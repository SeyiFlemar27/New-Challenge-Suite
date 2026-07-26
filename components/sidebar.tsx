"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Award,
  BarChart3,
  Bell,
  ClipboardCheck,
  Coins,
  Diamond,
  Gift,
  Home,
  LayoutGrid,
  LockKeyhole,
  Medal,
  Menu,
  PlusSquare,
  Radio,
  ReceiptText,
  Rocket,
  Settings,
  ShieldCheck,
  Star,
  Target,
  Trophy,
  User,
  UsersRound,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { BrandLogo, planBadgeLabel, PremiumBadge } from "./brand";
import { findCustomizationOption } from "@/lib/customization/options";
import { getEffectiveTier } from "@/lib/plan-access";
import { NotificationBell } from "@/components/notification-bell";

type NavIcon = typeof Home;
type NavItem = { href: string; label: string; icon: NavIcon };
type NavSection = { label: string; items: NavItem[] };

const competitorSections: NavSection[] = [
  { label: "Main", items: [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: LayoutGrid },
    { href: "/favorites", label: "Saved", icon: Star },
    { href: "/wallet", label: "Wallet", icon: Coins },
    { href: "/rewards", label: "Rewards", icon: Gift },
  ] },
  { label: "Compete", items: [
    { href: "/challenges", label: "Challenges", icon: Medal },
    { href: "/challenges/create", label: "Create Challenge", icon: PlusSquare },
    { href: "/my-challenges", label: "My Challenges", icon: Target },
    { href: "/my-entries", label: "My Entries", icon: ClipboardCheck },
    { href: "/leaderboards", label: "Leaderboards", icon: BarChart3 },
    { href: "/winners", label: "Winners", icon: Trophy }
  ] },
  { label: "Account", items: [
    { href: "/profile", label: "Profile", icon: User },
    { href: "/settings", label: "Settings", icon: Settings }
  ] }
];

const starterSections: NavSection[] = [
  { label: "Main", items: [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: LayoutGrid },
    { href: "/favorites", label: "Saved", icon: Star },
    { href: "/wallet", label: "Wallet", icon: Coins },
    { href: "/rewards", label: "Rewards", icon: Gift },
  ] },
  { label: "Competitions", items: [
    { href: "/creator/challenges", label: "Challenges", icon: Medal },
    { href: "/creator/private-challenges", label: "Private Challenges", icon: LockKeyhole },
    { href: "/my-challenges", label: "My Challenges", icon: Target },
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
    { href: "/wallet", label: "Wallet", icon: Coins },
    { href: "/rewards", label: "Rewards", icon: Gift },
  ] },
  { label: "Competitions", items: [
    { href: "/creator/challenges", label: "Challenges", icon: Medal },
    { href: "/creator/private-challenges", label: "Private Challenges", icon: LockKeyhole },
    { href: "/my-challenges", label: "My Challenges", icon: Target },
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
    { href: "/wallet", label: "Wallet & Revenue", icon: Coins },
    { href: "/rewards", label: "Rewards", icon: Gift }
  ] },
  { label: "Competitions", items: [
    { href: "/host/challenges", label: "Challenges", icon: Medal },
    { href: "/host/private", label: "Private Challenges", icon: LockKeyhole },
    { href: "/host/live-events", label: "Live Events", icon: Radio },
    { href: "/host/tournaments", label: "Tournaments", icon: Award },
    { href: "/my-challenges", label: "My Challenges", icon: Target },
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
    { href: "/sponsor/dashboard", label: "Overview", icon: Home },
    { href: "/sponsor/campaigns", label: "Campaigns", icon: Target },
    { href: "/sponsor/proposals", label: "Proposals", icon: ClipboardCheck },
    { href: "/sponsor/messages", label: "Messages", icon: Bell }
  ] },
  { label: "Discover", items: [
    { href: "/sponsor/discover/creators", label: "Creators", icon: UsersRound },
    { href: "/sponsor/discover/challenges", label: "Challenges", icon: Medal },
    { href: "/sponsor/saved", label: "Saved", icon: Star }
  ] },
  { label: "Billing", items: [
    { href: "/sponsor/plans", label: "Plans", icon: Diamond },
    { href: "/sponsor/billing", label: "Billing", icon: ReceiptText },
    { href: "/settings", label: "Settings", icon: Settings }
  ] }
];
function activeNavigationHref(pathname: string) {
  if (pathname === "/challenges/create") return "/challenges/create";
  if (pathname === "/private/create") return "/creator/private-challenges";
  if (pathname === "/dashboard/host/team" || pathname === "/host/team") return "/host/team";
  if (pathname === "/dashboard/host") return "/dashboard/host";
  if (pathname.startsWith("/host/challenges/create")) return "/host/challenges";
  if (pathname.startsWith("/host/private/create")) return "/host/private";
  if (pathname.startsWith("/host/live/create")) return "/host/live-events";
  if (pathname.startsWith("/host/tournaments/create")) return "/host/tournaments";
  if (pathname.startsWith("/host/")) return pathname;
  if (pathname.startsWith("/creator/")) return pathname;
  if (pathname === "/my-entries") return "/my-entries";
  if (pathname === "/my-challenges") return "/my-challenges";
  if (pathname === "/challenges" || pathname.startsWith("/challenges/")) return "/challenges";
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return "/profile";
  if (pathname === "/rewards" || pathname.startsWith("/rewards/")) return "/rewards";
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

export function Sidebar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, loading, signedOut, error } = useCurrentUser();
  const avatarRingClass = findCustomizationOption(user?.customization?.avatarRingId, "avatarRing")?.previewClass;
  const effectiveTier = getEffectiveTier({
    planId: user?.planId,
    planStatus: user?.planStatus,
    accountType: user?.accountType,
    selectedAccountType: user?.selectedAccountType,
    role: user?.role
  });
  const sections = sectionsForTier(effectiveTier.id, user?.accountType === "sponsor");
  const activeHref = activeNavigationHref(pathname);
  const planLabel = effectiveTier.displayName || planBadgeLabel(user?.planId);
  const planButtonLabel = effectiveTier.paid ? planLabel : effectiveTier.id === "free_competitor" ? "Become a Creator" : planLabel;
  const mobileItems = user?.accountType === "sponsor"
    ? sponsorSections[0].items
    : effectiveTier.id === "host" || effectiveTier.id === "enterprise"
      ? [
          { href: "/dashboard/host", label: "Home", icon: Home },
          { href: "/host/challenges", label: "Challenges", icon: Medal },
          { href: "/host/submissions", label: "Submissions", icon: ClipboardCheck },
          { href: "/rewards", label: "Rewards", icon: Gift },
          { href: "/wallet", label: "Wallet", icon: Coins }
        ]
      : effectiveTier.id === "creator" || effectiveTier.id === "pro" || effectiveTier.id === "creator_starter"
        ? [
            { href: "/dashboard", label: "Home", icon: Home },
            { href: "/explore", label: "Explore", icon: LayoutGrid },
            { href: "/creator/challenges", label: "Challenges", icon: Medal },
            { href: "/creator/private-challenges", label: "Private", icon: LockKeyhole },
            { href: "/rewards", label: "Rewards", icon: Gift }
          ]
        : [
            { href: "/dashboard", label: "Home", icon: Home },
            { href: "/explore", label: "Explore", icon: LayoutGrid },
            { href: "/challenges/create", label: "Create", icon: PlusSquare },
            { href: "/rewards", label: "Rewards", icon: Gift },
            { href: "/wallet", label: "Wallet", icon: Coins }
          ];

  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  if (loading) return <WorkspaceNavigationLoading />;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-yellow-500/20 bg-[#0c0c0c]/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href={effectiveTier.id === "host" ? "/dashboard/host" : "/dashboard"} className="flex min-w-0 items-center gap-3">
            <BrandLogo imageClassName="h-11 w-11 border border-[var(--gold)]" />
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite</p>
              <p className="truncate text-sm font-black text-white">{loading ? "Loading" : signedOut ? "Welcome" : effectiveTier.dashboardName}</p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/wallet" className="flex h-10 items-center gap-1 rounded-[8px] border border-yellow-500/30 bg-yellow-500/10 px-3 text-xs font-black text-[var(--gold)]"><Coins size={15} /> {loading ? "..." : user?.doroBalance ?? 0}</Link>
            <NotificationBell compact />
            <button type="button" onClick={() => setDrawerOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 text-[var(--gold)]" aria-label="Open navigation menu"><Menu size={20} /></button>
          </div>
        </div>
      </header>

      {drawerOpen ? <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <button type="button" className="absolute inset-0 bg-black/80" onClick={() => setDrawerOpen(false)} aria-label="Close navigation menu" />
        <aside className="absolute bottom-0 left-0 top-0 w-[min(88vw,360px)] overflow-y-auto border-r border-[var(--gold)]/20 bg-[#0b0b0b] p-5">
          <div className="flex items-center justify-between"><div className="flex items-center gap-3"><BrandLogo imageClassName="h-12 w-12 border border-[var(--gold)]" /><div><p className="text-xs font-black uppercase text-[var(--gold)]">Challenge Suite</p><p className="font-black">{effectiveTier.dashboardName}</p></div></div><button type="button" onClick={() => setDrawerOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10" aria-label="Close menu"><X /></button></div>
          <NavigationSections sections={sections} activeHref={activeHref} mobile />
          <div className="mt-6 border-t border-white/10 pt-5"><Link href="/profile" className="flex items-center gap-3 rounded-[8px] bg-white/5 p-4"><div className={cn("flex h-11 w-11 items-center justify-center rounded-full border-2 bg-[var(--gold)] text-sm font-black text-black", avatarRingClass ?? "border-white/10")}>{user?.initials || "?"}</div><div><p className="font-black">{user?.displayName || "Profile"}</p><p className="text-xs text-slate-400">{effectiveTier.memberLabel}</p></div></Link>{!signedOut && user?.accountType !== "sponsor" ? <Link href="/sponsor/onboarding" className="mt-3 flex min-h-11 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 text-sm font-black text-[var(--gold)]">Become a Sponsor</Link> : null}</div>
        </aside>
      </div> : null}

      <aside className="fixed left-5 top-5 z-20 hidden h-[calc(100vh-40px)] w-[280px] flex-col rounded-[8px] border border-yellow-500/20 bg-[#0d0d0d] shadow-2xl lg:flex xl:w-[320px]">
        <div className="flex h-28 items-center gap-4 border-b border-white/10 px-6">
          <BrandLogo imageClassName="h-14 w-14 border border-[var(--gold)]" />
          <div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite</p><p className="mt-1 truncate font-black">{effectiveTier.dashboardName}</p></div>
        </div>
        <nav className="scrollbar-dark flex-1 overflow-y-auto border-b border-white/10 px-5 py-4" aria-label="Primary navigation">
          <NavigationSections sections={sections} activeHref={activeHref} />
        </nav>
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-2">
            <Link href="/wallet" className="flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-yellow-500/30 bg-yellow-500/10 px-2 text-xs font-black text-[var(--gold)]"><Coins size={15} /> {loading ? "..." : user?.doroBalance ?? 0}</Link>
            <NotificationBell />
          </div>
          <Link href="/subscriptions" className="flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-yellow-500/30 bg-[#171717] px-3 text-sm font-black"><Diamond size={16} className="text-[var(--gold)]" /> {loading ? "Plan" : planButtonLabel}</Link>
          <div className="flex items-center gap-3 pt-2">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-[var(--gold)] text-black", avatarRingClass ?? "border-white/10")}>{loading ? "" : user?.initials || "?"}</div>
            <div className="min-w-0 flex-1">
              {loading ? <div className="font-bold text-slate-300">Loading profile</div> : signedOut ? <><div className="font-bold text-slate-300">Signed out</div><Link className="text-sm text-[var(--gold)]" href="/auth/login">Sign In</Link></> : error ? <><div className="font-bold text-slate-300">Profile unavailable</div><Link className="text-sm text-[var(--gold)]" href="/profile">Retry</Link></> : <><div className="flex min-w-0 items-center gap-2 font-bold"><span className="truncate">{user?.displayName}</span><PremiumBadge planId={user?.planId} badgeStyleId={user?.customization?.profileBadgeId} labelOverride={effectiveTier.badgeLabel} compact /></div><p className="mt-0.5 text-xs text-slate-400">{effectiveTier.memberLabel}</p></>}
            </div>
          </div>
          {!loading && !signedOut && user?.accountType !== "sponsor" ? <Link href="/sponsor/onboarding" className="flex min-h-10 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 text-xs font-black text-[var(--gold)]">Become a Sponsor</Link> : null}
        </div>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-yellow-500/20 bg-[#0b0b0b]/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur lg:hidden" aria-label="Mobile navigation">
        <div className={cn("mx-auto grid max-w-md gap-1 rounded-[8px] border border-white/10 bg-[#121212] p-1.5", mobileItems.length === 4 ? "grid-cols-4" : "grid-cols-5")}>
          {mobileItems.map((item) => {
            const active = activeHref === item.href;
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-[8px] px-1 text-[11px] font-black text-slate-400 transition", active && "bg-[var(--gold)] text-black")}><Icon size={18} /><span className="leading-none">{item.label}</span></Link>;
          })}
        </div>
      </nav>
    </>
  );
}

function WorkspaceNavigationLoading() {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-yellow-500/20 bg-[#0c0c0c]/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <BrandLogo imageClassName="h-11 w-11 border border-[var(--gold)]" />
          <div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite</p><p className="text-sm font-black">Loading your workspace...</p></div>
        </div>
      </header>
      <aside className="fixed left-5 top-5 z-20 hidden h-[calc(100vh-40px)] w-[280px] flex-col rounded-[8px] border border-yellow-500/20 bg-[#0d0d0d] p-6 lg:flex xl:w-[320px]">
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

