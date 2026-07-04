"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import {
  canAccessSponsorFeature,
  normalizeSponsorReviewStatus,
  normalizeSponsorSubscriptionStatus,
  sponsorGateCopy,
  sponsorStatusLabel,
  type SponsorFeatureKey
} from "@/lib/sponsor-access";

export function SponsorFeatureGate({
  feature,
  title,
  currentStatus,
  subscriptionStatus,
  children,
  primaryActionLabel,
  primaryActionHref,
  secondaryActionLabel = "Back to Overview",
  secondaryActionHref = "/sponsor/dashboard"
}: {
  feature: SponsorFeatureKey;
  title: string;
  currentStatus?: string | null;
  subscriptionStatus?: string | null;
  children: React.ReactNode;
  primaryActionLabel?: string;
  primaryActionHref?: string;
  secondaryActionLabel?: string;
  secondaryActionHref?: string;
}) {
  const status = normalizeSponsorReviewStatus(currentStatus);
  const normalizedSubscriptionStatus = normalizeSponsorSubscriptionStatus(subscriptionStatus);
  if (canAccessSponsorFeature(status, feature, normalizedSubscriptionStatus)) return <>{children}</>;

  const copy = sponsorGateCopy(status, normalizedSubscriptionStatus, title);
  return (
    <Card className="mx-auto mt-8 max-w-3xl border-yellow-500/30 p-6 text-center sm:p-8 lg:p-10">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[8px] bg-[var(--gold)]/10 text-[var(--gold)]">
        {status === "suspended" ? <ShieldCheck size={28} /> : <LockKeyhole size={28} />}
      </div>
      <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">
        Current status: {sponsorStatusLabel(status)}
      </p>
      <h1 className="mt-3 text-2xl font-black sm:text-3xl">{copy.title}</h1>
      <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">{copy.description}</p>
      <div className="mt-7 grid gap-3 sm:flex sm:justify-center">
        <LinkButton href={primaryActionHref ?? copy.primaryActionHref}>{primaryActionLabel ?? copy.primaryActionLabel}</LinkButton>
        <LinkButton href={secondaryActionHref} variant="secondary">{secondaryActionLabel}</LinkButton>
      </div>
      <p className="mt-6 text-xs leading-5 text-slate-500">
        Approval unlocks product access only. Sponsor money capture and release remain inactive.
      </p>
    </Card>
  );
}
