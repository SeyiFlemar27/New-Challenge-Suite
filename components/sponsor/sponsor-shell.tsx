"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, CreditCard, LayoutDashboard, LockKeyhole, Megaphone, MessageSquare, PieChart, PlusCircle, Settings, Store, Target, Users, Menu, X, BadgeDollarSign } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { ProductWalkthrough } from "@/components/product-walkthrough";
import { Card } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { getPlanExperience } from "@/lib/plan-access";
import { canAccessSponsorFeature, normalizeSponsorReviewStatus, normalizeSponsorSubscriptionStatus, sponsorStatusLabel, type SponsorFeatureKey } from "@/lib/sponsor-access";

const sponsorNav: Array<{ label: string; icon: typeof LayoutDashboard; href: string; feature: SponsorFeatureKey }> = [
  { label: "Overview", icon: LayoutDashboard, href: "/sponsor/dashboard", feature: "overview" },
  { label: "Campaigns", icon: Megaphone, href: "/sponsor/campaigns", feature: "campaigns" },
  { label: "Sponsor Challenges", icon: Store, href: "/sponsor/challenges", feature: "challenges" },
  { label: "Create Campaign", icon: PlusCircle, href: "/sponsor/create-campaign", feature: "create_campaign" },
  { label: "Brand Profile", icon: Building2, href: "/sponsor/onboarding", feature: "brand_profile" },
  { label: "Sponsor Plans", icon: BadgeDollarSign, href: "/sponsor/plans", feature: "plans" },
  { label: "Placements", icon: Target, href: "/sponsor/placements", feature: "placements" },
  { label: "Audience Insights", icon: PieChart, href: "/sponsor/insights", feature: "insights" },
  { label: "Reports", icon: BarChart3, href: "/sponsor/reports", feature: "reports" },
  { label: "Budget & Billing", icon: CreditCard, href: "/sponsor/billing", feature: "billing" },
  { label: "Team Members", icon: Users, href: "/sponsor/team", feature: "team" },
  { label: "Messages", icon: MessageSquare, href: "/sponsor/messages", feature: "messages" },
  { label: "Settings", icon: Settings, href: "/sponsor/settings", feature: "settings" }
];

export interface SponsorShellProfile {
  brandName?: string | null;
  businessEmail?: string | null;
  sponsorVerificationStatus?: string | null;
  sponsorOnboardingStatus?: string | null;
  planId?: string | null;
  planStatus?: string | null;
  subscriptionStatus?: string | null;
  stripeStatus?: string | null;
}

export function SponsorShell({ children, profile }: { children: React.ReactNode; profile?: SponsorShellProfile | null }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadedProfile, setLoadedProfile] = useState<SponsorShellProfile | null>(profile ?? null);
  const effectiveProfile = profile ?? loadedProfile;
  const brandName = effectiveProfile?.brandName || "Brand Command Center";
  const verificationStatus = normalizeSponsorReviewStatus(effectiveProfile?.sponsorVerificationStatus);
  const subscriptionStatus = normalizeSponsorSubscriptionStatus(effectiveProfile?.subscriptionStatus ?? effectiveProfile?.planStatus ?? effectiveProfile?.stripeStatus);
  const experience = getPlanExperience({ planId: effectiveProfile?.planId, planStatus: effectiveProfile?.planStatus, accountType: "sponsor" });
  useEffect(() => {
    if (profile) {
      setLoadedProfile(profile);
      return;
    }
    void apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile").then((result) => {
      if (result.ok && result.data) setLoadedProfile(result.data.sponsorProfile);
    });
  }, [profile]);
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-black text-white">
      <ProductWalkthrough />
      <div className="grid min-h-screen md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="hidden border-b border-white/10 bg-[#0b0b0b] px-5 py-6 md:block md:border-b-0 md:border-r">
          <div className="flex items-center gap-4">
            <BrandLogo imageClassName="h-14 w-14 border border-[var(--gold)]" />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--gold)]">Sponsor</p>
              <h1 className="text-lg font-black leading-tight">{brandName}</h1>
            </div>
          </div>
          <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-200">Review Status</p>
            <p className="mt-2 text-sm font-bold text-white">{sponsorStatusLabel(verificationStatus)}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">{verificationStatus === "approved" ? "Sponsor tools are available according to your plan." : "Open a locked feature to see the exact approval step required."}</p>
            <p className="mt-3 border-t border-white/10 pt-3 text-xs font-black text-[var(--gold)]">{experience.badgeLabel} / {subscriptionStatus.replaceAll("_", " ")} / {experience.teamMemberLimit} team seat{experience.teamMemberLimit === 1 ? "" : "s"}</p>
          </Card>
          <nav className="mt-6 grid gap-2">
            {sponsorNav.map((item) => {
              const Icon = item.icon;
              const locked = !canAccessSponsorFeature(verificationStatus, item.feature, subscriptionStatus);
              const active = pathname === item.href;
              return <Link key={item.label} href={item.href} aria-current={active ? "page" : undefined} aria-label={`${item.label}${locked ? `, locked while sponsor status is ${sponsorStatusLabel(verificationStatus)}` : ""}`} title={locked ? `${item.label} is locked. Open for approval requirements.` : item.label} className={`flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-left text-sm font-bold transition ${active ? "bg-[var(--gold)] text-black" : locked ? "text-slate-500 hover:bg-white/5 hover:text-slate-300" : "text-slate-200 hover:bg-[var(--gold)] hover:text-black"}`}><Icon size={17} /><span className="min-w-0 flex-1">{item.label}</span>{locked ? <LockKeyhole size={14} className="shrink-0" /> : null}</Link>;
            })}
          </nav>
          <Link href="/landing" className="mt-6 block rounded-[8px] border border-white/10 px-4 py-3 text-center text-sm font-bold text-slate-300 transition hover:border-[var(--gold)] hover:text-white">
            View public site
          </Link>
        </aside>
        <section className="min-w-0 px-5 pb-12 pt-6 sm:px-6 md:px-8 md:py-8 lg:px-10 xl:px-12">
          <div className="mb-8 md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo imageClassName="h-12 w-12 border border-[var(--gold)]" />
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--gold)]">Sponsor</p>
                  <h1 className="truncate text-lg font-black leading-tight">{brandName}</h1>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 text-[var(--gold)]" aria-label="Open sponsor navigation"><Menu /></button>
            </div>
            <Card className="mt-4 border-yellow-500/20 bg-yellow-500/5 p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-yellow-200">Review Status</p>
              <p className="mt-1 text-sm font-bold text-white">{sponsorStatusLabel(verificationStatus)}</p>
            </Card>
          </div>
          {drawerOpen ? <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="Sponsor navigation"><button className="absolute inset-0 bg-black/80" onClick={() => setDrawerOpen(false)} aria-label="Close sponsor navigation" /><aside className="absolute bottom-0 right-0 top-0 w-[min(88vw,360px)] overflow-y-auto border-l border-[var(--gold)]/20 bg-[#0b0b0b] p-5"><div className="flex items-center justify-between"><p className="text-lg font-black">{brandName}</p><button onClick={() => setDrawerOpen(false)} className="flex h-12 w-12 items-center justify-center rounded-[8px] border border-white/10" aria-label="Close menu"><X /></button></div><nav className="mt-6 space-y-2">{sponsorNav.map((item) => { const Icon = item.icon; const locked = !canAccessSponsorFeature(verificationStatus, item.feature, subscriptionStatus); const active = pathname === item.href; return <Link key={item.label} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setDrawerOpen(false)} className={`flex min-h-12 items-center gap-3 rounded-[8px] px-4 font-bold ${active ? "bg-[var(--gold)] text-black" : locked ? "text-slate-500 hover:bg-white/5" : "text-slate-200 hover:bg-[var(--gold)] hover:text-black"}`}><Icon size={18} /><span className="min-w-0 flex-1">{item.label}</span>{locked ? <LockKeyhole size={15} /> : null}</Link>; })}</nav><Link href="/landing" onClick={() => setDrawerOpen(false)} className="mt-6 block rounded-[8px] border border-white/10 p-3 text-center font-bold">Public Site</Link></aside></div> : null}
          {children}
        </section>
      </div>
    </main>
  );
}

export function SponsorPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-black text-[var(--gold)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
    </Card>
  );
}
