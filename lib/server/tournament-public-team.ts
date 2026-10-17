import type { Firestore } from "firebase-admin/firestore";
import { isPublishedTournament, publicTournamentParticipantIds } from "@/lib/server/tournament-public-policy";
import { toPublicProfile } from "@/lib/server/public-profile";
import { isQaDemoOrPlaceholderProfile } from "@/lib/server/public-challenge";
import { loadTournamentTeamDirectory } from "@/lib/server/tournament-team-directory";

/** Public roster projection never returns internal account IDs, private profiles or payment records. */
export async function getPublicTournamentTeam(db: Firestore, tournamentId: string, publicTeamId: string) {
  if (!/^entrant-\d{1,3}$/.test(publicTeamId)) return null;
  const tournament = await db.collection("tournaments").doc(tournamentId).get();
  if (!tournament.exists || tournament.data()?.privacy !== "public" || tournament.data()?.participationMode !== "team" || !isPublishedTournament(tournament.data() ?? {})) return null;
  const teams = await loadTournamentTeamDirectory(db, tournamentId);
  const rows = teams.docs.map(document => ({ ...document.data(), id: document.id }));
  const publicIds = publicTournamentParticipantIds(rows);
  const team = teams.docs.find(document => publicIds.get(document.id) === publicTeamId)?.data();
  if (!team || !["ready", "registered", "checked_in", "active", "eliminated", "winner", "completed"].includes(String(team.status))) return null;
  const members = Array.isArray(team.memberUserIds) ? [...new Set(team.memberUserIds.filter((id): id is string => typeof id === "string" && Boolean(id)))] : [];
  if (!members.length || members.length > 20) return null;
  const profiles = await db.getAll(...members.map(id => db.collection("profiles").doc(id)));
  const accounts = await db.getAll(...members.map(id => db.collection("users").doc(id)));
  const publicMembers = profiles.flatMap((snapshot, index) => {
    const profile = snapshot.data() ?? {}, account = accounts[index]?.data() ?? {};
    if (!snapshot.exists || !accounts[index]?.exists || isQaDemoOrPlaceholderProfile(snapshot.id, { ...account, ...profile }) || profile.publicProfile === false || profile.profileVisibility === "private" || profile.status === "suspended"
      || account.disabled || account.suspended || ["disabled", "suspended", "deleted", "deactivated", "deletion_requested"].includes(String(account.accountStatus))) return [];
    const identity = toPublicProfile("", { ...profile, email: "" });
    return [{ displayName: identity.displayName, username: identity.username, avatarUrl: identity.avatarUrl, profilePath: identity.username ? `/profile/${encodeURIComponent(identity.username)}` : null, captain: members[index] === team.captainUserId }];
  });
  return { id: publicTeamId, name: String(team.name ?? "Tournament Team"), status: String(team.status), memberCount: members.length, publicMembers };
}
