"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CheckCircle2, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { Button, Card, Field, inputClass, LinkButton, textareaClass } from "@/components/ui";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { useAuth } from "@/components/auth-provider";
import { MediaUploadField } from "@/components/media-upload-field";
import { apiRequest } from "@/lib/api/client";
import { businessVerificationLabel, calculateSponsorCompletion, normalizeBusinessVerificationStatus, sponsorBudgetRanges, sponsorBusinessTypes, sponsorCampaignDurations, sponsorCategories, sponsorCompanySizes, sponsorCtaLabels, sponsorGoals, sponsorIndustries, sponsorOnboardingSteps, sponsorToneOptions, sponsorVerificationDocuments } from "@/lib/sponsor-foundation";
import { normalizeSponsorReviewStatus, sponsorStatusLabel } from "@/lib/sponsor-access";

type SponsorProfile = Record<string, any>;
interface SponsorProfileResponse { profileExists: boolean; sponsorProfile: SponsorProfile; }

const emptyForm = {
  brandName: "", legalBusinessName: "", industry: "", companySize: "", businessType: "", businessRegistrationCountry: "", headquartersLocation: "", website: "", countryLocation: "", brandDescription: "", contactPerson: "", businessEmail: "", phoneNumber: "",
  logoUrl: "", logoPath: "", alternateLogoUrl: "", alternateLogoPath: "", squareIconUrl: "", squareIconPath: "", bannerUrl: "", bannerPath: "", coverImageUrl: "", coverImagePath: "", brandColorsText: "#F5B700", brandFontsText: "", brandTone: "", socialLinksText: "", approvedHashtagsText: "", preferredCtaLabels: ["Learn More"] as string[], ctaButtonText: "Learn More", ctaDestinationLink: "",
  sponsorshipGoals: [] as string[], preferredChallengeCategories: [] as string[], targetCountriesText: "", targetRegionsText: "", targetAgeRange: "", genderPreference: "", languagesText: "", interestsText: "", preferredCreatorNichesText: "", preferredAudienceSize: "",
  typicalCampaignBudget: "", preferredSponsorshipStructure: "", preferredPaymentCurrency: "USD", preferredCampaignDuration: "", milestonePaymentsRequired: false, legalApprovalRequired: false, publicProfile: false
};

export default function SponsorOnboardingPage() {
  const router = useRouter();
  const auth = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [profile, setProfile] = useState<SponsorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState<"save" | "submit" | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [unauthorized, setUnauthorized] = useState(false);

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
    const p = result.data.sponsorProfile;
    setProfile(p);
    setForm({
      ...emptyForm,
      brandName: p.brandName ?? "", legalBusinessName: p.legalBusinessName ?? "", industry: p.industry ?? "", companySize: p.companySize ?? "", businessType: p.businessType ?? "", businessRegistrationCountry: p.businessRegistrationCountry ?? "", headquartersLocation: p.headquartersLocation ?? p.countryLocation ?? "", website: p.website ?? "", countryLocation: p.countryLocation ?? "", brandDescription: p.brandDescription ?? "", contactPerson: p.contactPerson ?? "", businessEmail: p.businessEmail ?? "", phoneNumber: p.phoneNumber ?? "",
      logoUrl: p.logoUrl ?? "", logoPath: p.logoPath ?? "", alternateLogoUrl: p.alternateLogoUrl ?? "", alternateLogoPath: p.alternateLogoPath ?? "", squareIconUrl: p.squareIconUrl ?? "", squareIconPath: p.squareIconPath ?? "", bannerUrl: p.bannerUrl ?? "", bannerPath: p.bannerPath ?? "", coverImageUrl: p.coverImageUrl ?? p.bannerUrl ?? "", coverImagePath: p.coverImagePath ?? p.bannerPath ?? "", brandColorsText: (p.brandColors ?? []).join("\n") || "#F5B700", brandFontsText: (p.brandFonts ?? []).join("\n"), brandTone: p.brandTone ?? "", socialLinksText: (p.socialLinks ?? []).join("\n"), approvedHashtagsText: (p.approvedHashtags ?? []).join("\n"), preferredCtaLabels: p.preferredCtaLabels ?? [p.ctaButtonText ?? "Learn More"], ctaButtonText: p.ctaButtonText ?? "Learn More", ctaDestinationLink: p.ctaDestinationLink ?? "",
      sponsorshipGoals: p.sponsorshipGoals ?? [], preferredChallengeCategories: p.preferredChallengeCategories ?? [], targetCountriesText: (p.targetCountries ?? []).join("\n"), targetRegionsText: (p.targetRegions ?? []).join("\n"), targetAgeRange: p.targetAgeRange ?? "", genderPreference: p.genderPreference ?? "", languagesText: (p.languages ?? []).join("\n"), interestsText: (p.interests ?? []).join("\n"), preferredCreatorNichesText: (p.preferredCreatorNiches ?? []).join("\n"), preferredAudienceSize: p.preferredAudienceSize ?? "",
      typicalCampaignBudget: p.typicalCampaignBudget ?? "", preferredSponsorshipStructure: p.preferredSponsorshipStructure ?? "", preferredPaymentCurrency: p.preferredPaymentCurrency ?? "USD", preferredCampaignDuration: p.preferredCampaignDuration ?? "", milestonePaymentsRequired: Boolean(p.milestonePaymentsRequired), legalApprovalRequired: Boolean(p.legalApprovalRequired), publicProfile: Boolean(p.publicProfile)
    });
    setLoading(false);
  }

  useEffect(() => { void loadProfile(); }, []);

  function update(field: keyof typeof form, value: string | string[] | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setSaved(null);
  }


  function updateAsset(urlField: keyof typeof form, pathField: keyof typeof form, url: string, metadata?: { path: string }) {
    setForm((current) => ({ ...current, [urlField]: url, [pathField]: metadata?.path ?? "" }));
    setFieldErrors((current) => ({ ...current, [String(urlField)]: "" }));
    setSaved(null);
  }
  function toggleList(field: "sponsorshipGoals" | "preferredChallengeCategories" | "preferredCtaLabels", value: string) {
    setForm((current) => {
      const active = current[field].includes(value);
      return { ...current, [field]: active ? current[field].filter((item) => item !== value) : [...current[field], value] };
    });
    setSaved(null);
  }

  const lines = (value: string) => value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  const completion = calculateSponsorCompletion({ ...profile, ...form, targetCountries: lines(form.targetCountriesText), brandColors: lines(form.brandColorsText) });
  const reviewStatus = normalizeSponsorReviewStatus(profile?.sponsorVerificationStatus);
  const businessStatus = normalizeBusinessVerificationStatus(profile?.businessVerificationStatus ?? profile?.sponsorVerificationStatus);
  const completed = Boolean(profile?.hasSponsorProfile || profile?.sponsorOnboardingStatus === "complete");

  const payload = useMemo(() => ({
    brandName: form.brandName, legalBusinessName: form.legalBusinessName, industry: form.industry, companySize: form.companySize, businessType: form.businessType, businessRegistrationCountry: form.businessRegistrationCountry, headquartersLocation: form.headquartersLocation, website: form.website, countryLocation: form.countryLocation || form.headquartersLocation, brandDescription: form.brandDescription, contactPerson: form.contactPerson, businessEmail: form.businessEmail, phoneNumber: form.phoneNumber,
    logoUrl: form.logoUrl, logoPath: form.logoPath, alternateLogoUrl: form.alternateLogoUrl, alternateLogoPath: form.alternateLogoPath, squareIconUrl: form.squareIconUrl, squareIconPath: form.squareIconPath, bannerUrl: form.bannerUrl, bannerPath: form.bannerPath, coverImageUrl: form.coverImageUrl, coverImagePath: form.coverImagePath, brandColors: lines(form.brandColorsText), brandFonts: lines(form.brandFontsText), brandTone: form.brandTone, socialLinks: lines(form.socialLinksText), approvedHashtags: lines(form.approvedHashtagsText), preferredCtaLabels: form.preferredCtaLabels, ctaButtonText: form.ctaButtonText, ctaDestinationLink: form.ctaDestinationLink,
    sponsorshipGoals: form.sponsorshipGoals, preferredChallengeCategories: form.preferredChallengeCategories, targetCountries: lines(form.targetCountriesText), targetRegions: lines(form.targetRegionsText), targetAgeRange: form.targetAgeRange, genderPreference: form.genderPreference, languages: lines(form.languagesText), interests: lines(form.interestsText), preferredCreatorNiches: lines(form.preferredCreatorNichesText), preferredAudienceSize: form.preferredAudienceSize,
    typicalCampaignBudget: form.typicalCampaignBudget, preferredSponsorshipStructure: form.preferredSponsorshipStructure, preferredPaymentCurrency: form.preferredPaymentCurrency, preferredCampaignDuration: form.preferredCampaignDuration, milestonePaymentsRequired: form.milestonePaymentsRequired, legalApprovalRequired: form.legalApprovalRequired, publicProfile: form.publicProfile
  }), [form]);

  async function persistProfile(reviewAction: "save" | "submit") {
    setSaving(true); setSavingAction(reviewAction); setSaved(null); setError(null); setFieldErrors({});
    const result = await apiRequest<{ sponsorProfile: SponsorProfile }>("/api/sponsor/profile", { method: "PATCH", body: JSON.stringify({ ...payload, reviewAction }) });
    setSaving(false); setSavingAction(null);
    if (!result.ok || !result.data) { setFieldErrors(((result as any).details?.fieldErrors ?? {}) as Record<string, string>); setError(result.message || "Sponsor onboarding could not be saved."); return; }
    setProfile(result.data.sponsorProfile); setSaved(result.message);
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); await persistProfile("save"); }

  if (loading) return <SponsorShell profile={profile}><div className="mx-auto max-w-6xl"><div className="h-10 w-80 animate-pulse rounded bg-white/10" /><Card className="mt-8 h-[520px] animate-pulse bg-[#171717]" /></div></SponsorShell>;
  if (unauthorized) return <SponsorShell profile={profile}><Card className="mx-auto mt-10 max-w-2xl p-8 text-center"><LockKeyhole className="mx-auto h-12 w-12 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black">Sponsor access required</h1><p className="mt-3 text-slate-300">{error ?? "Sign in with a sponsor account to continue."}</p><LinkButton href="/auth/login" className="mt-6">Sign In</LinkButton></Card></SponsorShell>;

  return <SponsorShell profile={profile}>
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-sm font-black uppercase tracking-[0.22em] text-[var(--gold)]">Sponsor Onboarding</p><h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">{completed ? "Update your brand command center" : "Build your brand command center"}</h1><p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">Complete business, identity, audience, budget, and verification details. Sponsors can explore the dashboard while review is pending, but restricted money and high-value tools stay locked.</p></div>
        <LinkButton href="/sponsor/dashboard" variant="secondary">Open Dashboard <ArrowRight size={18} /></LinkButton>
      </div>

      <Card className="mt-8 p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Progress</p><h2 className="mt-2 text-2xl font-black">{completion}% complete</h2><p className="mt-1 text-sm text-slate-400">Review status: {sponsorStatusLabel(reviewStatus)} / Business verification: {businessVerificationLabel(businessStatus)}</p></div><div className="h-3 w-full overflow-hidden rounded-full bg-white/10 lg:max-w-sm"><div className="h-full bg-[var(--gold)]" style={{ width: `${completion}%` }} /></div></div></Card>

      <div className="mt-8 grid gap-3 lg:grid-cols-7">{sponsorOnboardingSteps.map((item, index) => <button key={item.id} type="button" onClick={() => setStep(index)} className={`rounded-[8px] border p-3 text-left text-sm transition ${step === index ? "border-[var(--gold)] bg-[var(--gold)] text-black" : "border-white/10 bg-[#111] text-slate-300 hover:border-[var(--gold)]/40"}`}><span className="block text-xs font-black uppercase tracking-[0.14em]">Step {index + 1}</span><span className="mt-1 block font-black">{item.title}</span></button>)}</div>

      <form className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]" onSubmit={saveProfile}>
        <Card className="p-5 sm:p-6 lg:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{sponsorOnboardingSteps[step].title}</p><h2 className="mt-2 text-2xl font-black">{sponsorOnboardingSteps[step].description}</h2>
          {step === 0 ? <Grid><Text field="brandName" label="Brand Name" form={form} update={update} error={fieldErrors.brandName} /><Text field="legalBusinessName" label="Legal Business Name" form={form} update={update} /><Select field="industry" label="Industry" options={sponsorIndustries} form={form} update={update} error={fieldErrors.industry} /><Select field="companySize" label="Company Size" options={sponsorCompanySizes} form={form} update={update} /><Select field="businessType" label="Business Type" options={sponsorBusinessTypes} form={form} update={update} /><Text field="businessRegistrationCountry" label="Registration Country" form={form} update={update} /><Text field="headquartersLocation" label="Headquarters Location" form={form} update={update} /><Text field="website" label="Website" form={form} update={update} error={fieldErrors.website} /><Text field="businessEmail" label="Business Email" form={form} update={update} error={fieldErrors.businessEmail} /><Text field="phoneNumber" label="Phone Number" form={form} update={update} /></Grid> : null}
          {step === 1 ? <><Grid><MediaUploadField label="Primary Logo" value={form.logoUrl} onChange={(url, metadata) => updateAsset("logoUrl", "logoPath", url, metadata)} storagePath={`sponsors/${auth.user?.uid ?? "anonymous"}/assets/logo`} kind="image" buttonLabel="Upload Logo" /><MediaUploadField label="Alternate Logo" value={form.alternateLogoUrl} onChange={(url, metadata) => updateAsset("alternateLogoUrl", "alternateLogoPath", url, metadata)} storagePath={`sponsors/${auth.user?.uid ?? "anonymous"}/assets/alternate-logo`} kind="image" buttonLabel="Upload Alternate Logo" /><MediaUploadField label="Square Brand Icon" value={form.squareIconUrl} onChange={(url, metadata) => updateAsset("squareIconUrl", "squareIconPath", url, metadata)} storagePath={`sponsors/${auth.user?.uid ?? "anonymous"}/assets/square-icon`} kind="image" buttonLabel="Upload Icon" /><MediaUploadField label="Cover Image" value={form.bannerUrl} onChange={(url, metadata) => { updateAsset("bannerUrl", "bannerPath", url, metadata); updateAsset("coverImageUrl", "coverImagePath", url, metadata); }} storagePath={`sponsors/${auth.user?.uid ?? "anonymous"}/assets/cover`} kind="image" buttonLabel="Upload Cover" /></Grid><Grid><Area field="brandColorsText" label="Brand Colors" form={form} update={update} /><Area field="brandFontsText" label="Brand Fonts" form={form} update={update} /><Select field="brandTone" label="Brand Tone" options={sponsorToneOptions} form={form} update={update} /><Area field="socialLinksText" label="Social Media Links" form={form} update={update} /><Area field="approvedHashtagsText" label="Approved Hashtags" form={form} update={update} /><div><p className="mb-2.5 text-sm font-bold text-white">Preferred CTA Labels</p><div className="flex flex-wrap gap-2">{sponsorCtaLabels.map((label) => <Chip key={label} label={label} active={form.preferredCtaLabels.includes(label)} onClick={() => toggleList("preferredCtaLabels", label)} />)}</div></div></Grid><Field label="Company Description"><textarea className={textareaClass} value={form.brandDescription} onChange={(event) => update("brandDescription", event.target.value)} />{fieldErrors.brandDescription ? <ErrorText>{fieldErrors.brandDescription}</ErrorText> : null}</Field></> : null}
          {step === 2 ? <OptionSection title="Sponsorship Goals" options={sponsorGoals} active={form.sponsorshipGoals} toggle={(value) => toggleList("sponsorshipGoals", value)} error={fieldErrors.sponsorshipGoals} /> : null}
          {step === 3 ? <><OptionSection title="Challenge Categories" options={sponsorCategories} active={form.preferredChallengeCategories} toggle={(value) => toggleList("preferredChallengeCategories", value)} error={fieldErrors.preferredChallengeCategories} /><Grid><Area field="targetCountriesText" label="Target Countries" form={form} update={update} /><Area field="targetRegionsText" label="Target States/Regions" form={form} update={update} /><Text field="targetAgeRange" label="Age Range" form={form} update={update} /><Text field="genderPreference" label="Gender Preference" form={form} update={update} /><Area field="languagesText" label="Languages" form={form} update={update} /><Area field="interestsText" label="Interests" form={form} update={update} /><Area field="preferredCreatorNichesText" label="Preferred Creator Niches" form={form} update={update} /><Text field="preferredAudienceSize" label="Preferred Audience Size" form={form} update={update} /></Grid></> : null}
          {step === 4 ? <Grid><Select field="typicalCampaignBudget" label="Typical Campaign Budget" options={sponsorBudgetRanges} form={form} update={update} /><Text field="preferredSponsorshipStructure" label="Preferred Sponsorship Structure" form={form} update={update} /><Text field="preferredPaymentCurrency" label="Payment Currency" form={form} update={update} /><Select field="preferredCampaignDuration" label="Preferred Campaign Duration" options={sponsorCampaignDurations} form={form} update={update} /><Check field="milestonePaymentsRequired" label="Milestone payments required" form={form} update={update} /><Check field="legalApprovalRequired" label="Legal approval required" form={form} update={update} /></Grid> : null}
          {step === 5 ? <div className="space-y-5"><Card className="border-yellow-500/20 bg-yellow-500/5 p-5"><ShieldCheck className="text-[var(--gold)]" /><h3 className="mt-3 text-xl font-black">Business verification</h3><p className="mt-2 text-sm leading-6 text-slate-300">Verification status is reviewed by Challenge Suite admins. Sponsors can explore the dashboard while pending, but funding campaigns, verified badge, high-value sponsor tools, payment release actions, and enterprise sponsorship tools stay restricted.</p></Card><div className="grid gap-3 sm:grid-cols-2">{sponsorVerificationDocuments.map((doc) => <div key={doc} className="rounded-[8px] border border-white/10 bg-[#171717] p-4 text-sm font-bold text-slate-300">{doc}<p className="mt-2 text-xs font-normal text-slate-500">Metadata/secure references only. Raw documents are not stored in app records.</p></div>)}</div></div> : null}
          {step === 6 ? <div className="grid gap-5 lg:grid-cols-2"><Summary label="Brand" value={form.brandName || "Not provided"} /><Summary label="Legal name" value={form.legalBusinessName || "Not provided"} /><Summary label="Goals" value={form.sponsorshipGoals.join(", ") || "Not selected"} /><Summary label="Audience" value={lines(form.targetCountriesText).join(", ") || "Not selected"} /><Summary label="Budget" value={form.typicalCampaignBudget || "Not selected"} /><Summary label="Verification" value={businessVerificationLabel(businessStatus)} /><label className="flex items-start gap-3 rounded-[8px] border border-white/10 bg-[#171717] p-4 text-sm leading-6 text-slate-300 lg:col-span-2"><input className="mt-1" type="checkbox" checked={form.publicProfile} onChange={(event) => update("publicProfile", event.target.checked)} /><span>Allow this brand profile to be public when approved. Admin approval is still required before verified badges appear.</span></label></div> : null}
          <div className="mt-8 flex flex-wrap gap-3"><Button type="submit" disabled={saving}>{savingAction === "save" ? "Saving..." : <><Save size={18} /> Save Progress</>}</Button><Button type="button" variant="secondary" disabled={saving} onClick={() => void persistProfile("submit")}>{savingAction === "submit" ? "Submitting..." : "Submit for Review"}</Button>{step < sponsorOnboardingSteps.length - 1 ? <Button type="button" variant="ghost" onClick={() => setStep(step + 1)}>Next Step <ArrowRight size={16} /></Button> : null}</div>
        </Card>
        <div className="space-y-5"><Card className="p-5"><h3 className="text-xl font-black">Next best actions</h3><div className="mt-4 space-y-3 text-sm text-slate-300">{["Complete brand profile", "Prepare first campaign brief", "Discover creators", "Browse challenges", "Invite team members later"].map((item) => <p key={item} className="rounded-[8px] bg-[#171717] p-3">{item}</p>)}</div></Card>{error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-sm font-bold text-red-200">{error}</p> : null}{saved ? <p className="rounded-[8px] bg-emerald-950/40 p-3 text-sm font-bold text-emerald-200">{saved}</p> : null}<Card className="border-yellow-500/20 bg-yellow-500/5 p-5"><CheckCircle2 className="text-[var(--gold)]" /><p className="mt-3 text-sm leading-6 text-slate-300">No campaign funding, sponsor release, prize release, payout, withdrawal, or refund action is enabled from onboarding.</p></Card></div>
      </form>
    </div>
  </SponsorShell>;
}

function Grid({ children }: { children: React.ReactNode }) { return <div className="mt-6 grid gap-5 md:grid-cols-2">{children}</div>; }
function ErrorText({ children }: { children: React.ReactNode }) { return <p className="mt-2 text-sm font-bold text-red-300">{children}</p>; }
function Text({ field, label, form, update, error }: { field: keyof typeof emptyForm; label: string; form: typeof emptyForm; update: (field: keyof typeof emptyForm, value: string) => void; error?: string }) { return <Field label={label}><input className={inputClass} value={String(form[field] ?? "")} onChange={(event) => update(field, event.target.value)} />{error ? <ErrorText>{error}</ErrorText> : null}</Field>; }
function Area({ field, label, form, update }: { field: keyof typeof emptyForm; label: string; form: typeof emptyForm; update: (field: keyof typeof emptyForm, value: string) => void }) { return <Field label={label}><textarea className={textareaClass} value={String(form[field] ?? "")} onChange={(event) => update(field, event.target.value)} /></Field>; }
function Select({ field, label, options, form, update, error }: { field: keyof typeof emptyForm; label: string; options: string[]; form: typeof emptyForm; update: (field: keyof typeof emptyForm, value: string) => void; error?: string }) { return <Field label={label}><select className={inputClass} value={String(form[field] ?? "")} onChange={(event) => update(field, event.target.value)}><option value="">Select</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>{error ? <ErrorText>{error}</ErrorText> : null}</Field>; }
function Check({ field, label, form, update }: { field: keyof typeof emptyForm; label: string; form: typeof emptyForm; update: (field: keyof typeof emptyForm, value: boolean) => void }) { return <label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-white/10 bg-[#171717] p-4 font-bold"><input type="checkbox" checked={Boolean(form[field])} onChange={(event) => update(field, event.target.checked)} />{label}</label>; }
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={active ? "rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-black text-black" : "rounded-full border border-white/10 bg-[#171717] px-4 py-2 text-sm font-bold text-slate-300"}>{label}</button>; }
function OptionSection({ title, options, active, toggle, error }: { title: string; options: string[]; active: string[]; toggle: (value: string) => void; error?: string }) { return <div className="mt-6"><h3 className="text-xl font-black">{title}</h3><div className="mt-4 flex flex-wrap gap-3">{options.map((option) => <Chip key={option} label={option} active={active.includes(option)} onClick={() => toggle(option)} />)}</div>{error ? <ErrorText>{error}</ErrorText> : null}</div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-[8px] bg-[#171717] p-4"><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">{label}</p><p className="mt-2 font-bold text-white">{value}</p></div>; }


