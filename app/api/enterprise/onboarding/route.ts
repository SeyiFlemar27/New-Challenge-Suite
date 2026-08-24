import { requireEnterprisePermission } from "@/lib/server/enterprise-access";
import { ENTERPRISE_ONBOARDING_DEFINITION_VERSION, enterpriseOnboardingModules, enterpriseOnboardingPermissionFingerprint, enterpriseOnboardingRequiredTaskIds, enterpriseOnboardingTaskIds } from "@/lib/enterprise-onboarding";
import { ok, readJson, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

async function onboardingState(result: Awaited<ReturnType<typeof requireEnterprisePermission>>) {
  const [snap, actionsSnap] = await Promise.all([
    result.db!.collection("enterpriseOnboarding").doc(result.user!.uid).get(),
    result.db!.collection("auditLogs").where("actorId", "==", result.user!.uid).limit(200).get().catch(() => null)
  ]);
  const data = snap.data() ?? {};
  const modules = enterpriseOnboardingModules(result.access!);
  const validTaskIds = enterpriseOnboardingTaskIds(result.access!);
  const requiredTaskIds = enterpriseOnboardingRequiredTaskIds(result.access!);
  const stored = Array.isArray(data.completedTaskIds) ? data.completedTaskIds.filter((value): value is string => typeof value === "string") : [];
  const actions = new Set(actionsSnap?.docs.map((doc) => String(doc.data().action ?? "")) ?? []);
  const automatic = modules.flatMap((module) => module.tasks.filter((task) => task.completionMode === "audited_action" && task.sourceActions?.some((action) => actions.has(action))).map((task) => task.id));
  const completedTaskIds = [...new Set([...stored, ...automatic])].filter((id) => validTaskIds.includes(id));
  const permissionFingerprint = enterpriseOnboardingPermissionFingerprint(result.access!);
  return { modules, completedTaskIds, automaticallyCompletedTaskIds: automatic, completed: requiredTaskIds.every((id) => completedTaskIds.includes(id)), totalTasks: requiredTaskIds.length, completedTasks: requiredTaskIds.filter((id) => completedTaskIds.includes(id)).length, definitionVersion: ENTERPRISE_ONBOARDING_DEFINITION_VERSION, permissionFingerprint };
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
  const task = enterpriseOnboardingModules(result.access).flatMap((module) => module.tasks).find((item) => item.id === taskId);
  if (task?.completionMode === "audited_action") return validationError({ taskId: "This task completes automatically after the corresponding Enterprise action." });
  const ref = result.db.collection("enterpriseOnboarding").doc(result.user.uid);
  await result.db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = Array.isArray(snap.data()?.completedTaskIds) ? snap.data()!.completedTaskIds.filter((value: unknown): value is string => typeof value === "string") : [];
    const next = completed ? [...new Set([...existing, taskId])] : existing.filter((value: string) => value !== taskId);
    const now = new Date().toISOString();
    const history = Array.isArray(snap.data()?.completionHistory) ? snap.data()!.completionHistory : [];
    transaction.set(ref, { userId: result.user.uid, completedTaskIds: next, completionHistory: [...history, { taskId, completed, source: "acknowledgement", at: now }].slice(-250), definitionVersion: ENTERPRISE_ONBOARDING_DEFINITION_VERSION, permissionFingerprint: enterpriseOnboardingPermissionFingerprint(result.access), status: "in_progress", updatedAt: now }, { merge: true });
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
  batch.set(result.db.collection("enterpriseOnboarding").doc(result.user.uid), { userId: result.user.uid, completedTaskIds: state.completedTaskIds, definitionVersion: state.definitionVersion, permissionFingerprint: state.permissionFingerprint, status: "completed", completedAt: now, updatedAt: now }, { merge: true });
  await batch.commit();
  return ok({ completed: true }, "Enterprise onboarding completed.");
}
