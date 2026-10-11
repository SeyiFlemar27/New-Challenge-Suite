import { z } from "zod";
import { getDefaultRouteForAccount } from "@/lib/account-routing";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  step: z.number().int().min(0).max(2).optional(),
  complete: z.literal(true).optional()
}).strict().refine((value) => value.step !== undefined || value.complete === true, "A step or completion update is required.");

function selectedType(profile: Record<string, unknown>) {
  const selected = profile.account_type ?? profile.selectedAccountType;
  if (selected === "creator" || selected === "sponsor") return selected;
  if (profile.accountType === "sponsor" || profile.dashboardType === "sponsor_dashboard" || profile.role === "sponsor") return "sponsor";
  return null;
}

function destination(type: string | null, profile: Record<string, unknown>) {
  return getDefaultRouteForAccount({
    ...profile,
    accountTypeSelectionComplete: true,
    accountIntroOnboardingStatus: "complete",
    account_type: type ?? profile.account_type
  });
}

async function loadAccount(db: NonNullable<ReturnType<typeof getAdminDb>>, uid: string) {
  const [accountSnap, profileSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("profiles").doc(uid).get()
  ]);
  return { profile: { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) } as Record<string, unknown> };
}

export async function GET(request: Request) {
  const { user, response } = await requireAuthenticatedUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Account onboarding");

  try {
    const { profile } = await loadAccount(db, user.uid);
    if (profile.accountTypeSelectionComplete === false) return fail("Choose Creator or Sponsor before continuing.", 409, undefined, "ACCOUNT_TYPE_REQUIRED");
    const status = String(profile.accountIntroOnboardingStatus ?? "");
    const type = selectedType(profile);
    if (status !== "in_progress" || !type) {
      return ok({ status: "complete", step: 2, accountType: type, destination: getDefaultRouteForAccount(profile) }, "Account introduction is already complete.");
    }
    const stepValue = Number(profile.accountIntroOnboardingStep ?? 0);
    return ok({ status: "in_progress", step: Math.max(0, Math.min(2, Number.isInteger(stepValue) ? stepValue : 0)), accountType: type }, "Account introduction loaded.");
  } catch (error) {
    console.error("[api/onboarding/intro] load failed", { userId: user.uid, message: error instanceof Error ? error.message : "unknown" });
    return serverError("Account onboarding could not be loaded.");
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAuthenticatedUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Account onboarding");
  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;
  const parsed = updateSchema.safeParse(parsedBody.body);
  if (!parsed.success) return validationError({ onboarding: parsed.error.issues[0]?.message ?? "Onboarding update is invalid." });

  const accountRef = db.collection("users").doc(user.uid);
  const profileRef = db.collection("profiles").doc(user.uid);
  const now = new Date().toISOString();
  try {
    const result = await db.runTransaction(async (transaction) => {
      const [accountSnap, profileSnap] = await Promise.all([transaction.get(accountRef), transaction.get(profileRef)]);
      const profile = { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) } as Record<string, unknown>;
      if (profile.accountTypeSelectionComplete === false) return { kind: "account_type_required" as const };
      const type = selectedType(profile);
      const status = String(profile.accountIntroOnboardingStatus ?? "");
      if (status === "complete" || status !== "in_progress") {
        return { kind: "complete" as const, destination: getDefaultRouteForAccount(profile) };
      }
      if (!type || (profile.accountIntroOnboardingType && profile.accountIntroOnboardingType !== type)) return { kind: "invalid_type" as const };

      const currentStepValue = Number(profile.accountIntroOnboardingStep ?? 0);
      const currentStep = Math.max(0, Math.min(2, Number.isInteger(currentStepValue) ? currentStepValue : 0));
      if (parsed.data.complete === true) {
        if (currentStep < 2) return { kind: "step_incomplete" as const };
        const update = { accountIntroOnboardingStatus: "complete", accountIntroOnboardingStep: 2, accountIntroOnboardingCompletedAt: now, updatedAt: now };
        transaction.set(accountRef, update, { merge: true });
        transaction.set(profileRef, update, { merge: true });
        return { kind: "complete" as const, destination: destination(type, profile) };
      }

      const nextStep = parsed.data.step ?? currentStep;
      if (nextStep > currentStep + 1) return { kind: "step_out_of_order" as const };
      const update = { accountIntroOnboardingStep: nextStep, updatedAt: now };
      transaction.set(accountRef, update, { merge: true });
      transaction.set(profileRef, update, { merge: true });
      return { kind: "saved" as const, step: nextStep, accountType: type };
    });

    if (result.kind === "account_type_required") return fail("Choose Creator or Sponsor before continuing.", 409, undefined, "ACCOUNT_TYPE_REQUIRED");
    if (result.kind === "invalid_type") return fail("Account onboarding does not match the selected account type.", 409, undefined, "ACCOUNT_TYPE_MISMATCH");
    if (result.kind === "step_incomplete") return fail("Complete each introduction screen before finishing onboarding.", 409, undefined, "ONBOARDING_STEP_INCOMPLETE");
    if (result.kind === "step_out_of_order") return fail("Continue through the introduction in order.", 409, undefined, "ONBOARDING_STEP_OUT_OF_ORDER");
    if (result.kind === "complete") return ok({ status: "complete", step: 2, destination: result.destination }, "Account introduction completed.");
    return ok({ status: "in_progress", step: result.step, accountType: result.accountType }, "Onboarding progress saved.");
  } catch (error) {
    console.error("[api/onboarding/intro] update failed", { userId: user.uid, message: error instanceof Error ? error.message : "unknown" });
    return serverError("Onboarding progress could not be saved.");
  }
}
