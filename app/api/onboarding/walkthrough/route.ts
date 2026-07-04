import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Product walkthrough");
  const now = new Date().toISOString();
  const update = { walkthroughCompleted: true, walkthroughCompletedAt: now, updatedAt: now };
  await Promise.all([
    db.collection("users").doc(user.uid).set(update, { merge: true }),
    db.collection("profiles").doc(user.uid).set(update, { merge: true })
  ]);
  return ok({ completed: true }, "Product walkthrough completed.");
}
