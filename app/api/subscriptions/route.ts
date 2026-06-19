import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { getSubscriptionPlansForUser } from "@/lib/server/subscriptions";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Subscriptions");

  try {
    const [userSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get()
    ]);
    const account = userSnap.exists ? userSnap.data() ?? {} : {};
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const currentPlanId = account.planId ?? profile.planId ?? "observer";

    return ok({
      currentPlanId,
      subscriptionStatus: account.subscriptionStatus ?? profile.subscriptionStatus ?? "free",
      plans: getSubscriptionPlansForUser(currentPlanId)
    }, "Subscription plans loaded.");
  } catch (error) {
    return serverError("Subscription plans could not be loaded.", error instanceof Error ? error.message : error);
  }
}
