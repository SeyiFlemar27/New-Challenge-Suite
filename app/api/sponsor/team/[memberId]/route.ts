import { ok, readJson, serverError } from "@/lib/server/responses";
import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { isoNow, normalizeTeamRole, normalizeTeamStatus, rolePermissions } from "@/lib/sponsor-operations";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ memberId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { memberId } = await params;
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const owned = await assertSponsorOwnedDoc(context.db, "sponsorTeamMembers", memberId, context.user.uid);
  if (owned.response) return owned.response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  try {
    const now = isoNow();
    const role = normalizeTeamRole(body.role ?? owned.snap.data()?.role);
    const update = { role, status: normalizeTeamStatus(body.status ?? owned.snap.data()?.status), permissionsFoundation: rolePermissions(role), ownerTransferStatus: "disabled_foundation", updatedAt: now, updatedBy: context.user.uid };
    await Promise.all([owned.snap.ref.set(update, { merge: true }), context.db.collection("sponsorSettingsAuditLogs").add({ sponsorId: context.user.uid, action: "team_member_foundation_updated", memberId, createdAt: now, createdBy: context.user.uid })]);
    return ok({ member: { id: memberId, ...(owned.snap.data() ?? {}), ...update } }, "Team member foundation updated. Security enforcement remains server-side where implemented.");
  } catch (error) {
    console.error("[sponsor-team-member:patch]", { userId: context.user.uid, memberId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor team member could not be updated.");
  }
}
