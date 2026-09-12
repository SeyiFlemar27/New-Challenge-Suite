"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity, BriefcaseBusiness, ClipboardCheck, FileClock, Flag, FolderCog, Gift, Home, Landmark, LifeBuoy, ListChecks, Menu,
  Megaphone, Radio, RefreshCw, Search, Settings, ShieldCheck, SlidersHorizontal,
  Trophy, UserCog, UsersRound, WalletCards, X
} from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Card, LinkButton } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { MobileFooter } from "@/components/mobile-footer";
import type { AdminPermission } from "@/lib/server/admin-permissions";

type NavItem = { href: string; label: string; icon: typeof Home; permission: AdminPermission; developerOnly?: boolean };
type NavGroup = { label: string; items: NavItem[] };
type AdminAccess = { authorized: boolean; roles: string[]; permissions: AdminPermission[]; developerToolsAvailable: boolean; secondFactorRequired: boolean; secondFactorVerified: boolean };

const groups: NavGroup[] = [
  { label: "Overview", items: [
    { href: "/admin", label: "Dashboard", icon: Home, permission: "admin.dashboard.view" },
    { href: "/admin/action-centre", label: "Action Centre", icon: ListChecks, permission: "admin.actionCentre.view" }
  ] },
  { label: "People", items: [
    { href: "/admin/people/users", label: "Users", icon: UsersRound, permission: "users.view" },
    { href: "/admin/kyc", label: "Verification", icon: ShieldCheck, permission: "users.requireVerification" },
    { href: "/admin/enterprise-applications", label: "Enterprise Applications", icon: BriefcaseBusiness, permission: "challenges.review" },
    { href: "/admin/enterprise-leads", label: "Enterprise Leads", icon: FolderCog, permission: "challenges.review" }
  ] },
  { label: "Challenges", items: [
    { href: "/admin/challenges", label: "All Challenges", icon: Trophy, permission: "challenges.view" },
    { href: "/admin/review", label: "Review Queue", icon: ListChecks, permission: "challenges.review" },
    { href: "/admin/submissions", label: "Submissions", icon: ClipboardCheck, permission: "submissions.view" },
    { href: "/admin/prize-approvals", label: "Prize Approvals", icon: ClipboardCheck, permission: "winners.review" }
  ] },
  { label: "Finance", items: [
    { href: "/admin/finance", label: "Overview", icon: Landmark, permission: "finance.view" },
    { href: "/admin/cash-ledger", label: "Transactions", icon: WalletCards, permission: "finance.view" },
    { href: "/admin/settlements", label: "Settlements", icon: Landmark, permission: "settlements.prepare" },
    { href: "/admin/withdrawals", label: "Withdrawals", icon: Landmark, permission: "withdrawals.review" },
    { href: "/admin/refunds", label: "Refunds", icon: FileClock, permission: "refunds.request" },
  ] },
  { label: "Sponsors", items: [
    { href: "/admin/sponsor-brands", label: "Organizations", icon: BriefcaseBusiness, permission: "sponsors.view" },
    { href: "/admin/sponsors", label: "Applications", icon: ShieldCheck, permission: "sponsors.review" },
    { href: "/admin/sponsor-campaigns", label: "Sponsorships", icon: Megaphone, permission: "sponsorCampaigns.review" },
    { href: "/admin/sponsor-operations", label: "Operations", icon: Flag, permission: "sponsors.review" }
  ] },
  { label: "Rewards", items: [
    { href: "/admin/rewards", label: "Overview", icon: Trophy, permission: "rewards.view" },
    { href: "/admin/rewards/prize-wheel", label: "Prize Wheel", icon: RefreshCw, permission: "rewards.view" },
    { href: "/admin/rewards/prize-catalog", label: "Prize Catalog", icon: Gift, permission: "rewards.view" },
    { href: "/admin/rewards/fulfilment", label: "Fulfilment", icon: ClipboardCheck, permission: "rewards.fulfil" },
    { href: "/admin/rewards/manual-grant", label: "Manual Grant", icon: Gift, permission: "rewards.manualGrant" },
    { href: "/admin/rewards/adjustments", label: "Adjustments", icon: SlidersHorizontal, permission: "rewards.adjustUser" }
  ] },
  { label: "Safety & Support", items: [
    { href: "/admin/safety-support/support-tickets", label: "Support", icon: LifeBuoy, permission: "tickets.view" },
    { href: "/admin/contact-requests", label: "Contact Requests", icon: LifeBuoy, permission: "tickets.view" },
    { href: "/admin/safety-support/disputes", label: "Disputes", icon: Flag, permission: "disputes.review" },
    { href: "/admin/safety-support/appeals", label: "Appeals", icon: FileClock, permission: "appeals.review" },
    { href: "/admin/safety-support/safety-reports", label: "Safety Reports", icon: ShieldCheck, permission: "safetyReports.review" },
  ] },
  { label: "Content", items: [
    { href: "/admin/announcements", label: "Announcements", icon: Megaphone, permission: "content.edit" },
    { href: "/admin/categories", label: "Categories", icon: FolderCog, permission: "content.edit" },
  ] },
  { label: "Platform", items: [
    { href: "/admin/people/admin-team", label: "Admin Team", icon: UserCog, permission: "roles.manage" },
    { href: "/admin/settings", label: "Settings", icon: Settings, permission: "settings.view" },
    { href: "/admin/audit-logs", label: "Audit Logs", icon: FileClock, permission: "auditLogs.viewRaw" }
  ] },
  { label: "System", items: [
    { href: "/admin/developer-tools/system-status", label: "Status", icon: Activity, permission: "systemDiagnostics.view", developerOnly: true },
    { href: "/admin/developer-tools/background-jobs", label: "Jobs", icon: RefreshCw, permission: "jobs.view", developerOnly: true },
  ] }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState("");
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [accessDetails, setAccessDetails] = useState<AdminAccess | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const { user, loading, signedOut } = useCurrentUser();
  const environmentLabel = process.env.NODE_ENV === "production" ? "Production" : process.env.NODE_ENV === "test" ? "Test" : "Development";

  useEffect(() => {
    if (loading) return;
    if (signedOut) return setAccess("denied");
    let active = true;
    void apiRequest<AdminAccess>("/api/admin/access").then((result) => {
      if (!active) return;
      setAccessDetails(result.ok && result.data?.authorized ? result.data : null);
      setAccess(result.ok && result.data?.authorized ? "allowed" : "denied");
    });
    return () => { active = false; };
  }, [loading, signedOut]);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const prior = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? []);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    focusable()[0]?.focus();
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", keydown); prior?.focus(); };
  }, [drawer]);

  function search(event: React.FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (value) router.push(`/admin/search?q=${encodeURIComponent(value)}`);
  }

  if (loading || access === "checking") return <main className="theme-workspace min-h-screen bg-[var(--background)] p-6 text-[var(--foreground)]"><div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--gold)]">Challenge Suite Admin</p><h1 className="mt-4 text-3xl font-black">Verifying administrative access...</h1><div className="mt-8 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-36 animate-pulse" />)}</div></div></main>;
  if (access === "denied") return <main className="theme-workspace flex min-h-screen items-center justify-center bg-[var(--background)] px-5 text-[var(--foreground)]"><Card className="w-full max-w-xl border-red-500/20 p-8 text-center"><ShieldCheck className="mx-auto text-red-300" size={42} /><h1 className="mt-5 text-3xl font-black">Access denied</h1><p className="mt-4 leading-7 text-slate-300">This command center is restricted to authorized Challenge Suite administrators. Administrative data is also protected by server-side authorization.</p><LinkButton href={signedOut ? "/auth/login" : "/dashboard"} className="mt-7">{signedOut ? "Sign In" : "Return to Dashboard"}</LinkButton></Card></main>;

  const allowedGroups = groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => accessDetails?.permissions.includes(item.permission) && (!item.developerOnly || accessDetails.developerToolsAvailable))
  })).filter((group) => group.items.length > 0);
  const navigation = <nav className="mt-7 space-y-4" aria-label="Admin navigation">{allowedGroups.map((group) => {
    const containsActive = group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return <details key={group.label} open={group.label === "Overview" || containsActive || undefined} className="group"><summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{group.label}</summary><div className="mt-1 space-y-1">{group.items.map((item) => {
      const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
      const Icon = item.icon;
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-10 items-center gap-3 rounded-[8px] px-3 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-white", active && "bg-[var(--gold)] text-black hover:bg-[var(--gold)] hover:text-black")}><Icon size={16} /><span>{item.label}</span></Link>;
    })}</div></details>;
  })}</nav>;

  return (
    <div className="admin-mobile-shell theme-workspace min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
      <a href="#admin-workspace" className="sr-only z-[120] rounded-[8px] bg-[var(--gold)] px-4 py-3 font-bold text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to admin workspace</a>
      <header className="sticky top-0 z-40 border-b border-[var(--gold)]/20 bg-[var(--panel)] px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="grid min-h-12 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <button type="button" onClick={() => setDrawer(true)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 text-[var(--gold)]" aria-label="Open admin navigation"><Menu /></button>
          <Link href="/admin" className="flex min-w-0 items-center justify-center gap-2 text-center"><BrandLogo imageClassName="h-9 w-9 border border-[var(--gold)]" /><span className="truncate text-sm font-black text-white">Admin Workspace</span></Link>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--gold)] text-xs font-black text-black">{String(user?.displayName || "A").slice(0, 2).toUpperCase()}</span>
        </div>
      </header>
      {drawer ? <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation"><button className="absolute inset-0 bg-black/80" onClick={() => setDrawer(false)} aria-label="Close admin navigation" /><aside ref={drawerRef} className="absolute inset-y-0 left-0 w-[min(90vw,370px)] overflow-y-auto border-r border-[var(--gold)]/20 bg-[var(--panel)] p-5"><div className="flex items-center justify-between"><p className="font-black text-[var(--gold)]">Admin Navigation</p><button onClick={() => setDrawer(false)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10" aria-label="Close admin navigation"><X /></button></div>{navigation}</aside></div> : null}
      <aside className="fixed inset-y-5 left-5 hidden w-[290px] overflow-y-auto rounded-[8px] border border-[var(--gold)]/20 bg-[var(--panel)] p-5 lg:block">
        <div className="flex items-center gap-3"><BrandLogo imageClassName="h-12 w-12 border border-[var(--gold)]" /><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--gold)]">Internal</p><p className="font-black">Admin Workspace</p></div></div>
        {navigation}
        <div className="mt-8 border-t border-white/10 pt-5"><p className="text-sm font-bold">{user?.displayName || "Administrator"}</p><p className="mt-1 text-xs text-slate-500">{accessDetails?.roles.map((role) => role.replaceAll("_", " ")).join(", ") || "Authorized administrator"}</p><p className="mt-2 text-xs text-slate-500">Sensitive actions require recent authentication. MFA is not currently verified by this console.</p></div>
      </aside>
      <main id="admin-workspace" className="admin-workspace px-5 py-7 sm:px-8 lg:ml-[330px] lg:px-10">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-8 grid gap-3 xl:grid-cols-[minmax(280px,1fr)_auto] xl:items-center">
            <form onSubmit={search} className="admin-surface flex min-w-0 items-center rounded-[8px] border border-white/10 bg-[#141414] px-4 shadow-sm focus-within:border-[var(--gold)]">
              <Search size={17} className="shrink-0 text-slate-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm text-current outline-none" placeholder="Search users, sponsors, challenges..." aria-label="Search admin records" />
              <button className="text-xs font-black text-[var(--gold)]">Search</button>
            </form>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-sm font-bold">View live site</Link>
              <button type="button" onClick={() => window.dispatchEvent(new Event("admin:refresh"))} className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-black/10 bg-white" aria-label="Refresh admin data"><RefreshCw size={16} /></button>
              <span className="inline-flex min-h-11 items-center rounded-[8px] border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-950"><Activity size={15} className="mr-2 text-amber-600" /> {environmentLabel}</span>
              <span className="inline-flex min-h-11 items-center rounded-[8px] border border-black/10 bg-white px-4 text-sm font-bold">{user?.displayName || "Admin"}</span>
            </div>
          </div>
          {children}
          <MobileFooter />
        </div>
      </main>
    </div>
  );
}


