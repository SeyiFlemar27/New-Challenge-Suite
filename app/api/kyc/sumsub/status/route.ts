import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { loadKycMetadata } from "@/lib/server/kyc";
import { ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sumsub KYC status");
  const metadata = await loadKycMetadata(db, user.uid);
  return ok({ kyc: metadata }, "KYC metadata loaded.");
}
