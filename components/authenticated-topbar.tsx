"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleHelp, Coins, Handshake, LogOut, MessageSquare, Search, Settings, UserRound, WalletCards, X } from "lucide-react";
import { ContentImage } from "@/components/content-image";
import { NotificationBell } from "@/components/notification-bell";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { logout } from "@/lib/firebase/auth-service";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { hasSponsorPanelContext } from "@/lib/account-routing";
import { usePathname } from "next/navigation";

export function AuthenticatedTopbar({ showSearch = true }: { showSearch?: boolean }) {
  const { user, loading, signedOut } = useCurrentUser();
  if (loading || signedOut || !user) return null;
  return (
    <header className="sticky top-[69px] z-20 border-b border-white/10 bg-[var(--panel)] px-4 py-2.5 backdrop-blur sm:px-6 lg:top-0 lg:px-10" data-authenticated-topbar>
      <div className="mx-auto flex min-h-11 max-w-[1600px] items-center justify-end gap-2">
        {showSearch ? <form action="/explore" className="mr-auto hidden w-full max-w-lg items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--panel-2)] px-3 sm:flex"><Search size={16} className="text-[var(--muted)]"/><input name="q" aria-label="Search public challenges" placeholder="Search challenges or categories…" className="h-10 min-w-0 flex-1 bg-transparent text-xs text-[var(--foreground)] outline-none"/></form> : null}
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
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useCurrentUser();
  const pathname = usePathname();
  useDismissibleMenu(open, setOpen, ref);
  if (!user) return null;
  const sponsorContext = pathname.startsWith('/sponsor') && hasSponsorPanelContext(user);
  const personalContext = user.activeWorkspace === "personal" && user.accountType !== "admin" && !sponsorContext;
  const sponsorHref = user.sponsorOnboardingComplete
    ? "/sponsor/dashboard"
    : user.hasSponsorProfile || user.sponsorOnboardingStatus
      ? "/sponsor/onboarding"
      : "/sponsor/start";
  const adminAccount = user.isAdmin && user.accountType === "admin";
  const hasSponsorAccess = hasSponsorPanelContext(user) || Boolean(user.sponsorOnboardingStatus);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[var(--line)] text-left hover:border-[var(--gold)]/40" aria-label="Open account menu" aria-expanded={open} aria-haspopup="menu">
        {user.avatarUrl && failedAvatar !== user.avatarUrl ? <ContentImage src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" onError={() => setFailedAvatar(user.avatarUrl ?? null)}/> : <span className="flex h-full w-full items-center justify-center rounded-full bg-[var(--gold)] text-xs font-black text-black">{user.initials || "?"}</span>}
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
          {pathname.startsWith('/sponsor') ? <MenuLink href="/explore" label="Return to Challenge Suite" onSelect={() => setOpen(false)}/> : null}
          <MenuLink href="/profile" label="My Profile" icon={<UserRound size={16} />} onSelect={() => setOpen(false)} />
          <MenuLink href="/settings" label="Account Settings" icon={<Settings size={16} />} onSelect={() => setOpen(false)} />
          {personalContext ? <MenuLink href="/subscriptions" label="Current Plan & Billing" onSelect={() => setOpen(false)} /> : null}
          {sponsorContext ? <MenuLink href="/sponsor/billing" label="Sponsor Plan & Billing" onSelect={() => setOpen(false)} /> : null}
          {personalContext ? <MenuLink href="/dorocoins" label="DoroCoins" icon={<Coins size={16}/>} onSelect={() => setOpen(false)}/> : null}
          {personalContext && !adminAccount ? <MenuLink href={sponsorHref} label={hasSponsorAccess ? "Sponsor Panel" : "Become a Sponsor"} icon={<Handshake size={16} />} onSelect={() => setOpen(false)} /> : null}
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
      const trigger=ref.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
      if (event.key === "Escape") { setOpen(false); trigger?.focus(); }
      if (["ArrowDown","ArrowUp","Home","End"].includes(event.key)) {
        const items=Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')??[]).filter(item=>!item.hasAttribute('disabled'));
        if (!items.length) return;
        event.preventDefault();
        const index=items.indexOf(document.activeElement as HTMLElement);
        items[event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(index+1)%items.length:(index-1+items.length)%items.length]?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ref, setOpen]);
}
