"use client";
import { ContentImage } from "@/components/content-image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useNavigationDialog } from "@/lib/hooks/use-navigation-dialog";
import { usePathname } from "next/navigation";
import { BarChart3, Bookmark, FileText, Handshake, LayoutDashboard, Menu, Search, WalletCards, X } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Card } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";
import { AuthenticatedTopbar } from "@/components/authenticated-topbar";

export interface SponsorShellProfile {
  brandName?: string | null; logoUrl?: string | null; squareIconUrl?: string | null; publicProfile?: boolean; brandSlug?: string | null;
  sponsorVerificationStatus?: string | null; sponsorOnboardingStatus?: string | null; organizationStatus?: string | null;
  planId?: string | null; planStatus?: string | null; subscriptionStatus?: string | null; stripeStatus?: string | null; [key: string]: unknown;
}
type NavItem = { label: string; href: string; icon: typeof LayoutDashboard };
const groups: Array<{ label: string; items: NavItem[] }> = [
  { label: "Sponsor", items: [{ label: "Dashboard", href: "/sponsor/dashboard", icon: LayoutDashboard }, { label: "Discover Opportunities", href: "/sponsor/discover", icon: Search }, { label: "My Campaigns", href: "/sponsor/campaigns", icon: Handshake }, { label: "Analytics", href: "/sponsor/analytics", icon: BarChart3 }, { label: "Wallet", href: "/sponsor/wallet", icon: WalletCards }, { label: "Transactions", href: "/sponsor/wallet/transactions", icon: FileText }, { label: "Saved Opportunities", href: "/sponsor/saved", icon: Bookmark }] }
  ,{ label: "Account", items: [{ label: "Brand Profile", href: "/sponsor/profile", icon: Handshake }, { label: "Settings", href: "/sponsor/settings", icon: LayoutDashboard }, { label: "Support", href: "/sponsor/support", icon: FileText }] }
];
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "SP"; }

export function SponsorShell({ children, profile }: { children: React.ReactNode; profile?: SponsorShellProfile | null }) {
  const drawerRef=useRef<HTMLElement>(null);
  const pathname = usePathname(); const [drawerPath, setDrawerPath] = useState<string | null>(null); const drawerOpen = drawerPath === pathname; const [loaded, setLoaded] = useState<SponsorShellProfile | null>(null);
  useNavigationDialog(drawerOpen,drawerRef,()=>setDrawerPath(null));
  const current = profile ?? loaded ?? {}; const state = resolveSponsorWorkspaceState(current); const brandName = String(current.brandName || "Sponsor Account");
  const logoUrl = String(current.squareIconUrl || current.logoUrl || ""); const organizationStatus = String(current.organizationStatus || "active").toLowerCase();
  useEffect(() => { if (profile) return; let active = true; void apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile").then((result) => { if (active && result.ok && result.data) setLoaded(result.data.sponsorProfile); }); return () => { active = false; }; }, [profile]);
  useEffect(() => { if (!drawerOpen) return; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, [drawerOpen]);
  if (state.status === "suspended" || organizationStatus === "suspended" || organizationStatus === "closed") return <StatusScreen brandName={brandName} closed={organizationStatus === "closed"} />;

  function navLink(item: NavItem) {
    const Icon = item.icon; const active = pathname === item.href || pathname.startsWith(item.href + "/");
    return <Link key={item.label} href={item.href} aria-current={active ? "page" : undefined} className={"flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-bold " + (active ? "bg-[var(--gold)] text-black" : "text-slate-700 hover:bg-amber-50 hover:text-slate-950")}><Icon size={17} /><span className="min-w-0 flex-1 truncate">{item.label}</span></Link>;
  }
  const nav = <nav className="mt-7 grid gap-5" aria-label="Sponsor panel">{groups.map((group) => <section key={group.label}><p className="px-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{group.label}</p><div className="mt-1 grid gap-1">{group.items.map(navLink)}</div></section>)}</nav>;
  const mark = logoUrl ? <ContentImage src={logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-[8px] border border-slate-200 object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-[var(--gold)] text-xs font-black text-black">{initials(brandName)}</span>;


  return <main className="sponsor-mobile-shell dashboard-workspace theme-workspace min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]"><div className="grid min-h-screen md:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[268px_minmax(0,1fr)]">
    <aside data-dashboard-sidebar className="hidden h-screen overflow-y-auto border-r border-slate-200 bg-white px-4 py-5 md:sticky md:top-0 md:block"><Link href="/sponsor/dashboard" className="flex min-w-0 items-center gap-3 px-2">{mark}<div className="min-w-0 flex-1"><p data-workspace-title className="text-sm font-black leading-snug text-slate-950">Sponsor Dashboard</p><p className="mt-1 break-words text-xs text-slate-600">{brandName}</p></div></Link>{nav}</aside>
    <section className="min-w-0 px-4 pb-12 pt-5 sm:px-6 md:px-8 md:py-8 lg:px-10 xl:px-12"><div className="mb-7 md:hidden"><div className="grid min-h-12 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2"><button type="button" onClick={() => setDrawerPath(pathname)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-amber-300 bg-white text-amber-800" aria-label="Open sponsor navigation"><Menu /></button><Link href="/sponsor/dashboard" className="flex min-w-0 items-center justify-center gap-2">{mark}<span className="truncate text-sm font-black text-slate-950">{brandName}</span></Link><span aria-hidden="true" /></div></div>
      {drawerOpen ? <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="Sponsor navigation"><button type="button" className="absolute inset-0 bg-slate-950/50" onClick={() => setDrawerPath(null)} aria-label="Close sponsor navigation" /><aside ref={drawerRef} className="absolute bottom-0 right-0 top-0 w-[min(90vw,360px)] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl"><div className="flex items-center justify-between gap-3"><p className="truncate text-base font-black text-slate-950">{brandName}</p><button type="button" onClick={() => setDrawerPath(null)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-slate-200" aria-label="Close menu"><X /></button></div>{nav}</aside></div> : null}<AuthenticatedTopbar />{children}</section>
  </div></main>;
}

function StatusScreen({ brandName, closed }: { brandName: string; closed: boolean }) { return <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5"><Card className="max-w-xl p-7 text-center"><BrandLogo imageClassName="mx-auto h-12 w-12" /><p className="mt-5 text-xs font-black uppercase text-amber-800">Sponsor account status</p><h1 className="mt-2 text-2xl font-black">{brandName}</h1><p className="mt-4 text-sm text-slate-600">{closed ? "This Sponsor Organization is closed. Historical financial records, sponsorships and reports remain preserved." : "Sponsor operations are suspended. New commercial activity is unavailable while the account is under review."}</p><div className="mt-6 flex justify-center gap-3"><Link href="/sponsor/support" className="rounded-[8px] bg-[var(--gold)] px-5 py-3 text-sm font-black text-black">Contact Support</Link><Link href="/dashboard" className="rounded-[8px] border border-slate-300 px-5 py-3 text-sm font-black">Return to Challenge Suite</Link></div></Card></main>; }
export function SponsorPlaceholder({ title, body }: { title: string; body: string }) { return <Card className="p-5"><p className="text-sm font-black text-amber-800">{title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{body}</p></Card>; }
