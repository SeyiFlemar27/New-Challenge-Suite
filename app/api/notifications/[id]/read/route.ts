import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { markNotificationRead } from "@/lib/server/notifications";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Notifications");
  const { id } = await params;
  const result = await markNotificationRead(db, user.uid, id);
  if (!result) return fail("Notification not found.", 404, undefined, "NOT_FOUND");
  return ok(result, "Notification marked read.");
}
