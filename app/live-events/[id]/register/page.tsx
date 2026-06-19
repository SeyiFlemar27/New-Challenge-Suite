"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { fetchLiveEventDetails, registerForEvent } from "@/lib/api/services";

interface EventDetails {
  id: string;
  title: string;
  image: string;
  description: string;
  date: string;
  time: string;
  location: string;
  ticketType: string;
  alreadyRegistered: boolean;
  fullCapacity: boolean;
  planRequired: boolean;
  registrationOpen: boolean;
  canRegister: boolean;
}

function formatDate(value: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function EventRegistrationPage() {
  const params = useParams<{ id: string }>();
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [unauthenticated, setUnauthenticated] = useState(false);

  async function loadEvent() {
    setLoading(true);
    setError("");
    setNotFound(false);
    setUnauthenticated(false);
    const result = await fetchLiveEventDetails(params.id);
    if (!result.ok || !result.data) {
      const code = (result as any).code;
      setUnauthenticated(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED");
      setNotFound(code === "NOT_FOUND");
      setError(result.message || "Live event could not be loaded.");
      setLoading(false);
      return;
    }
    const data = result.data;
    const record = data.event as Partial<EventDetails>;
    setEvent({
      id: String(record.id ?? ""),
      title: String(record.title ?? ""),
      image: String(record.image ?? ""),
      description: String(record.description ?? ""),
      date: String(record.date ?? ""),
      time: String(record.time ?? ""),
      location: String(record.location ?? ""),
      ticketType: String(record.ticketType ?? "General attendee access"),
      alreadyRegistered: Boolean(record.alreadyRegistered),
      fullCapacity: Boolean(record.fullCapacity),
      planRequired: Boolean(record.planRequired),
      registrationOpen: Boolean(record.registrationOpen),
      canRegister: Boolean(record.canRegister)
    });
    setForm((value) => ({
      ...value,
      fullName: data.user.displayName ?? "",
      email: data.user.email ?? ""
    }));
    setLoading(false);
  }

  useEffect(() => {
    loadEvent();
  }, [params.id]);

  async function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!agreed) {
      setError("Accept the event agreement to continue.");
      return;
    }
    if (!event?.canRegister) {
      setError("This event is not available for registration.");
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await registerForEvent(event.id, {
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      notes: form.notes,
      ticketType: "general",
      acceptedAgreement: true
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message || "Registration could not be completed.");
      await loadEvent();
      return;
    }
    setSubmitted(true);
  }

  if (loading) {
    return (
      <AppShell>
        <div className="grid max-w-6xl gap-8 xl:grid-cols-[.9fr_1.1fr]">
          <Card className="h-[520px] animate-pulse bg-[#151515]" />
          <Card className="h-[520px] animate-pulse bg-[#151515]" />
        </div>
      </AppShell>
    );
  }

  if (unauthenticated) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl">
          <EmptyState icon={<LockKeyhole />} title="Sign in required" body={error || "Sign in with a verified account to register for live events."} action={<LinkButton href="/auth/login">Sign In</LinkButton>} />
        </Card>
      </AppShell>
    );
  }

  if (notFound || !event) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl">
          <EmptyState icon={<LockKeyhole />} title="Live event not found" body={error || "This live event does not exist or is unavailable."} action={<LinkButton href="/live-events">Back to Events</LinkButton>} />
        </Card>
      </AppShell>
    );
  }

  const blockedMessage = event.alreadyRegistered
    ? "You are already registered for this event."
    : event.fullCapacity
      ? "This event is full."
      : event.planRequired
        ? "This event requires an eligible subscription plan."
        : !event.registrationOpen
          ? "Registration is closed for this event."
          : "";

  if (submitted) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-10 text-center">
          <CheckCircle2 className="mx-auto h-20 w-20 text-emerald-400" />
          <h1 className="mt-6 text-4xl font-black">Registration Confirmed</h1>
          <p className="mt-3 text-slate-300">You are registered for {event.title}. Event details have been sent to your email.</p>
          <div className="mt-8 flex justify-center gap-3">
            <LinkButton href="/live-events">Back to Events</LinkButton>
            <LinkButton href="/dashboard" variant="secondary">Dashboard</LinkButton>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid max-w-6xl gap-8 xl:grid-cols-[.9fr_1.1fr]">
        <Card className="overflow-hidden">
          {event.image ? <img src={event.image} alt={event.title} className="h-72 w-full object-cover" /> : <div className="flex h-72 w-full items-center justify-center bg-black/40 text-sm font-bold text-slate-400">Event media unavailable</div>}
          <div className="p-7">
            <PageTitle title={event.title} subtitle={event.description} />
            <div className="mt-6 space-y-3 text-slate-200">
              <p><b>Date:</b> {formatDate(event.date)}</p>
              <p><b>Time:</b> {event.time || "Time unavailable"}</p>
              <p><b>Location:</b> {event.location}</p>
              <p><b>Ticket/access type:</b> {event.ticketType}</p>
            </div>
          </div>
        </Card>

        <Card className="p-8">
          <h2 className="text-2xl font-black">Event Registration</h2>
          <form className="mt-6 space-y-5" onSubmit={submit}>
            <Field label="Full Name"><input className={inputClass} value={form.fullName} onChange={(inputEvent) => setForm((value) => ({ ...value, fullName: inputEvent.target.value }))} required /></Field>
            <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={(inputEvent) => setForm((value) => ({ ...value, email: inputEvent.target.value }))} required /></Field>
            <Field label="Phone Number"><input className={inputClass} type="tel" value={form.phone} onChange={(inputEvent) => setForm((value) => ({ ...value, phone: inputEvent.target.value }))} placeholder="+1 555 0100" required /></Field>
            <Field label="Optional Notes"><textarea className={textareaClass} value={form.notes} onChange={(inputEvent) => setForm((value) => ({ ...value, notes: inputEvent.target.value }))} placeholder="Accessibility needs, team name, or guest notes" /></Field>
            <label className="flex items-start gap-3 font-bold"><input className="mt-1" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> I accept the live event rules, risk notice, and recording consent.</label>
            {blockedMessage ? <p className="rounded-[8px] bg-yellow-950/40 p-3 text-yellow-100">{blockedMessage}</p> : null}
            {error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-red-200">{error}</p> : null}
            <Button className="w-full" disabled={submitting || !event.canRegister}>{submitting ? "Submitting Registration..." : "Submit Registration"}</Button>
            {event.planRequired ? <LinkButton href="/subscriptions" variant="secondary" className="w-full">Upgrade Plan</LinkButton> : null}
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
