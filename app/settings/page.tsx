"use client";

import {
  Bell,
  ChevronRight,
  CircleUserRound,
  Coins,
  CreditCard,
  LockKeyhole,
  Palette,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  UserRound
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, PageTitle } from "@/components/ui";
import Link from "next/link";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getEffectiveTier } from "@/lib/plan-access";

const categories = [
  { href: "/settings/account", title: "Account", body: "Name, username, email, phone, and account type.", icon: CircleUserRound },
  { href: "/settings/profile", title: "Profile", body: "Avatar, cover image, bio, location, and social links.", icon: UserRound },
  { href: "/settings/appearance", title: "Appearance", body: "System, light, or dark display preference.", icon: Palette },
  { href: "/settings/notifications", title: "Notifications", body: "Challenge, vote, comment, follower, and billing alerts.", icon: Bell },
  { href: "/settings/privacy", title: "Privacy", body: "Profile visibility, activity, messages, and public stats.", icon: Shield },
  { href: "/settings/security", title: "Security", body: "Password, two-factor setup, and login sessions.", icon: LockKeyhole },
  { href: "/kyc/status", title: "Identity Verification", body: "Premium KYC status, Sumsub verification, and review state.", icon: ShieldCheck },
  { href: "/settings/billing", title: "Billing & Subscription", body: "Current plan, plan management, invoices, and cancellation.", icon: CreditCard },
  { href: "/settings/wallet", title: "Wallet & DoroCoin", body: "Internal credits and DoroCoin purchase history.", icon: Coins },
  { href: "/settings/preferences", title: "Challenge Preferences", body: "Categories, challenge types, location, and language.", icon: SlidersHorizontal },
  { href: "/settings/danger", title: "Danger Zone", body: "Protected account deactivation and deletion controls.", icon: TriangleAlert, danger: true }
];

export default function SettingsPage() {
  const { user } = useCurrentUser();
  const tier = getEffectiveTier({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role });
  return (
    <AppShell>
      <PageTitle title="Settings" subtitle="Choose a category to manage one focused part of your Challenge Suite account." icon={<SettingsIcon className="text-[var(--gold)]" />} />
      <div className="mt-8 grid gap-3 lg:grid-cols-2">
        {categories.map(({ href, title, body, icon: Icon, danger }) => {
          const displayTitle = href === "/settings/wallet" && tier.id === "host" ? "Wallet & Revenue" : title;
          return (
          <Link key={href} href={href} className="group">
            <Card className={`flex min-h-24 items-center gap-4 p-5 transition hover:border-[var(--gold)]/40 hover:bg-white/[0.04] ${danger ? "border-red-500/20" : ""}`}>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] ${danger ? "bg-red-500/10 text-red-300" : "bg-[var(--gold)]/10 text-[var(--gold)]"}`}><Icon size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block text-lg font-black">{displayTitle}</span><span className="mt-1 block text-sm leading-5 text-slate-400">{body}</span></span>
              <ChevronRight className="shrink-0 text-slate-500 transition group-hover:translate-x-1 group-hover:text-[var(--gold)]" />
            </Card>
          </Link>
          );
        })}
      </div>
    </AppShell>
  );
}


