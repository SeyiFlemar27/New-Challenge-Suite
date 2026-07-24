"use client";

import { useState } from "react";
import { ArrowRight, Building2, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { MediaUploadField } from "@/components/media-upload-field";
import { Button, Card, Field, inputClass, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { sponsorMediaPath } from "@/lib/media-upload-paths";

const initial = { brandName: "", workEmail: "", website: "", industry: "", countryRegion: "", contactPerson: "", sponsorGoal: "", brandDescription: "", sponsorshipType: "", logoUrl: "", logoPath: "", bannerUrl: "", bannerPath: "" };
const sponsorTypes = ["Sponsor a challenge", "Sponsor creators", "Sponsor live events", "Sponsor tournaments", "Long-term brand partnership", "Not sure yet"];
const sponsorGoals = ["Brand awareness", "Product launch", "Creator collaboration", "Community growth", "Live event activation", "Tournament partnership", "Lead generation"];

export default function SponsorOnboardingPage() {
  const auth = useAuth();
  const [accountMode, setAccountMode] = useState<"existing" | "separate">("existing");
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); setMessage(""); setError(""); setSubmitted(false); }
  async function submit() {
    setSaving(true); setError(""); setMessage(""); setSubmitted(false);
    const payload = {
      brandName: form.brandName,
      legalBusinessName: form.brandName,
      industry: form.industry,
      companySize: "",
      businessType: "Brand / Sponsor",
      businessRegistrationCountry: form.countryRegion,
      headquartersLocation: form.countryRegion,
      website: form.website,
      countryLocation: form.countryRegion,
      brandDescription: form.brandDescription,
      socialLinks: [],
      contactPerson: form.contactPerson,
      businessEmail: form.workEmail,
      phoneNumber: "",
      logoUrl: form.logoUrl,
      logoPath: form.logoPath,
      alternateLogoUrl: "",
      alternateLogoPath: "",
      squareIconUrl: "",
      squareIconPath: "",
      bannerUrl: form.bannerUrl,
      bannerPath: form.bannerPath,
      coverImageUrl: form.bannerUrl,
      coverImagePath: form.bannerPath,
      brandColors: [],
      brandFonts: [],
      brandTone: "Professional",
      approvedHashtags: [],
      preferredCtaLabels: ["Learn More"],
      ctaButtonText: "Learn More",
      ctaDestinationLink: form.website,
      sponsorshipGoals: form.sponsorGoal ? [form.sponsorGoal] : [],
      preferredChallengeCategories: [form.sponsorshipType || "Sponsor a challenge"],
      targetCountries: form.countryRegion ? [form.countryRegion] : [],
      targetRegions: [],
      targetAgeRange: "",
      genderPreference: "",
      languages: [],
      interests: [],
      preferredCreatorNiches: [],
      preferredAudienceSize: "",
      typicalCampaignBudget: "",
      preferredSponsorshipStructure: form.sponsorshipType,
      preferredPaymentCurrency: "USD",
      preferredCampaignDuration: "",
      milestonePaymentsRequired: false,
      legalApprovalRequired: false,
      publicProfile: false,
      reviewAction: "save"
    };
    const result = await apiRequest<{ sponsorProfile: Record<string, unknown> }>("/api/sponsor/profile", { method: "PATCH", body: JSON.stringify(payload) });
    setSaving(false);
    if (!result.ok) { setError(result.message || "Sponsor profile could not be started. If this is a normal account, sponsor account switching still needs backend support."); return; }
    setSubmitted(true);
    setMessage("Sponsor profile started");
  }

  if (submitted) return <AppShell><div className="mx-auto max-w-4xl"><Card className="p-8 text-center"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-300" /><h1 className="mt-5 text-3xl font-black">Sponsor profile started</h1><p className="mx-auto mt-3 max-w-2xl text-slate-300">Your sponsor profile is ready for review. You can enter the Sponsor Center with limited access while brand approval and plan activation are completed.</p><div className="mt-7 grid gap-3 sm:flex sm:justify-center"><LinkButton href="/sponsor/dashboard">Go to Sponsor Center</LinkButton><LinkButton href="/sponsor/plans" variant="secondary">View Sponsor Plans</LinkButton></div><Card className="mt-7 border-yellow-500/20 bg-yellow-500/5 p-4 text-left text-sm leading-6 text-slate-300"><b className="text-white">Limited access:</b> brand approval is required for full sponsor tools. A sponsor subscription is required before campaign tools unlock. Campaign budgets and prize contributions are handled separately.</Card></Card></div></AppShell>;

  return <AppShell><div className="mx-auto max-w-6xl"><div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start"><div><PageTitleBlock /><Card className="mt-8 p-5 sm:p-7"><h2 className="text-xl font-black">Choose sponsor account setup</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Choice active={accountMode === "existing"} title="Use my existing account" body="Start a sponsor profile from your current Challenge Suite login." onClick={() => setAccountMode("existing")} /><Choice active={accountMode === "separate"} title="Create a separate sponsor account" body="Use a different login for brand or agency work." onClick={() => setAccountMode("separate")} /></div>{accountMode === "separate" ? <Card className="mt-4 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-slate-300">Separate sponsor accounts require the existing registration flow and future account-linking support. This form will not create duplicate user records.</Card> : null}</Card><Card className="mt-6 p-5 sm:p-7"><div className="grid gap-5 md:grid-cols-2"><Field label="Brand / organization name"><input className={inputClass} value={form.brandName} onChange={(event) => update("brandName", event.target.value)} /></Field><Field label="Work email"><input className={inputClass} type="email" value={form.workEmail} onChange={(event) => update("workEmail", event.target.value)} /></Field><Field label="Website"><input className={inputClass} value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="https://brand.com" /></Field><Field label="Industry"><input className={inputClass} value={form.industry} onChange={(event) => update("industry", event.target.value)} /></Field><Field label="Country / region"><input className={inputClass} value={form.countryRegion} onChange={(event) => update("countryRegion", event.target.value)} /></Field><Field label="Contact person"><input className={inputClass} value={form.contactPerson} onChange={(event) => update("contactPerson", event.target.value)} /></Field><Field label="Sponsor goal"><select className={inputClass} value={form.sponsorGoal} onChange={(event) => update("sponsorGoal", event.target.value)}><option value="">Select goal</option>{sponsorGoals.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Preferred sponsorship type"><select className={inputClass} value={form.sponsorshipType} onChange={(event) => update("sponsorshipType", event.target.value)}><option value="">Select type</option>{sponsorTypes.map((item) => <option key={item}>{item}</option>)}</select></Field></div><div className="mt-5"><Field label="Brand description"><textarea className={textareaClass} value={form.brandDescription} onChange={(event) => update("brandDescription", event.target.value)} placeholder="Briefly describe the brand, audience, and sponsorship goals." /></Field></div><div className="mt-6 grid gap-5 md:grid-cols-2"><MediaUploadField label="Sponsor logo" value={form.logoUrl} onChange={(url, metadata) => { update("logoUrl", url); update("logoPath", metadata?.path ?? ""); }} storagePath={sponsorMediaPath(auth.user?.uid ?? "anonymous", "logo")} kind="image" buttonLabel="Upload Sponsor Logo" disabled={!auth.user || accountMode === "separate"} disabledReason="Sign in with the sponsor account before uploading brand media." helperText="Brand media remains pending review and does not approve public placements." /><MediaUploadField label="Sponsor banner" value={form.bannerUrl} onChange={(url, metadata) => { update("bannerUrl", url); update("bannerPath", metadata?.path ?? ""); }} storagePath={sponsorMediaPath(auth.user?.uid ?? "anonymous", "banner")} kind="image" buttonLabel="Upload Sponsor Banner" disabled={!auth.user || accountMode === "separate"} disabledReason="Sign in with the sponsor account before uploading brand media." helperText="Banner placement remains gated behind sponsor approval." /></div>{error ? <Card className="mt-5 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-yellow-100">{error}</Card> : null}{message ? <Card className="mt-5 border-emerald-500/20 bg-emerald-950/30 p-4 text-sm text-emerald-100">{message}</Card> : null}<div className="mt-6 flex flex-wrap gap-3"><Button disabled={saving || accountMode === "separate" || form.brandName.length < 2 || form.workEmail.length < 4 || form.brandDescription.length < 20} onClick={() => void submit()}>{saving ? "Starting..." : "Start Sponsor Profile"}</Button>{accountMode === "separate" ? <LinkButton href="/auth/register" variant="secondary">Create Separate Login</LinkButton> : null}<LinkButton href="/sponsor/plans" variant="ghost">View Sponsor Plans</LinkButton></div></Card></div><SidePanel /></div></div></AppShell>;
}

function PageTitleBlock() { return <div><p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Sponsor Onboarding</p><h1 className="mt-3 text-4xl font-black">Start a sponsor profile</h1><p className="mt-3 max-w-3xl leading-7 text-slate-300">Sponsor accounts are for brands, agencies, and businesses that want to sponsor challenges, creators, live events, or tournaments.</p></div>; }
function Choice({ active, title, body, onClick }: { active: boolean; title: string; body: string; onClick: () => void }) { return <button type="button" onClick={onClick} className={`rounded-[8px] border p-4 text-left transition ${active ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-white/10 bg-[#171717] hover:border-[var(--gold)]/40"}`}><p className="font-black text-white">{title}</p><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></button>; }
function SidePanel() { return <div className="space-y-5 lg:sticky lg:top-24"><Card className="p-5"><Building2 className="text-[var(--gold)]" /><h2 className="mt-3 text-xl font-black">How sponsor access works</h2><div className="mt-4 space-y-3 text-sm leading-6 text-slate-300"><p>Use an existing account or create a separate sponsor login.</p><p>Sponsor dashboard access is limited until brand review and plan activation are complete.</p><p>Sponsorship campaign budgets are separate from sponsor subscriptions.</p></div></Card><Card className="border-yellow-500/20 bg-yellow-500/5 p-5"><ShieldCheck className="text-[var(--gold)]" /><h2 className="mt-3 font-black">Locked until approval</h2><p className="mt-2 text-sm leading-6 text-slate-300">Campaign creation, proposal sending, brand placements, messaging, funding, reports, and team seats require approval and an active sponsor plan.</p></Card><Card className="p-5"><LockKeyhole className="text-slate-400" /><h2 className="mt-3 font-black">No automatic activation</h2><p className="mt-2 text-sm leading-6 text-slate-300">This page does not approve brands, charge payment, send email, or unlock sponsor tools by itself.</p><LinkButton href="/sponsor/plans" className="mt-5 w-full" variant="secondary">Sponsor Plans <ArrowRight size={16} /></LinkButton></Card></div>; }
