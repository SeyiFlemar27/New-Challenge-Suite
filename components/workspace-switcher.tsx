"use client";

import { BriefcaseBusiness, Check, Handshake, UserRound } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/api/client";
import type { CurrentUserProfile } from "@/lib/hooks/use-current-user";

type Workspace = "personal" | "sponsor" | "enterprise";

export function WorkspaceSwitcher({ user, compact = false }: { user: Pick<CurrentUserProfile, "activeWorkspace" | "availableWorkspaces"> | null | undefined; compact?: boolean }) {
  const [busy, setBusy] = useState<Workspace | null>(null);
  const [notice, setNotice] = useState("");
  const available = user?.availableWorkspaces ?? ["personal"];
  if (!user || available.length < 2) return null;
  const requested = user.activeWorkspace ?? "personal";
  const current: Workspace = available.includes(requested) ? requested : "personal";

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

  return <section className={compact ? "mt-5 border-t border-white/10 pt-5" : "rounded-[8px] border border-white/10 bg-white/[0.03] p-3"} aria-label="Workspace switcher">
    <p className="px-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Workspace</p>
    <div className="mt-2 grid gap-1">
      <WorkspaceButton label="Personal Workspace" icon={<UserRound size={16} />} active={current === "personal"} busy={busy === "personal"} onClick={() => void switchWorkspace("personal")} />
      {available.includes("sponsor") ? <WorkspaceButton label="Sponsor Workspace" icon={<Handshake size={16} />} active={current === "sponsor"} busy={busy === "sponsor"} onClick={() => void switchWorkspace("sponsor")} /> : null}
      {available.includes("enterprise") ?
      <WorkspaceButton label="Challenge Suite Enterprise" icon={<BriefcaseBusiness size={16} />} active={current === "enterprise"} busy={busy === "enterprise"} onClick={() => void switchWorkspace("enterprise")} />
      : null}
    </div>
    {notice ? <p role="status" className="mt-2 px-1 text-xs text-amber-200">{notice}</p> : null}
  </section>;
}

function WorkspaceButton({ label, icon, active, busy, onClick }: { label: string; icon: React.ReactNode; active: boolean; busy: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} disabled={active || busy} aria-current={active ? "page" : undefined} className={`flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-left text-sm font-bold transition ${active ? "bg-[var(--gold)] text-black" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
    {icon}<span className="min-w-0 flex-1">{busy ? "Switching..." : label}</span>{active ? <Check size={16} aria-label="Current workspace" /> : null}
  </button>;
}
