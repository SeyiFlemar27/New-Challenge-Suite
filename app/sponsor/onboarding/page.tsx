"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CheckCircle2, ExternalLink, LockKeyhole, Save, Upload } from "lucide-react";
import { Button, Card, Field, inputClass, LinkButton, textareaClass } from "@/components/ui";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { apiRequest } from "@/lib/api/client";
import { normalizeSponsorReviewStatus, sponsorStatusLabel } from "@/lib/sponsor-access";

interface SponsorProfile {
  brandName?: string;
  industry?: string;
  website?: string | null;
  countryLocation?: string;
  brandDescription?: string;
  socialLinks?: string[];
  contactPerson?: string;
  businessEmail?: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  ctaButtonText?: string;
  ctaDestinationLink?: string;
  sponsorshipGoals?: string[];
  preferredChallengeCategories?: string[];
  sponsorOnboardingStatus?: string | null;
  hasSponsorProfile?: boolean;
  sponsorVerificationStatus?: string | null;
  sponsorSubmittedAt?: string | null;
  sponsorReviewFeedback?: string | null;
}

interface SponsorProfileResponse {
  profileExists: boolean;
  sponsorProfile: SponsorProfile;
}

const goalOptions = ["Brand awareness", "Product launch", "Creator partnerships", "Community growth", "Lead generation", "Event activation"];
const categoryOptions = ["Music", "Dance", "Fitness", "Fashion", "Gaming", "Food", "Beauty", "Sports", "Business", "Education"];

const emptyForm = {
  brandName: "",
  industry: "",
  website: "",
  countryLocation: "",
  brandDescription: "",
  socialLinksText: "",
  contactPerson: "",
  businessEmail: "",
  logoUrl: "",
  bannerUrl: "",
  ctaButtonText: "Learn More",
  ctaDestinationLink: "",
  sponsorshipGoals: [] as string[],
  preferredChallengeCategories: [] as string[]
};

export default function SponsorOnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [profile, setProfile] = useState<SponsorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [savingAction, setSavingAction] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [unauthorized, setUnauthorized] = useState(false);

  const completed = Boolean(profile?.hasSponsorProfile || profile?.sponsorOnboardingStatus === "complete");
  const verificationStatus = normalizeSponsorReviewStatus(profile?.sponsorVerificationStatus);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    const result = await apiRequest<SponsorProfileResponse>("/api/sponsor/profile");
    if (!result.ok || !result.data) {
      const code = (result as any).code;
      setUnauthorized(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED");
      setError(result.message || "Sponsor profile could not be loaded.");
      setLoading(false);
      return;
    }

    const sponsorProfile = result.data.sponsorProfile;
    setProfile(sponsorProfile);
    setForm({
      brandName: sponsorProfile.brandName ?? "",
      industry: sponsorProfile.industry ?? "",
      website: sponsorProfile.website ?? "",
      countryLocation: sponsorProfile.countryLocation ?? "",
      brandDescription: sponsorProfile.brandDescription ?? "",
      socialLinksText: (sponsorProfile.socialLinks ?? []).join("\n"),
      contactPerson: sponsorProfile.contactPerson ?? "",
      businessEmail: sponsorProfile.businessEmail ?? "",
      logoUrl: sponsorProfile.logoUrl ?? "",
      bannerUrl: sponsorProfile.bannerUrl ?? "",
      ctaButtonText: sponsorProfile.ctaButtonText ?? "Learn More",
      ctaDestinationLink: sponsorProfile.ctaDestinationLink ?? "",
      sponsorshipGoals: sponsorProfile.sponsorshipGoals ?? [],
      preferredChallengeCategories: sponsorProfile.preferredChallengeCategories ?? []
    });
    setLoading(false);
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  function update(field: keyof typeof form, value: string | string[]) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setSaved(null);
  }

  function toggleList(field: "sponsorshipGoals" | "preferredChallengeCategories", value: string) {
    setForm((current) => {
      const active = current[field].includes(value);
      return { ...current, [field]: active ? current[field].filter((item) => item !== value) : [...current[field], value] };
    });
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setSaved(null);
  }

  const socialLinks = useMemo(() => form.socialLinksText.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean), [form.socialLinksText]);

  async function persistProfile(reviewAction: "save" | "submit") {
    setSaving(true);
    setSavingAction(reviewAction);
    setSaved(null);
    setError(null);
    setFieldErrors({});

    const result = await apiRequest<{ sponsorProfile: SponsorProfile }>("/api/sponsor/profile", {
      method: "PATCH",
      body: JSON.stringify({
        brandName: form.brandName,
        industry: form.industry,
        website: form.website,
        countryLocation: form.countryLocation,
        brandDescription: form.brandDescription,
        socialLinks,
        contactPerson: form.contactPerson,
        businessEmail: form.businessEmail,
        logoUrl: form.logoUrl,
        bannerUrl: form.bannerUrl,
        ctaButtonText: form.ctaButtonText,
        ctaDestinationLink: form.ctaDestinationLink,
        sponsorshipGoals: form.sponsorshipGoals,
        preferredChallengeCategories: form.preferredChallengeCategories,
        reviewAction
      })
    });

    setSaving(false);
    setSavingAction(null);
    if (!result.ok || !result.data) {
      setFieldErrors(((result as any).details?.fieldErrors ?? {}) as Record<string, string>);
      setError(result.message || "Sponsor profile could not be saved.");
      return;
    }

    setProfile(result.data.sponsorProfile);
    setSaved(result.message);
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistProfile("save");
  }

  if (loading) {
    return (
      <SponsorShell profile={profile}>
        <div className="mx-auto max-w-6xl">
          <div className="h-10 w-80 animate-pulse rounded bg-white/10" />
          <Card className="mt-8 p-5 sm:p-6 lg:p-8">
            <div className="grid gap-5 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-11 animate-pulse rounded-[7px] bg-white/10" />)}
            </div>
          </Card>
        </div>
      </SponsorShell>
    );
  }

  if (unauthorized) {
    return (
      <SponsorShell profile={profile}>
        <Card className="mx-auto mt-10 max-w-2xl p-6 text-center sm:mt-16 sm:p-8 lg:p-10">
          <LockKeyhole className="mx-auto h-12 w-12 text-[var(--gold)]" />
          <h1 className="mt-5 text-3xl font-black">Sponsor access required</h1>
          <p className="mt-3 text-slate-300">{error ?? "Sign in with a verified sponsor account to continue."}</p>
          <LinkButton href="/auth/login" className="mt-6">Sign In</LinkButton>
        </Card>
      </SponsorShell>
    );
  }

  if (verificationStatus === "suspended") {
    return (
      <SponsorShell profile={profile}>
        <Card className="mx-auto mt-10 max-w-2xl border-red-500/20 bg-red-950/20 p-8 text-center">
          <LockKeyhole className="mx-auto h-12 w-12 text-[var(--gold)]" />
          <h1 className="mt-5 text-3xl font-black">Sponsor access suspended</h1>
          <p className="mt-3 leading-7 text-slate-300">Your brand profile cannot be changed while sponsor access is suspended. Contact support for the next step.</p>
          <LinkButton href="/sponsor/messages" className="mt-6">Contact Support</LinkButton>
        </Card>
      </SponsorShell>
    );
  }

  return (
    <SponsorShell profile={profile}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[var(--gold)]">Sponsor Onboarding</p>
            <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">{completed ? "Update Brand Profile" : "Build Your Brand Command Center"}</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">Add the sponsor profile details Challenge Suite needs before future campaign, marketplace, placement, and reporting tools are activated.</p>
          </div>
          {completed ? <Button type="button" onClick={() => router.push("/sponsor/dashboard")}>Go to Dashboard <ArrowRight size={18} /></Button> : null}
        </div>

        <Card className={`mt-8 p-5 sm:p-6 ${verificationStatus === "approved" ? "border-emerald-500/20 bg-emerald-500/5" : "border-yellow-500/20 bg-yellow-500/5"}`}>
          <p className="flex items-center gap-2 font-bold"><CheckCircle2 size={18} className="text-[var(--gold)]" /> Review status: {sponsorStatusLabel(verificationStatus)}</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {verificationStatus === "approved" ? "Your sponsor profile is approved. Sponsor tools are available according to your plan." :
              verificationStatus === "pending_review" || verificationStatus === "submitted" ? "Your profile is under review. You can keep viewing or updating the brand profile while approval is pending." :
              verificationStatus === "rejected" || verificationStatus === "needs_changes" ? "Your sponsor profile needs changes before approval. Update it and submit it again." :
              "Save your complete profile, then submit it for platform review."}
          </p>
          {profile?.sponsorReviewFeedback ? <p className="mt-3 rounded-[8px] bg-black/30 p-3 text-sm text-slate-200">Review feedback: {profile.sponsorReviewFeedback}</p> : null}
        </Card>

        <form className="mt-8 grid gap-8 lg:mt-10 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)] xl:gap-10" onSubmit={saveProfile}>
          <Card className="p-5 sm:p-6 lg:p-8">
            <div className="grid gap-6 lg:grid-cols-2">
              <Field label="Brand Name"><input className={inputClass} value={form.brandName} onChange={(event) => update("brandName", event.target.value)} />{fieldErrors.brandName ? <ErrorText>{fieldErrors.brandName}</ErrorText> : null}</Field>
              <Field label="Industry / Category"><input className={inputClass} value={form.industry} onChange={(event) => update("industry", event.target.value)} placeholder="Food, beauty, fitness..." />{fieldErrors.industry ? <ErrorText>{fieldErrors.industry}</ErrorText> : null}</Field>
              <Field label="Website"><input className={inputClass} value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="https://brand.com" />{fieldErrors.website ? <ErrorText>{fieldErrors.website}</ErrorText> : null}</Field>
              <Field label="Country / Location"><input className={inputClass} value={form.countryLocation} onChange={(event) => update("countryLocation", event.target.value)} placeholder="United States, Nigeria..." />{fieldErrors.countryLocation ? <ErrorText>{fieldErrors.countryLocation}</ErrorText> : null}</Field>
              <Field label="Contact Person"><input className={inputClass} value={form.contactPerson} onChange={(event) => update("contactPerson", event.target.value)} />{fieldErrors.contactPerson ? <ErrorText>{fieldErrors.contactPerson}</ErrorText> : null}</Field>
              <Field label="Business Email"><input className={inputClass} type="email" value={form.businessEmail} onChange={(event) => update("businessEmail", event.target.value)} />{fieldErrors.businessEmail ? <ErrorText>{fieldErrors.businessEmail}</ErrorText> : null}</Field>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Field label="CTA Button Text"><input className={inputClass} value={form.ctaButtonText} onChange={(event) => update("ctaButtonText", event.target.value)} />{fieldErrors.ctaButtonText ? <ErrorText>{fieldErrors.ctaButtonText}</ErrorText> : null}</Field>
              <Field label="CTA Destination Link"><input className={inputClass} value={form.ctaDestinationLink} onChange={(event) => update("ctaDestinationLink", event.target.value)} placeholder="https://brand.com/campaign" />{fieldErrors.ctaDestinationLink ? <ErrorText>{fieldErrors.ctaDestinationLink}</ErrorText> : null}</Field>
            </div>
            <div className="mt-6">
              <Field label="Brand Description"><textarea className={textareaClass} value={form.brandDescription} onChange={(event) => update("brandDescription", event.target.value)} placeholder="Describe the brand, audience, and what you want creators or participants to know." />{fieldErrors.brandDescription ? <ErrorText>{fieldErrors.brandDescription}</ErrorText> : null}</Field>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Field label="Logo URL / Placeholder"><input className={inputClass} value={form.logoUrl} onChange={(event) => update("logoUrl", event.target.value)} placeholder="Optional image URL" />{fieldErrors.logoUrl ? <ErrorText>{fieldErrors.logoUrl}</ErrorText> : null}</Field>
              <Field label="Banner URL / Placeholder"><input className={inputClass} value={form.bannerUrl} onChange={(event) => update("bannerUrl", event.target.value)} placeholder="Optional banner URL" />{fieldErrors.bannerUrl ? <ErrorText>{fieldErrors.bannerUrl}</ErrorText> : null}</Field>
            </div>
            <div className="mt-6">
              <Field label="Social Links"><textarea className={textareaClass} value={form.socialLinksText} onChange={(event) => update("socialLinksText", event.target.value)} placeholder="One URL per line" />{fieldErrors.socialLinks ? <ErrorText>{fieldErrors.socialLinks}</ErrorText> : null}</Field>
            </div>
          </Card>

          <div className="space-y-6 lg:space-y-8">
            <Card className="p-5 sm:p-6 lg:p-7">
              <h2 className="flex items-center gap-2 text-xl font-black"><Building2 className="text-[var(--gold)]" /> Sponsor Goals</h2>
              <div className="mt-5 grid gap-3">
                {goalOptions.map((goal) => <CheckOption key={goal} label={goal} checked={form.sponsorshipGoals.includes(goal)} onChange={() => toggleList("sponsorshipGoals", goal)} />)}
              </div>
              {fieldErrors.sponsorshipGoals ? <ErrorText>{fieldErrors.sponsorshipGoals}</ErrorText> : null}
            </Card>
            <Card className="p-5 sm:p-6 lg:p-7">
              <h2 className="text-xl font-black">Preferred Challenge Categories</h2>
              <div className="mt-5 flex flex-wrap gap-3">
                {categoryOptions.map((category) => <ChipOption key={category} label={category} checked={form.preferredChallengeCategories.includes(category)} onClick={() => toggleList("preferredChallengeCategories", category)} />)}
              </div>
              {fieldErrors.preferredChallengeCategories ? <ErrorText>{fieldErrors.preferredChallengeCategories}</ErrorText> : null}
            </Card>
            <Card className="border-yellow-500/20 bg-yellow-500/5 p-5 sm:p-6 lg:p-7">
              <Upload className="h-8 w-8 text-[var(--gold)]" />
              <h2 className="mt-4 text-xl font-black">Media upload support</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">Logo and banner fields are prepared as URL placeholders for now. File upload can connect to Firebase Storage in a later media batch.</p>
            </Card>
            {error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-sm font-bold text-red-200">{error}</p> : null}
            {saved ? <p className="rounded-[8px] bg-emerald-950/40 p-3 text-sm font-bold text-emerald-200">{saved}</p> : null}
            <Button className="w-full" disabled={saving}>{savingAction === "save" ? "Saving Brand Profile..." : <><Save size={18} /> Save Brand Profile</>}</Button>
            {verificationStatus === "approved" ? <p className="rounded-[8px] border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100">This sponsor profile is approved. Saving updates does not start any payment or funding action.</p> :
              verificationStatus === "pending_review" || verificationStatus === "submitted" ? <Button type="button" variant="secondary" className="w-full" disabled>Submitted for Review</Button> :
              <Button type="button" variant="secondary" className="w-full" disabled={saving} onClick={() => void persistProfile("submit")}>{savingAction === "submit" ? "Submitting..." : "Submit for Review"}</Button>}
            {completed ? <LinkButton href="/sponsor/dashboard" variant="secondary" className="w-full">Open Brand Command Center <ExternalLink size={16} /></LinkButton> : null}
          </div>
        </form>
      </div>
    </SponsorShell>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm font-bold text-red-300">{children}</p>;
}

function CheckOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-white/10 bg-[#1a1a1a] px-4 py-3 text-sm font-bold"><input className="shrink-0" type="checkbox" checked={checked} onChange={onChange} /> {label}</label>;
}

function ChipOption({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={checked ? "min-h-11 rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-black text-black" : "min-h-11 rounded-full border border-white/10 bg-[#1a1a1a] px-4 py-2 text-sm font-bold text-slate-300"}>{label}</button>;
}
