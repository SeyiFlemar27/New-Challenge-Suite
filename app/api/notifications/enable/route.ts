import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Notification preferences");

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  if (body?.permission && !["granted", "denied", "default"].includes(body.permission)) {
    return validationError({ permission: "Permission must be granted, denied, or default." });
  }
  const preference = {
    userId: user.uid,
    permission: body.permission ?? "unknown",
    enabled: body.permission === "granted",
    updatedAt: new Date().toISOString()
  };
  await db.collection("notificationPreferences").doc(preference.userId).set(preference, { merge: true });
  return ok({ preference }, "Notification preference saved.");
}
