"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, LockKeyhole, Rocket } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, LinkButton } from "@/components/ui";

type BoostState = {
  allowance: number;
  used: number;
  remaining: number;
  resetAt: string;
  active: boolean;
  endsAt: string | null;
  durationHours: number;
  access: { allowed: boolean; reason: string | null; eligibleStatus: boolean };
};

export function MonthlyBoostControl({ challengeId }: { challengeId: string }) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const query = useQuery({ queryKey: ["monthly-boost", challengeId], queryFn: () => apiRequest<{ state: BoostState }>(`/api/challenges/${challengeId}/boost`), staleTime: 15_000 });
  const state = query.data?.ok ? query.data.data?.state : null;
  const mutation = useMutation({
    mutationFn: () => {
      const idempotencyKey = crypto.randomUUID();
      return apiRequest<{ boost: { endsAt: string }; entitlement: BoostState }>(`/api/challenges/${challengeId}/boost`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ idempotencyKey }) });
    },
    onSuccess: async () => { setConfirming(false); await Promise.all([client.invalidateQueries({ queryKey: ["monthly-boost", challengeId] }), client.invalidateQueries({ queryKey: ["challenge-manage", challengeId] })]); }
  });

  if (query.isLoading) return <Card className="h-40 animate-pulse" aria-label="Loading Monthly Boost" />;
  if (!state) return <Card className="p-5"><h2 className="font-black">Monthly Boost</h2><p className="mt-2 text-sm text-slate-400">Boost status is temporarily unavailable.</p></Card>;
  const locked = state.allowance <= 0 || state.access.reason === "plan_required";
  const exhausted = state.remaining <= 0;
  const canRedeem = state.access.allowed && !exhausted;
  const action = state.active ? "Extend 3 Days" : "Boost Challenge";

  return <Card className="p-5" data-monthly-boost-control>
    <div className="flex items-start gap-3"><span className="rounded-[8px] bg-[var(--gold)]/10 p-2 text-[var(--gold)]">{locked ? <LockKeyhole size={20} /> : <Rocket size={20} />}</span><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--gold)]">{state.active ? "Monthly Boost Active" : "Monthly Boost"}</p><h2 className="mt-1 text-lg font-black">{locked ? "Available with eligible premium plans" : `${state.remaining} of ${state.allowance} boosts remaining this month.`}</h2></div></div>
    {state.active ? <p className="mt-4 flex items-center gap-2 text-sm text-slate-300"><CalendarClock size={16} /> Ends {state.endsAt ? new Date(state.endsAt).toLocaleString() : "soon"}</p> : <p className="mt-4 text-sm text-slate-400">Each redemption adds 72 hours of discovery ranking weight. It is never labelled publicly.</p>}
    {!state.access.eligibleStatus && !locked ? <p className="mt-3 text-sm text-amber-200">A new boost can be applied only while this challenge is Scheduled or Active.</p> : null}
    {mutation.data && !mutation.data.ok ? <p className="mt-3 text-sm text-red-200">{mutation.data.message}</p> : null}
    {locked ? <LinkButton href="/subscriptions" variant="secondary" className="mt-5">View Plans</LinkButton> : confirming ? <div className="mt-5 rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/5 p-4"><p className="font-black">Use one Monthly Boost?</p><p className="mt-1 text-sm text-slate-400">This will {state.active ? "extend the current boost" : "activate the boost"} by 72 hours.</p><div className="mt-4 flex gap-2"><Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Applying..." : "Confirm"}</Button><Button variant="secondary" disabled={mutation.isPending} onClick={() => setConfirming(false)}>Cancel</Button></div></div> : <Button className="mt-5" disabled={!canRedeem} onClick={() => setConfirming(true)}>{exhausted ? "Monthly allowance used" : action}</Button>}
    <p className="mt-4 text-xs text-slate-500">Resets {new Date(state.resetAt).toLocaleDateString()}.</p>
  </Card>;
}
