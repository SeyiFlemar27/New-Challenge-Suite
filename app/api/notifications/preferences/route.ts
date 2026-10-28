import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { reconciledNotificationPreferences, OPTIONAL_NOTIFICATION_DEFAULTS } from "@/lib/notification-policy";
import { forbidden, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
const schema = z.object({ voterResults: z.boolean().optional(), votingReminders: z.boolean().optional(), recommendations: z.boolean().optional(), promotions: z.boolean().optional(), communityUpdates: z.boolean().optional(), directMessages: z.boolean().optional(), otherOptional: z.boolean().optional() }).strict();
function restricted(profile: Record<string, unknown>) { return profile.disabled === true || profile.suspended === true || ["disabled", "suspended", "restricted", "deleted", "deactivated"].includes(String(profile.accountStatus)); }
export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request); if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Notification settings");
  try {
    const [record, legacy, account] = await db.getAll(db.collection("notificationPreferences").doc(user.uid), db.collection("sponsorNotificationPreferences").doc(user.uid), db.collection("users").doc(user.uid));
    if (restricted(account.data() ?? {})) return forbidden("Notification settings are unavailable for this account.");
    const normalized = reconciledNotificationPreferences(record.data() ?? {}, legacy.data()?.preferences ?? {});
    const preferences = Object.fromEntries(Object.keys(OPTIONAL_NOTIFICATION_DEFAULTS).map(key => [key, normalized[key as keyof typeof OPTIONAL_NOTIFICATION_DEFAULTS]]));
    const result = ok({ preferences, essentialInApp: true }, "Notification settings loaded.");
    result.headers.set("Cache-Control", "private, no-store"); return result;
  } catch { return serverUnavailable("Notification settings"); }
}
export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request); if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Notification settings");
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = schema.safeParse(parsed.body); if (!body.success) return validationError({ notifications: "Choose supported notification options." });
  try {
    const account = await db.collection("users").doc(user.uid).get();
    if (restricted(account.data() ?? {})) return forbidden("Notification settings are unavailable for this account.");
    await db.collection("notificationPreferences").doc(user.uid).set({ ...body.data, userId: user.uid, essentialInApp: true, policyVersion: 2, updatedAt: new Date().toISOString() }, { merge: true });
    return ok({ saved: true }, "Notification settings saved.");
  } catch { return serverUnavailable("Notification settings"); }
}
