import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { getSubscriptionPlansForUser } from "@/lib/server/subscriptions";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { normalizeAccountType, normalizePlanId } from "@/lib/plan-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getOptionalRequestUser(request);
  if (!user) {
    return ok({
      authenticated: false,
      currentPlanId: "free",
      accountType: "user",
      subscriptionStatus: "free",
      subscription: { stripeStatus: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, planId: null },
      plans: getSubscriptionPlansForUser("free", "user")
    }, "Public subscription plans loaded.");
  }

  const db = getAdminDb();
  if (!db) return serverUnavailable("Subscriptions");

  try {
    const [userSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get()
    ]);
    const account = userSnap.exists ? userSnap.data() ?? {} : {};
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const currentPlanId = normalizePlanId(account.planId ?? profile.planId ?? "free");
    const accountType = normalizeAccountType({ ...profile, ...account, planId: currentPlanId });

    return ok({
      authenticated: true,
      currentPlanId,
      accountType,
      subscriptionStatus: account.subscriptionStatus ?? profile.subscriptionStatus ?? "free",
      subscription: {
        stripeStatus: account.stripeStatus ?? profile.stripeStatus ?? null,
        currentPeriodEnd: account.subscriptionCurrentPeriodEnd ?? profile.subscriptionCurrentPeriodEnd ?? null,
        cancelAtPeriodEnd: Boolean(account.subscriptionCancelAtPeriodEnd ?? profile.subscriptionCancelAtPeriodEnd),
        planId: account.subscriptionPlanId ?? profile.subscriptionPlanId ?? null
      },
      plans: getSubscriptionPlansForUser(currentPlanId, accountType)
    }, "Subscription plans loaded.");
  } catch (error) {
    return serverError("Subscription plans could not be loaded.", error instanceof Error ? error.message : error);
  }
}
