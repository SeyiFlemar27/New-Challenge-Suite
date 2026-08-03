"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Save, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { MediaUploadField } from "@/components/media-upload-field";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Button, Card, Field, inputClass, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { sponsorMediaPath } from "@/lib/media-upload-paths";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";

const steps = ["Brand Profile", "Business Details", "Media & Identity", "Sponsorship Goals", "Review & Submit"] as const;
const initial = { brandName: "", workEmail: "", website: "", industry: "", countryRegion: "", contactPerson: "", sponsorGoal: "Brand awareness", brandDescription: "", sponsorshipType: "Sponsor a challenge", logoUrl: "", logoPath: "", bannerUrl: "", bannerPath: "" };
const sponsorTypes = ["Sponsor a challenge", "Sponsor creators", "Sponsor live events", "Sponsor tournaments", "Long-term brand partnership", "Not sure yet"];
const sponsorGoals = ["Brand awareness", "Product launch", "Creator collaboration", "Community growth", "Live event activation", "Tournament partnership", "Lead generation"];
const DRAFT_KEY = "challenge-suite-sponsor-onboarding-draft";

export default function SponsorOnboardingPage() {
  const auth = useAuth();
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [form, setForm] = useState(initial);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const workspace = resolveSponsorWorkspaceState(profile ?? form);

  useEffect(() => {
    const local = localStorage.getItem(DRAFT_KEY);
    if (local) { try { setForm((current) => ({ ...current, ...JSON.parse(local) })); } catch {} }
    void apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile").then((result) => {
      if (!result.ok || !result.data) return;
      const saved = result.data.sponsorProfile;
      setProfile(saved);
      setForm((current) => ({ ...current, brandName: String(saved.brandName || current.brandName), workEmail: String(saved.businessEmail || current.workEmail), website: String(saved.website || current.website), industry: String(saved.industry || current.industry), countryRegion: String(saved.countryLocation || saved.headquartersLocation || current.countryRegion), contactPerson: String(saved.contactPerson || current.contactPerson), sponsorGoal: Array.isArray(saved.sponsorshipGoals) ? String(saved.sponsorshipGoals[0] || current.sponsorGoal) : current.sponsorGoal, brandDescription: String(saved.brandDescription || current.brandDescription), sponsorshipType: String(saved.preferredSponsorshipStructure || current.sponsorshipType), logoUrl: String(saved.logoUrl || current.logoUrl), logoPath: String(saved.logoPath || current.logoPath), bannerUrl: String(saved.bannerUrl || current.bannerUrl), bannerPath: String(saved.bannerPath || current.bannerPath) }));
    });
  }, []);
  useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); }, [form]);

  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); setMessage(""); setError(""); }
  const requiredReady = form.brandName.trim().length >= 2 && form.workEmail.includes("@") && form.industry.trim().length >= 2 && form.countryRegion.trim().length >= 2 && form.brandDescription.trim().length >= 20 && Boolean(form.sponsorGoal) && Boolean(form.sponsorshipType);
  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);

  async function persist(reviewAction: "save" | "submit") {
    if (!requiredReady) { setError("Complete the required brand, business, and sponsorship fields before saving to your account."); return; }
    setSaving(true); setError(""); setMessage("");
    const payload = {
      brandName: form.brandName, legalBusinessName: form.brandName, industry: form.industry, companySize: "", businessType: "Brand / Sponsor", businessRegistrationCountry: form.countryRegion, headquartersLocation: form.countryRegion, website: form.website, countryLocation: form.countryRegion, brandDescription: form.brandDescription, socialLinks: [], contactPerson: form.contactPerson, businessEmail: form.workEmail, phoneNumber: "", logoUrl: form.logoUrl, logoPath: form.logoPath, alternateLogoUrl: "", alternateLogoPath: "", squareIconUrl: "", squareIconPath: "", bannerUrl: form.bannerUrl, bannerPath: form.bannerPath, coverImageUrl: form.bannerUrl, coverImagePath: form.bannerPath, brandColors: [], brandFonts: [], brandTone: "Professional", approvedHashtags: [], preferredCtaLabels: ["Learn More"], ctaButtonText: "Learn More", ctaDestinationLink: form.website, sponsorshipGoals: [form.sponsorGoal], preferredChallengeCategories: [form.sponsorshipType], targetCountries: [form.countryRegion], targetRegions: [], targetAgeRange: "", genderPreference: "", languages: [], interests: [], preferredCreatorNiches: [], preferredAudienceSize: "", typicalCampaignBudget: "", preferredSponsorshipStructure: form.sponsorshipType, preferredPaymentCurrency: "USD", preferredCampaignDuration: "", milestonePaymentsRequired: false, legalApprovalRequired: false, publicProfile: false, notificationPreferences: {}, reviewAction
    };
    const result = await apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile", { method: "PATCH", body: JSON.stringify(payload) });
    setSaving(false);
    if (!result.ok || !result.data) { setError(result.message || "Sponsor profile could not be saved."); return; }
    setProfile(result.data.sponsorProfile);
    if (reviewAction === "submit") localStorage.removeItem(DRAFT_KEY);
    setMessage(reviewAction === "submit" ? "Sponsor profile submitted for review." : "Sponsor profile saved. You can finish it later.");
  }

  if (["submitted", "pending_review"].includes(workspace.status)) return <SponsorShell profile={profile}><div className="mx-auto max-w-3xl"><Card className="border-amber-200 bg-white p-7 sm:p-10"><CheckCircle2 className="text-amber-700" size={36} /><p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-amber-700">Sponsor review</p><h1 className="mt-3 text-3xl font-black text-slate-950">Your sponsor profile is pending review.</h1><p className="mt-4 leading-7 text-slate-600">Your submitted profile is safely stored. Challenge Suite will unlock the approved sponsor workspace only after review. Funding and proposal actions remain unavailable while review is pending.</p><div className="mt-7 rounded-[8px] border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-black text-slate-950">Status: {workspace.statusLabel}</p><p className="mt-1 text-sm text-slate-600">Brand profile: {workspace.completionPercent}% complete</p></div><div className="mt-7 flex flex-wrap gap-3"><LinkButton href="/sponsor/support" variant="secondary">Contact Support</LinkButton><LinkButton href="/dashboard" variant="ghost">Return to Dashboard</LinkButton></div></Card></div></SponsorShell>;

  return <SponsorShell profile={profile}><div className="mx-auto max-w-6xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Sponsor onboarding</p><h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Build your brand profile</h1><p className="mt-3 max-w-3xl leading-7 text-slate-600">Complete your sponsor profile, save progress, and submit it for review when ready.</p></div><div className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-slate-800">{workspace.statusLabel} / {workspace.completionPercent}% complete</div></div>
    <div className="mt-7 grid gap-7 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start"><aside className="grid gap-2 lg:sticky lg:top-8">{steps.map((item, index) => <button key={item} type="button" onClick={() => setStep(index)} className={`min-h-11 rounded-[8px] border px-3 py-2 text-left text-sm font-bold ${step === index ? "border-amber-400 bg-[var(--gold)] text-black" : "border-slate-200 bg-white text-slate-700 hover:border-amber-300"}`}><span className="mr-2 text-xs">{index + 1}.</span>{item}</button>)}<div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-[var(--gold)]" style={{ width: `${progress}%` }} /></div></aside>
      <Card className="p-5 sm:p-7"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">Step {step + 1} of {steps.length}</p><h2 className="mt-2 text-2xl font-black text-slate-950">{steps[step]}</h2><div className="mt-6">{step === 0 ? <div className="grid gap-5"><Field label="Brand / organization name"><input className={inputClass} value={form.brandName} onChange={(event) => update("brandName", event.target.value)} /></Field><Field label="Industry"><input className={inputClass} value={form.industry} onChange={(event) => update("industry", event.target.value)} /></Field><Field label="Brand description"><textarea className={textareaClass} value={form.brandDescription} onChange={(event) => update("brandDescription", event.target.value)} placeholder="Describe the brand, audience, and sponsorship focus." /></Field></div> : null}
        {step === 1 ? <div className="grid gap-5 md:grid-cols-2"><Field label="Business email"><input className={inputClass} type="email" value={form.workEmail} onChange={(event) => update("workEmail", event.target.value)} /></Field><Field label="Contact person"><input className={inputClass} value={form.contactPerson} onChange={(event) => update("contactPerson", event.target.value)} /></Field><Field label="Website or social profile"><input className={inputClass} value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="https://brand.com" /></Field><Field label="Location"><input className={inputClass} value={form.countryRegion} onChange={(event) => update("countryRegion", event.target.value)} /></Field></div> : null}
        {step === 2 ? <div className="grid gap-5 md:grid-cols-2"><MediaUploadField label="Brand logo" value={form.logoUrl} onChange={(url, metadata) => { update("logoUrl", url); update("logoPath", metadata?.path ?? ""); }} storagePath={sponsorMediaPath(auth.user?.uid ?? "anonymous", "logo")} kind="image" buttonLabel="Upload Brand Logo" disabled={!auth.user} disabledReason="Sign in with the sponsor account before uploading brand media." helperText="Upload completion requires a storage-confirmed file." /><MediaUploadField label="Brand banner" value={form.bannerUrl} onChange={(url, metadata) => { update("bannerUrl", url); update("bannerPath", metadata?.path ?? ""); }} storagePath={sponsorMediaPath(auth.user?.uid ?? "anonymous", "banner")} kind="image" buttonLabel="Upload Brand Banner" disabled={!auth.user} disabledReason="Sign in with the sponsor account before uploading brand media." helperText="Upload completion requires a storage-confirmed file." /></div> : null}
        {step === 3 ? <div className="grid gap-5 md:grid-cols-2"><Field label="Sponsorship goal"><select className={inputClass} value={form.sponsorGoal} onChange={(event) => update("sponsorGoal", event.target.value)}>{sponsorGoals.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Preferred sponsorship type"><select className={inputClass} value={form.sponsorshipType} onChange={(event) => update("sponsorshipType", event.target.value)}>{sponsorTypes.map((item) => <option key={item}>{item}</option>)}</select></Field></div> : null}
        {step === 4 ? <div className="grid gap-4 sm:grid-cols-2"><Summary label="Brand" value={form.brandName || "Required"} /><Summary label="Industry" value={form.industry || "Required"} /><Summary label="Business email" value={form.workEmail || "Required"} /><Summary label="Location" value={form.countryRegion || "Required"} /><Summary label="Goal" value={form.sponsorGoal} /><Summary label="Media" value={`${form.logoPath ? "Logo uploaded" : "Logo pending"}; ${form.bannerPath ? "banner uploaded" : "banner pending"}`} /><Card className="sm:col-span-2 border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><ShieldCheck size={18} /><p className="mt-2">Submitting sends the profile for review. It does not approve the brand, activate a plan, or enable funding.</p></Card></div> : null}</div>
        {error ? <p className="mt-5 rounded-[8px] border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}{message ? <p className="mt-5 rounded-[8px] border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}<div className="mt-7 flex flex-wrap items-center gap-3">{step > 0 ? <Button variant="secondary" onClick={() => setStep((current) => current - 1)}><ArrowLeft size={16} /> Back</Button> : null}<Button variant="secondary" disabled={saving || !requiredReady} onClick={() => void persist("save")}><Save size={16} /> Save & Finish Later</Button>{step < steps.length - 1 ? <Button onClick={() => setStep((current) => current + 1)}>Continue <ArrowRight size={16} /></Button> : <Button disabled={saving || !requiredReady} onClick={() => void persist("submit")}><CheckCircle2 size={16} /> Submit for Review</Button>}<LinkButton href="/sponsor/dashboard" variant="ghost">Return to Overview</LinkButton></div></Card>
    </div></div></SponsorShell>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 break-words font-bold text-slate-950">{value}</p></div>; }
