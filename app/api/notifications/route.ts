import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { listUserNotifications, markAllNotificationsRead } from "@/lib/server/notifications";
import { ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Notifications");
  const notifications = await listUserNotifications(db, user.uid, 50);
  const unreadCount = notifications.filter((item: { status?: string; read?: boolean }) => item.status === "unread" || item.read === false).length;
  return ok({ notifications, unreadCount, delivery: { inApp: true, email: false, push: false } }, "Notifications loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Notifications");
  const result = await markAllNotificationsRead(db, user.uid);
  return ok(result, "Notifications marked read.");
}
