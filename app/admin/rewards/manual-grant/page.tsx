"use client";

import { useEffect, useMemo, useState } from "react";
import { Gift } from "lucide-react";
import { Button, Card, Field, inputClass, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Prize = { id: string; prizeName: string; prizeType: string; rewardValue: number; unit?: string | null; currency?: string | null; status: string; enabled: boolean };

export default function ManualRewardGrantPage() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [user, setUser] = useState("");
  const [prizeId, setPrizeId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const supported = useMemo(() => prizes.filter((prize) => prize.enabled && prize.status === "active" && ["reward_points", "dorocoin", "cash", "free_entry", "fixed_entry_discount", "percentage_entry_discount", "creator_boost", "bonus_spin"].includes(prize.prizeType)), [prizes]);
  const selected = supported.find((prize) => prize.id === prizeId);

  useEffect(() => { void apiRequest<{ prizes: Prize[] }>("/api/admin/rewards/prizes").then((result) => result.ok ? setPrizes(result.data?.prizes ?? []) : setMessage(result.message)); }, []);

  async function submit() {
    setBusy(true);
    setMessage("");
    const response = await apiRequest("/api/admin/rewards/manual-grants", { method: "POST", body: JSON.stringify({ user: user.trim(), prizeId, reason: reason.trim(), confirmation, idempotencyKey: crypto.randomUUID() }) });
    setBusy(false);
    setMessage(response.message);
    if (response.ok) { setUser(""); setPrizeId(""); setReason(""); setConfirmation(""); }
  }

  return <>
    <PageTitle title="Manual Reward Grant" subtitle="Grant an active supported reward through the same ledger, entitlement, budget, and fulfillment controls used by normal rewards." icon={<Gift />} />
    {message ? <Card className="mt-6 p-4 text-sm font-bold" role="status">{message}</Card> : null}
    <Card className="mt-8 max-w-2xl p-6">
      <div className="space-y-5">
        <Field label="User ID or email"><input className={inputClass} value={user} onChange={(event) => setUser(event.target.value)} autoComplete="off" /></Field>
        <Field label="Reward"><select className={inputClass} value={prizeId} onChange={(event) => setPrizeId(event.target.value)}><option value="">Select an active reward</option>{supported.map((prize) => <option key={prize.id} value={prize.id}>{prize.prizeName} · {prize.prizeType.replaceAll("_", " ")}</option>)}</select></Field>
        {selected ? <div className="rounded-[8px] border border-[var(--line)] p-4 text-sm"><p className="font-black">Resulting fulfillment</p><p className="mt-2 text-[var(--muted)]">{selected.prizeType === "cash" ? "Creates a pending-review internal Wallet credit backed by the configured reward budget." : ["free_entry", "fixed_entry_discount", "percentage_entry_discount", "creator_boost", "bonus_spin"].includes(selected.prizeType) ? "Creates a single-use Reward entitlement for the user." : selected.prizeType === "dorocoin" ? "Credits the non-withdrawable DoroCoin ledger." : "Credits the canonical Reward Point ledger."}</p></div> : null}
        <Field label="Operational reason"><textarea className={textareaClass} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        <Field label="Type CONFIRM REWARD GRANT to confirm"><input className={inputClass} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></Field>
        <p className="text-sm text-[var(--muted)]">This creates an immutable Reward Grant and audit record. Cash remains pending review and no external payout is executed.</p>
        <Button onClick={submit} disabled={busy || !user.trim() || !prizeId || reason.trim().length < 8 || confirmation !== "CONFIRM REWARD GRANT"}>{busy ? "Granting..." : "Grant Reward"}</Button>
      </div>
    </Card>
  </>;
}
