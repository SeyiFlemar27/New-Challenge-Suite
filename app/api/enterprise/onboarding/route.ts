import { requireEnterprisePermission } from "@/lib/server/enterprise-access";
import { ok } from "@/lib/server/responses";

export async function POST(request: Request) {
  const result = await requireEnterprisePermission(request, "challenge.view");
  if (result.response) return result.response;
  const now = new Date().toISOString();
  const update = { enterpriseOnboardingComplete: true, enterpriseStaffStatus: "active", staffAccess: { ...result.access, status: "active", onboardingComplete: true }, enterpriseOnboardingCompletedAt: now, updatedAt: now };
  const batch = result.db.batch();
  batch.set(result.db.collection("users").doc(result.user.uid), update, { merge: true });
  batch.set(result.db.collection("profiles").doc(result.user.uid), update, { merge: true });
  await batch.commit();
  return ok({ completed: true }, "Enterprise onboarding completed.");
}
