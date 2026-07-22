import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { getChallengeOrNull, serializeProposal } from "@/lib/server/prize-approvals";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin challenge winner proposals");
  const { id: challengeId } = await params;
  const challenge = await getChallengeOrNull(db, challengeId);
  if (!challenge) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");

  const snap = await db.collection("winnerProposals").where("challengeId", "==", challengeId).limit(100).get();
  const proposals = snap.docs.map(serializeProposal).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return ok({ challenge, proposals, moneyMovementEnabled: false }, "Admin winner proposals loaded.");
}
