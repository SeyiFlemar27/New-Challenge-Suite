"use client";

import Link from "next/link";
import { BarChart3, Building2, CreditCard, LayoutDashboard, Megaphone, MessageSquare, PieChart, PlusCircle, Settings, Store, Target, Users } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Card } from "@/components/ui";
import { getPlanExperience } from "@/lib/plan-access";

const sponsorNav = [
  { label: "Overview", icon: LayoutDashboard, href: "/sponsor/dashboard" },
  { label: "Campaigns", icon: Megaphone },
  { label: "Sponsor Challenges", icon: Store },
  { label: "Create Campaign", icon: PlusCircle },
  { label: "Brand Profile", icon: Building2, href: "/sponsor/onboarding" },
  { label: "Placements", icon: Target },
  { label: "Audience Insights", icon: PieChart },
  { label: "Reports", icon: BarChart3 },
  { label: "Budget & Billing", icon: CreditCard },
  { label: "Team Members", icon: Users },
  { label: "Messages", icon: MessageSquare, href: "/sponsor/messages" },
  { label: "Settings", icon: Settings }
];

const sponsorMobileNav = sponsorNav.filter((item) => ["Overview", "Campaigns", "Sponsor Challenges", "Budget & Billing", "Brand Profile"].includes(item.label));

export interface SponsorShellProfile {
  brandName?: string | null;
  businessEmail?: string | null;
  sponsorVerificationStatus?: string | null;
  sponsorOnboardingStatus?: string | null;
  planId?: string | null;
  planStatus?: string | null;
}

export function SponsorShell({ children, profile }: { children: React.ReactNode; profile?: SponsorShellProfile | null }) {
  const brandName = profile?.brandName || "Brand Command Center";
  const verificationStatus = profile?.sponsorVerificationStatus || "pending_review";
  const experience = getPlanExperience({ planId: profile?.planId, planStatus: profile?.planStatus, accountType: "sponsor" });

  return (
    <main className="min-h-screen overflow-x-hidden bg-black text-white">
      <div className="grid min-h-screen lg:grid-cols-[292px_1fr]">
        <aside className="hidden border-b border-white/10 bg-[#0b0b0b] px-5 py-6 lg:block lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-4">
            <BrandLogo imageClassName="h-14 w-14 border border-[var(--gold)]" />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--gold)]">Sponsor</p>
              <h1 className="text-lg font-black leading-tight">{brandName}</h1>
            </div>
          </div>
          <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-200">Review Status</p>
            <p className="mt-2 text-sm font-bold capitalize text-white">{verificationStatus.replaceAll("_", " ")}</p>
            <p className="mt-2 text-xs text-slate-400">Your sponsor profile is ready for future admin review workflows.</p>
            <p className="mt-3 border-t border-white/10 pt-3 text-xs font-black text-[var(--gold)]">{experience.badgeLabel} · {experience.teamMemberLimit} team seat{experience.teamMemberLimit === 1 ? "" : "s"}</p>
          </Card>
          <nav className="mt-6 grid gap-2">
            {sponsorNav.map((item) => {
              const Icon = item.icon;
              return item.href ? <Link key={item.label} href={item.href} className="flex h-11 items-center gap-3 rounded-[8px] px-3 text-left text-sm font-bold text-slate-200 transition hover:bg-[var(--gold)] hover:text-black"><Icon size={17} />{item.label}</Link> : <button key={item.label} type="button" disabled className="flex h-11 cursor-not-allowed items-center gap-3 rounded-[8px] px-3 text-left text-sm font-bold text-slate-500 opacity-70" title={`${item.label} is planned for a later sponsor phase`}><Icon size={17} />{item.label}</button>;
            })}
          </nav>
          <Link href="/landing" className="mt-6 block rounded-[8px] border border-white/10 px-4 py-3 text-center text-sm font-bold text-slate-300 transition hover:border-[var(--gold)] hover:text-white">
            View public site
          </Link>
        </aside>
        <section className="min-w-0 px-4 pb-10 pt-5 sm:px-5 md:px-8 lg:px-10">
          <div className="mb-6 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo imageClassName="h-12 w-12 border border-[var(--gold)]" />
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--gold)]">Sponsor</p>
                  <h1 className="truncate text-lg font-black leading-tight">{brandName}</h1>
                </div>
              </div>
              <Link href="/landing" className="shrink-0 rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">Public site</Link>
            </div>
            <Card className="mt-4 border-yellow-500/20 bg-yellow-500/5 p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-yellow-200">Review Status</p>
              <p className="mt-1 text-sm font-bold capitalize text-white">{verificationStatus.replaceAll("_", " ")}</p>
            </Card>
            <nav className="scrollbar-dark mt-4 flex gap-2 overflow-x-auto pb-1">
              {sponsorMobileNav.map((item) => {
                const Icon = item.icon;
                return item.href ? <Link key={item.label} href={item.href} className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-[#151515] px-4 text-xs font-black text-slate-200"><Icon size={15} />{item.label.replace("Sponsor ", "")}</Link> : <button key={item.label} type="button" disabled className="flex min-h-11 shrink-0 cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-[#151515] px-4 text-xs font-black text-slate-500"><Icon size={15} />{item.label.replace("Sponsor ", "")}</button>;
              })}
            </nav>
          </div>
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
