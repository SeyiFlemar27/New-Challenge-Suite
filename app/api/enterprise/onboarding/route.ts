import { requireEnterprisePermission } from "@/lib/server/enterprise-access";
import { enterpriseOnboardingModules, enterpriseOnboardingTaskIds } from "@/lib/enterprise-onboarding";
import { ok, readJson, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

async function onboardingState(result: Awaited<ReturnType<typeof requireEnterprisePermission>>) {
  const snap = await result.db!.collection("enterpriseOnboarding").doc(result.user!.uid).get();
  const data = snap.data() ?? {};
  const validTaskIds = enterpriseOnboardingTaskIds(result.access!);
  const completedTaskIds = Array.isArray(data.completedTaskIds) ? data.completedTaskIds.filter((value): value is string => typeof value === "string" && validTaskIds.includes(value)) : [];
  return { modules: enterpriseOnboardingModules(result.access!), completedTaskIds, completed: validTaskIds.every((id) => completedTaskIds.includes(id)), totalTasks: validTaskIds.length, completedTasks: completedTaskIds.length };
}

export async function GET(request: Request) {
  const result = await requireEnterprisePermission(request, "challenge.view");
  if (result.response) return result.response;
  return ok({ access: result.access, ...(await onboardingState(result)) }, "Enterprise onboarding loaded.");
}

export async function PATCH(request: Request) {
  const result = await requireEnterprisePermission(request, "challenge.view");
  if (result.response) return result.response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const taskId = String(parsed.body?.taskId ?? "");
  const completed = parsed.body?.completed !== false;
  const validTaskIds = enterpriseOnboardingTaskIds(result.access);
  if (!validTaskIds.includes(taskId)) return validationError({ taskId: "Choose an onboarding task available to your Enterprise role." });
  const ref = result.db.collection("enterpriseOnboarding").doc(result.user.uid);
  await result.db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = Array.isArray(snap.data()?.completedTaskIds) ? snap.data()!.completedTaskIds.filter((value: unknown): value is string => typeof value === "string") : [];
    const next = completed ? [...new Set([...existing, taskId])] : existing.filter((value: string) => value !== taskId);
    transaction.set(ref, { userId: result.user.uid, completedTaskIds: next, status: "in_progress", updatedAt: new Date().toISOString() }, { merge: true });
  });
  return ok(await onboardingState(result), "Onboarding progress saved.");
}

export async function POST(request: Request) {
  const result = await requireEnterprisePermission(request, "challenge.view");
  if (result.response) return result.response;
  const state = await onboardingState(result);
  if (!state.completed) return validationError({ onboarding: "Complete each onboarding acknowledgement before entering Enterprise Studio." });
  const now = new Date().toISOString();
  const update = { enterpriseOnboardingComplete: true, enterpriseStaffStatus: "active", staffAccess: { ...result.access, status: "active", onboardingComplete: true }, enterpriseOnboardingCompletedAt: now, updatedAt: now };
  const batch = result.db.batch();
  batch.set(result.db.collection("users").doc(result.user.uid), update, { merge: true });
  batch.set(result.db.collection("profiles").doc(result.user.uid), update, { merge: true });
  batch.set(result.db.collection("enterpriseOnboarding").doc(result.user.uid), { userId: result.user.uid, completedTaskIds: state.completedTaskIds, status: "completed", completedAt: now, updatedAt: now }, { merge: true });
  await batch.commit();
  return ok({ completed: true }, "Enterprise onboarding completed.");
}
