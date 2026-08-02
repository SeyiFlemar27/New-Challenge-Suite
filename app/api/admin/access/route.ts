import { requireAdminPermission } from "@/lib/server/auth";
import { ok } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireAdminPermission(request, "admin.dashboard.view");
  if (response) return response;
  return ok({
    authorized: true,
    uid: user.uid,
    roles: user.adminRoles ?? [],
    permissions: user.adminPermissions ?? [],
    secondFactorRequired: user.adminSecondFactorRequired === true,
    secondFactorVerified: user.adminSecondFactorVerified === true,
    developerToolsAvailable: process.env.NODE_ENV !== "production" && Boolean(user.adminPermissions?.includes("developerTools.view"))
  }, "Admin access verified.");
}
