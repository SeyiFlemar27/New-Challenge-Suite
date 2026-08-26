"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleHelp, LogOut, MessageSquare, Settings, UserRound, WalletCards, X } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { logout } from "@/lib/firebase/auth-service";
import { LanguageSelector } from "@/components/i18n/language-selector";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

export function AuthenticatedTopbar() {
  const { user, loading, signedOut } = useCurrentUser();
  if (loading || signedOut || !user) return null;
  return (
    <header className="sticky top-[69px] z-20 border-b border-white/10 bg-[var(--panel)] px-4 py-2.5 backdrop-blur sm:px-6 lg:top-0 lg:px-10" data-authenticated-topbar>
      <div className="mx-auto flex min-h-11 max-w-[1600px] items-center justify-end gap-2">
        <LanguageSelector compact persistAccount />
        <Link href="/messages" className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10 text-slate-300 hover:border-[var(--gold)]/40 hover:text-white" aria-label="Open messages">
          <MessageSquare size={18} />
        </Link>
        <NotificationBell compact />
        <HelpMenu />
        <AccountMenu />
      </div>
    </header>
  );
}

function HelpMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissibleMenu(open, setOpen, ref);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10 text-slate-300 hover:border-[var(--gold)]/40 hover:text-white" aria-label="Open help menu" aria-expanded={open} aria-haspopup="menu">
        <CircleHelp size={18} />
      </button>
      {open ? <div role="menu" className="absolute right-0 z-50 mt-2 w-[min(88vw,280px)] rounded-[8px] border border-white/10 bg-[var(--panel)] p-2 shadow-2xl">
        <MenuLink href="/contact" label="Contact Support" onSelect={() => setOpen(false)} />
        <MenuLink href="/community-guidelines" label="Community Guidelines" onSelect={() => setOpen(false)} />
        <MenuLink href="/about" label="About Challenge Suite" onSelect={() => setOpen(false)} />
      </div> : null}
    </div>
  );
}

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useCurrentUser();
  useDismissibleMenu(open, setOpen, ref);
  if (!user) return null;
  const personalContext = user.activeWorkspace === "personal";
  const sponsorHref = user.sponsorOnboardingComplete
    ? "/sponsor/dashboard"
    : user.hasSponsorProfile || user.sponsorOnboardingStatus
      ? "/sponsor/onboarding"
      : "/sponsor/start";
  const canSwitchSponsorRole = !user.isAdmin && Boolean(user.isSponsor || user.hasSponsorProfile || user.sponsorOnboardingStatus);
  const roleLinks = [
    { href: "/dashboard", label: "User Dashboard" },
    ...(canSwitchSponsorRole ? [{ href: sponsorHref, label: "Sponsor" }] : [])
  ];
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-11 items-center gap-2 rounded-[8px] border border-white/10 px-2 text-left hover:border-[var(--gold)]/40" aria-label="Open account menu" aria-expanded={open} aria-haspopup="menu">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--gold)] text-xs font-black text-black">{user.initials || "?"}</span>
        <span className="hidden max-w-36 truncate text-sm font-bold text-white sm:block">{user.displayName}</span>
      </button>
      {open ? <div role="menu" className="absolute right-0 z-50 mt-2 w-[min(92vw,330px)] overflow-hidden rounded-[8px] border border-white/10 bg-[var(--panel)] shadow-2xl">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate font-black text-white">{user.displayName}</p><p className="truncate text-xs text-slate-400">{user.email}</p><p className="mt-2 text-xs font-bold text-[var(--gold)]">{user.isSponsor ? "User and Sponsor access" : "User access"}</p></div>
            <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-[8px] text-slate-400 hover:bg-white/5" aria-label="Close account menu"><X size={17} /></button>
          </div>
        </div>
        <div className="p-2">
          <WorkspaceSwitcher user={user} compact placement="bottom" />
          <MenuLink href="/profile" label="View Profile" icon={<UserRound size={16} />} onSelect={() => setOpen(false)} />
          <MenuLink href="/settings" label="Account Settings" icon={<Settings size={16} />} onSelect={() => setOpen(false)} />
          {personalContext ? <MenuLink href="/subscriptions" label="Subscription / Plan" onSelect={() => setOpen(false)} /> : null}
          {personalContext && canSwitchSponsorRole ? <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-[8px] px-3 text-sm font-bold text-slate-300 hover:bg-white/5 hover:text-white">Switch Role</summary>
            <div className="ml-3 border-l border-white/10 pl-2">{roleLinks.map((item) => <MenuLink key={`${item.href}-${item.label}`} href={item.href} label={item.label} onSelect={() => setOpen(false)} />)}</div>
          </details> : null}
          {personalContext ? <MenuLink href="/settings/payouts" label="Payout Settings" icon={<WalletCards size={16} />} onSelect={() => setOpen(false)} /> : null}
          <MenuLink href="/contact" label="Help Center" icon={<CircleHelp size={16} />} onSelect={() => setOpen(false)} />
          <button type="button" role="menuitem" onClick={() => void logout().finally(() => { window.location.href = "/auth/login"; })} className="flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-sm font-bold text-slate-300 hover:bg-white/5 hover:text-white"><LogOut size={16} /> Log Out</button>
        </div>
      </div> : null}
    </div>
  );
}

function MenuLink({ href, label, icon, onSelect }: { href: string; label: string; icon?: React.ReactNode; onSelect: () => void }) {
  return <Link role="menuitem" href={href} onClick={onSelect} className="flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-bold text-slate-300 hover:bg-white/5 hover:text-white">{icon}{label}</Link>;
}

function useDismissibleMenu(open: boolean, setOpen: (value: boolean) => void, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ref, setOpen]);
}
