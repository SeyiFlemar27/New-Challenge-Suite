"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Coins, Diamond, Home, LayoutGrid, Star, Medal, PlusSquare, Target, Radio, BarChart3, Trophy, User, Award, LockKeyhole, Settings, ShieldCheck, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { BrandLogo, planBadgeLabel, PremiumBadge } from "./brand";
import { findCustomizationOption } from "@/lib/customization/options";
import { getPlanExperience } from "@/lib/plan-access";

const nav = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/feed", label: "Feed", icon: LayoutGrid },
  { href: "/favorites", label: "Favorites", icon: Star },
  { href: "/private-exclusive", label: "Private / Exclusive", icon: LockKeyhole },
  { href: "/wallet", label: "Wallet / DoroCoin", icon: Coins },
  { href: "/challenges", label: "Challenges", icon: Medal },
  { href: "/challenges/create", label: "Create Challenge", icon: PlusSquare },
  { href: "/my-challenges", label: "My Challenges", icon: Target },
  { href: "/live-events", label: "Live Events", icon: Radio },
  { href: "/leaderboards", label: "Leaderboards", icon: BarChart3 },
  { href: "/tournaments", label: "Tournaments", icon: Award },
  { href: "/dashboard/host", label: "Host Control Center", icon: ShieldCheck },
  { href: "/winners", label: "Winners", icon: Trophy },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings }
];

const mobileNav = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/feed", label: "Explore", icon: LayoutGrid },
  { href: "/challenges/create", label: "Create", icon: PlusSquare },
  { href: "/leaderboards", label: "Rank", icon: BarChart3 },
  { href: "/wallet", label: "Wallet", icon: Coins }
];

function activeNavigationHref(pathname: string) {
  if (pathname === "/challenges/create") return "/challenges/create";
  if (pathname === "/my-entries") return "/my-entries";
  if (pathname === "/my-challenges") return "/my-challenges";
  if (pathname === "/challenges" || pathname.startsWith("/challenges/")) return "/challenges";
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return "/profile";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "/settings";
  return pathname;
}

export function Sidebar() {
  const pathname = usePathname();
  const [notificationStatus, setNotificationStatus] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, loading, signedOut, error } = useCurrentUser();
  const avatarRingClass = findCustomizationOption(user?.customization?.avatarRingId, "avatarRing")?.previewClass;
  const planLabel = planBadgeLabel(user?.planId);
  const planExperience = getPlanExperience({
    planId: user?.planId,
    planStatus: user?.planStatus,
    accountType: user?.accountType
  });
  const selectedAccountType = user?.selectedAccountType ?? (user?.role === "creator" || user?.role === "host" ? user.role : user?.accountType);
  const freePlan = planExperience.planId === "free";
  const freeCompetitor = freePlan && selectedAccountType !== "creator" && selectedAccountType !== "host";
  const canCreateChallenges = !freePlan || selectedAccountType === "creator" || selectedAccountType === "host";
  const activeHref = activeNavigationHref(pathname);
  const visibleNav = user?.accountType === "sponsor"
    ? [
        { href: "/sponsor/dashboard", label: "Brand Command Center", icon: Home },
        { href: "/sponsor/onboarding", label: "Brand Profile", icon: User },
        { href: "/subscriptions", label: "Sponsor Plans", icon: Diamond },
        { href: "/settings", label: "Settings", icon: Settings }
      ]
    : nav.map((item) => freeCompetitor && item.href === "/my-challenges" ? { ...item, href: "/my-entries", label: "My Entries" } : item).filter((item) => {
        if (freeCompetitor) return ["/dashboard", "/feed", "/favorites", "/wallet", "/challenges", "/my-entries", "/leaderboards", "/winners", "/profile", "/settings"].includes(item.href);
        if (item.href === "/challenges/create") return canCreateChallenges;
        if (item.href === "/private-exclusive") return planExperience.features.private_challenges;
        if (item.href === "/live-events") return planExperience.features.live_event_tools;
        if (item.href === "/tournaments") return planExperience.features.join_tournaments || planExperience.features.tournament_builder;
        if (item.href === "/dashboard/host") return planExperience.features.host_control_center;
        return true;
      });
  const visibleMobileNav = user?.accountType === "sponsor"
    ? [
        { href: "/sponsor/dashboard", label: "Brand", icon: Home },
        { href: "/sponsor/onboarding", label: "Profile", icon: User },
        { href: "/subscriptions", label: "Plans", icon: Diamond },
        { href: "/settings", label: "Settings", icon: Settings }
      ]
    : freeCompetitor
      ? [
          { href: "/dashboard", label: "Home", icon: Home },
          { href: "/feed", label: "Explore", icon: LayoutGrid },
          { href: "/favorites", label: "Saved", icon: Star },
          { href: "/leaderboards", label: "Rank", icon: BarChart3 },
          { href: "/wallet", label: "Wallet", icon: Coins }
        ]
      : mobileNav.filter((item) => item.href !== "/challenges/create" || canCreateChallenges);

  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotificationStatus("Unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    await fetch("/api/notifications/enable", { method: "POST", body: JSON.stringify({ permission }) }).catch(() => null);
    setNotificationStatus(permission === "granted" ? "Enabled" : "Blocked");
    if (permission === "granted") new Notification("Challenge Suite", { body: "Notifications enabled." });
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-yellow-500/20 bg-[#0c0c0c]/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <BrandLogo imageClassName="h-11 w-11 border border-[var(--gold)] gold-glow" />
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite</p>
              <p className="truncate text-sm font-black text-white">{loading ? "Loading" : signedOut ? "Welcome" : user?.displayName || "Dashboard"}</p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/wallet" className="flex h-10 items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 text-xs font-black text-[var(--gold)]">
              <Coins size={15} /> {loading ? "..." : user?.doroBalance ?? 0}
            </Link>
            <button onClick={() => setDrawerOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 text-[var(--gold)]" aria-label="Open navigation menu"><Menu size={20} /></button>
          </div>
        </div>
      </header>

      {drawerOpen ? <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <button className="absolute inset-0 bg-black/80" onClick={() => setDrawerOpen(false)} aria-label="Close navigation menu" />
        <aside className="absolute bottom-0 left-0 top-0 w-[min(88vw,360px)] overflow-y-auto border-r border-[var(--gold)]/20 bg-[#0b0b0b] p-5">
          <div className="flex items-center justify-between"><div className="flex items-center gap-3"><BrandLogo imageClassName="h-12 w-12 border border-[var(--gold)]" /><div><p className="text-xs font-black uppercase text-[var(--gold)]">Challenge Suite</p><p className="font-black">{user?.displayName || "Menu"}</p></div></div><button onClick={() => setDrawerOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10" aria-label="Close menu"><X /></button></div>
          <nav className="mt-6 space-y-2">{visibleNav.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={cn("flex min-h-12 items-center gap-3 rounded-[8px] px-4 font-bold text-slate-200", activeHref === item.href && "bg-[var(--gold)] text-black")}><Icon size={19} />{item.label}</Link>; })}</nav>
          <div className="mt-6 border-t border-white/10 pt-5"><Link href="/profile" className="flex items-center gap-3 rounded-[8px] bg-white/5 p-4"><div className={cn("flex h-11 w-11 items-center justify-center rounded-full border-2 bg-[var(--gold)] text-sm font-black text-black", avatarRingClass ?? "border-white/10")}>{user?.initials || "?"}</div><div><p className="font-black">{user?.displayName || "Profile"}</p><p className="text-xs text-slate-400">{planLabel} Plan</p></div></Link></div>
        </aside>
      </div> : null}

      <aside className="fixed left-5 top-5 z-20 hidden h-[calc(100vh-40px)] w-[280px] flex-col rounded-[16px] border border-yellow-500/30 bg-[#121212] lg:flex">
        <div className="flex h-40 items-center justify-center xl:h-48">
          <BrandLogo imageClassName="h-28 w-28 border-2 border-[var(--gold)] gold-glow xl:h-32 xl:w-32" />
        </div>
        <nav className="scrollbar-dark flex-1 overflow-y-auto border-b border-yellow-500/20 px-5 py-4">
          {visibleNav.map((item) => {
            const active = activeHref === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("mb-2 flex h-12 items-center gap-3 rounded-[8px] px-4 text-sm font-bold text-slate-200", active && "bg-[var(--gold)] text-black gold-glow")}
              >
                <Icon size={21} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 p-5">
          <Link href="/wallet" className="flex h-11 items-center justify-center gap-2 rounded-[8px] border border-yellow-500/40 bg-yellow-500/10 text-sm font-black text-[var(--gold)]">
            <Coins size={16} /> {loading ? "Loading DoroCoins" : `${user?.doroBalance ?? 0} DoroCoins`}
          </Link>
          <button onClick={enableNotifications} className="flex h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/5 text-sm font-bold text-[var(--gold-2)]">
            <Bell size={16} /> {notificationStatus ? `Notifications: ${notificationStatus}` : "Enable Notifications"}
          </button>
          <Link href="/subscriptions" className="flex h-11 items-center justify-center gap-2 rounded-[8px] border border-yellow-500/30 bg-[#1c1c1c] text-base font-black">
            <Diamond size={16} className="text-[var(--gold)]" /> {loading ? "Plan" : `${planLabel} Plan`}
          </Link>
          <div className="flex items-center gap-3 pt-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-full border-2 bg-[var(--gold)] text-black", avatarRingClass ?? "border-white/10")}>{loading ? "" : user?.initials || "?"}</div>
            <div className="min-w-0">
              {loading ? (
                <div className="font-bold text-slate-300">Loading profile</div>
              ) : signedOut ? (
                <>
                  <div className="font-bold text-slate-300">Signed out</div>
                  <Link className="text-sm text-[var(--gold)]" href="/auth/login">Sign In</Link>
                </>
              ) : error ? (
                <>
                  <div className="font-bold text-slate-300">Profile unavailable</div>
                  <Link className="text-sm text-[var(--gold)]" href="/profile">Retry from profile</Link>
                </>
              ) : (
                <>
                  <div className="flex min-w-0 items-center gap-2 font-bold"><span className="truncate">{user?.displayName}</span><PremiumBadge planId={user?.planId} badgeStyleId={user?.customization?.profileBadgeId} compact /></div>
                  <Link className="text-sm text-red-500" href="/landing">Sign Out</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-yellow-500/20 bg-[#0b0b0b]/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur lg:hidden">
        <div className={cn("mx-auto grid max-w-md gap-1 rounded-[18px] border border-white/10 bg-[#121212] p-1.5", visibleMobileNav.length === 4 ? "grid-cols-4" : "grid-cols-5")}>
          {visibleMobileNav.map((item) => {
            const active = activeHref === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-[14px] px-1 text-[11px] font-black text-slate-400 transition", active && "bg-[var(--gold)] text-black")}>
                <Icon size={18} />
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
