"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { workspaceRouteNeedsSwitch, type WorkspaceId } from "@/lib/workspace-routing";

export function WorkspaceRouteBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, signedOut } = useCurrentUser();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const available = user?.availableWorkspaces ?? ["personal"];
  const required = user ? workspaceRouteNeedsSwitch(pathname, user.activeWorkspace, available) : null;

  useEffect(() => {
    if (!user || !required) return;
    if (document.querySelector("[data-builder-surface]") && !window.confirm("This builder may have unsaved changes. Switch workspace and continue?")) {
      window.history.back();
      return;
    }
    let active = true;
    setError("");
    setSwitching(true);
    void apiRequest<{ activeWorkspace: WorkspaceId }>("/api/auth/workspace", {
      method: "PATCH",
      body: JSON.stringify({ workspace: required }),
    }).then((result) => {
      if (!active) return;
      if (result.ok) window.location.replace(window.location.pathname + window.location.search + window.location.hash);
      else { setError(result.message || "Workspace access could not be refreshed."); setSwitching(false); }
    });
    return () => { active = false; };
  }, [required, user]);

  if (error) return <div className="grid min-h-screen place-items-center bg-[var(--background)] px-6 text-center"><div><h1 className="text-xl font-black">Workspace unavailable</h1><p className="mt-2 text-sm text-[var(--muted)]">{error}</p><button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-[8px] bg-[var(--gold)] px-5 py-3 text-sm font-black text-black">Try Again</button></div></div>;
  if (loading || (!signedOut && required) || switching) {
    return <div className="grid min-h-screen place-items-center bg-[var(--background)] px-6 text-center text-sm font-bold text-[var(--muted)]" role="status">Opening the correct workspace...</div>;
  }
  return <>{children}</>;
}
