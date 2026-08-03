"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bell, ChevronRight, Home, Compass, PlusCircle, Wallet, User, Menu, X } from "lucide-react";
import type { MobileScreen, MobileTab } from "@/lib/mobile-preview/data";
import { cn } from "@/lib/utils";

import { brandConfig } from "@/lib/brand-config";

export const logoUrl = brandConfig.logo.local;
export type SheetState = null | { title: string; body: string; action: string };

export function tabToScreen(tab: MobileTab): MobileScreen {
  return tab === "home" ? "home" : tab === "explore" ? "explore" : tab === "create" ? "join" : tab === "wallet" ? "wallet" : "profile";
}

export function MobileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-[46px] border border-white/15 bg-[#111] p-3 shadow-[0_30px_90px_rgba(0,0,0,.65)]">
      <div className="absolute left-1/2 top-5 z-20 h-7 w-28 -translate-x-1/2 rounded-full bg-black" />
      <div className="relative h-[852px] w-[393px] overflow-hidden rounded-[36px] border border-white/10 bg-black shadow-inner max-[430px]:h-[812px] max-[430px]:w-[360px]">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(245,217,10,.18),transparent_36%),radial-gradient(circle_at_90%_20%,rgba(118,92,246,.14),transparent_30%)]" />
        {children}
      </div>
    </div>
  );
}

export function MobileTopBar({ screen, tab, onBack, onSettings }: { screen: MobileScreen; tab: MobileTab; onBack: () => void; onSettings: () => void }) {
  const root = tabToScreen(tab) === screen;
  return (
    <header className="flex h-[76px] shrink-0 items-center justify-between px-4 pt-4">
      <button onClick={root ? onSettings : onBack} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#141414]">
        {root ? <Menu size={19} /> : <ArrowLeft size={19} />}
      </button>
      <div className="flex items-center gap-2">
        <img src={logoUrl} alt="Challenge Suite" className="h-9 w-9 rounded-full border border-yellow-400/50 object-cover" />
        <span className="text-sm font-black text-[var(--gold)]">Challenge Suite</span>
      </div>
      <button onClick={onSettings} className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#141414]">
        <Bell size={18} /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--gold)]" />
      </button>
    </header>
  );
}

export function BottomTabs({ active, onSelect }: { active: MobileTab; onSelect: (tab: MobileTab) => void }) {
  const tabs = [
    { id: "home" as const, label: "Home", icon: Home },
    { id: "explore" as const, label: "Explore", icon: Compass },
    { id: "create" as const, label: "Create", icon: PlusCircle },
    { id: "wallet" as const, label: "Wallet", icon: Wallet },
    { id: "profile" as const, label: "Profile", icon: User }
  ];
  return (
    <nav className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-black/95 px-3 pb-5 pt-2 backdrop-blur">
      <div className="grid grid-cols-5 gap-1 rounded-[22px] border border-white/10 bg-[#111] p-1.5">
        {tabs.map((item) => {
          const Icon = item.icon;
          const selected = active === item.id;
          return <button key={item.id} onClick={() => onSelect(item.id)} className={cn("flex flex-col items-center gap-1 rounded-[16px] px-1 py-2 text-[11px] font-black transition", selected ? "bg-[var(--gold)] text-black shadow-[0_0_22px_rgba(245,217,10,.22)]" : "text-slate-400")}><Icon size={18} />{item.label}</button>;
        })}
      </div>
    </nav>
  );
}

export function MobileCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-[16px] border border-white/10 bg-[#121212]", className)}>{children}</div>;
}

export function MobileButton({ children, onClick, variant = "primary", className }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  return <button onClick={onClick} className={cn("flex h-12 w-full items-center justify-center gap-2 rounded-[14px] px-4 text-sm font-black transition disabled:opacity-50", variant === "primary" && "bg-[var(--gold)] text-black shadow-[0_0_22px_rgba(245,217,10,.18)]", variant === "secondary" && "border border-yellow-400/40 bg-yellow-500/10 text-[var(--gold)]", variant === "ghost" && "border border-white/10 bg-[#171717] text-white", className)}>{children}</button>;
}

export function MobileBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border border-yellow-400/40 bg-yellow-500/10 px-3 py-1 text-xs font-black text-[var(--gold)]", className)}>{children}</span>;
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div><h1 className="text-3xl font-black leading-tight">{title}</h1>{subtitle ? <p className="mt-2 text-sm leading-6 text-slate-300">{subtitle}</p> : null}</div>;
}

export function SectionHeader({ title, action, onClick }: { title: string; action?: string; onClick?: () => void }) {
  return <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2>{action ? <button onClick={onClick} className="text-xs font-black text-[var(--gold)]">{action}</button> : null}</div>;
}

export function MobileInput({ label, value, icon, multiline }: { label: string; value: string; icon?: React.ReactNode; multiline?: boolean }) {
  return <label className="block"><span className="mb-2 block text-xs font-black text-slate-300">{label}</span><div className={cn("flex items-center gap-2 rounded-[14px] border border-white/10 bg-[#171717] px-4 text-sm font-bold text-white", multiline ? "min-h-24 items-start py-4" : "h-12")}>{value}<span className="ml-auto text-slate-400">{icon}</span></div></label>;
}

export function MiniMetric({ label, value }: { label: string; value: string }) {
  return <MobileCard className="p-3 text-center"><div className="text-lg font-black text-[var(--gold)]">{value}</div><div className="mt-1 text-[11px] font-bold text-slate-400">{label}</div></MobileCard>;
}

export function MobileListRow({ title, meta, value, danger }: { title: string; meta: string; value?: string; danger?: boolean }) {
  return <div className="flex items-center justify-between rounded-[16px] border border-white/10 bg-[#121212] p-4"><div><div className="font-black">{title}</div><div className="text-xs text-slate-400">{meta}</div></div>{value ? <div className={cn("font-black", danger ? "text-red-300" : "text-emerald-300")}>{value}</div> : <ChevronRight size={18} className="text-slate-500" />}</div>;
}

export function StickyActions({ children }: { children: React.ReactNode }) {
  return <div className="absolute bottom-0 left-0 right-0 z-20 space-y-2 border-t border-white/10 bg-black/95 px-4 pb-5 pt-3 backdrop-blur">{children}</div>;
}

export function BottomSheet({ sheet, onClose, onConfirm }: { sheet: SheetState; onClose: () => void; onConfirm: () => void }) {
  return <AnimatePresence>{sheet ? <motion.div className="absolute inset-0 z-40 flex items-end bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div initial={{ y: 260 }} animate={{ y: 0 }} exit={{ y: 260 }} transition={{ type: "spring", damping: 26, stiffness: 260 }} className="w-full rounded-t-[28px] border border-white/10 bg-[#121212] p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-black">{sheet.title}</h2><button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1d1d1d]"><X size={18} /></button></div><p className="text-sm leading-6 text-slate-300">{sheet.body}</p><div className="mt-6 grid grid-cols-2 gap-3"><MobileButton variant="ghost" onClick={onClose}>Cancel</MobileButton><MobileButton onClick={onConfirm}>Confirm</MobileButton></div></motion.div></motion.div> : null}</AnimatePresence>;
}
