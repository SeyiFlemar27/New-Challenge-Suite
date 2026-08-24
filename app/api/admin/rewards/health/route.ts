import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "rewards.view");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Reward health");
  const [settings, failedFulfillments, reviewFulfillments, openIssues] = await Promise.all([
    db.collection("rewardSettings").doc("default").get(),
    db.collection("rewardFulfillments").where("status", "==", "failed").limit(100).get(),
    db.collection("rewardFulfillments").where("status", "==", "awaiting_claim").limit(100).get(),
    db.collection("rewardReconciliationIssues").where("status", "==", "open").limit(100).get()
  ]);
  return ok({ settings: settings.data() ?? {}, health: { failedFulfillments: failedFulfillments.size, awaitingReview: reviewFulfillments.size, openReconciliationIssues: openIssues.size }, externalPayoutExecutionEnabled: false }, "Reward health loaded.");
}
