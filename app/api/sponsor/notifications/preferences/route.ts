import { ok, readJson, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { defaultNotificationPreferences, isoNow, notificationCategories } from "@/lib/sponsor-operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const prefSnap = await context.db.collection("sponsorNotificationPreferences").doc(context.user.uid).get();
    return ok({ preferences: prefSnap.exists ? prefSnap.data()?.preferences ?? defaultNotificationPreferences() : defaultNotificationPreferences(), categories: notificationCategories, providers: { email: false, sms: false, webhook: false } }, "Sponsor notification preferences loaded.");
  } catch (error) {
    console.error("[sponsor-notification-preferences:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor notification preferences could not be loaded.");
  }
}

export async function PATCH(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  try {
    const now = isoNow();
    const preferences = body.preferences && typeof body.preferences === "object" ? body.preferences : defaultNotificationPreferences();
    const payload = { sponsorId: context.user.uid, ownerUid: context.user.uid, preferences, emailProviderConfigured: false, smsProviderConfigured: false, webhookProviderConfigured: false, updatedAt: now, updatedBy: context.user.uid, createdAt: now, createdBy: context.user.uid };
    await Promise.all([context.db.collection("sponsorNotificationPreferences").doc(context.user.uid).set(payload, { merge: true }), context.db.collection("sponsorSettingsAuditLogs").add({ sponsorId: context.user.uid, action: "notification_preferences_updated", emailSent: false, smsSent: false, webhookSent: false, createdAt: now, createdBy: context.user.uid })]);
    return ok({ preferences }, "Notification preferences saved. Email, SMS, and webhook delivery remain disabled unless providers are configured.");
  } catch (error) {
    console.error("[sponsor-notification-preferences:patch]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor notification preferences could not be saved.");
  }
}
