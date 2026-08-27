"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, Bookmark, ChevronDown, ClipboardCheck, FileText, Handshake, LayoutDashboard, LifeBuoy, LogOut, Menu, RotateCcw, Search, Settings, WalletCards, X } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { ProductWalkthrough } from "@/components/product-walkthrough";
import { Card } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";
import { logout } from "@/lib/firebase/auth-service";

export interface SponsorShellProfile {
  brandName?: string | null; logoUrl?: string | null; squareIconUrl?: string | null; publicProfile?: boolean; brandSlug?: string | null;
  sponsorVerificationStatus?: string | null; sponsorOnboardingStatus?: string | null; organizationStatus?: string | null;
  planId?: string | null; planStatus?: string | null; subscriptionStatus?: string | null; stripeStatus?: string | null; [key: string]: unknown;
}
type NavItem = { label: string; href: string; icon: typeof LayoutDashboard };
const groups: Array<{ label: string; items: NavItem[] }> = [
  { label: "Main", items: [{ label: "Sponsor Studio", href: "/sponsor/dashboard", icon: LayoutDashboard }, { label: "Discover", href: "/sponsor/discover", icon: Search }, { label: "Saved", href: "/sponsor/saved", icon: Bookmark }] },
  { label: "Sponsorships", items: [{ label: "Sponsorships", href: "/sponsor/sponsorships", icon: Handshake }, { label: "Proposals", href: "/sponsor/proposals", icon: FileText }, { label: "Deliverables", href: "/sponsor/deliverables", icon: ClipboardCheck }] },
  { label: "Performance", items: [{ label: "Analytics", href: "/sponsor/analytics", icon: BarChart3 }, { label: "Reports", href: "/sponsor/reports", icon: FileText }] },
  { label: "Finance", items: [{ label: "Wallet", href: "/sponsor/wallet", icon: WalletCards }] },
  { label: "Account", items: [{ label: "Settings", href: "/sponsor/settings", icon: Settings }, { label: "Support", href: "/sponsor/support", icon: LifeBuoy }] }
];
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "SP"; }

export function SponsorShell({ children, profile }: { children: React.ReactNode; profile?: SponsorShellProfile | null }) {
  const pathname = usePathname(); const [drawerOpen, setDrawerOpen] = useState(false); const [loaded, setLoaded] = useState<SponsorShellProfile | null>(profile ?? null);
  const current = profile ?? loaded ?? {}; const state = resolveSponsorWorkspaceState(current); const brandName = String(current.brandName || "Sponsor Account");
  const logoUrl = String(current.squareIconUrl || current.logoUrl || ""); const organizationStatus = String(current.organizationStatus || "active").toLowerCase();
  useEffect(() => { if (profile) { setLoaded(profile); return; } void apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile").then((result) => { if (result.ok && result.data) setLoaded(result.data.sponsorProfile); }); }, [profile]);
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => { if (!drawerOpen) return; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, [drawerOpen]);
  if (state.status === "suspended" || organizationStatus === "suspended" || organizationStatus === "closed") return <StatusScreen brandName={brandName} closed={organizationStatus === "closed"} />;

  function navLink(item: NavItem) {
    const Icon = item.icon; const active = pathname === item.href || pathname.startsWith(item.href + "/");
    return <Link key={item.label} href={item.href} aria-current={active ? "page" : undefined} className={"flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-bold " + (active ? "bg-[var(--gold)] text-black" : "text-slate-700 hover:bg-amber-50 hover:text-slate-950")}><Icon size={17} /><span className="min-w-0 flex-1 truncate">{item.label}</span></Link>;
  }
  const nav = <nav className="mt-7 grid gap-5" aria-label="Sponsor panel">{groups.map((group) => <section key={group.label}><p className="px-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{group.label}</p><div className="mt-1 grid gap-1">{group.items.map(navLink)}</div></section>)}</nav>;
  const mark = logoUrl ? <img src={logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-[8px] border border-slate-200 object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-[var(--gold)] text-xs font-black text-black">{initials(brandName)}</span>;
  const account = <SponsorAccountMenu brandName={brandName} logoUrl={logoUrl} profile={current} />;

  return <main className="sponsor-mobile-shell theme-workspace min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]"><ProductWalkthrough /><div className="grid min-h-screen md:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[268px_minmax(0,1fr)]">
    <aside className="hidden h-screen overflow-y-auto border-r border-slate-200 bg-white px-4 py-5 md:sticky md:top-0 md:block"><Link href="/sponsor/dashboard" className="flex min-w-0 items-center gap-3 px-2">{mark}<div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Sponsor Panel</p><h1 className="truncate text-sm font-black text-slate-950">{brandName}</h1></div></Link>{nav}<div className="mt-7 border-t border-slate-200 pt-4">{account}</div></aside>
    <section className="min-w-0 px-4 pb-12 pt-5 sm:px-6 md:px-8 md:py-8 lg:px-10 xl:px-12"><div className="mb-7 md:hidden"><div className="grid min-h-12 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2"><button type="button" onClick={() => setDrawerOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-amber-300 bg-white text-amber-800" aria-label="Open sponsor navigation"><Menu /></button><Link href="/sponsor/dashboard" className="flex min-w-0 items-center justify-center gap-2">{mark}<span className="truncate text-sm font-black text-slate-950">{brandName}</span></Link><button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open Sponsor account menu" className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--gold)] text-xs font-black text-black">{initials(brandName)}</button></div></div>
      {drawerOpen ? <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="Sponsor navigation"><button type="button" className="absolute inset-0 bg-slate-950/50" onClick={() => setDrawerOpen(false)} aria-label="Close sponsor navigation" /><aside className="absolute bottom-0 right-0 top-0 w-[min(90vw,360px)] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl"><div className="flex items-center justify-between gap-3"><p className="truncate text-base font-black text-slate-950">{brandName}</p><button type="button" onClick={() => setDrawerOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-slate-200" aria-label="Close menu"><X /></button></div>{nav}<div className="mt-7 border-t border-slate-200 pt-4">{account}</div></aside></div> : null}{children}</section>
  </div></main>;
}

function SponsorAccountMenu({ brandName, logoUrl, profile }: { brandName: string; logoUrl: string; profile: SponsorShellProfile }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape); return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); }; }, [open]);
  async function returnToChallengeSuite() { const saved = sessionStorage.getItem("challenge-suite:last-personal-destination"); const destination = saved && saved.startsWith("/") && !saved.startsWith("/enterprise") && !saved.startsWith("/sponsor") ? saved : "/dashboard"; await apiRequest("/api/auth/workspace", { method: "PATCH", body: JSON.stringify({ workspace: "personal" }) }); window.location.assign(destination); }
  const logo = logoUrl ? <img src={logoUrl} alt="" className="h-10 w-10 rounded-[8px] border border-slate-200 object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[var(--gold)] text-xs font-black text-black">{initials(brandName)}</span>;
  return <div ref={ref} className="relative"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu" className="flex min-h-14 w-full items-center gap-3 rounded-[8px] px-2 text-left hover:bg-slate-50">{logo}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-950">{brandName}</span><span className="block text-xs text-slate-500">Sponsor Account</span></span><ChevronDown size={16} /></button>
    {open ? <div role="menu" className="absolute bottom-full left-0 z-[100] mb-2 w-[min(82vw,300px)] rounded-[8px] border border-slate-200 bg-white p-2 shadow-xl"><AccountLink href="/sponsor/profile" label="Brand Profile" close={() => setOpen(false)} /><AccountLink href="/sponsor/settings?section=channels" label="Connected Channels" close={() => setOpen(false)} /><AccountLink href="/sponsor/billing" label="Plan & Billing" close={() => setOpen(false)} /><AccountLink href="/sponsor/settings" label="Settings" close={() => setOpen(false)} /><AccountLink href="/sponsor/support" label="Support" close={() => setOpen(false)} />{profile.publicProfile === true && profile.brandSlug ? <AccountLink href={"/sponsors/" + String(profile.brandSlug)} label="View Public Profile" close={() => setOpen(false)} /> : null}<div className="my-2 border-t border-slate-200" /><button type="button" role="menuitem" onClick={() => void returnToChallengeSuite()} className="flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><RotateCcw size={16} /> Return to Challenge Suite</button><button type="button" role="menuitem" onClick={() => void logout().finally(() => { window.location.href = "/auth/login"; })} className="flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><LogOut size={16} /> Sign Out</button></div> : null}
  </div>;
}
function AccountLink({ href, label, close }: { href: string; label: string; close: () => void }) { return <Link role="menuitem" href={href} onClick={close} className="flex min-h-11 items-center rounded-[8px] px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">{label}</Link>; }
function StatusScreen({ brandName, closed }: { brandName: string; closed: boolean }) { return <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5"><Card className="max-w-xl p-7 text-center"><BrandLogo imageClassName="mx-auto h-12 w-12" /><p className="mt-5 text-xs font-black uppercase text-amber-800">Sponsor account status</p><h1 className="mt-2 text-2xl font-black">{brandName}</h1><p className="mt-4 text-sm text-slate-600">{closed ? "This Sponsor Organization is closed. Historical financial records, sponsorships and reports remain preserved." : "Sponsor operations are suspended. New commercial activity is unavailable while the account is under review."}</p><div className="mt-6 flex justify-center gap-3"><Link href="/sponsor/support" className="rounded-[8px] bg-[var(--gold)] px-5 py-3 text-sm font-black text-black">Contact Support</Link><Link href="/dashboard" className="rounded-[8px] border border-slate-300 px-5 py-3 text-sm font-black">Return to Challenge Suite</Link></div></Card></main>; }
export function SponsorPlaceholder({ title, body }: { title: string; body: string }) { return <Card className="p-5"><p className="text-sm font-black text-amber-800">{title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{body}</p></Card>; }