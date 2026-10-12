import { getAdminDb } from "@/lib/firebase/admin";
import { cookies } from "next/headers";
import { getRequestUser, SESSION_COOKIE_NAME, type RequestUser } from "@/lib/server/auth";
import { publicTournamentView } from "@/lib/server/tournament-public-policy";

type TournamentRow = Record<string, unknown> & { id: string };

const TOURNAMENT_INDEX_MESSAGE = "Tournament data is not available yet. Please try again shortly.";

export function isFirestoreMissingIndexError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("FAILED_PRECONDITION") && message.toLowerCase().includes("index");
}

function logMissingIndex(scope: string, error: unknown) {
  if (!isFirestoreMissingIndexError(error)) return;
  console.warn("[tournament-firestore-index]", {
    scope,
    message: "Firestore index required for this query."
  });
}

function sortByIsoDesc(rows: TournamentRow[], field: string) {
  return [...rows].sort((a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? "")));
}

export async function listPublicTournaments(limit = 50): Promise<{ available: boolean; tournaments: TournamentRow[]; message: string }> {
  const db = getAdminDb();
  if (!db) return { available: false, tournaments: [], message: "Tournament data requires Firebase Admin configuration." };
  try {
    const snap = await db.collection("tournaments").where("privacy", "==", "public").limit(limit).get();
    const tournaments = sortByIsoDesc(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TournamentRow[], "createdAt").map(publicTournamentView);
    return { available: true, tournaments, message: snap.empty ? "No public tournaments are available yet." : "" };
  } catch (error) {
    logMissingIndex("listPublicTournaments", error);
    return { available: false, tournaments: [], message: isFirestoreMissingIndexError(error) ? TOURNAMENT_INDEX_MESSAGE : "Tournament data could not be loaded." };
  }
}

export async function getServerTournamentViewer() {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;
  return getRequestUser(new Request("http://localhost", { headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookie)}` } }));
}

export async function getTournamentBundle(id: string, viewer: RequestUser | null = null): Promise<{ available: boolean; tournament: TournamentRow | null; participants: TournamentRow[]; rounds: TournamentRow[]; matches: TournamentRow[]; submissions: TournamentRow[]; announcements: TournamentRow[]; sponsors: TournamentRow[]; placements: TournamentRow[]; audits: TournamentRow[]; message: string }> {
  const db = getAdminDb();
  if (!db) return { available: false, tournament: null, participants: [], rounds: [], matches: [], submissions: [], announcements: [], sponsors: [], placements: [], audits: [], message: "Tournament data requires Firebase Admin configuration." };
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return { available: true, tournament: null, participants: [], rounds: [], matches: [], submissions: [], announcements: [], sponsors: [], placements: [], audits: [], message: "Tournament not found." };
  const rows = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TournamentRow[];
  const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() } as TournamentRow;
  if (tournament.privacy !== "public") {
    if (!viewer?.emailVerified) return { available: false, tournament: null, participants: [], rounds: [], matches: [], submissions: [], announcements: [], sponsors: [], placements: [], audits: [], message: "Tournament not found or unavailable." };
    const [participant, teamMembership, invitation, teamInvitationQuery] = await Promise.all([
      db.collection("tournamentParticipants").doc(`${id}_${viewer.uid}`).get(),
      db.collection("tournamentTeamMemberships").doc(`${id}_${viewer.uid}`).get(),
      db.collection("tournamentInvitations").doc(`${id}_${viewer.uid}`).get(),
      db.collection("tournamentTeamInvitations").where("tournamentId", "==", id).where("inviteeUserId", "==", viewer.uid).limit(5).get()
    ]);
    const participantStatus = String(participant.data()?.status ?? "");
    const invite = invitation.data() ?? {};
    const inviteExpiresAt = invite.expiresAt ? Date.parse(String(invite.expiresAt)) : Number.POSITIVE_INFINITY;
    const hasValidTeamInvitation = teamInvitationQuery.docs.some((doc) => {
      const data = doc.data();
      const expiresAt = data.expiresAt ? Date.parse(String(data.expiresAt)) : Number.POSITIVE_INFINITY;
      return data.tournamentId === id && data.inviteeUserId === viewer.uid && data.status === "pending" && expiresAt > Date.now();
    });
    const allowed = viewer.isAdmin === true || tournament.hostId === viewer.uid
      || (participant.exists && !["withdrawn", "rejected", "disqualified"].includes(participantStatus))
      || (teamMembership.exists && teamMembership.data()?.status === "active")
      || hasValidTeamInvitation
      || (invitation.exists && invite.tournamentId === id && invite.inviteeUserId === viewer.uid && ["pending", "accepted"].includes(String(invite.status)) && inviteExpiresAt > Date.now());
    if (!allowed) return { available: false, tournament: null, participants: [], rounds: [], matches: [], submissions: [], announcements: [], sponsors: [], placements: [], audits: [], message: "Tournament not found or unavailable." };
  }
  try {
    const [participants, teams, rounds, matches, submissions, announcements, sponsors, placements, audits] = await Promise.all([
      db.collection("tournamentParticipants").where("tournamentId", "==", id).limit(500).get(),
      db.collection("tournamentTeams").where("tournamentId", "==", id).limit(150).get(),
      db.collection("tournamentRounds").where("tournamentId", "==", id).limit(100).get(),
      db.collection("tournamentMatches").where("tournamentId", "==", id).limit(200).get(),
      db.collection("tournamentSubmissions").where("tournamentId", "==", id).limit(200).get(),
      db.collection("tournamentAnnouncements").where("tournamentId", "==", id).limit(50).get(),
      db.collection("tournamentSponsorProposals").where("tournamentId", "==", id).limit(20).get(),
      db.collection("tournamentPlacements").where("tournamentId", "==", id).limit(20).get(),
      db.collection("tournamentAuditEvents").where("tournamentId", "==", id).limit(100).get()
    ]);
    return {
      available: true,
      tournament,
      participants: tournament.participationMode === "team"
        ? rows(teams).map((team) => ({ id: team.id, tournamentId: id, displayName: String(team.name ?? "Tournament Team"), publicDisplayName: true, status: team.status, seed: team.seed ?? null }))
        : rows(participants),
      rounds: rows(rounds),
      matches: rows(matches).map((match) => {
        const resultVerified = match.status === "confirmed" && match.resultStatus === "confirmed";
        const { voteCountA, voteCountB, verifiedVoteCountA, verifiedVoteCountB, ...withoutVoteState } = match;
        const safeMatch: TournamentRow = Object.fromEntries(Object.entries(withoutVoteState).filter(([key]) => !["voteSequence", "tiePrioritySlot", "tiePriorityParticipantId"].includes(key))) as TournamentRow;
        if (resultVerified) {
          const versionThree = Number(tournament.configVersion ?? 1) >= 3;
          const votesA = versionThree ? verifiedVoteCountA : voteCountA;
          const votesB = versionThree ? verifiedVoteCountB : voteCountB;
          if (Number.isSafeInteger(votesA) && Number(votesA) >= 0) safeMatch.verifiedVoteCountA = Number(votesA);
          if (Number.isSafeInteger(votesB) && Number(votesB) >= 0) safeMatch.verifiedVoteCountB = Number(votesB);
        }
        return safeMatch;
      }),
      submissions: rows(submissions),
      announcements: rows(announcements).filter((item) => item.status === "published"),
      sponsors: rows(sponsors).filter((item) => item.publicDisplayApproved === true),
      placements: rows(placements),
      audits: rows(audits),
      message: ""
    };
  } catch (error) {
    logMissingIndex("getTournamentBundle", error);
    return { available: false, tournament, participants: [], rounds: [], matches: [], submissions: [], announcements: [], sponsors: [], placements: [], audits: [], message: isFirestoreMissingIndexError(error) ? TOURNAMENT_INDEX_MESSAGE : "Tournament detail data could not be loaded." };
  }
}

export function tournamentSections(tournaments: Array<Record<string, unknown>>) {
  return [
    { title: "Registration Open", rows: tournaments.filter((item) => item.status === "registration_open") },
    { title: "Live", rows: tournaments.filter((item) => ["active", "round_active", "round_review", "final"].includes(String(item.status))) },
    { title: "Starting Soon", rows: tournaments.filter((item) => item.status === "scheduled") },
    { title: "Free", rows: tournaments.filter((item) => item.entryType === "free") },
    { title: "Prize Tournaments", rows: tournaments.filter((item) => Number((item.prizePool as Record<string, unknown> | undefined)?.confirmedPrizePoolMinor ?? 0) > 0) },
    { title: "Completed", rows: tournaments.filter((item) => item.status === "completed") }
  ].filter((section) => section.rows.length);
}

export function participantEligibilitySummary(tournament: Record<string, unknown> | null) {
  if (!tournament) return [];
  const status = String(tournament.status ?? "");
  return [
    { label: "Registration open", eligible: status === "registration_open", reason: status === "registration_open" ? "Open now" : "Registration is not open" },
    { label: "Profile complete", eligible: true, reason: "Verified when joining server-side" },
    { label: "Verification required", eligible: Boolean((tournament.eligibility as Record<string, unknown> | undefined)?.kycRequired) ? false : true, reason: "KYC is checked server-side when required" }
  ];
}
