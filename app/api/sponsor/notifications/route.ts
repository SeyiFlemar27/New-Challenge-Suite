import { listUserNotifications } from "@/lib/server/notifications";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const notifications = await listUserNotifications(context.db, context.user.uid, 50);
    return ok({ notifications }, "Sponsor notifications loaded from the shared notification center.");
  } catch (error) {
    console.error("[sponsor-notifications:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor notifications could not be loaded.");
  }
}
