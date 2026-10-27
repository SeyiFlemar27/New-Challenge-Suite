import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { currentParticipantMatch } from "@/lib/tournament-participant-view";
import { isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { orderTournamentParticipation } from "@/lib/tournament-smart-priority";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Your Tournaments");
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor && (cursor.includes("/") || cursor.length > 500)) return fail("Invalid Tournament page.", 400);
  const team = cursor?.startsWith("team:") === true;
  if (cursor && !team && !cursor.startsWith("individual:")) return fail("Invalid Tournament page.", 400);
  const collection = db.collection(team ? "tournamentTeamMemberships" : "tournamentParticipants");
  const anchor = cursor?.slice(cursor.indexOf(":") + 1) ?? "";
  let query = collection.where("userId", "==", user.uid).orderBy(FieldPath.documentId());
  if (anchor) {
    const record = await collection.doc(anchor).get();
    if (!record.exists || record.data()?.userId !== user.uid) return fail("Invalid Tournament page.", 400);
    query = query.startAfter(record);
  }
  // Bound each authenticated read, but never impose a participation-history cap.
  // The client collects all batches before globally sorting and displaying pages.
  const [registrations, account] = await Promise.all([query.limit(128).get(), db.collection("users").doc(user.uid).get()]);
  const selected = registrations.docs;
  const tournamentIds = [...new Set(selected.map(row => String(row.data().tournamentId ?? "")).filter(id => id && !id.includes("/")))];
  const records = tournamentIds.length ? await db.getAll(...tournamentIds.map(id => db.collection("tournaments").doc(id))) : [];
  const recordMap = new Map(records.map(row => [row.id, row]));
  const teamIds = team ? [...new Set(selected.map(row => String(row.data().teamId ?? "")).filter(id => id && !id.includes("/")))] : [];
  const teams = teamIds.length ? await db.getAll(...teamIds.map(id => db.collection("tournamentTeams").doc(id))) : [];
  const teamMap = new Map(teams.map(row => [row.id, row]));
  const entrantId = (row: typeof selected[number]) => team ? String(row.data().teamId ?? "") : row.id;
  const active = selected.filter(row => !["completed", "winners_announced", "cancelled"].includes(String(recordMap.get(String(row.data().tournamentId))?.data()?.status)));
  const matchRows = new Map<string, Record<string, unknown> & { id: string }>();
  for (let offset = 0; offset < active.length; offset += 30) {
    const ids = [...new Set(active.slice(offset, offset + 30).map(entrantId).filter(id => id && !id.includes("/")))];
    if (!ids.length) continue;
    const snapshots = await Promise.all([db.collection("tournamentMatches").where("participantAId", "in", ids).limit(961).get(), db.collection("tournamentMatches").where("participantBId", "in", ids).limit(961).get()]);
    if (snapshots.some(rows => rows.size > 960)) return fail("Your match history requires reconciliation.", 503, undefined, "TOURNAMENT_PRIORITY_RECONCILIATION_REQUIRED");
    for (const rows of snapshots) for (const row of rows.docs) matchRows.set(row.id, { ...row.data(), id: row.id });
  }
  const restrictedAccount = isSponsorProfile(account.data() ?? {}) || ["suspended", "disabled", "deleted", "deactivated"].includes(String(account.data()?.accountStatus));
  const tournaments = await Promise.all(selected.map(async registration => {
    const data = registration.data();
    const id = typeof data.tournamentId === "string" ? data.tournamentId : "";
    if (!id || id.includes("/")) return null;
    const record = recordMap.get(id);
    if (!record?.exists) return null;
    const tournament = record.data() ?? {};
    const entrant = entrantId(registration);
    const teamRecord = teamMap.get(entrant);
    const matches = [...matchRows.values()].filter(row => row.tournamentId === id && [row.participantAId, row.participantBId].includes(entrant));
    const match = currentParticipantMatch(matches, entrant);
    const restricted = restrictedAccount || ["disqualified", "withdrawn", "rejected", "refunded", "inactive"].includes(String(data.status)) || Boolean(team && (!teamRecord?.exists || teamRecord.data()?.tournamentId !== id || ["disqualified", "withdrawn", "rejected"].includes(String(teamRecord.data()?.status))));
    const submission = match ? await db.collection("tournamentSubmissions").doc(`${id}_${match.id}_${entrant}`).get() : null;
    const accepted = submission?.exists && ["submitted", "pending_moderation", "under_review", "approved"].includes(String(submission.data()?.status));
    const submissionDeadline = typeof match?.submissionDeadlineAt === "string" ? match.submissionDeadlineAt : null;
    const canSubmit = !team || data.role === "captain";
    const actionable = !restricted && canSubmit && match?.status === "submissions_open" && !accepted && Boolean(submissionDeadline && Date.parse(submissionDeadline) > Date.now());
    const deadline = actionable ? submissionDeadline : null;
    const completed = ["completed", "winners_announced"].includes(String(tournament.status));
    return { id, registrationId: `${team ? "team" : "individual"}:${registration.id}`, title: String(tournament.title ?? "Tournament"), status: String(tournament.status ?? ""), registrationStatus: String(data.status ?? ""), deadline, actionable, completed,
      actionLabel: actionable ? "Submit Entry" : match ? "View Match" : completed ? "View Results" : "View Tournament",
      href: match ? `/tournaments/${encodeURIComponent(id)}/matches/${encodeURIComponent(match.id)}` : `/tournaments/${encodeURIComponent(id)}${completed ? "/results" : ""}`,
      stateLabel: restricted ? "Entry unavailable" : actionable ? "Submission needed" : match ? String(match.status).replaceAll("_", " ") : completed ? "Completed" : "Awaiting Next Opponent" };
  }));
  const items = orderTournamentParticipation(tournaments.filter(item => item !== null));
  const nextScanCursor = registrations.size === 128 ? `${team ? "team" : "individual"}:${selected.at(-1)!.id}` : team ? null : "team:";
  const result = ok({ tournaments: items, hasMoreScans: nextScanCursor !== null, nextScanCursor, priorityScope: "membership_batch" }, "Your Tournament participation batch loaded.");
  result.headers.set("Cache-Control", "private, no-store");
  return result;
}
