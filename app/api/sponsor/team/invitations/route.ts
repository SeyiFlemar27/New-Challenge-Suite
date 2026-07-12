import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { cleanText, isoNow, normalizeTeamRole, rolePermissions } from "@/lib/sponsor-operations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const email = cleanText(body.email).toLowerCase();
  if (!email.includes("@")) return validationError({ email: "A valid email is required." });
  try {
    const now = isoNow();
    const role = normalizeTeamRole(body.role);
    const ref = context.db.collection("sponsorInvitations").doc();
    const invite = { id: ref.id, sponsorId: context.user.uid, ownerUid: context.user.uid, email, role, permissionsFoundation: rolePermissions(role), messageFoundation: cleanText(body.message).slice(0, 800), status: "draft", emailDeliveryStatus: "not_configured", inviteTokenExposed: false, createdAt: now, updatedAt: now, createdBy: context.user.uid, updatedBy: context.user.uid };
    await Promise.all([ref.set(invite), context.db.collection("sponsorSettingsAuditLogs").add({ sponsorId: context.user.uid, action: "team_invite_foundation_created", targetEmail: email, emailSent: false, createdAt: now, createdBy: context.user.uid })]);
    return ok({ invitation: invite }, "Invite foundation saved. Email delivery is not configured and no invite email was sent.");
  } catch (error) {
    console.error("[sponsor-team-invite:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor invitation could not be saved.");
  }
}
