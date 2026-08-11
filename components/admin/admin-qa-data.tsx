"use client";

import { useEffect, useState } from "react";
import { Database, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";

type QaBatch = {
  id: string;
  createdAt?: string;
  createdByAdminId?: string;
  recordCount?: number;
  counts?: Record<string, number>;
};

export function AdminQaData() {
  const [batches, setBatches] = useState<QaBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<{ mode: "create" | "delete"; batch?: QaBatch } | null>(null);

  async function load() {
    setLoading(true);
    const result = await apiRequest<{ batches: QaBatch[] }>("/api/admin/qa-data");
    setLoading(false);
    if (!result.ok || !result.data) return setNotice(result.message);
    setBatches(result.data.batches);
    setNotice("");
  }

  useEffect(() => {
    void load();
  }, []);

  async function confirm() {
    if (!confirmation) return;
    setWorking(true);
    const result = confirmation.mode === "create"
      ? await apiRequest("/api/admin/qa-data", { method: "POST", body: "{}" })
      : await apiRequest("/api/admin/qa-data", {
          method: "DELETE",
          body: JSON.stringify({ batchId: confirmation.batch?.id })
        });
    setWorking(false);
    setNotice(result.message);
    if (result.ok) {
      setConfirmation(null);
      await load();
      window.dispatchEvent(new Event("admin:refresh"));
    }
  }

  return (
    <>
      <PageTitle
        title="QA Seed Data"
        subtitle="Create isolated review records for every critical admin queue, then remove them by batch without touching production records."
        icon={<Database />}
      />
      <Card className="mt-7 border-emerald-500/20 p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Safety boundary</p>
            <h2 className="mt-2 text-xl font-black">Review data only</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Seeded withdrawals remain pending review with providers disconnected. No payout, prize release, refund, notification, or balance conversion is executed.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void load()} disabled={loading || working}><RefreshCw size={16} /> Refresh</Button>
            <Button onClick={() => setConfirmation({ mode: "create" })} disabled={working}>Create QA seed records</Button>
          </div>
        </div>
      </Card>
      {notice ? <Card className="mt-5 border-[var(--gold)]/20 p-4 text-sm text-slate-200">{notice}</Card> : null}
      {loading ? <div className="mt-7 grid gap-5 md:grid-cols-2">{[0, 1].map((item) => <Card key={item} className="h-52 animate-pulse" />)}</div> : null}
      {!loading && !batches.length ? (
        <Card className="mt-7"><EmptyState icon={<ShieldCheck />} title="No QA seed batches" body="Create a batch when you are ready to verify live admin queues. Nothing is seeded automatically." /></Card>
      ) : null}
      {!loading && batches.length ? (
        <div className="mt-7 grid gap-5 xl:grid-cols-2">
          {batches.map((batch) => (
            <Card key={batch.id} className="p-5 sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Active QA batch</p>
                  <h2 className="mt-2 break-all text-lg font-black">{batch.id}</h2>
                  <p className="mt-2 text-sm text-slate-500">{batch.createdAt ? new Date(batch.createdAt).toLocaleString() : "Creation time unavailable"} · {batch.recordCount ?? 0} records</p>
                </div>
                <Button variant="ghost" className="text-red-200" onClick={() => setConfirmation({ mode: "delete", batch })}><Trash2 size={16} /> Delete batch</Button>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {Object.entries(batch.counts ?? {}).map(([collection, count]) => (
                  <div key={collection} className="flex items-center justify-between rounded-[8px] border border-white/8 bg-white/[0.025] px-4 py-3 text-sm">
                    <span className="break-all text-slate-400">{collection}</span><strong>{count}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <LinkButton href="/admin" variant="secondary">Verify queue cards</LinkButton>
                <LinkButton href="/admin/audit-logs" variant="ghost">View audit logs</LinkButton>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
      {confirmation ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-5 py-10" role="dialog" aria-modal="true" aria-labelledby="qa-confirm-title">
          <Card className="w-full max-w-xl border-[var(--gold)]/25 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Confirmation required</p>
                <h2 id="qa-confirm-title" className="mt-2 text-2xl font-black">{confirmation.mode === "create" ? "Create QA review records?" : "Delete this QA seed batch?"}</h2>
              </div>
              <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-white/10" onClick={() => setConfirmation(null)} aria-label="Close confirmation"><X /></button>
            </div>
            <p className="mt-5 leading-7 text-slate-400">
              {confirmation.mode === "create"
                ? "This creates clearly labeled test records in live Firestore queues. It does not move money, approve KYC, call a provider, or mark a withdrawal paid."
                : `Only documents tagged isQaSeed=true for ${confirmation.batch?.id} will be removed. The cleanup audit event remains append-only.`}
            </p>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setConfirmation(null)} disabled={working}>Cancel</Button>
              <Button onClick={() => void confirm()} disabled={working}>{working ? "Working..." : confirmation.mode === "create" ? "Create QA batch" : "Delete QA batch"}</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
