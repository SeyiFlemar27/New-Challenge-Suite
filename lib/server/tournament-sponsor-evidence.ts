import type { Firestore, Transaction } from "firebase-admin/firestore";
import { tournamentSponsorCutoff } from "@/lib/server/tournament-sponsor-cutoff";

/** Full transition history is rechecked within the same transaction as funding. */
export async function readTournamentSponsorVotingEvidence(db: Firestore, transaction: Transaction | undefined, tournamentId: string, tournament: Record<string, unknown>): Promise<Record<string, unknown>> {
  const ref = db.collection("tournamentFundingCutoffs").doc(tournamentId);
  const query = db.collection("tournamentMatches").where("tournamentId", "==", tournamentId);
  const [cutoff, matches] = await Promise.all([transaction ? transaction.get(ref) : ref.get(), transaction ? transaction.get(query) : query.get()]);
  const occurrences = matches.docs.filter(doc => doc.data().votingOpenedAt != null).map(doc => ({ id: doc.id, at: Date.parse(String(doc.data().votingOpenedAt)) }));
  const invalid = () => ({ ...tournament, firstVotingOpenedAt: "invalid", tournamentVotingCutoffAt: "invalid" });
  if (occurrences.some(row => !Number.isFinite(row.at))) return invalid();
  occurrences.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const first = occurrences[0];
  const mirrored = tournamentSponsorCutoff(tournament);
  if (!first) return cutoff.exists || mirrored !== null ? invalid() : tournament;
  const stored = cutoff.data() ?? {};
  if (mirrored !== first.at || (cutoff.exists && (stored.tournamentId !== tournamentId || Date.parse(String(stored.firstVotingOpenedAt)) !== first.at))) return invalid();
  const auditRef = db.collection("tournamentAuditEvents").doc(`${first.id}_voting_opened`);
  const audit = transaction ? await transaction.get(auditRef) : await auditRef.get();
  if (!audit.exists || audit.data()?.tournamentId !== tournamentId || audit.data()?.action !== "match_voting_opened" || Date.parse(String(audit.data()?.metadata?.votingOpenedAt)) !== first.at) return invalid();
  return tournament;
}
