"use client";

import Link from "next/link";
import { BarChart3, Building2, CreditCard, LayoutDashboard, Megaphone, MessageSquare, PieChart, PlusCircle, Settings, Store, Target, Users } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

const sponsorNav = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Campaigns", icon: Megaphone },
  { label: "Sponsor Challenges", icon: Store },
  { label: "Create Campaign", icon: PlusCircle },
  { label: "Brand Profile", icon: Building2 },
  { label: "Placements", icon: Target },
  { label: "Audience Insights", icon: PieChart },
  { label: "Reports", icon: BarChart3 },
  { label: "Budget & Billing", icon: CreditCard },
  { label: "Team Members", icon: Users },
  { label: "Messages", icon: MessageSquare },
  { label: "Settings", icon: Settings }
];

export interface SponsorShellProfile {
  brandName?: string | null;
  businessEmail?: string | null;
  sponsorVerificationStatus?: string | null;
  sponsorOnboardingStatus?: string | null;
}

export function SponsorShell({ children, profile }: { children: React.ReactNode; profile?: SponsorShellProfile | null }) {
  const brandName = profile?.brandName || "Brand Command Center";
  const verificationStatus = profile?.sponsorVerificationStatus || "pending_review";

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="grid min-h-screen lg:grid-cols-[292px_1fr]">
        <aside className="border-b border-white/10 bg-[#0b0b0b] px-5 py-6 lg:border-b-0 lg:border-r">
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
          </Card>
          <nav className="mt-6 grid gap-2">
            {sponsorNav.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={!item.active}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-[8px] px-3 text-left text-sm font-bold transition",
                    item.active ? "bg-[var(--gold)] text-black" : "cursor-not-allowed text-slate-500 opacity-70"
                  )}
                  title={item.active ? item.label : `${item.label} is planned for a later sponsor phase`}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <Link href="/dashboard" className="mt-6 block rounded-[8px] border border-white/10 px-4 py-3 text-center text-sm font-bold text-slate-300 transition hover:border-[var(--gold)] hover:text-white">
            Back to main site
          </Link>
        </aside>
        <section className="min-w-0 px-5 py-6 md:px-8 lg:px-10">
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
