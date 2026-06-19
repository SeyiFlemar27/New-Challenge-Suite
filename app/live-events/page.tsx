"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchLiveEvents } from "@/lib/api/services";
import { CheckCircle2, LockKeyhole } from "lucide-react";

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
}

function formatDate(value: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function LiveEventsPage() {
  const [events, setEvents] = useState<LiveEventRecord[]>([]);
  const [canHostLiveEvents, setCanHostLiveEvents] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unauthenticated, setUnauthenticated] = useState(false);

  async function loadEvents() {
    setLoading(true);
    setError("");
    setUnauthenticated(false);
    const result = await fetchLiveEvents(30);
    if (!result.ok || !result.data) {
      const code = (result as any).code;
      setUnauthenticated(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED");
      setError(result.message || "Live events could not be loaded.");
      setEvents([]);
      setLoading(false);
      return;
    }
    setCanHostLiveEvents(Boolean(result.data.user.canHostLiveEvents));
    setEvents(result.data.events.map((event) => {
      const record = event as Partial<LiveEventRecord>;
      return {
        id: String(record.id ?? ""),
        title: String(record.title ?? ""),
        host: String(record.host ?? ""),
        image: String(record.image ?? ""),
        location: String(record.location ?? ""),
        date: String(record.date ?? ""),
        time: String(record.time ?? ""),
        attending: Number(record.attending ?? 0),
        registrationStatus: String(record.registrationStatus ?? "available"),
        planRequired: Boolean(record.planRequired),
        canRegister: Boolean(record.canRegister)
      };
    }).filter((event) => event.id));
    setLoading(false);
  }

  useEffect(() => {
    loadEvents();
  }, []);

  return (
    <AppShell>
      <div className="flex max-w-6xl flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle title="Live In-Person Events" subtitle="Discover offline competitions and physical gatherings." />
        {canHostLiveEvents ? <LinkButton href="/live-events/create">Become a Verified Host</LinkButton> : <LinkButton href="/subscriptions" variant="secondary">Upgrade to Host Events</LinkButton>}
      </div>
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
          <EmptyState icon={<LockKeyhole />} title="Live events unavailable" body={error} action={<Button onClick={loadEvents}>Retry</Button>} />
        </Card>
      ) : events.length ? (
        <div className="mt-12 grid max-w-5xl gap-10 border-t border-white/10 pt-12 md:grid-cols-2">
          {events.map((event) => {
          const isRegistered = event.registrationStatus === "registered";
          return (
            <Card key={event.title} className="overflow-hidden">
              {event.image ? <img src={event.image} alt={event.title} className="h-52 w-full object-cover" /> : <div className="flex h-52 w-full items-center justify-center bg-black/40 text-sm font-bold text-slate-400">Event media unavailable</div>}
              <div className="p-7">
                <div className="font-bold">Hosted by: {event.host} <span className="text-emerald-400">Verified</span></div>
                <h2 className="mt-5 text-2xl font-black">{event.title}</h2>
                <p className="mt-3 text-slate-200">{event.location}</p>
                <p className="mt-8 text-slate-200">Date: {formatDate(event.date)} at {event.time || "Time unavailable"}</p>
                <p className="mt-5 text-slate-200">{event.attending} attending</p>
                <div className="mt-7">
                  {isRegistered ? (
                    <p className="flex items-center gap-2 rounded-[8px] bg-emerald-950/40 p-3 font-bold text-emerald-200"><CheckCircle2 size={18} /> Registered to attend</p>
                  ) : event.planRequired ? (
                    <LinkButton href="/subscriptions" variant="secondary">Upgrade Required</LinkButton>
                  ) : !event.canRegister ? (
                    <Button variant="ghost" disabled>Registration Closed</Button>
                  ) : (
                    <LinkButton href={`/live-events/${event.id}/register`}>Register to Attend</LinkButton>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        </div>
      ) : (
        <Card className="mt-12 max-w-5xl">
          <EmptyState icon={<LockKeyhole />} title="No live events available" body="There are no scheduled live events right now." action={<Button onClick={loadEvents}>Retry</Button>} />
        </Card>
      )}
    </AppShell>
  );
}
