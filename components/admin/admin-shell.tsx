"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, BarChart3, ClipboardCheck, FileClock, Home, Landmark, Menu, Settings, ShieldCheck, Trophy, UserCog, UsersRound, X } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Card, LinkButton } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/admin", label: "Overview", icon: Home },
  { href: "/admin/sponsors", label: "Sponsors", icon: ShieldCheck },
  { href: "/admin/hosts", label: "Hosts", icon: UserCog },
  { href: "/admin/challenges", label: "Challenges", icon: Trophy },
  { href: "/admin/submissions", label: "Submissions", icon: ClipboardCheck },
  { href: "/admin/participants", label: "Participants", icon: UsersRound },
  { href: "/admin/winners", label: "Winners", icon: Trophy },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: Landmark },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/users", label: "Users", icon: UsersRound },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: FileClock },
  { href: "/admin/settings", label: "Settings", icon: Settings }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const { user, loading, signedOut } = useCurrentUser();

  useEffect(() => {
    if (loading) return;
    if (signedOut) {
      setAccess("denied");
      return;
    }
    let active = true;
    void apiRequest<{ authorized: boolean }>("/api/admin/access").then((result) => {
      if (active) setAccess(result.ok && result.data?.authorized ? "allowed" : "denied");
    });
    return () => { active = false; };
  }, [loading, signedOut]);

  if (loading || access === "checking") return <main className="min-h-screen bg-black p-6 text-white"><div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--gold)]">Challenge Suite Admin</p><h1 className="mt-4 text-3xl font-black">Verifying administrative access...</h1><div className="mt-8 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-36 animate-pulse" />)}</div></div></main>;
  if (access === "denied") return <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white"><Card className="w-full max-w-xl border-red-500/20 p-8 text-center"><ShieldCheck className="mx-auto text-red-300" size={42} /><h1 className="mt-5 text-3xl font-black">Access denied</h1><p className="mt-4 leading-7 text-slate-300">This command center is restricted to authorized Challenge Suite administrators. Administrative data is also protected by server-side authorization.</p><LinkButton href={signedOut ? "/auth/login" : "/dashboard"} className="mt-7">{signedOut ? "Sign In" : "Return to Dashboard"}</LinkButton></Card></main>;

  const nav = <nav className="mt-8 space-y-1" aria-label="Admin navigation">{navigation.map((item) => {
    const active = pathname === item.href;
    const Icon = item.icon;
    return <Link key={item.href} href={item.href} onClick={() => setDrawer(false)} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-[8px] px-4 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-white", active && "bg-[var(--gold)] text-black hover:bg-[var(--gold)] hover:text-black")}><Icon size={17} /><span>{item.label}</span></Link>;
  })}</nav>;

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--gold)]/20 bg-black/95 px-5 py-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3"><BrandLogo imageClassName="h-10 w-10 border border-[var(--gold)]" /><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--gold)]">Internal</p><p className="font-black">Admin Command Center</p></div></div>
        <button type="button" onClick={() => setDrawer(true)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-[var(--gold)]/30" aria-label="Open admin navigation"><Menu /></button>
      </header>
      {drawer ? <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/80" onClick={() => setDrawer(false)} aria-label="Close admin navigation" /><aside className="absolute inset-y-0 left-0 w-[min(88vw,350px)] overflow-y-auto border-r border-[var(--gold)]/20 bg-[#0c0c0c] p-5"><div className="flex items-center justify-between"><p className="font-black text-[var(--gold)]">Admin Navigation</p><button onClick={() => setDrawer(false)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10"><X /></button></div>{nav}</aside></div> : null}
      <aside className="fixed inset-y-5 left-5 hidden w-[280px] overflow-y-auto rounded-[8px] border border-[var(--gold)]/20 bg-[#0c0c0c] p-5 lg:block">
        <div className="flex items-center gap-3"><BrandLogo imageClassName="h-12 w-12 border border-[var(--gold)]" /><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--gold)]">Internal</p><p className="font-black">Admin Command Center</p></div></div>
        {nav}
        <div className="mt-8 border-t border-white/10 pt-5"><p className="text-sm font-bold">{user?.displayName || "Administrator"}</p><p className="mt-1 text-xs text-slate-500">Authorized administrator</p></div>
      </aside>
      <main className="px-5 py-8 sm:px-8 lg:ml-[320px] lg:px-10 lg:py-10"><div className="mx-auto max-w-[1500px]">{children}</div></main>
    </div>
  );
}
