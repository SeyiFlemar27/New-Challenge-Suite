"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { fetchMyProfile, updateMyProfile } from "@/lib/api/services";
import { CheckCircle2, LockKeyhole, UserRound } from "lucide-react";

type RegionCode = "US" | "NG";

interface EditProfileForm {
  displayName: string;
  email: string;
  selfDeclaredRegion: RegionCode;
}

export default function EditProfilePage() {
  const [form, setForm] = useState<EditProfileForm>({ displayName: "", email: "", selfDeclaredRegion: "US" });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function loadProfile() {
    setLoading(true);
    setError(null);
    setUnauthenticated(false);
    const result = await fetchMyProfile();
    if (!result.ok || !result.data) {
      const code = (result as any).code;
      setUnauthenticated(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED");
      setError(result.message || "Profile could not be loaded.");
      setLoading(false);
      return;
    }

    const user = result.data.user as typeof result.data.user & { selfDeclaredRegion?: RegionCode | null };
    setForm({
      displayName: user.displayName ?? "",
      email: user.email ?? "",
      selfDeclaredRegion: user.selfDeclaredRegion === "NG" ? "NG" : "US"
    });
    setLoading(false);
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function saveProfile() {
    setSaving(true);
    setSaved(false);
    setError(null);
    setFieldErrors({});

    const result = await updateMyProfile({ displayName: form.displayName, selfDeclaredRegion: form.selfDeclaredRegion });
    setSaving(false);

    if (!result.ok) {
      setFieldErrors(((result as any).details?.fieldErrors ?? {}) as Record<string, string>);
      setError(result.message || "Profile could not be saved.");
      return;
    }

    setSaved(true);
  }

  if (loading) {
    return (
      <AppShell>
        <PageTitle title="Edit Profile" subtitle="Update your account information and declared region" />
        <Card className="mt-10 max-w-2xl p-8">
          <div className="space-y-6">
            {[1, 2, 3].map((item) => <div key={item} className="h-11 animate-pulse rounded-[7px] bg-white/10" />)}
          </div>
        </Card>
      </AppShell>
    );
  }

  if (unauthenticated) {
    return (
      <AppShell>
        <PageTitle title="Edit Profile" subtitle="Update your account information and declared region" />
        <Card className="mt-10">
          <EmptyState icon={<LockKeyhole />} title="Sign in required" body={error ?? "Sign in with a verified account to edit your profile."} action={<LinkButton href="/auth/login">Sign In</LinkButton>} />
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageTitle title="Edit Profile" subtitle="Update your account information and declared region" />
      <Card className="mt-10 max-w-2xl p-8">
        <div className="space-y-6">
          {error ? <p className="rounded-[8px] bg-red-950/40 p-3 text-sm font-bold text-red-200">{error}</p> : null}
          <Field label="Display Name">
            <input className={inputClass} value={form.displayName} onChange={(event) => setForm((value) => ({ ...value, displayName: event.target.value }))} />
            {fieldErrors.displayName ? <p className="mt-2 text-sm font-bold text-red-300">{fieldErrors.displayName}</p> : null}
          </Field>
          <Field label="Email"><input className={inputClass} value={form.email} disabled /></Field>
          <Field label="Self-Declared Country/Region">
            <select className={inputClass} value={form.selfDeclaredRegion} onChange={(event) => setForm((value) => ({ ...value, selfDeclaredRegion: event.target.value as RegionCode }))}>
              <option value="US">United States</option>
              <option value="NG">Nigeria</option>
            </select>
            {fieldErrors.selfDeclaredRegion ? <p className="mt-2 text-sm font-bold text-red-300">{fieldErrors.selfDeclaredRegion}</p> : null}
          </Field>
          {saved ? <p className="flex items-center gap-2 rounded-[8px] bg-emerald-950/40 p-3 text-emerald-200"><CheckCircle2 size={18} /> Profile changes saved.</p> : null}
          {error && !Object.keys(fieldErrors).length ? <Button variant="secondary" onClick={loadProfile}><UserRound size={18} /> Retry Load</Button> : null}
          <Button onClick={saveProfile} disabled={saving}>{saving ? "Saving..." : "Save Profile"}</Button>
        </div>
      </Card>
    </AppShell>
  );
}
