"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, BarChart3, Bell, BookOpenCheck, Boxes, BriefcaseBusiness, ClipboardCheck,
  Coins, Database, FileClock, Flag, FolderCog, Home, Landmark, LifeBuoy, ListChecks, Menu,
  Megaphone, Radio, RefreshCw, Search, Settings, ShieldCheck, SlidersHorizontal,
  Trophy, UserCog, UsersRound, WalletCards, X
} from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Card, LinkButton } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof Home };
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  { label: "Overview", items: [{ href: "/admin", label: "Command Center", icon: Home }] },
  { label: "Reviews", items: [
    { href: "/admin/sponsors", label: "Sponsors", icon: ShieldCheck },
    { href: "/admin/hosts", label: "Hosts", icon: UserCog },
    { href: "/admin/challenges", label: "Challenges", icon: Trophy },
    { href: "/admin/submissions", label: "Submissions", icon: ClipboardCheck },
    { href: "/admin/participants", label: "Participants", icon: UsersRound },
    { href: "/admin/winners", label: "Winners", icon: Trophy },
    { href: "/admin/withdrawals", label: "Withdrawals", icon: Landmark },
    { href: "/admin/disputes", label: "Disputes", icon: Flag }
  ] },
  { label: "Platform", items: [
    { href: "/admin/users", label: "Users", icon: UsersRound },
    { href: "/admin/creators", label: "Creators", icon: UserCog },
    { href: "/admin/host-workspaces", label: "Host Workspaces", icon: BriefcaseBusiness },
    { href: "/admin/sponsor-brands", label: "Sponsor Brands", icon: ShieldCheck },
    { href: "/admin/events", label: "Events", icon: Radio },
    { href: "/admin/tournaments", label: "Tournaments", icon: Trophy },
    { href: "/admin/risk-safety", label: "Risk & Safety", icon: ShieldCheck },
    { href: "/admin/media-moderation", label: "Media Moderation", icon: ClipboardCheck },
    { href: "/admin/predictions", label: "Predictions", icon: Coins },
    { href: "/admin/prediction-settlements", label: "Prediction Settlements", icon: Landmark },
    { href: "/admin/dorocoin", label: "DoroCoin Ledger", icon: Coins },
    { href: "/admin/cash-ledger", label: "Cash Ledger", icon: WalletCards }
  ] },
  { label: "Operations", items: [
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
    { href: "/admin/audit-logs", label: "Audit Logs", icon: FileClock },
    { href: "/admin/notifications", label: "Notifications", icon: Bell },
    { href: "/admin/support", label: "Support Inbox", icon: LifeBuoy },
    { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
    { href: "/admin/kyc", label: "KYC Status", icon: ShieldCheck },
    { href: "/admin/rewards", label: "Reward Fulfillment", icon: Trophy },
    { href: "/admin/ad-rewards", label: "Ad Reward Logs", icon: Bell },
    { href: "/admin/enterprise-leads", label: "Enterprise Leads", icon: BriefcaseBusiness }
  ] },
  { label: "Configuration", items: [
    { href: "/admin/categories", label: "Categories", icon: FolderCog },
    { href: "/admin/voting-rules", label: "Voting Rules", icon: ListChecks },
    { href: "/admin/revenue-rules", label: "Prize & Revenue Rules", icon: BookOpenCheck },
    { href: "/admin/feature-flags", label: "Feature Flags", icon: SlidersHorizontal },
    { href: "/admin/rewards/prize-wheel", label: "Prize Wheel", icon: Trophy },
    { href: "/admin/roles", label: "Admin Roles", icon: Boxes },
    { href: "/admin/qa-data", label: "QA Seed Data", icon: Database },
    { href: "/admin/settings/qa", label: "Production QA", icon: ClipboardCheck },
    { href: "/admin/settings", label: "Settings", icon: Settings }
  ] }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState("");
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const { user, loading, signedOut } = useCurrentUser();

  useEffect(() => {
    if (loading) return;
    if (signedOut) return setAccess("denied");
    let active = true;
    void apiRequest<{ authorized: boolean }>("/api/admin/access").then((result) => {
      if (active) setAccess(result.ok && result.data?.authorized ? "allowed" : "denied");
    });
    return () => { active = false; };
  }, [loading, signedOut]);
  useEffect(() => setDrawer(false), [pathname]);

  function search(event: React.FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (value) router.push(`/admin/search?q=${encodeURIComponent(value)}`);
  }

  if (loading || access === "checking") return <main className="min-h-screen bg-black p-6 text-white"><div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--gold)]">Challenge Suite Admin</p><h1 className="mt-4 text-3xl font-black">Verifying administrative access...</h1><div className="mt-8 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-36 animate-pulse" />)}</div></div></main>;
  if (access === "denied") return <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white"><Card className="w-full max-w-xl border-red-500/20 p-8 text-center"><ShieldCheck className="mx-auto text-red-300" size={42} /><h1 className="mt-5 text-3xl font-black">Access denied</h1><p className="mt-4 leading-7 text-slate-300">This command center is restricted to authorized Challenge Suite administrators. Administrative data is also protected by server-side authorization.</p><LinkButton href={signedOut ? "/auth/login" : "/dashboard"} className="mt-7">{signedOut ? "Sign In" : "Return to Dashboard"}</LinkButton></Card></main>;

  const navigation = <nav className="mt-7 space-y-4" aria-label="Admin navigation">{groups.map((group) => {
    const containsActive = group.items.some((item) => pathname === item.href);
    return <details key={group.label} open={group.label === "Overview" || containsActive || undefined} className="group"><summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{group.label}</summary><div className="mt-1 space-y-1">{group.items.map((item) => {
      const active = pathname === item.href;
      const Icon = item.icon;
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-10 items-center gap-3 rounded-[8px] px-3 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-white", active && "bg-[var(--gold)] text-black hover:bg-[var(--gold)] hover:text-black")}><Icon size={16} /><span>{item.label}</span></Link>;
    })}</div></details>;
  })}</nav>;

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--gold)]/20 bg-black/95 px-5 py-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3"><BrandLogo imageClassName="h-10 w-10 border border-[var(--gold)]" /><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--gold)]">Internal</p><p className="font-black">Admin Command Center</p></div></div>
        <button type="button" onClick={() => setDrawer(true)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-[var(--gold)]/30" aria-label="Open admin navigation"><Menu /></button>
      </header>
      {drawer ? <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/80" onClick={() => setDrawer(false)} aria-label="Close admin navigation" /><aside className="absolute inset-y-0 left-0 w-[min(90vw,370px)] overflow-y-auto border-r border-[var(--gold)]/20 bg-[#0c0c0c] p-5"><div className="flex items-center justify-between"><p className="font-black text-[var(--gold)]">Admin Navigation</p><button onClick={() => setDrawer(false)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10" aria-label="Close admin navigation"><X /></button></div>{navigation}</aside></div> : null}
      <aside className="fixed inset-y-5 left-5 hidden w-[290px] overflow-y-auto rounded-[8px] border border-[var(--gold)]/20 bg-[#0c0c0c] p-5 lg:block">
        <div className="flex items-center gap-3"><BrandLogo imageClassName="h-12 w-12 border border-[var(--gold)]" /><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--gold)]">Internal</p><p className="font-black">Admin Command Center</p></div></div>
        {navigation}
        <div className="mt-8 border-t border-white/10 pt-5"><p className="text-sm font-bold">{user?.displayName || "Administrator"}</p><p className="mt-1 text-xs text-slate-500">Authorized administrator</p></div>
      </aside>
      <main className="px-5 py-7 sm:px-8 lg:ml-[330px] lg:px-10">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-8 grid gap-3 xl:grid-cols-[minmax(280px,1fr)_auto] xl:items-center">
            <form onSubmit={search} className="flex min-w-0 items-center rounded-[8px] border border-white/10 bg-[#101010] px-4 focus-within:border-[var(--gold)]/50">
              <Search size={17} className="shrink-0 text-slate-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" placeholder="Search users, sponsors, challenges..." aria-label="Search admin records" />
              <button className="text-xs font-black text-[var(--gold)]">Search</button>
            </form>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-white/10 px-4 text-sm font-bold">View live site</Link>
              <button type="button" onClick={() => window.dispatchEvent(new Event("admin:refresh"))} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-white/10 px-4 text-sm font-bold"><RefreshCw size={16} /> Refresh queues</button>
              <span className="inline-flex min-h-11 items-center rounded-[8px] border border-emerald-500/20 bg-emerald-500/5 px-4 text-xs font-black uppercase text-emerald-300">Production</span>
              <span className="inline-flex min-h-11 items-center rounded-[8px] border border-[var(--gold)]/20 bg-[var(--gold)]/5 px-4 text-sm font-bold"><Activity size={15} className="mr-2 text-[var(--gold)]" /> {user?.displayName || "Admin"}</span>
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
