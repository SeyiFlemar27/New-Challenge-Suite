"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchLiveEvents } from "@/lib/api/services";

type LiveEvent = Record<string, unknown> & { id?: string };

export default function HostLiveEventsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["live-events", "host-management"], queryFn: () => fetchLiveEvents(30), staleTime: 30_000 });
  const events = useMemo<LiveEvent[]>(() => {
    if (!data?.ok) return [];
    return ((data.data?.events ?? []) as LiveEvent[]).filter((event) => Boolean(event.isOwned));
  }, [data]);
  const errorMessage = !isLoading && data && !data.ok ? data.message : null;

  return <PlanFeatureGate feature="host_control_center" requiredPlan="Host" title="Host tools are available on the Host Plan."><AppShell><div className="mx-auto max-w-7xl">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><PageTitle title="Live Events" subtitle="Manage live-event challenges and Creator Suite stream readiness." icon={<Radio />} /><LinkButton href="/host/live/create" className="w-full sm:w-auto">Create Live Event</LinkButton></div>
    {isLoading ? <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-56 animate-pulse bg-[#151515]" />)}</div> : null}
    {errorMessage ? <Card className="mt-8 p-6"><h2 className="text-xl font-black text-[var(--gold-2)]">Live events could not load</h2><p className="mt-2 text-slate-300">{errorMessage}</p></Card> : null}
    {!isLoading && !errorMessage && events.length ? <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{events.map((event) => <Card key={String(event.id)} className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{String(event.status ?? "scheduled").replaceAll("_", " ")}</p><h2 className="mt-3 text-xl font-black">{String(event.title ?? "Live event")}</h2><p className="mt-2 text-sm text-slate-400">{String(event.location ?? event.venueName ?? "Venue pending")}</p><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Info label="Registrations" value={event.attending ?? 0} /><Info label="Check-ins" value={event.checkInCount ?? 0} /><Info label="Stream" value={event.externalLiveUrl ? "Creator Suite link set" : "Setup required"} /><Info label="Date" value={event.date || "Not scheduled"} /></div><LinkButton href={event.challengeId ? `/challenges/${String(event.challengeId)}` : "/host/live/create"} variant="secondary" className="mt-5 w-full">Manage Event</LinkButton></Card>)}</div> : null}
    {!isLoading && !errorMessage && !events.length ? <Card className="mt-8"><EmptyState icon={<Radio className="text-[var(--gold)]" />} title="No live events yet" body="Live-event challenges you create will appear here. Streaming remains handled through Creator Suite." action={<LinkButton href="/host/live/create">Create Live Event</LinkButton>} /></Card> : null}
  </div></AppShell></PlanFeatureGate>;
}

function Info({ label, value }: { label: string; value: unknown }) { return <div className="rounded-[8px] bg-black/30 p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 font-bold text-white">{String(value || "Not available")}</p></div>; }
