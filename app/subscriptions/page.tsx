"use client";

import { useEffect, useState } from "react";
import { Check, Eye, Handshake, LockKeyhole, Swords } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { ConsentDialog } from "@/components/consent-dialog";
import { money } from "@/lib/utils";
import { createSubscriptionCheckout, fetchSubscriptionPlans } from "@/lib/api/services";
import type { SubscriptionPlan } from "@/lib/types";

export default function SubscriptionsPage() {
  const [audience, setAudience] = useState<"creator" | "sponsor">("creator");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [unauthenticated, setUnauthenticated] = useState(false);
  const visiblePlans = plans.filter((plan) => plan.audience === audience);

  async function loadPlans() {
    setLoading(true);
    setError("");
    setUnauthenticated(false);
    const result = await fetchSubscriptionPlans();
    if (!result.ok || !result.data) {
      const code = (result as any).code;
      setPlans([]);
      setUnauthenticated(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED");
      setError(result.message || "Subscription plans could not be loaded.");
      setLoading(false);
      return;
    }
    setPlans(result.data.plans);
    setLoading(false);
  }

  useEffect(() => {
    loadPlans();
  }, []);

  async function checkout(planId: string) {
    setLoadingPlan(planId);
    setError("");
    setCheckoutMessage("");
    const result = await createSubscriptionCheckout(planId);
    setLoadingPlan(null);
    if (!result.ok || !result.data?.url) {
      setError(result.message || "Checkout could not be started. Please try again.");
      return;
    }
    setCheckoutMessage("Checkout started. Your plan updates after Stripe confirms payment.");
    window.location.href = result.data.url;
  }

  return (
    <AppShell>
      <div className="text-center"><PageTitle title="Choose Your Identity" subtitle="Unlock the full potential of the Challenge Suite." /></div>
      <div className="mx-auto mt-8 flex w-full max-w-[520px] rounded-full bg-[#111] p-2">
        <Button variant={audience === "creator" ? "purple" : "ghost"} className="flex-1 rounded-full" onClick={() => setAudience("creator")}>Creators & Competitors</Button>
        <Button variant={audience === "sponsor" ? "purple" : "ghost"} className="flex-1 rounded-full" onClick={() => setAudience("sponsor")}>Brands & Sponsors</Button>
      </div>
      {error ? <Card className="mx-auto mt-6 max-w-3xl border-red-500/30 bg-red-950/30 p-4 text-red-100">{error}</Card> : null}
      {checkoutMessage ? <Card className="mx-auto mt-6 max-w-3xl border-emerald-500/30 bg-emerald-950/30 p-4 text-emerald-100">{checkoutMessage}</Card> : null}
      {loading ? (
        <div className="mt-14 grid gap-7 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Card key={item} className="h-[520px] animate-pulse bg-[#10151e]" />)}
        </div>
      ) : unauthenticated ? (
        <Card className="mx-auto mt-14 max-w-3xl">
          <EmptyState icon={<LockKeyhole />} title="Sign in required" body={error || "Sign in with a verified account to view your current subscription options."} action={<LinkButton href="/auth/login">Sign In</LinkButton>} />
        </Card>
      ) : !visiblePlans.length ? (
        <Card className="mx-auto mt-14 max-w-3xl">
          <EmptyState icon={<Swords />} title="No plans available" body="Subscription plans are not available for this audience yet." action={<Button onClick={loadPlans}>Retry</Button>} />
        </Card>
      ) : (
      <div className="mt-14 grid gap-7 md:grid-cols-2 xl:grid-cols-4">
        {visiblePlans.map((plan) => (
          <Card key={plan.id} className={`relative p-8 ${plan.recommended ? "border-purple-500 bg-yellow-500/10" : "bg-[#10151e]"}`}>
            {plan.recommended ? <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#765cf6] px-7 py-2 text-sm font-bold">Recommended</span> : null}
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-purple-950 text-purple-200">{plan.audience === "sponsor" ? <Handshake size={34} /> : plan.name === "Observer" ? <Eye size={34} /> : <Swords size={34} />}</div>
            <h2 className="mt-8 text-center text-3xl font-black">{plan.name}</h2>
            <p className="mt-4 text-center">{plan.subtitle}</p>
            <div className="mt-6 text-center text-4xl font-black">{money(plan.priceMonthly)}<span className="text-base font-normal">/month</span></div>
            <div className="my-8 border-t border-white/10" />
            <ul className="space-y-4">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm"><Check size={16} className="shrink-0 text-emerald-400" /> {feature}</li>)}</ul>
            <div className="mt-8">
              {plan.current ? <Button variant="ghost" className="w-full" disabled>Current Tier</Button> : plan.priceMonthly <= 0 ? <Button variant="ghost" className="w-full" disabled>Free Tier</Button> : plan.audience === "sponsor" ? <ConsentDialog agreementType="sponsor" actionLabel={loadingPlan === plan.id ? "Starting Checkout..." : "Partner With Us"} onAccepted={() => checkout(plan.id)} /> : <ConsentDialog agreementType="dorocoin" actionLabel={loadingPlan === plan.id ? "Starting Checkout..." : "Select Plan"} onAccepted={() => checkout(plan.id)} />}
            </div>
          </Card>
        ))}
      </div>
      )}
    </AppShell>
  );
}
