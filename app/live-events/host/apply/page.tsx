"use client";

import { FormEvent, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, LinkButton, PageTitle, inputClass, textareaClass } from "@/components/ui";
import { Award, CalendarCheck, CheckCircle2, ShieldCheck, Sparkles, Users } from "lucide-react";

const benefits = [
  { icon: <ShieldCheck size={20} />, title: "Verified trust", body: "Show competitors and sponsors that your event is reviewed and approved." },
  { icon: <Users size={20} />, title: "Audience growth", body: "Bring your physical competitions into the Challenge Suite discovery feed." },
  { icon: <CalendarCheck size={20} />, title: "Event tools", body: "Prepare registrations, attendance, and event visibility through the platform." }
];

const eventTypes = ["Tournament", "Creator meetup", "Brand activation", "Live showcase", "Workshop", "Other"];

export default function VerifiedHostApplicationPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Pending backend connection: this is intentionally local UI state until a host-application API route is approved.
    setSubmitted(true);
  }

  return (
    <AppShell>
      <div className="max-w-6xl">
        <LinkButton href="/live-events" variant="ghost">Back to Live Events</LinkButton>
        <div className="mt-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <PageTitle
            icon={<Award className="text-[var(--gold)]" />}
            title="Become a Verified Host"
            subtitle="Apply to host trusted in-person Challenge Suite events for competitors, creators, and sponsors."
          />
          <div className="rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-4 py-3 text-sm font-bold text-[var(--gold-2)]">
            Applications are reviewed before public hosting access is granted.
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[.9fr_1.35fr]">
          <div className="space-y-5">
            <Card className="p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[var(--gold)] text-black gold-glow">
                <Sparkles size={24} />
              </div>
              <h2 className="mt-6 text-2xl font-black text-white">What verified hosts can do</h2>
              <p className="mt-4 text-sm leading-6 text-[#8fa6ca]">
                Verified hosts can submit live event concepts for review, manage event interest, and bring Challenge Suite competitions into real-world rooms.
              </p>
            </Card>

            <div className="grid gap-4">
              {benefits.map((benefit) => (
                <Card key={benefit.title} className="p-5">
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 text-[var(--gold)]">
                      {benefit.icon}
                    </div>
                    <div>
                      <h3 className="font-black text-white">{benefit.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-[#8fa6ca]">{benefit.body}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <Card className="p-6 md:p-8">
            {submitted ? (
              <div className="flex min-h-[560px] flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                  <CheckCircle2 size={34} />
                </div>
                <h2 className="mt-7 text-3xl font-black text-white">Application received</h2>
                <p className="mt-4 max-w-xl text-lg leading-8 text-[#8fa6ca]">
                  Thanks for applying to become a verified host. The backend approval workflow is pending connection, so this preview stores the success state locally for now.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Button onClick={() => setSubmitted(false)} variant="secondary">Submit Another</Button>
                  <LinkButton href="/live-events">Back to Events</LinkButton>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <h2 className="text-2xl font-black text-white">Verified Host Application</h2>
                  <p className="mt-2 text-sm leading-6 text-[#8fa6ca]">Tell us who you are, where you host, and what kind of live Challenge Suite experience you want to create.</p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Full name">
                    <input className={inputClass} name="fullName" required />
                  </Field>
                  <Field label="Email">
                    <input className={inputClass} name="email" type="email" required />
                  </Field>
                  <Field label="Phone number">
                    <input className={inputClass} name="phone" type="tel" required />
                  </Field>
                  <Field label="Organization / brand name">
                    <input className={inputClass} name="organization" required />
                  </Field>
                  <Field label="City / location">
                    <input className={inputClass} name="location" required />
                  </Field>
                  <Field label="Event type">
                    <select className={inputClass} name="eventType" required defaultValue="">
                      <option value="" disabled>Select event type</option>
                      {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="Experience hosting events">
                  <textarea className={textareaClass} name="experience" required placeholder="Share past events, audience size, venues, brands, or competition formats you have managed." />
                </Field>

                <Field label="Social media or website link">
                  <input className={inputClass} name="website" type="url" placeholder="https://example.com" />
                </Field>

                <Field label="Why do you want to host Challenge Suite events?">
                  <textarea className={textareaClass} name="reason" required placeholder="Tell us what makes your event concept a strong fit for Challenge Suite." />
                </Field>

                <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-[#8fa6ca]">Submitting this form does not publish an event. Approval is required before public display.</p>
                  <Button type="submit" className="sm:min-w-44">Submit Application</Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
