import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, readJson } from "@/lib/server/responses";
import { assertSandboxAllowed, sandboxProviderFoundation } from "@/lib/server/financial/sandbox";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "qaTools.use");
  if (response) return response;
  const guard = assertSandboxAllowed();
  if (!guard.allowed) return fail("Financial sandbox controls are not available in production.", 403, guard, "SANDBOX_DISABLED_IN_PRODUCTION");
  return ok({ guard, foundation: sandboxProviderFoundation() }, "Financial sandbox foundation loaded.");
}

export async function POST(request: Request) {
  const { response } = await requireAdminPermission(request, "qaTools.use");
  if (response) return response;
  const guard = assertSandboxAllowed();
  if (!guard.allowed) return fail("Financial sandbox controls are not available in production.", 403, guard, "SANDBOX_DISABLED_IN_PRODUCTION");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const action = String((parsed.body as Record<string, unknown>)?.action ?? "");
  const foundation = sandboxProviderFoundation();
  if (!foundation.supportedActions.includes(action)) return fail("Unsupported sandbox action.", 400, { supportedActions: foundation.supportedActions }, "SANDBOX_ACTION_UNSUPPORTED");
  return ok({ action, eventDrivenOnly: true, directSetBalanceAllowed: false, ledgerServiceRequired: true, payoutProviderCalled: false }, "Sandbox action accepted as foundation-only. No production money movement occurred.");
}
