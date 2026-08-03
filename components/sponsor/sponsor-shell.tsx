"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, Handshake, LayoutDashboard, LifeBuoy, LockKeyhole, Megaphone, Menu, Search, Settings, UserRoundCheck, X } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { ProductWalkthrough } from "@/components/product-walkthrough";
import { Card } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { getPlanExperience } from "@/lib/plan-access";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";
import { MobileFooter } from "@/components/mobile-footer";

export interface SponsorShellProfile {
  brandName?: string | null;
  businessEmail?: string | null;
  sponsorVerificationStatus?: string | null;
  sponsorOnboardingStatus?: string | null;
  planId?: string | null;
  planStatus?: string | null;
  subscriptionStatus?: string | null;
  stripeStatus?: string | null;
  hasSponsorConversations?: boolean;
  sponsorConversationCount?: number;
  hasSponsorReportableData?: boolean;
  reportableSponsorRecordCount?: number;
  [key: string]: unknown;
}

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; available: boolean; lockedReason?: string | null };

export function SponsorShell({ children, profile }: { children: React.ReactNode; profile?: SponsorShellProfile | null }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadedProfile, setLoadedProfile] = useState<SponsorShellProfile | null>(profile ?? null);
  const effectiveProfile = profile ?? loadedProfile ?? {};
  const workspace = resolveSponsorWorkspaceState(effectiveProfile);
  const brandName = String(effectiveProfile.brandName || "Sponsor Workspace");
  const experience = getPlanExperience({ planId: effectiveProfile.planId, planStatus: effectiveProfile.planStatus, accountType: "sponsor" });

  useEffect(() => {
    if (profile) { setLoadedProfile(profile); return; }
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

  const items = useMemo<NavItem[]>(() => {
    if (!workspace.approved) return [
      { label: "Complete Profile", href: "/sponsor/onboarding", icon: UserRoundCheck, available: true },
      { label: "Billing & Plan", href: "/sponsor/billing", icon: CreditCard, available: true },
      { label: "Support", href: "/sponsor/support", icon: LifeBuoy, available: true },
      { label: "Settings", href: "/sponsor/settings", icon: Settings, available: true }
    ];
    const approvedItems: NavItem[] = [
      { label: "Overview", href: "/sponsor/dashboard", icon: LayoutDashboard, available: true },
      { label: "Campaigns", href: "/sponsor/campaigns", icon: Megaphone, available: workspace.canCreateCampaignBrief, lockedReason: workspace.lockedReason },
      { label: "Discover", href: "/sponsor/discover", icon: Search, available: workspace.canDiscover, lockedReason: workspace.lockedReason },
      { label: "Proposals", href: "/sponsor/proposals", icon: Handshake, available: workspace.canSendProposal, lockedReason: workspace.lockedReason }
    ];
    approvedItems.push({ label: "Billing & Plan", href: "/sponsor/billing", icon: CreditCard, available: true });
    approvedItems.push({ label: "Reports", href: "/sponsor/reports", icon: BarChart3, available: true });
    approvedItems.push(
      { label: "Settings", href: "/sponsor/settings", icon: Settings, available: true },
      { label: "Support", href: "/sponsor/support", icon: LifeBuoy, available: true }
    );
    return approvedItems;
  }, [workspace]);

  function navLink(item: NavItem) {
    const Icon = item.icon;
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (!item.available) return <div key={item.label} aria-disabled="true" title={item.lockedReason || `${item.label} is not available yet.`} className="flex min-h-11 cursor-not-allowed items-center gap-3 rounded-[8px] px-3 text-sm font-bold text-slate-400"><Icon size={17} /><span className="min-w-0 flex-1">{item.label}</span><LockKeyhole size={14} className="shrink-0" /></div>;
    return <Link key={item.label} href={item.href} aria-current={active ? "page" : undefined} title={item.label} className={`flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-bold transition ${active ? "bg-[var(--gold)] text-black" : "text-slate-700 hover:bg-amber-50 hover:text-slate-950"}`}><Icon size={17} /><span className="min-w-0 flex-1">{item.label}</span></Link>;
  }

  const nav = <nav className="mt-6 grid gap-1.5" aria-label="Sponsor workspace">{items.map(navLink)}</nav>;
  const statusCard = <Card className="mt-6 border-amber-200 bg-amber-50/70 p-4 shadow-none"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-800">Sponsor status</p><p className="mt-2 text-sm font-black text-slate-950">{workspace.statusLabel}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-[var(--gold)]" style={{ width: `${workspace.completionPercent}%` }} /></div><p className="mt-2 text-xs leading-5 text-slate-600">Brand profile {workspace.completionPercent}% complete</p><p className="mt-3 border-t border-amber-200 pt-3 text-xs font-bold text-slate-700">{experience.badgeLabel} / {workspace.subscriptionStatus.replaceAll("_", " ")}</p></Card>;

  return <main className="sponsor-mobile-shell theme-workspace min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
    <ProductWalkthrough />
    <div className="grid min-h-screen md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden h-screen overflow-y-auto border-r border-slate-200 bg-white px-5 py-6 shadow-[8px_0_30px_rgba(15,23,42,0.03)] md:sticky md:top-0 md:block">
        <div className="flex items-center gap-3"><BrandLogo imageClassName="h-12 w-12 border border-amber-300" /><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-700">Sponsor</p><h1 className="truncate text-base font-black text-slate-950">{brandName}</h1></div></div>
        {statusCard}{nav}
        <Link href="/landing" className="mt-6 block rounded-[8px] border border-slate-200 px-4 py-3 text-center text-sm font-bold text-slate-600 transition hover:border-amber-400 hover:text-slate-950">View public site</Link>
      </aside>
      <section className="min-w-0 px-4 pb-12 pt-5 sm:px-6 md:px-8 md:py-8 lg:px-10 xl:px-12">
        <div className="mb-7 md:hidden"><div className="grid min-h-12 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2"><button onClick={() => setDrawerOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-amber-300 bg-white text-amber-800" aria-label="Open sponsor navigation"><Menu /></button><Link href="/sponsor/dashboard" className="flex min-w-0 items-center justify-center gap-2"><BrandLogo imageClassName="h-9 w-9 border border-amber-300" /><span className="truncate text-sm font-black text-slate-950">{brandName}</span></Link><Link href="/sponsor/profile" aria-label="Open sponsor profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--gold)] text-xs font-black text-black">{brandName.slice(0, 2).toUpperCase()}</Link></div><div className="mt-3 rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-slate-800">{workspace.statusLabel} / {workspace.nextActionLabel}</div></div>
        {drawerOpen ? <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="Sponsor navigation"><button className="absolute inset-0 bg-slate-950/50" onClick={() => setDrawerOpen(false)} aria-label="Close sponsor navigation" /><aside className="absolute bottom-0 right-0 top-0 w-[min(90vw,360px)] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl"><div className="flex items-center justify-between"><p className="text-lg font-black text-slate-950">{brandName}</p><button onClick={() => setDrawerOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-slate-200 text-slate-700" aria-label="Close menu"><X /></button></div>{statusCard}{nav}<Link href="/landing" onClick={() => setDrawerOpen(false)} className="mt-6 block rounded-[8px] border border-slate-200 p-3 text-center font-bold text-slate-700">Public site</Link></aside></div> : null}
        {children}<MobileFooter />
      </section>
    </div>
  </main>;
}

export function SponsorPlaceholder({ title, body }: { title: string; body: string }) {
  return <Card className="p-5"><p className="text-sm font-black text-amber-800">{title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{body}</p></Card>;
}
