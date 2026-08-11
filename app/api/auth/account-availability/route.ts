import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { normalizedEmailHash, normalizeAccountDeletionStatus, PENDING_ACCOUNT_DELETION_STATUSES } from "@/lib/server/account-deletion";
import { ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const schema = z.object({ email: z.string().trim().email() });

export async function POST(request: Request) {
  const db = getAdminDb();
  const auth = getAdminAuth();
  if (!db || !auth) return serverUnavailable("Account availability");
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return validationError({ email: "Enter a valid email address." });
  try {
    const email = parsed.data.email.trim().toLowerCase();
    const snap = await db.collection("deletedAccountReferences").doc(normalizedEmailHash(email)).get();
    const record = snap.data() ?? {};
    const rawStatus = String(record.status ?? "").toLowerCase();
    const status = normalizeAccountDeletionStatus(rawStatus);
    let authUser: Awaited<ReturnType<typeof auth.getUserByEmail>> | null = null;
    try {
      authUser = await auth.getUserByEmail(email);
    } catch (error) {
      if ((error as { code?: string })?.code !== "auth/user-not-found") throw error;
    }

    if (PENDING_ACCOUNT_DELETION_STATUSES.has(status) || ["auth_release_pending", "auth_release_failed", "finalization_failed"].includes(rawStatus)) {
      return ok({ state: "deletion_pending", available: false, supportHref: "/contact", deletionStatusHref: "/account/deletion-status" }, "This email is still linked to an account deletion in progress. You can reuse it once deletion is complete.");
    }
    if (record.enforcementReviewRequired === true) {
      return ok({ state: "enforcement_review_required", available: false, supportHref: "/contact" }, "This email cannot be used to create a new account right now. Please contact support.");
    }
    if (authUser) {
      if (record.emailReuseAllowed === true || ["deleted", "anonymized"].includes(rawStatus)) {
        return ok({ state: "deleted_but_auth_not_released", available: false, supportHref: "/contact" }, "This email has not been fully released yet. Please try again later or contact support.");
      }
      const providers = authUser.providerData.map((provider) => provider.providerId);
      const state = providers.length > 0 && !providers.includes("password") ? "provider_conflict" : "active_account_exists";
      const message = state === "provider_conflict"
        ? "This email is already connected to another sign-in method. Please use the original sign-in option."
        : "An account already exists with this email. Please sign in or reset your password.";
      return ok({ state, available: false, supportHref: "/contact" }, message);
    }
    if (record.emailReuseAllowed === true && ["deleted", "anonymized"].includes(rawStatus)) {
      return ok({ state: "deleted_email_reuse_allowed", available: true, freshAccountRequired: true, previousAccountRestored: false }, "A new account can be created with a new identity.");
    }
    if (snap.exists && record.emailReuseAllowed !== true) {
      return ok({ state: "enforcement_review_required", available: false, supportHref: "/contact" }, "This email cannot be used to create a new account right now. Please contact support.");
    }
    return ok({ state: "available", available: true, freshAccountRequired: true }, "Account creation can continue.");
  } catch (error) {
    return serverError("Account availability could not be confirmed.", error instanceof Error ? error.message : error);
  }
}
