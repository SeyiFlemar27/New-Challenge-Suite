import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { loadKycMetadata } from "@/lib/server/kyc";
import { ok, serverUnavailable } from "@/lib/server/responses";
import { getSumsubConfig } from "@/lib/server/sumsub";

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
  const metadata = await loadKycMetadata(db, user.uid);
  if (!metadata.kycRequired) return ok({ kyc: metadata, notRequired: true }, "KYC is not required for your current plan.");
  if (!getSumsubConfig().configured) {
    const now = new Date().toISOString();
    const update = { kycRequired: true, kycStatus: "provider_not_configured", premiumAccessState: "pending_kyc", kycProvider: "sumsub", rawIdentityStored: false, kycLastCheckedAt: now, updatedAt: now };
    await Promise.all([
      db.collection("users").doc(user.uid).set(update, { merge: true }),
      db.collection("profiles").doc(user.uid).set(update, { merge: true }),
      db.collection("kycMetadata").doc(user.uid).set({ userId: user.uid, ...update, createdAt: now }, { merge: true })
    ]);
    return ok({ kyc: { ...metadata, ...update }, providerConfigured: false }, "KYC provider is not configured yet.");
  }
  return ok({ kyc: metadata, providerConfigured: true, startEndpoint: "/api/kyc/sumsub/start" }, "Use the Sumsub start endpoint to launch verification.");
}
