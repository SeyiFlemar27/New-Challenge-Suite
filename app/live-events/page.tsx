"use client";
import { ContentImage } from "@/components/content-image";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchLiveEvents } from "@/lib/api/services";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getEffectiveTier } from "@/lib/plan-access";

interface LiveEventRecord {
  id: string;
  title: string;
  host: string;
  image: string;
  location: string;
  date: string;
  time: string;
  attending: number;
  registrationStatus: string;
  planRequired: boolean;
  canRegister: boolean;
  checkInCount?: number;
  status?: string;
  isOwned?: boolean;
  source?: string;
  challengeId?: string | null;
  venueName?: string;
  venueAddress?: string;
  nativeLiveStreamingEnabled?: boolean;
}

function formatDate(value: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function LiveEventsPage() {
  return <LiveEventsContent />;
}

function LiveEventsContent() {
  const { user } = useCurrentUser();
  const eventsQuery = useQuery({ queryKey: ["live-events", user?.uid ?? "signed-out"], queryFn: () => fetchLiveEvents(30), staleTime: 30_000, retry: false });
  const events = useMemo(() => {
    const rawEvents = eventsQuery.data?.ok ? eventsQuery.data.data?.events ?? [] : [];
    return rawEvents.map((event) => {
      const record = event as Partial<LiveEventRecord>;
      return {
        id: String(record.id ?? ""), title: String(record.title ?? ""), host: String(record.host ?? ""), image: String(record.image ?? ""),
        location: String(record.location ?? ""), date: String(record.date ?? ""), time: String(record.time ?? ""), attending: Number(record.attending ?? 0),
        registrationStatus: String(record.registrationStatus ?? "available"), planRequired: Boolean(record.planRequired), canRegister: Boolean(record.canRegister),
        checkInCount: Number(record.checkInCount ?? 0), status: String(record.status ?? "scheduled"), isOwned: Boolean(record.isOwned),
        source: String((record as any).source ?? "liveEvents"), challengeId: (record as any).challengeId ? String((record as any).challengeId) : null,
        venueName: String((record as any).venueName ?? ""), venueAddress: String((record as any).venueAddress ?? ""), nativeLiveStreamingEnabled: false
      };
    }).filter((event) => event.id);
  }, [eventsQuery.data]);
  const canHostLiveEvents = Boolean(eventsQuery.data?.ok && eventsQuery.data.data?.user.canHostLiveEvents);
  const loading = eventsQuery.isLoading;
  const error = eventsQuery.data && !eventsQuery.data.ok ? eventsQuery.data.message || "Live events could not be loaded." : "";
  const unauthenticated = eventsQuery.data && !eventsQuery.data.ok && ["AUTHENTICATION_REQUIRED", "PERMISSION_DENIED"].includes(String(eventsQuery.data.code ?? ""));
  const tier = getEffectiveTier({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role });
  const hostMode = tier.id === "host";

  return (
    <AppShell>
      <div className="flex max-w-6xl flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle title={hostMode ? "My Live Events" : "Live In-Person Events"} subtitle={hostMode ? "Create and manage events, registrations, check-ins, and event status." : "Discover offline competitions and physical gatherings."} />
        {hostMode ? <LinkButton href="/host/live/create">Create Live Event</LinkButton> : canHostLiveEvents ? <LinkButton href="/dashboard/host">Open Host Controls</LinkButton> : <LinkButton href="/subscriptions" variant="secondary">{["creator_starter", "creator"].includes(tier.id) ? "Become a Host" : "Become a Creator"}</LinkButton>}
      </div>
      {hostMode ? <div className="mt-6 flex flex-wrap gap-2">{["Upcoming", "Live Now", "Completed", "Drafts"].map((label) => <span key={label} className="rounded-[8px] border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold">{label}</span>)}</div> : null}
      {loading ? (
        <div className="mt-12 grid max-w-5xl gap-10 border-t border-white/10 pt-12 md:grid-cols-2">
          {[1, 2].map((item) => <Card key={item} className="h-[470px] animate-pulse bg-[#151515]" />)}
        </div>
      ) : unauthenticated ? (
        <Card className="mt-12 max-w-5xl">
          <EmptyState icon={<LockKeyhole />} title="Sign in required" body={error || "Sign in with a verified account to view live events."} action={<LinkButton href="/auth/login">Sign In</LinkButton>} />
        </Card>
      ) : error ? (
        <Card className="mt-12 max-w-5xl">
          <EmptyState icon={<LockKeyhole />} title="Live events unavailable" body={error} action={<Button onClick={() => void eventsQuery.refetch()}>Retry</Button>} />
        </Card>
      ) : (hostMode ? events.filter((event) => event.isOwned) : events).length ? (
        <div className="mt-12 grid max-w-5xl gap-10 border-t border-white/10 pt-12 md:grid-cols-2">
          {(hostMode ? events.filter((event) => event.isOwned) : events).map((event) => {
          const isRegistered = event.registrationStatus === "registered";
          return (
            <Card key={event.title} className="overflow-hidden">
              {event.image ? <ContentImage src={event.image} alt={event.title} className="h-52 w-full object-cover" /> : <div className="flex h-52 w-full items-center justify-center bg-black/40 text-sm font-bold text-slate-400">Event media unavailable</div>}
              <div className="p-7">
                <div className="font-bold">Hosted by: {event.host} <span className="text-emerald-400">Verified</span></div>
                <h2 className="mt-5 text-2xl font-black">{event.title}</h2>
                <p className="mt-3 text-slate-200">Physical Event · Venue: {event.venueName || event.location || "Venue pending"}</p>
                {event.venueAddress ? <p className="mt-1 text-sm text-slate-400">{event.venueAddress}</p> : null}
                <p className="mt-8 text-slate-200">Date: {formatDate(event.date)} at {event.time || "Time unavailable"}</p>
                <p className="mt-5 text-slate-200">{event.attending} attending</p>
                <div className="mt-5 rounded-[8px] border border-white/10 bg-black/30 p-4 text-sm text-slate-300">
                  <p className="font-black text-white">In-person event</p>
                  <p className="mt-1">Registration, check-in, and participation are managed at the venue.</p>
                </div>
                {hostMode ? <p className="mt-2 text-sm text-slate-400">{event.checkInCount ?? 0} checked in · Status: <span className="capitalize">{event.status?.replaceAll("_", " ")}</span></p> : null}
                <div className="mt-7">
                  {hostMode ? <LinkButton href="/dashboard/host/events">Manage Event</LinkButton> : null}
                  {!hostMode ? <>
                  {event.challengeId ? <LinkButton href={`/challenges/${event.challengeId}`} variant="secondary" className="mb-3 mr-3">View Challenge</LinkButton> : null}
                  {isRegistered ? (
                    <p className="flex items-center gap-2 rounded-[8px] bg-emerald-950/40 p-3 font-bold text-emerald-200"><CheckCircle2 size={18} /> Registered to attend</p>
                  ) : event.planRequired ? (
                    <LinkButton href="/subscriptions" variant="secondary">Upgrade Required</LinkButton>
                  ) : !event.canRegister ? (
                    <Button variant="ghost" disabled>Registration Closed</Button>
                  ) : (
                    <LinkButton href={`/live-events/${event.id}/register`}>Register to Attend</LinkButton>
                  )}
                  </> : null}
                </div>
              </div>
            </Card>
          );
        })}
        </div>
      ) : (
        <Card className="mt-12 max-w-5xl">
          <EmptyState icon={<LockKeyhole />} title={hostMode ? "No hosted events yet" : "No live events available"} body={hostMode ? "Create your first live-event challenge to begin the event-management workflow." : "There are no scheduled live events right now."} action={hostMode ? <LinkButton href="/host/live/create">Create Live Event</LinkButton> : <Button onClick={() => void eventsQuery.refetch()}>Retry</Button>} />
        </Card>
      )}
    </AppShell>
  );
}

