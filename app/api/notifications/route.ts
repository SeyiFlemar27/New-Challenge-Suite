import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Notifications");
  const snap = await db.collection("notifications").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(50).get();
  return ok({ notifications: snap.docs.map((doc) => doc.data()) }, "Notifications loaded.");
}
