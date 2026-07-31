import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Hybrid competition stage");
  const { id } = await params;
  const challengeRef = db.collection("challenges").doc(id);
  const challengeSnap = await challengeRef.get();
  if (!challengeSnap.exists) return fail("Hybrid competition not found.", 404, undefined, "NOT_FOUND");
  const challenge = challengeSnap.data() ?? {};
  const actorAuthorized = user.isAdmin || [challenge.creatorId, challenge.hostId, challenge.userId].includes(user.uid);
  if (!actorAuthorized) return fail("You cannot manage this archived competition.", 403, undefined, "PERMISSION_DENIED");
  return fail("Hybrid Competition has been discontinued. Historical records remain available in read-only mode.", 410, { archived: true, preserveHistoricalRecords: true }, "HYBRID_COMPETITION_RETIRED");
}
