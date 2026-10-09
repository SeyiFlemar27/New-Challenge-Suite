import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

async function creatorCanAccess(db: FirebaseFirestore.Firestore, proposal: Record<string, unknown>, userId: string) {
  if (proposal.linkedCreatorId === userId) return true;
  const challengeId = String(proposal.linkedChallengeId ?? "");
  if (!challengeId) return false;
  const snap = await db.collection("challenges").doc(challengeId).get();
  const challenge = snap.data() ?? {};
  return [challenge.creatorId, challenge.ownerId, challenge.hostId, challenge.createdBy].includes(userId);
}

export async function GET(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const auth = await requireRequestUser(request);
  if (auth.response) return auth.response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator sponsorship proposal");
  const { proposalId } = await params;
  const snap = await db.collection("sponsorProposals").doc(proposalId).get();
  if (!snap.exists) return fail("Proposal not found.", 404, undefined, "NOT_FOUND");
  const proposal = snap.data() ?? {};
  if (!(await creatorCanAccess(db, proposal, auth.user.uid))) return fail("You do not have access to this proposal.", 403, undefined, "PERMISSION_DENIED");
  const revisions = await db.collection("sponsorProposalRevisions").where("proposalId", "==", proposalId).limit(50).get();
  const revisionItems: Array<Record<string, unknown> & { id: string }> = revisions.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return ok({ proposal: { id: snap.id, ...proposal }, revisions: revisionItems.sort((a, b) => Number(a.revisionNumber ?? 0) - Number(b.revisionNumber ?? 0)) }, "Sponsorship proposal loaded.");
}

/** Historical Sponsor proposal records are read-only for every workspace. */
export async function PATCH(request: Request) {
  const auth = await requireRequestUser(request);
  if (auth.response) return auth.response;
  return fail("Historical Sponsor proposals are read-only. New sponsorship relationships start from an opportunity.", 410, undefined, "SPONSOR_PROPOSAL_READ_ONLY");
}
