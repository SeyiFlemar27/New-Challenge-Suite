import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { pageUserNotifications, markAllNotificationsRead } from "@/lib/server/notifications";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

function privateResponse<T extends Response>(response: T) { response.headers.set("Cache-Control", "private, no-store"); return response; }

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Notifications");
  const account = await db.collection("users").doc(user.uid).get();
  if (account.data()?.disabled === true || account.data()?.suspended === true || ["suspended", "disabled", "deleted", "deactivated"].includes(String(account.data()?.accountStatus))) return fail("Account access is restricted.", 403);
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return fail("Invalid notification page size.", 400);
  const category = params.get("category") ?? "all";
  if (!["all", "participation", "money", "account", "updates"].includes(category)) return fail("Invalid notification category.", 400);
  try {
    const page = await pageUserNotifications(db, user.uid, { limit, cursor: params.get("cursor"), unread: params.get("filter") === "unread", category });
    return privateResponse(ok({ ...page, delivery: { inApp: true, email: false, push: false } }, "Notifications loaded."));
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_NOTIFICATION_CURSOR") return fail("Invalid notification page.", 400);
    return serverUnavailable("Notifications");
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Notifications");
  const account = await db.collection("users").doc(user.uid).get();
  if (account.data()?.disabled === true || account.data()?.suspended === true || ["suspended", "disabled", "deleted", "deactivated"].includes(String(account.data()?.accountStatus))) return fail("Account access is restricted.", 403);
  const parsed = request.headers.get("content-type")?.includes("application/json") ? await readJson(request) : { body: {}, response: null };
  if (parsed.response) return parsed.response;
  const cursor = parsed.body?.cursor, before = parsed.body?.before;
  if (cursor != null && typeof cursor !== "string" || before != null && (typeof before !== "string" || !Number.isFinite(Date.parse(before)))) return fail("Invalid notification progress.", 400);
  try {
    const result = await markAllNotificationsRead(db, user.uid, cursor, before);
    return privateResponse(ok(result, result.nextCursor ? "Notification history update is continuing." : "Notifications marked read."));
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_NOTIFICATION_CURSOR") return fail("Invalid notification page.", 400);
    return serverUnavailable("Notification update");
  }
}
