"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { logout } from "@/lib/firebase/auth-service";
import { ApiErrorPanel } from "@/components/api-error-panel";

type DeletionStatus = { status: string; cancellationAllowed: boolean; requestedAt?: string | null; retainedFinancialAndAuditRecords: boolean };

export default function AccountDeletionStatusPage() {
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function loadStatus() { void apiRequest<DeletionStatus>("/api/account/delete").then((result) => { if (result.ok && result.data) { setStatus(result.data); setMessage(""); } else setMessage(result.message); }); }
  useEffect(loadStatus, []);
  async function cancelDeletion() {
    setBusy(true);
    const result = await apiRequest<{ status: string }>("/api/account/delete", { method: "DELETE" });
    setBusy(false);
    if (result.ok) window.location.href = "/dashboard";
    else setMessage(result.message);
  }
  return <AppShell><div className="mx-auto max-w-2xl"><PageTitle title="Account deletion in progress" subtitle="Your public profile is no longer visible while this request is reviewed." icon={<ShieldAlert className="text-amber-600" />} /><Card className="mt-7 border-amber-300 bg-white p-6 text-slate-950 sm:p-8"><p className="leading-7 text-slate-700">Some records may be retained for payment, safety, legal, audit, dispute, or platform-integrity reasons. Retained records are not attached to any future account created after deletion is finalized.</p>{status?.requestedAt ? <p className="mt-4 text-sm text-slate-500">Requested {new Date(status.requestedAt).toLocaleString()}</p> : null}{message ? <ApiErrorPanel message={message} onRetry={loadStatus} /> : null}<div className="mt-7 flex flex-col gap-3 sm:flex-row"><LinkButton href="/contact">Contact Support</LinkButton>{status?.cancellationAllowed ? <Button variant="secondary" disabled={busy} onClick={() => void cancelDeletion()}>{busy ? "Cancelling..." : "Cancel Deletion"}</Button> : null}<Button variant="ghost" onClick={() => void logout().finally(() => { window.location.href = "/auth/login"; })}>Sign Out</Button></div></Card></div></AppShell>;
}
