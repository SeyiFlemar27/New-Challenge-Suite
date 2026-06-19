import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverUnavailable, validationError } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winner claims");

  const formData = await request.formData();
  const identityDocument = formData.get("identityDocument");
  if (!(identityDocument instanceof File)) {
    return validationError({ identityDocument: "Identity document upload is required." });
  }
  const submissionId = String(formData.get("submissionId") ?? "");
  if (!submissionId) return validationError({ submissionId: "Submission ID is required." });
  const claim = {
    userId: user.uid,
    submissionId,
    status: "pending_review",
    identityDocumentName: identityDocument.name,
    createdAt: new Date().toISOString()
  };
  await db.collection("winnerClaims").add(claim);
  return ok({ claim }, "Winner claim submitted.");
}
