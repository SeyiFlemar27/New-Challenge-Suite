import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { loadKycMetadata } from "@/lib/server/kyc";
import { ok, readJson, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("KYC status");
  const metadata = await loadKycMetadata(db, user.uid);
  return ok({ kyc: metadata }, "KYC metadata loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("KYC start");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const now = new Date().toISOString();
  const metadata = await loadKycMetadata(db, user.uid);
  if (!metadata.providerConfigured) {
    return ok({ kyc: metadata, providerConfigured: false }, "KYC provider not configured yet.");
  }
  const sessionId = `kyc_${user.uid}_${Date.now()}`;
  const update = {
    kycRequired: metadata.kycRequired,
    kycStatus: "in_progress",
    kycProvider: metadata.kycProvider,
    kycSessionId: sessionId,
    kycSubmittedAt: null,
    kycVerifiedAt: null,
    kycRejectedAt: null,
    kycFailureReason: null,
    kycLastCheckedAt: now,
    rawIdentityStored: false,
    updatedAt: now
  };
  await Promise.all([
    db.collection("users").doc(user.uid).set(update, { merge: true }),
    db.collection("profiles").doc(user.uid).set(update, { merge: true }),
    db.collection("kycMetadata").doc(user.uid).set({ userId: user.uid, ...update, createdAt: now }, { merge: true })
  ]);
  return ok({ kyc: { ...metadata, ...update }, providerConfigured: true }, "KYC session foundation started.");
}
