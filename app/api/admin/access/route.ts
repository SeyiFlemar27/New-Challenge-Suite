import { requireAdminUser } from "@/lib/server/auth";
import { ok } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  return ok({ authorized: true, uid: user.uid }, "Admin access verified.");
}
