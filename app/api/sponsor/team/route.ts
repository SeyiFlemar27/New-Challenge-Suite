import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { rolePermissions, teamRoles } from "@/lib/sponsor-operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const [membersSnap, invitationsSnap] = await Promise.all([
      context.db.collection("sponsorTeamMembers").where("sponsorId", "==", context.user.uid).limit(100).get(),
      context.db.collection("sponsorInvitations").where("sponsorId", "==", context.user.uid).limit(100).get()
    ]);
    const owner = { id: context.user.uid, sponsorId: context.user.uid, userId: context.user.uid, email: context.sponsorProfile.businessEmail ?? "Owner email not available", role: "owner", status: "active", permissions: rolePermissions("owner"), lastActiveFoundation: "Current account" };
    return ok({ members: [owner, ...membersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))], invitations: invitationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), roles: teamRoles.map((role) => ({ role, permissions: rolePermissions(role) })), emailProviderConfigured: false }, "Sponsor team foundation loaded.");
  } catch (error) {
    console.error("[sponsor-team:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor team could not be loaded.");
  }
}
