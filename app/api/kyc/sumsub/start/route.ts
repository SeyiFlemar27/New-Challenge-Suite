import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { loadKycMetadata, premiumRequiresKyc } from "@/lib/server/kyc";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { getSumsubClient, getSumsubConfig } from "@/lib/server/sumsub";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sumsub KYC start");

  const config = getSumsubConfig();
  const metadata = await loadKycMetadata(db, user.uid);
  if (!metadata.kycRequired) {
    return ok({ kyc: metadata, notRequired: true }, "KYC is not required for your current plan.");
  }
  if (!config.configured) {
    const now = new Date().toISOString();
    const update = { kycRequired: true, kycStatus: "provider_not_configured", kycProvider: "sumsub", providerConfigured: false, kycLastCheckedAt: now, rawIdentityStored: false, updatedAt: now };
    await Promise.all([
      db.collection("users").doc(user.uid).set(update, { merge: true }),
      db.collection("profiles").doc(user.uid).set(update, { merge: true }),
      db.collection("kycMetadata").doc(user.uid).set({ userId: user.uid, ...update, createdAt: now }, { merge: true })
    ]);
    return ok({ kyc: { ...metadata, ...update }, providerConfigured: false }, "KYC provider is not configured yet.");
  }

  const userSnap = await db.collection("users").doc(user.uid).get();
  const profile = userSnap.data() ?? {};
  if (!premiumRequiresKyc(profile)) {
    return ok({ kyc: metadata, notRequired: true }, "KYC is not required for your current plan.");
  }

  const client = getSumsubClient();
  const now = new Date().toISOString();
  try {
    let applicantId = typeof metadata.sumsubApplicantId === "string" ? metadata.sumsubApplicantId : null;
    if (!applicantId) {
      try {
        const existing = await client.getApplicantByExternalUserId(user.uid);
        applicantId = typeof existing.id === "string" ? existing.id : null;
      } catch {
        applicantId = null;
      }
    }
    if (!applicantId) {
      const created = await client.createApplicant(user.uid, { email: user.email ?? null, fullName: typeof profile.displayName === "string" ? profile.displayName : null });
      applicantId = typeof created.id === "string" ? created.id : null;
    }
    if (!applicantId) return fail("KYC provider could not create an applicant session.", 502, undefined, "KYC_PROVIDER_ERROR");

    const token = await client.createAccessToken(user.uid, applicantId);
    if (!token.token) return fail("KYC provider did not return an access token.", 502, undefined, "KYC_PROVIDER_ERROR");
    const expiresAt = new Date(Date.now() + Number(token.expiresIn ?? 1200) * 1000).toISOString();
    const update = {
      kycRequired: true,
      kycStatus: metadata.kycStatus === "pending_review" ? "pending_review" : "in_progress",
      premiumAccessState: "pending_kyc",
      kycProvider: "sumsub",
      kycSessionId: token.userId ?? `sumsub_${user.uid}_${Date.now()}`,
      sumsubApplicantId: applicantId,
      sumsubLevelName: config.levelName,
      sumsubEnvironment: config.environment,
      kycLastCheckedAt: now,
      rawIdentityStored: false,
      updatedAt: now
    };
    await Promise.all([
      db.collection("users").doc(user.uid).set(update, { merge: true }),
      db.collection("profiles").doc(user.uid).set(update, { merge: true }),
      db.collection("kycMetadata").doc(user.uid).set({ userId: user.uid, ...update, createdAt: now }, { merge: true })
    ]);
    return ok({ accessToken: token.token, applicantId, levelName: config.levelName, expiresAt, kyc: { ...metadata, ...update } }, "Sumsub verification session started.");
  } catch (error) {
    console.error("[sumsub:start]", { userId: user.uid, error: error instanceof Error ? error.message : "Unknown Sumsub error" });
    const update = { kycStatus: "provider_error", kycProvider: "sumsub", kycFailureReason: "Sumsub session could not be started.", kycLastCheckedAt: now, updatedAt: now, rawIdentityStored: false };
    await db.collection("kycMetadata").doc(user.uid).set({ userId: user.uid, ...update, createdAt: now }, { merge: true });
    return serverError("KYC provider could not be reached.", "Sumsub session start failed.");
  }
}
