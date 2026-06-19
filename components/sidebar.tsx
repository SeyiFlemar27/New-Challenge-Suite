"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bell, Coins, Diamond, Home, LayoutGrid, Star, Medal, PlusSquare, Target, Radio, BarChart3, Trophy, User, Award, LockKeyhole, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { BrandLogo, PremiumBadge } from "./brand";

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
  { href: "/winners", label: "Winners", icon: Trophy },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function Sidebar() {
  const pathname = usePathname();
  const [notificationStatus, setNotificationStatus] = useState("");
  const { user, loading, signedOut, error } = useCurrentUser();

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
    <aside className="sticky top-0 z-20 flex max-h-screen flex-col border-b border-yellow-500/30 bg-[#121212] lg:fixed lg:left-5 lg:top-5 lg:h-[calc(100vh-40px)] lg:w-[280px] lg:rounded-[16px] lg:border">
      <div className="flex h-20 items-center justify-center lg:h-40 xl:h-48">
        <BrandLogo imageClassName="h-16 w-16 border-2 border-[var(--gold)] gold-glow lg:h-28 lg:w-28 xl:h-32 xl:w-32" />
      </div>
      <nav className="scrollbar-dark flex gap-2 overflow-x-auto border-b border-yellow-500/20 px-4 py-3 lg:block lg:flex-1 lg:overflow-y-auto lg:px-5 lg:py-4">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("flex h-11 shrink-0 items-center gap-3 rounded-[8px] px-3 text-sm font-bold text-slate-200 lg:mb-2 lg:h-12 lg:px-4", active && "bg-[var(--gold)] text-black gold-glow")}
            >
              <Icon size={21} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden space-y-3 p-5 lg:block">
        <Link href="/wallet" className="flex h-11 items-center justify-center gap-2 rounded-[8px] border border-yellow-500/40 bg-yellow-500/10 text-sm font-black text-[var(--gold)]">
          <Coins size={16} /> {loading ? "Loading DoroCoins" : `${user?.doroBalance ?? 0} DoroCoins`}
        </Link>
        <button onClick={enableNotifications} className="flex h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-indigo-500/40 bg-indigo-950/40 text-sm font-bold text-indigo-300">
          <Bell size={16} /> {notificationStatus ? `Notifications: ${notificationStatus}` : "Enable Notifications"}
        </button>
        <Link href="/subscriptions" className="flex h-11 items-center justify-center gap-2 rounded-[8px] border border-yellow-500/30 bg-[#1c1c1c] text-base font-black">
          <Diamond size={16} className="text-sky-400" /> Premium
        </Link>
        <div className="flex items-center gap-3 pt-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500">{loading ? "" : user?.initials || "?"}</div>
          <div>
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
                <div className="flex items-center gap-2 font-bold">{user?.displayName}<PremiumBadge planId={user?.planId} compact /></div>
                <Link className="text-sm text-red-500" href="/landing">Sign Out</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
