import { getAdminDb } from "@/lib/firebase/admin";
import { processSponsorCompletion } from "@/lib/server/sponsor-completion";
import { processEnterpriseAccessLifecycle } from "@/lib/server/enterprise-access-lifecycle";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== "Bearer " + secret) return fail("Scheduled operation is not authorized.", 401, undefined, "CRON_UNAUTHORIZED");
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor completion scheduler");
  const [outcomes, enterpriseAccessOutcomes] = await Promise.all([processSponsorCompletion(db), processEnterpriseAccessLifecycle(db)]);
  return ok({ outcomes, processed: outcomes.length, enterpriseAccessOutcomes, enterpriseAccessProcessed: enterpriseAccessOutcomes.length, externalPayoutExecuted: false, externalRefundExecuted: false }, "Scheduled lifecycle checks processed.");
}
