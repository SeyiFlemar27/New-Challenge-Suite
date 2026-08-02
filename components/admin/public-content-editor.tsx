"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { DEFAULT_PUBLIC_CONTENT } from "@/lib/public-site/config";

type Config = typeof DEFAULT_PUBLIC_CONTENT;

export function PublicContentEditor() {
  const [form, setForm] = useState<Config>(DEFAULT_PUBLIC_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiRequest<{ config: Config }>("/api/admin/public-content")
      .then((result) => {
        if (result.ok && result.data) setForm(result.data.config);
        else setMessage(result.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const setSection = (section: "announcement" | "hero" | "finalCta", key: string, value: unknown) => {
    setForm((current) => ({ ...current, [section]: { ...current[section], [key]: value } }));
  };

  async function save(status?: string) {
    setSaving(true);
    setMessage("");
    const body = status ? { ...form, announcement: { ...form.announcement, status } } : form;
    const result = await apiRequest<{ config: Config }>("/api/admin/public-content", {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    if (result.ok && result.data) {
      setForm(result.data.config);
      setMessage("Public website content saved.");
    } else {
      setMessage(result.message);
    }
    setSaving(false);
  }

  if (loading) return <Card className="h-72 animate-pulse" />;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black text-[var(--gold)]">Configuration</p>
          <h1 className="mt-2 text-3xl font-black">Public Website</h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            Manage published public copy and media. Platform statistics remain read-only trusted aggregates.
          </p>
        </div>
        <Link href="/" target="_blank" className="inline-flex min-h-11 items-center rounded-[8px] border border-white/10 px-4 font-bold">
          Preview live site
        </Link>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-xl font-black">Announcement</h2>
          <div className="mt-5 grid gap-5">
            <label className="flex items-center gap-3 font-bold">
              <input type="checkbox" checked={form.announcement.enabled} onChange={(event) => setSection("announcement", "enabled", event.target.checked)} />
              Enabled
            </label>
            <Field label="Message">
              <input className={inputClass} value={form.announcement.message} onChange={(event) => setSection("announcement", "message", event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="CTA label">
                <input className={inputClass} value={form.announcement.ctaLabel} onChange={(event) => setSection("announcement", "ctaLabel", event.target.value)} />
              </Field>
              <Field label="Internal CTA route">
                <input className={inputClass} value={form.announcement.ctaRoute} onChange={(event) => setSection("announcement", "ctaRoute", event.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start time">
                <input type="datetime-local" className={inputClass} value={form.announcement.startAt || ""} onChange={(event) => setSection("announcement", "startAt", event.target.value)} />
              </Field>
              <Field label="End time">
                <input type="datetime-local" className={inputClass} value={form.announcement.endAt || ""} onChange={(event) => setSection("announcement", "endAt", event.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Audience">
                <select className={inputClass} value={form.announcement.audience} onChange={(event) => setSection("announcement", "audience", event.target.value)}>
                  <option value="all">All roles</option>
                  <option value="user">Talent</option>
                  <option value="creator">Creator</option>
                  <option value="host">Host</option>
                  <option value="sponsor">Sponsor</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <Field label="Logged-in state">
                <select className={inputClass} value={form.announcement.loggedInState} onChange={(event) => setSection("announcement", "loggedInState", event.target.value)}>
                  <option value="all">Everyone</option>
                  <option value="guest">Guests only</option>
                  <option value="authenticated">Logged-in only</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Roles/workspaces (comma separated)">
                <input className={inputClass} value={form.announcement.roles.join(", ")} onChange={(event) => setSection("announcement", "roles", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} />
              </Field>
              <Field label="Plans (comma separated)">
                <input className={inputClass} value={form.announcement.plans.join(", ")} onChange={(event) => setSection("announcement", "plans", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} />
              </Field>
              <Field label="Priority">
                <input type="number" min="0" max="100" className={inputClass} value={form.announcement.priority} onChange={(event) => setSection("announcement", "priority", Number(event.target.value))} />
              </Field>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-black">Hero</h2>
          <div className="mt-5 grid gap-5">
            <Field label="Eyebrow">
              <input className={inputClass} value={form.hero.eyebrow} onChange={(event) => setSection("hero", "eyebrow", event.target.value)} />
            </Field>
            <Field label="Headline">
              <textarea className={`${inputClass} min-h-24`} value={form.hero.headline} onChange={(event) => setSection("hero", "headline", event.target.value)} />
            </Field>
            <Field label="Supporting copy">
              <textarea className={`${inputClass} min-h-28`} value={form.hero.supportingCopy} onChange={(event) => setSection("hero", "supportingCopy", event.target.value)} />
            </Field>
            <Field label="Video URL">
              <input className={inputClass} value={form.hero.videoUrl} onChange={(event) => setSection("hero", "videoUrl", event.target.value)} />
            </Field>
            <Field label="Poster URL">
              <input className={inputClass} value={form.hero.posterUrl} onChange={(event) => setSection("hero", "posterUrl", event.target.value)} />
            </Field>
          </div>
        </Card>

        <Card className="p-6 xl:col-span-2">
          <h2 className="text-xl font-black">Final call to action</h2>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Field label="Headline">
              <input className={inputClass} value={form.finalCta.headline} onChange={(event) => setSection("finalCta", "headline", event.target.value)} />
            </Field>
            <Field label="Supporting copy">
              <input className={inputClass} value={form.finalCta.body} onChange={(event) => setSection("finalCta", "body", event.target.value)} />
            </Field>
            <Field label="Button label">
              <input className={inputClass} value={form.finalCta.label} onChange={(event) => setSection("finalCta", "label", event.target.value)} />
            </Field>
          </div>
        </Card>
      </div>

      {message ? <p role="status" className="mt-5 rounded-[8px] border border-white/10 p-4">{message}</p> : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="secondary" disabled={saving} onClick={() => save("draft")}>Save draft</Button>
        <Button disabled={saving} onClick={() => save("published")}>{saving ? "Saving..." : "Publish changes"}</Button>
      </div>
    </div>
  );
}
