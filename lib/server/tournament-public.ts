import { getAdminDb } from "@/lib/firebase/admin";

type TournamentRow = Record<string, unknown> & { id: string };

export async function listPublicTournaments(limit = 50): Promise<{ available: boolean; tournaments: TournamentRow[]; message: string }> {
  const db = getAdminDb();
  if (!db) return { available: false, tournaments: [], message: "Tournament data requires Firebase Admin configuration." };
  const snap = await db.collection("tournaments").where("privacy", "==", "public").orderBy("createdAt", "desc").limit(limit).get();
  return { available: true, tournaments: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TournamentRow[], message: snap.empty ? "No public tournaments are available yet." : "" };
}

export async function getTournamentBundle(id: string): Promise<{ available: boolean; tournament: TournamentRow | null; participants: TournamentRow[]; rounds: TournamentRow[]; matches: TournamentRow[]; submissions: TournamentRow[]; announcements: TournamentRow[]; sponsors: TournamentRow[]; placements: TournamentRow[]; audits: TournamentRow[]; message: string }> {
  const db = getAdminDb();
  if (!db) return { available: false, tournament: null, participants: [], rounds: [], matches: [], submissions: [], announcements: [], sponsors: [], placements: [], audits: [], message: "Tournament data requires Firebase Admin configuration." };
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return { available: true, tournament: null, participants: [], rounds: [], matches: [], submissions: [], announcements: [], sponsors: [], placements: [], audits: [], message: "Tournament not found." };
  const [participants, rounds, matches, submissions, announcements, sponsors, placements, audits] = await Promise.all([
    db.collection("tournamentParticipants").where("tournamentId", "==", id).limit(500).get(),
    db.collection("tournamentRounds").where("tournamentId", "==", id).limit(100).get(),
    db.collection("tournamentMatches").where("tournamentId", "==", id).limit(200).get(),
    db.collection("tournamentSubmissions").where("tournamentId", "==", id).limit(200).get(),
    db.collection("tournamentAnnouncements").where("tournamentId", "==", id).where("status", "==", "published").limit(50).get(),
    db.collection("tournamentSponsorProposals").where("tournamentId", "==", id).where("publicDisplayApproved", "==", true).limit(20).get(),
    db.collection("tournamentPlacements").where("tournamentId", "==", id).limit(20).get(),
    db.collection("tournamentAuditEvents").where("tournamentId", "==", id).limit(100).get()
  ]);
  const rows = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TournamentRow[];
  return { available: true, tournament: { id: tournamentSnap.id, ...tournamentSnap.data() }, participants: rows(participants), rounds: rows(rounds), matches: rows(matches), submissions: rows(submissions), announcements: rows(announcements), sponsors: rows(sponsors), placements: rows(placements), audits: rows(audits), message: "" };
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
