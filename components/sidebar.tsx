"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Award,
  BarChart3,
  ClipboardCheck,
  Coins,
  Diamond,
  Gift,
  Home,
  LayoutGrid,
  LockKeyhole,
  Medal,
  Menu,
  Radio,
  ReceiptText,
  Rocket,
  Settings,
  ShieldCheck,
  LogIn,
  LogOut,
  Star,
  Target,
  Trophy,
  User,
  UserPlus,
  UsersRound,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { BrandLogo, planBadgeLabel } from "./brand";
import { findCustomizationOption } from "@/lib/customization/options";
import { getEffectiveTier } from "@/lib/plan-access";
import { logout } from "@/lib/firebase/auth-service";

type NavIcon = typeof Home;
type NavItem = { href: string; label: string; icon: NavIcon };
type NavSection = { label: string; items: NavItem[] };
type WorkspaceNavigationContext = "admin" | "host" | "creator" | "sponsor" | "user";

const competitorSections: NavSection[] = [
  { label: "Main", items: [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: LayoutGrid },
    { href: "/favorites", label: "Saved", icon: Star },
    { href: "/earnings", label: "Earnings", icon: ReceiptText },
    { href: "/dorocoins", label: "DoroCoins", icon: Coins },
    { href: "/rewards", label: "Rewards", icon: Gift },
  ] },
  { label: "Compete", items: [
    { href: "/challenges", label: "Challenges", icon: Medal },
    { href: "/my-entries", label: "My Entries", icon: ClipboardCheck },
    { href: "/leaderboards", label: "Leaderboards", icon: BarChart3 },
    { href: "/winners", label: "Winners", icon: Trophy }
  ] },
  { label: "Account", items: [
    { href: "/profile", label: "Profile", icon: User },
    { href: "/settings", label: "Settings", icon: Settings }
  ] }
];

const guestSections: NavSection[] = [
  { label: "Discover", items: [
    { href: "/explore", label: "Explore", icon: LayoutGrid },
    { href: "/challenges", label: "Challenges", icon: Medal },
    { href: "/live-events", label: "Live Events", icon: Radio },
    { href: "/tournaments", label: "Tournaments", icon: Award },
    { href: "/sponsor/onboarding", label: "Sponsors", icon: ShieldCheck }
  ] },
  { label: "Account", items: [
    { href: "/auth/login", label: "Sign In", icon: LogIn },
    { href: "/auth/register", label: "Join Challenge Suite", icon: UserPlus }
  ] }
];

const adminSections: NavSection[] = [
  { label: "Administration", items: [
    { href: "/admin", label: "Admin Dashboard", icon: ShieldCheck },
    { href: "/admin/challenges", label: "Challenges", icon: Medal },
    { href: "/admin/users", label: "Users", icon: UsersRound },
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
    { href: "/admin/prize-approvals", label: "Winners", icon: Trophy },
    { href: "/admin/finance", label: "Settlements", icon: ReceiptText },
    { href: "/admin/withdrawals", label: "Withdrawals", icon: Coins },
    { href: "/admin/audit-logs", label: "Audit Logs", icon: ClipboardCheck },
    { href: "/admin/settings", label: "Settings", icon: Settings }
  ] }
];

const starterSections: NavSection[] = [
  { label: "Main", items: [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: LayoutGrid },
    { href: "/favorites", label: "Saved", icon: Star },
    { href: "/earnings", label: "Earnings", icon: ReceiptText },
    { href: "/dorocoins", label: "DoroCoins", icon: Coins },
    { href: "/rewards", label: "Rewards", icon: Gift },
  ] },
  { label: "Competitions", items: [
    { href: "/challenges", label: "Challenges", icon: Medal },
    { href: "/creator/private-challenges", label: "Private Challenges", icon: LockKeyhole },
    { href: "/my-entries", label: "My Entries", icon: ClipboardCheck }
  ] },
  { label: "Community", items: [
    { href: "/leaderboards", label: "Leaderboards", icon: BarChart3 },
    { href: "/winners", label: "Winners", icon: Trophy }
  ] },
  { label: "Account", items: [
    { href: "/profile", label: "Profile", icon: User },
    { href: "/settings", label: "Settings", icon: Settings }
  ] }
];

const creatorSections: NavSection[] = [
  { label: "Main", items: [
    { href: "/dashboard", label: "Creator Studio", icon: Home },
    { href: "/explore", label: "Explore", icon: LayoutGrid },
    { href: "/favorites", label: "Saved", icon: Star },
    { href: "/earnings", label: "Earnings", icon: ReceiptText },
    { href: "/dorocoins", label: "DoroCoins", icon: Coins },
    { href: "/rewards", label: "Rewards", icon: Gift },
  ] },
  { label: "Competitions", items: [
    { href: "/challenges", label: "Challenges", icon: Medal },
    { href: "/creator/private-challenges", label: "Private Challenges", icon: LockKeyhole },
    { href: "/my-entries", label: "My Entries", icon: ClipboardCheck }
  ] },
  { label: "Creator Tools", items: [
    { href: "/creator/submissions", label: "Submissions", icon: ClipboardCheck },
    { href: "/creator/analytics", label: "Creator Analytics", icon: BarChart3 },
    { href: "/creator/boosts", label: "Monthly Boosts", icon: Rocket },
    { href: "/creator/sponsor-ready", label: "Sponsor-Ready", icon: ShieldCheck }
  ] },
  { label: "Community", items: [
    { href: "/leaderboards", label: "Leaderboards", icon: Award },
    { href: "/winners", label: "Winners", icon: Trophy }
  ] },
  { label: "Account", items: [
    { href: "/profile", label: "Profile", icon: User },
    { href: "/settings", label: "Settings", icon: Settings }
  ] }
];

const hostSections: NavSection[] = [
  { label: "Main", items: [
    { href: "/dashboard/host", label: "Host Control Center", icon: Home },
    { href: "/explore", label: "Explore", icon: LayoutGrid },
    { href: "/favorites", label: "Saved", icon: Star },
    { href: "/earnings", label: "Earnings", icon: ReceiptText },
    { href: "/dorocoins", label: "DoroCoins", icon: Coins },
    { href: "/rewards", label: "Rewards", icon: Gift }
  ] },
  { label: "Competitions", items: [
    { href: "/challenges", label: "Challenges", icon: Medal },
    { href: "/host/private", label: "Private Challenges", icon: LockKeyhole },
    { href: "/host/live-events", label: "Live Events", icon: Radio },
    { href: "/host/tournaments", label: "Tournaments", icon: Award },
    { href: "/my-entries", label: "My Entries", icon: ClipboardCheck }
  ] },
  { label: "Operations", items: [
    { href: "/host/submissions", label: "Submissions", icon: ClipboardCheck },
    { href: "/host/participants", label: "Participants", icon: UsersRound },
    { href: "/host/reports", label: "Reports", icon: BarChart3 }
  ] },
  { label: "Account", items: [
    { href: "/settings/billing", label: "Billing", icon: ReceiptText },
    { href: "/settings", label: "Settings", icon: Settings }
  ] }
];
const sponsorSections: NavSection[] = [
  { label: "Overview", items: [
    { href: "/sponsor/dashboard", label: "Sponsor Dashboard", icon: Home },
    { href: "/sponsor/campaigns", label: "Campaigns", icon: Target },
    { href: "/sponsor/proposals", label: "Proposals", icon: ClipboardCheck }
  ] },
  { label: "Discover", items: [
    { href: "/sponsor/discover/creators", label: "Creators", icon: UsersRound },
    { href: "/sponsor/discover/challenges", label: "Challenges", icon: Medal },
    { href: "/sponsor/saved", label: "Saved", icon: Star }
  ] },
  { label: "Billing", items: [
    { href: "/sponsor/reports", label: "Sponsor Reports", icon: BarChart3 },
    { href: "/sponsor/wallet", label: "Wallet & Payments", icon: Coins },
    { href: "/sponsor/plans", label: "Plans", icon: Diamond },
    { href: "/sponsor/billing", label: "Billing", icon: ReceiptText },
    { href: "/settings", label: "Settings", icon: Settings }
  ] }
];

export function workspaceNavigationContext(pathname: string): WorkspaceNavigationContext {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/dashboard/host" || pathname.startsWith("/dashboard/host/") || pathname === "/host" || pathname.startsWith("/host/")) return "host";
  if (pathname === "/creator" || pathname.startsWith("/creator/")) return "creator";
  if (pathname === "/sponsor" || pathname.startsWith("/sponsor/")) return "sponsor";
  return "user";
}

function activeNavigationHref(pathname: string) {
  if (pathname === "/challenges/create") return "/challenges";
  if (pathname === "/private/create") return "/creator/private-challenges";
  if (pathname === "/dashboard/host/team" || pathname === "/host/team") return "/host/team";
  if (pathname === "/dashboard/host") return "/dashboard/host";
  if (pathname.startsWith("/host/challenges/create")) return "/challenges";
  if (pathname.startsWith("/host/private/create")) return "/host/private";
  if (pathname.startsWith("/host/live/create")) return "/host/live-events";
  if (pathname.startsWith("/host/tournaments/create")) return "/host/tournaments";
  if (pathname.startsWith("/host/")) return pathname;
  if (pathname.startsWith("/creator/")) return pathname;
  if (pathname === "/my-entries") return "/my-entries";
  if (pathname === "/my-challenges") return "/challenges";
  if (pathname === "/challenges" || pathname.startsWith("/challenges/")) return "/challenges";
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return "/profile";
  if (pathname === "/rewards" || pathname.startsWith("/rewards/")) return "/rewards";
  if (pathname === "/wallet" || pathname.startsWith("/wallet/")) return pathname.includes("withdraw") ? "/earnings" : "/dorocoins";
  if (pathname === "/earnings" || pathname.startsWith("/earnings/")) return "/earnings";
  if (pathname === "/dorocoins" || pathname.startsWith("/dorocoins/")) return "/dorocoins";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "/settings";
  return pathname;
}

function sectionsForTier(tierId: string, sponsor: boolean) {
  if (sponsor) return sponsorSections;
  if (tierId === "host" || tierId === "enterprise") return hostSections;
  if (tierId === "creator" || tierId === "pro") return creatorSections;
  if (tierId === "creator_starter" || tierId === "host_starter") return starterSections;
  return competitorSections;
}

function sectionsForWorkspace(context: WorkspaceNavigationContext, isAdmin: boolean, tierId: string, sponsor: boolean) {
  if (context === "admin") return isAdmin ? adminSections : [];
  if (context === "host") return hostSections;
  if (context === "creator") return creatorSections;
  if (context === "sponsor") return sponsorSections;
  return sectionsForTier(tierId, sponsor);
}

function workspaceIdentity(context: WorkspaceNavigationContext, isAdmin: boolean, fallbackName: string) {
  if (context === "admin") return isAdmin
    ? { name: "Admin Command Center", homeHref: "/admin" }
    : { name: "Challenge Suite", homeHref: "/dashboard" };
  if (context === "host") return { name: "Host Control Center", homeHref: "/dashboard/host" };
  if (context === "creator") return { name: "Creator Studio", homeHref: "/dashboard" };
  if (context === "sponsor") return { name: "Sponsor Dashboard", homeHref: "/sponsor/dashboard" };
  return { name: fallbackName, homeHref: "/dashboard" };
}

export function Sidebar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, loading, signedOut } = useCurrentUser();
  const avatarRingClass = findCustomizationOption(user?.customization?.avatarRingId, "avatarRing")?.previewClass;
  const effectiveTier = getEffectiveTier({
    planId: user?.planId,
    planStatus: user?.planStatus,
    accountType: user?.accountType,
    selectedAccountType: user?.selectedAccountType,
    role: user?.role
  });
  const workspaceContext = workspaceNavigationContext(pathname);
  const sections = signedOut
    ? guestSections
    : sectionsForWorkspace(workspaceContext, user?.isAdmin === true, effectiveTier.id, user?.accountType === "sponsor");
  const workspace = workspaceIdentity(workspaceContext, user?.isAdmin === true, effectiveTier.dashboardName);
  const activeHref = activeNavigationHref(pathname);
  const planLabel = effectiveTier.displayName || planBadgeLabel(user?.planId);
  const planButtonLabel = effectiveTier.paid ? planLabel : effectiveTier.id === "free_competitor" ? "Become a Creator" : planLabel;
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  if (loading) return <WorkspaceNavigationLoading />;

  return (
    <>
      <header data-mobile-header className="sticky top-0 z-30 border-b border-yellow-500/20 bg-[var(--panel)] px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="grid min-h-12 grid-cols-[44px_minmax(0,1fr)_56px] items-center gap-2">
          <button type="button" onClick={() => setDrawerOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 text-[var(--gold)]" aria-label="Open navigation menu"><Menu size={21} /></button>
          <Link href={signedOut ? "/explore" : workspace.homeHref} className="flex min-w-0 items-center justify-center gap-2 text-center">
            <BrandLogo imageClassName="h-9 w-9 border border-[var(--gold)]" />
            <span className="truncate text-sm font-black uppercase tracking-[0.12em] text-white">Challenge Suite</span>
          </Link>
          {signedOut ? (
            <Link href={`/auth/login?next=${encodeURIComponent(pathname)}`} className="flex min-h-11 items-center justify-center text-xs font-black text-[var(--gold)]">Login</Link>
          ) : (
            <Link href="/profile" aria-label="Open profile" className={cn("mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 bg-[var(--gold)] text-xs font-black text-black", avatarRingClass ?? "border-white/10")}>{user?.initials || "?"}</Link>
          )}
        </div>
      </header>

      {drawerOpen ? <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <button type="button" className="absolute inset-0 bg-black/80" onClick={() => setDrawerOpen(false)} aria-label="Close navigation menu" />
        <aside className="absolute bottom-0 left-0 top-0 w-[min(88vw,360px)] overflow-y-auto border-r border-[var(--gold)]/20 bg-[var(--panel)] p-5">
          <div className="flex items-center justify-between"><div className="flex items-center gap-3"><BrandLogo imageClassName="h-12 w-12 border border-[var(--gold)]" /><div><p className="text-xs font-black uppercase text-[var(--gold)]">Challenge Suite</p><p className="font-black">{workspace.name}</p></div></div><button type="button" onClick={() => setDrawerOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10" aria-label="Close menu"><X /></button></div>
          <NavigationSections sections={sections} activeHref={activeHref} mobile />
          <div className="mt-6 border-t border-white/10 pt-5">
            {signedOut ? <div className="grid gap-3"><Link href="/auth/login" className="flex min-h-12 items-center justify-center rounded-[8px] border border-[var(--gold)] text-sm font-black text-white">Sign In</Link><Link href="/auth/register" className="flex min-h-12 items-center justify-center rounded-[8px] bg-[var(--gold)] text-sm font-black text-black">Join / Create Account</Link></div> : <>
              <button type="button" onClick={() => void logout().finally(() => { window.location.href = "/auth/login"; })} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] border border-white/10 px-4 text-sm font-black text-slate-300"><LogOut size={17} /> Logout</button>
              {user?.accountType !== "sponsor" ? <Link href="/sponsor/onboarding" className="mt-3 flex min-h-11 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 text-sm font-black text-[var(--gold)]">Become a Sponsor</Link> : null}
            </>}
          </div>
        </aside>
      </div> : null}

      <aside className="fixed left-5 top-5 z-20 hidden h-[calc(100vh-40px)] w-[280px] flex-col rounded-[8px] border border-yellow-500/20 bg-[var(--panel)] shadow-2xl lg:flex xl:w-[320px]">
        <div className="flex h-28 items-center gap-4 border-b border-white/10 px-6">
          <BrandLogo imageClassName="h-14 w-14 border border-[var(--gold)]" />
          <div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite</p><p className="mt-1 truncate font-black">{workspace.name}</p></div>
        </div>
        <nav className="scrollbar-dark flex-1 overflow-y-auto border-b border-white/10 px-5 py-4" aria-label="Primary navigation">
          <NavigationSections sections={sections} activeHref={activeHref} />
        </nav>
        <div className="space-y-3 p-5">
          <Link href="/dorocoins" className="flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-yellow-500/30 bg-yellow-500/10 px-2 text-xs font-black text-[var(--gold)]"><Coins size={15} /> {loading ? "..." : user?.doroBalance ?? 0} DoroCoins</Link>
          <Link href="/subscriptions" className="flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-yellow-500/30 bg-[var(--panel-2)] px-3 text-sm font-black"><Diamond size={16} className="text-[var(--gold)]" /> {loading ? "Plan" : planButtonLabel}</Link>
          {!loading && !signedOut && user?.accountType !== "sponsor" ? <Link href="/sponsor/onboarding" className="flex min-h-10 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 text-xs font-black text-[var(--gold)]">Become a Sponsor</Link> : null}
        </div>
      </aside>
    </>
  );
}

function WorkspaceNavigationLoading() {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-yellow-500/20 bg-[var(--panel)] px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="grid min-h-12 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <div className="h-11 w-11 animate-pulse rounded-[8px] bg-white/5" />
          <div className="flex items-center justify-center gap-2"><BrandLogo imageClassName="h-9 w-9 border border-[var(--gold)]" /><p className="truncate text-sm font-black uppercase tracking-[0.12em]">Challenge Suite</p></div>
          <div className="h-10 w-10 animate-pulse rounded-full bg-white/5" />
        </div>
      </header>
      <aside className="fixed left-5 top-5 z-20 hidden h-[calc(100vh-40px)] w-[280px] flex-col rounded-[8px] border border-yellow-500/20 bg-[var(--panel)] p-6 lg:flex xl:w-[320px]">
        <div className="flex items-center gap-4"><BrandLogo imageClassName="h-14 w-14 border border-[var(--gold)]" /><div className="h-5 w-36 animate-pulse rounded bg-white/10" /></div>
        <div className="mt-10 space-y-3">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-11 animate-pulse rounded-[8px] bg-white/5" />)}</div>
        <p className="mt-auto text-sm font-bold text-slate-400">Loading your workspace...</p>
      </aside>
    </>
  );
}

function NavigationSections({ sections, activeHref, mobile = false }: { sections: NavSection[]; activeHref: string; mobile?: boolean }) {
  return <div className={mobile ? "mt-7 space-y-7" : "space-y-6"}>{sections.map((section) => <section key={section.label}><p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">{section.label}</p><div className="space-y-1">{section.items.map((item) => { const Icon = item.icon; const active = activeHref === item.href || (item.href === "/rewards" && activeHref.startsWith("/rewards")); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-white", active && "bg-[var(--gold)] text-black hover:bg-[var(--gold)] hover:text-black")}><Icon size={18} className="shrink-0" /><span className="min-w-0">{item.label}</span></Link>; })}</div></section>)}</div>;
}

