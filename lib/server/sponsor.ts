import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser, type RequestUser } from "@/lib/server/auth";
import { fail, forbidden, serverError, serverUnavailable } from "@/lib/server/responses";
import { hasSponsorPermission, resolveSponsorOrganizationAccess, type SponsorOrganizationAccess, type SponsorPermission } from "@/lib/server/sponsor-organizations";

export type SponsorServerContext = {
  user: RequestUser;
  db: FirebaseFirestore.Firestore;
  sponsorId: string;
  organizationId: string;
  sponsorAccess: SponsorOrganizationAccess;
  sponsorProfile: Record<string, unknown>;
};

export async function requireSponsorContext(request: Request, options: { allowHistorical?: boolean } = {}): Promise<{ context: SponsorServerContext | null; response: Response | null }> {
  const { user, response } = await requireRequestUser(request);
  if (response) return { context: null, response };
  const db = getAdminDb();
  if (!db) return { context: null, response: serverUnavailable("Sponsor workspace") };
  try {
    const [userSnap, profileSnap, sponsorAccess] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get(),
      resolveSponsorOrganizationAccess(db, user.uid, { includeHistorical: options.allowHistorical === true })
    ]);
    if (!sponsorAccess) return { context: null, response: forbidden(options.allowHistorical ? "Sponsor account access is required." : "Active Sponsor workspace access is required.") };
    const sponsorSnap = await db.collection("sponsorProfiles").doc(sponsorAccess.organizationId).get();
    const userData = userSnap.exists ? userSnap.data() ?? {} : {};
    const profileData = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const sponsorData = sponsorSnap.exists ? sponsorSnap.data() ?? {} : {};
    return { context: { user, db, sponsorId: sponsorAccess.organizationId, organizationId: sponsorAccess.organizationId, sponsorAccess, sponsorProfile: { ...profileData, ...userData, ...sponsorData, userId: user.uid, sponsorOrganizationId: sponsorAccess.organizationId } }, response: null };
  } catch (error) {
    console.error("[sponsor-context]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return { context: null, response: serverError("Sponsor access could not be verified.") };
  }
}

export function requireSponsorPermission(context: SponsorServerContext, permission: SponsorPermission) {
  return hasSponsorPermission(context.sponsorAccess, permission) ? null : forbidden("You do not have permission to perform this Sponsor workspace action.");
}

export async function assertSponsorOwnedDoc(db: FirebaseFirestore.Firestore, collection: string, id: string, sponsorId: string) {
  const snap = await db.collection(collection).doc(id).get();
  if (!snap.exists) return { snap, response: fail("Record not found.", 404, undefined, "NOT_FOUND") };
  const data = snap.data() ?? {};
  const access = await resolveSponsorOrganizationAccess(db, sponsorId);
  const authorizedIds = new Set([sponsorId, access?.organizationId].filter((value): value is string => Boolean(value)));
  if (!authorizedIds.has(String(data.sponsorId ?? "")) && !authorizedIds.has(String(data.ownerUid ?? "")) && !authorizedIds.has(String(data.createdBy ?? ""))) {
    return { snap, response: forbidden("You can only access your own sponsor records.") };
  }
  return { snap, response: null };
}
