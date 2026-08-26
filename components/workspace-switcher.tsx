"use client";

import Link from "next/link";
import { BriefcaseBusiness, Check, ChevronDown, Handshake, LogOut, Settings, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { logout } from "@/lib/firebase/auth-service";
import type { CurrentUserProfile } from "@/lib/hooks/use-current-user";

type Workspace = "personal" | "sponsor" | "enterprise";
type SwitcherUser = Pick<CurrentUserProfile, "activeWorkspace" | "availableWorkspaces" | "displayName" | "initials" | "avatarUrl" | "planName" | "planId">;

const workspaceLabels: Record<Workspace, { label: string; subtitle: string; icon: typeof UserRound }> = {
  personal: { label: "Personal Workspace", subtitle: "Personal account", icon: UserRound },
  sponsor: { label: "Challenge Suite Sponsor", subtitle: "Sponsor Workspace", icon: Handshake },
  enterprise: { label: "Challenge Suite Enterprise", subtitle: "Staff Workspace", icon: BriefcaseBusiness },
};

export function WorkspaceSwitcher({ user, compact = false, placement = "top" }: { user: SwitcherUser | null | undefined; compact?: boolean; placement?: "top" | "bottom" }) {
  const [busy, setBusy] = useState<Workspace | null>(null);
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const available = user?.availableWorkspaces ?? ["personal"];
  const requested = user?.activeWorkspace ?? "personal";
  const current: Workspace = available.includes(requested) ? requested : "personal";
  const currentLabel = workspaceLabels[current];

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!user) return null;

  async function switchWorkspace(workspace: Workspace) {
    if (workspace === current || busy) return;
    if (document.querySelector("[data-builder-surface]") && !window.confirm("This builder may have unsaved changes. Switch workspace anyway?")) return;
    setBusy(workspace);
    setNotice("");
    const result = await apiRequest<{ activeWorkspace: Workspace }>("/api/auth/workspace", { method: "PATCH", body: JSON.stringify({ workspace }) });
    if (!result.ok) {
      setNotice(result.message || "Workspace could not be switched.");
      setBusy(null);
      return;
    }
    window.location.assign(workspace === "enterprise" ? "/enterprise" : workspace === "sponsor" ? "/sponsor/dashboard" : "/dashboard");
  }

  const personalPlan = String(user.planName ?? user.planId ?? "").replaceAll("_", " ").trim();
  return <div ref={ref} className="relative" data-workspace-switcher>
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu" className={"flex min-h-14 w-full items-center gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--panel-2)] px-3 text-left text-[var(--foreground)] transition hover:border-[var(--gold)]/50 " + (compact ? "mt-1" : "")}>
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-xs font-black text-black">{user.initials || "?"}</span>}
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{user.displayName || "Account"}</span><span className="block truncate text-xs text-[var(--muted)]">{currentLabel.label}</span></span>
      <ChevronDown size={17} className={open ? "rotate-180 transition" : "transition"} />
    </button>
    {open ? <div role="menu" aria-label="Switch workspace" className={"absolute left-0 z-[100] w-[min(88vw,320px)] rounded-[8px] border border-[var(--line)] bg-[var(--panel)] p-2 text-[var(--foreground)] shadow-2xl " + (placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2")}>
      <p className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">Switch Workspace</p>
      {(["personal", "sponsor", "enterprise"] as Workspace[]).filter((workspace) => available.includes(workspace)).map((workspace) => {
        const item = workspaceLabels[workspace];
        const Icon = item.icon;
        const active = workspace === current;
        const subtitle = workspace === "personal" && personalPlan ? personalPlan : item.subtitle;
        return <button role="menuitemradio" aria-checked={active} key={workspace} type="button" disabled={active || Boolean(busy)} onClick={() => void switchWorkspace(workspace)} className="flex min-h-14 w-full items-center gap-3 rounded-[8px] px-3 text-left hover:bg-[var(--panel-2)] disabled:cursor-default">
          <Icon size={18} className="shrink-0 text-[var(--gold)]" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{busy === workspace ? "Switching..." : item.label}</span><span className="block truncate text-xs text-[var(--muted)]">{subtitle}</span></span>
          {active ? <Check size={16} aria-label="Current workspace" /> : null}
        </button>;
      })}
      <div className="my-2 border-t border-[var(--line)]" />
      <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-bold hover:bg-[var(--panel-2)]"><UserRound size={16} /> Profile</Link>
      <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-bold hover:bg-[var(--panel-2)]"><Settings size={16} /> Settings</Link>
      <button role="menuitem" type="button" onClick={() => void logout().finally(() => { window.location.href = "/auth/login"; })} className="flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-left text-sm font-bold hover:bg-[var(--panel-2)]"><LogOut size={16} /> Sign Out</button>
      {notice ? <p role="status" className="px-3 py-2 text-xs font-bold text-amber-700">{notice}</p> : null}
    </div> : null}
  </div>;
}
