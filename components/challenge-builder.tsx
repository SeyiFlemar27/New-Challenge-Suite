"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, FileText, ImageIcon, LockKeyhole, Save, Sparkles, Video, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { MediaUploadField, type MediaUploadStage } from "@/components/media-upload-field";
import { createChallenge, fetchChallengeUsage } from "@/lib/api/services";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getPlanExperience, getUserPlanAccess } from "@/lib/plan-access";
import { validateChallengeForPublish, type ChallengeValidationResult } from "@/lib/server/challenge-validation";

type Mode = "public" | "private";
type FormState = {
  title: string; category: string; description: string; shortDescription: string;
  rules: string; terms: string; submission: string; access: string;
  submissionTypes: string[]; startsAt: string; submissionDeadline: string; votingDeadline: string; endsAt: string;
  coverImageUrl: string; coverImagePath: string; promoImageUrl: string; promoImagePath: string; galleryImageUrl: string; galleryImagePath: string; trailerVideoUrl: string; trailerVideoPath: string;
};

const publicSteps = ["Overview", "Rules & Eligibility", "Entry & Submission", "Voting & Timeline", "Media & Branding", "Review & Publish"];
const privateSteps = ["Overview", "Access & Invites", "Rules & Eligibility", "Entry & Submission", "Timeline", "Review & Publish"];
const categories = ["Fitness", "Creative", "Photography", "Food", "Gaming", "Education", "Business", "Other"];

function dateInput(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10) + "T12:00";
}

function initialForm(): FormState {
  return { title: "", category: "", description: "", shortDescription: "", rules: "", terms: "", submission: "", access: "", submissionTypes: ["image"], startsAt: dateInput(8), submissionDeadline: dateInput(5), votingDeadline: dateInput(6), endsAt: dateInput(9), coverImageUrl: "", coverImagePath: "", promoImageUrl: "", promoImagePath: "", galleryImageUrl: "", galleryImagePath: "", trailerVideoUrl: "", trailerVideoPath: "" };
}

export function ChallengeBuilder({ mode }: { mode: Mode }) {
  const { user, loading } = useCurrentUser();
  const planProfile = { planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType };
  const planAccess = getUserPlanAccess(planProfile);
  const planExperience = getPlanExperience(planProfile);
  const isFreePublic = mode === "public" && planExperience.planId === "free" && (user?.selectedAccountType ?? user?.role ?? user?.accountType) !== "sponsor";
  const privateLocked = mode === "private" && !planAccess.canCreatePrivateChallenges;
  const steps = mode === "private" ? privateSteps : publicSteps;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [freeUsage, setFreeUsage] = useState({ used: 0, limit: 3, remaining: 3, loaded: false });
  const [media, setMedia] = useState<Record<string, MediaUploadStage>>({});
  const [serverValidation, setServerValidation] = useState<ChallengeValidationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [createdId, setCreatedId] = useState("");
  const uploadInProgress = Object.values(media).some((status) => ["preparing", "uploading", "processing"].includes(status));
  const uploadFailed = Object.values(media).some((status) => status === "failed");
  const freeLimitReached = isFreePublic && freeUsage.loaded && freeUsage.remaining <= 0;
  const requiredImageMissing = !form.coverImageUrl || !form.coverImagePath;

  useEffect(() => {
    if (!loading && isFreePublic) {
      fetchChallengeUsage().then((result) => result.ok && result.data ? setFreeUsage({ ...result.data.freeBasic, loaded: true }) : setFreeUsage((current) => ({ ...current, loaded: true })));
    }
  }, [isFreePublic, loading]);

  function update(field: keyof FormState, value: string | string[]) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setNotice("");
    setServerValidation(null);
  }

  function updateMedia(urlField: keyof FormState, pathField: keyof FormState, url: string, metadata?: { path: string }) {
    setForm((current) => ({ ...current, [urlField]: url, [pathField]: metadata?.path ?? "" }));
    setServerValidation(null);
  }

  function track(field: string) {
    return (status: MediaUploadStage) => setMedia((current) => ({ ...current, [field]: status }));
  }

  function toggleType(type: string) {
    update("submissionTypes", form.submissionTypes.includes(type) ? form.submissionTypes.filter((item) => item !== type) : [...form.submissionTypes, type]);
  }

  function payload(publish: boolean) {
    const privateMode = mode === "private";
    return {
      title: form.title.trim(),
      description: (form.shortDescription.trim() ? form.shortDescription.trim() + "\n\n" : "") + form.description.trim(),
      category: form.category,
      type: privateMode ? "Private Challenge" : "Public Challenge",
      visibility: privateMode ? "private" : "public",
      acceptedSubmissionTypes: form.submissionTypes,
      competitionFormat: privateMode ? "Invite-only Entry Competition" : "Entry Competition",
      bestOf: "1 Rounder",
      prizeType: "bragging_rights",
      prizeValue: 0,
      numberOfWinners: 1,
      winnerSelection: "highest_votes",
      paidEntryEnabled: false,
      entryFee: 0,
      prizePoolEnabled: false,
      prizePool: 0,
      cashPayoutsEnabled: false,
      submissionDeadline: form.submissionDeadline,
      registrationDeadline: form.submissionDeadline,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      votingDeadline: form.votingDeadline,
      votingEndsAt: form.votingDeadline,
      votingStartsAt: form.submissionDeadline,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      coverImageUrl: form.coverImageUrl,
      coverImagePath: form.coverImagePath,
      promoImageUrl: form.promoImageUrl,
      promoImagePath: form.promoImagePath,
      trailerVideoUrl: form.trailerVideoUrl,
      trailerVideoPath: form.trailerVideoPath,
      standardRules: form.rules,
      policyTerms: form.terms,
      challengeGuidelines: form.submission,
      privateAccessInstructions: privateMode ? form.access : "",
      privateAccessMethod: privateMode ? "Invite-only access" : "",
      requiresSubmissionApproval: privateMode,
      sponsorEnabled: false,
      sponsorPackages: [],
      isLiveEvent: false,
      tournamentType: "none",
      votingSettings: { allowFreeVotes: true, allowDoroCoinVotes: true, weightedVotes: false },
      publish
    };
  }

  const localValidation = useMemo(() => validateChallengeForPublish(payload(true) as Record<string, unknown>, { mode: "publish", userId: user?.uid }), [form, mode, user?.uid]);
  const validation = serverValidation ?? localValidation;
  const publishBlocked = uploadInProgress || uploadFailed || privateLocked || freeLimitReached || requiredImageMissing || !localValidation.valid;
  const publishLabel = uploadInProgress ? "Upload in Progress" : uploadFailed ? "Fix Upload" : privateLocked ? "Upgrade Required" : freeLimitReached ? "Limit Reached" : requiredImageMissing ? "Add Challenge Image" : !localValidation.valid ? "Complete " + localValidation.missingCount + " Item" + (localValidation.missingCount === 1 ? "" : "s") : mode === "private" ? "Publish Private Challenge" : "Publish Challenge";

  function validateStep() {
    if (step === 0 && (!form.title.trim() || !form.category || form.description.trim().length < 20)) return "Add title, category, and a clear description.";
    if (mode === "private" && step === 1 && !form.access.trim()) return "Add private access instructions.";
    if (step === (mode === "private" ? 2 : 1) && (!form.rules.trim() || !form.terms.trim())) return "Rules and eligibility terms are required.";
    if (step === (mode === "private" ? 3 : 2) && (!form.submissionTypes.length || !form.submission.trim())) return "Submission type and instructions are required.";
    return "";
  }

  function next() {
    const problem = validateStep();
    if (problem) return setError(problem);
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  async function saveDraft() {
    if (privateLocked) return setError("Private challenge drafts require Creator Plan.");
    setSaving(true);
    const response = await createChallenge(payload(false));
    setSaving(false);
    if (!response.ok) return setError(response.message || "Draft could not be saved.");
    setNotice("Draft saved.");
  }

  async function publish() {
    if (publishBlocked) return setError(publishLabel);
    setSaving(true);
    const response = await createChallenge(payload(true));
    setSaving(false);
    if (!response.ok) {
      const nextValidation = (response as { details?: { publishValidation?: ChallengeValidationResult } }).details?.publishValidation;
      if (nextValidation) setServerValidation(nextValidation);
      return setError(response.message || "Challenge could not be published.");
    }
    const challenge = response.data?.challenge as { id?: string } | undefined;
    setCreatedId(challenge?.id ?? "");
  }

  if (loading) return <AppShell><Card className="mx-auto max-w-5xl p-8"><PageTitle title="Challenge Builder" subtitle="Loading builder..." /></Card></AppShell>;
  if (user?.accountType === "sponsor") return <Locked title="Use Brand Command Center" body="Sponsor accounts create and manage campaigns from the dedicated sponsor experience." primaryHref="/sponsor/dashboard" primaryLabel="Open Brand Command Center" />;
  if (privateLocked) return <Locked title="Private challenges are available on Creator Plan" body="Upgrade to create invite-only challenges and manage private competition access." primaryHref="/subscriptions" primaryLabel="View Plans" secondaryHref="/creator/private-challenges" secondaryLabel="Back to Private Challenges" />;
  if (createdId) return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" /><h1 className="mt-6 text-3xl font-black">{mode === "private" ? "Private Challenge Submitted" : "Challenge Submitted"}</h1><p className="mt-3 text-slate-300">Your challenge was saved through the existing creation flow.</p><div className="mt-8 grid gap-3 sm:flex sm:justify-center"><LinkButton href={"/challenges/" + createdId}>View Challenge</LinkButton><LinkButton href={mode === "private" ? "/creator/private-challenges" : "/creator/challenges"} variant="secondary">Back to Challenges</LinkButton></div></Card></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><PageTitle title={mode === "private" ? "Create Private Challenge" : "Create Challenge"} subtitle={mode === "private" ? "Build an invite-only challenge with access, submissions, timeline, and review." : "Build a public challenge through a focused multi-step workflow."} icon={<Sparkles />} /><div className="flex flex-col gap-3 sm:flex-row"><Button variant="secondary" onClick={saveDraft} disabled={saving}><Save size={17} /> Save Draft</Button><Button variant="ghost" onClick={() => setPreview(true)}><Eye size={17} /> Preview</Button></div></div>
        <Card className="mt-6 p-4"><Stepper steps={steps} current={step} onSelect={setStep} /></Card>
        {isFreePublic ? <Card className="mt-6 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-4 text-sm text-slate-300"><b className="text-white">Free Basic builder.</b> Public, non-monetized challenges are available up to three lifetime publishes. Used: {freeUsage.loaded ? freeUsage.used : "..."} of {freeUsage.limit}.</Card> : null}
        <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px]"><Card className="p-4 sm:p-6 lg:p-8"><StepContent mode={mode} step={step} form={form} update={update} toggleType={toggleType} updateMedia={updateMedia} track={track} userId={user?.uid ?? "anonymous"} planAccess={planAccess} planName={planExperience.badgeLabel} /></Card><Helper mode={mode} step={step} /></div>
        {error ? <p className="mt-5 rounded-[8px] bg-red-950/50 p-4 text-red-200">{error}</p> : null}{notice ? <p className="mt-5 rounded-[8px] bg-emerald-950/40 p-4 text-emerald-200">{notice}</p> : null}<Checklist readiness={validation} className="mt-5" />
        <div className="mt-8 grid gap-3 border-t border-white/10 pt-6 sm:flex sm:items-center sm:justify-between"><Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(value - 1, 0))}>Back</Button><div className="grid gap-3 sm:flex"><Button variant="secondary" onClick={saveDraft} disabled={saving}><Save size={17} /> Save Draft</Button>{step < steps.length - 1 ? <Button onClick={next}>Continue</Button> : <Button onClick={publish} disabled={saving || publishBlocked}>{saving ? "Publishing..." : publishLabel}</Button>}</div></div>
      </div>
      {preview ? <Preview mode={mode} form={form} publishLabel={publishLabel} publishDisabled={publishBlocked || saving} onClose={() => setPreview(false)} onPublish={publish} /> : null}
    </AppShell>
  );
}

function Locked({ title, body, primaryHref, primaryLabel, secondaryHref, secondaryLabel }: { title: string; body: string; primaryHref: string; primaryLabel: string; secondaryHref?: string; secondaryLabel?: string }) {
  return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><LockKeyhole className="mx-auto h-14 w-14 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black">{title}</h1><p className="mt-3 text-slate-300">{body}</p><div className="mt-7 grid gap-3 sm:flex sm:justify-center"><LinkButton href={primaryHref}>{primaryLabel}</LinkButton>{secondaryHref && secondaryLabel ? <LinkButton href={secondaryHref} variant="secondary">{secondaryLabel}</LinkButton> : null}</div></Card></AppShell>;
}

function Stepper({ steps, current, onSelect }: { steps: string[]; current: number; onSelect: (step: number) => void }) {
  return <div className="flex gap-3 overflow-x-auto pb-1">{steps.map((label, index) => <button key={label} type="button" onClick={() => onSelect(index)} className={(index === current ? "border-[var(--gold)] bg-[var(--gold)] text-black" : index < current ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-[#171717] text-slate-400") + " flex min-w-[170px] items-center gap-3 rounded-[8px] border px-4 py-3 text-left text-sm font-black"}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/20">{index < current ? "Done" : index + 1}</span><span>{label}</span></button>)}</div>;
}

function StepTitle({ title, body }: { title: string; body: string }) { return <div><h2 className="text-2xl font-black text-white">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{body}</p></div>; }

function StepContent({ mode, step, form, update, toggleType, updateMedia, track, userId, planAccess, planName }: { mode: Mode; step: number; form: FormState; update: (field: keyof FormState, value: string | string[]) => void; toggleType: (type: string) => void; updateMedia: (urlField: keyof FormState, pathField: keyof FormState, url: string, metadata?: { path: string }) => void; track: (field: string) => (status: MediaUploadStage) => void; userId: string; planAccess: ReturnType<typeof getUserPlanAccess>; planName: string }) {
  const privateOffset = mode === "private" ? 1 : 0;
  if (step === 0) return <section><StepTitle title="Overview" body={mode === "private" ? "Set the private challenge brief and visibility." : "Set the public challenge brief and discovery details."} /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label={mode === "private" ? "Private challenge title" : "Challenge title"}><input className={inputClass} value={form.title} maxLength={120} onChange={(e) => update("title", e.target.value)} placeholder="Name the challenge" /></Field><Field label="Category"><select className={inputClass} value={form.category} onChange={(e) => update("category", e.target.value)}><option value="">Select category</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></Field></div><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Visibility"><input className={inputClass} value={mode === "private" ? "Private / invite-only" : "Public"} disabled /></Field><Field label="Short description"><input className={inputClass} value={form.shortDescription} maxLength={160} onChange={(e) => update("shortDescription", e.target.value)} /></Field></div><div className="mt-5"><Field label="Detailed description"><textarea className={textareaClass} value={form.description} maxLength={2000} onChange={(e) => update("description", e.target.value)} /></Field></div></section>;
  if (mode === "private" && step === 1) return <section><StepTitle title="Access & Invites" body="Control who can enter without creating fake invite records." /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Access method"><input className={inputClass} value="Invite-only access" disabled /></Field><Field label="Invite code/link"><input className={inputClass} value="Created after private challenge setup" disabled /></Field></div><div className="mt-5"><Field label="Access instructions"><textarea className={textareaClass} value={form.access} onChange={(e) => update("access", e.target.value)} /></Field></div></section>;
  if (step === 1 + privateOffset) return <section><StepTitle title="Rules & Eligibility" body="Define fair participation terms before entries open." /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Challenge rules"><textarea className={textareaClass} value={form.rules} onChange={(e) => update("rules", e.target.value)} /></Field><Field label="Eligibility terms"><textarea className={textareaClass} value={form.terms} onChange={(e) => update("terms", e.target.value)} /></Field><Card className="p-4 text-sm leading-6 text-slate-300"><LockKeyhole className="mb-2 text-[var(--gold)]" size={18} /><b className="text-white">Upgrade required.</b><br />Paid entry, prize pools, sponsor tools, tournaments, live events, and advanced voting stay locked unless existing plan access allows them.</Card></div></section>;
  if (step === 2 + privateOffset) return <section><StepTitle title="Entry & Submission" body="Tell participants exactly what to submit." /><div className="mt-6 grid gap-3 sm:grid-cols-2">{["image", "video"].map((type) => <label key={type} className="flex min-h-14 items-center gap-3 rounded-[8px] border border-white/10 bg-[#181818] px-4 py-4 font-bold"><input type="checkbox" checked={form.submissionTypes.includes(type)} onChange={() => toggleType(type)} /> {type === "image" ? "Image upload" : "Video upload"}</label>)}</div><div className="mt-5"><Field label="Submission instructions"><textarea className={textareaClass} value={form.submission} onChange={(e) => update("submission", e.target.value)} /></Field></div><Card className="mt-5 border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">Uploads use the existing media flow. No upload is marked successful until the upload component reports a saved URL and storage path.</Card></section>;
  if (step === 3 + privateOffset) return <section><StepTitle title={mode === "private" ? "Timeline" : "Voting & Timeline"} body="Keep entry, voting, and announcement dates clear." /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Registration or invite close"><input className={inputClass} type="datetime-local" value={form.submissionDeadline} onChange={(e) => update("submissionDeadline", e.target.value)} /></Field><Field label="Challenge starts"><input className={inputClass} type="datetime-local" value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} /></Field><Field label="Voting or review closes"><input className={inputClass} type="datetime-local" value={form.votingDeadline} onChange={(e) => update("votingDeadline", e.target.value)} /></Field><Field label="Winner announcement"><input className={inputClass} type="datetime-local" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} /></Field></div></section>;
  if (mode === "public" && step === 4) { const base = "challenges/drafts/" + userId; return <MediaBrandingStep form={form} base={base} updateMedia={updateMedia} track={track} />; }
  return <section><StepTitle title="Review & Publish" body="Check the challenge before creating a record." />{mode === "private" ? <div className="mt-6"><h3 className="text-lg font-black text-white">Media & Branding</h3><p className="mt-1 text-sm text-slate-400">Optional assets stay in the existing media flow and do not create invite records.</p><UploadGallery form={form} base={"challenges/drafts/" + userId} updateMedia={updateMedia} track={track} className="mt-4" /></div> : null}<div className="mt-6 grid gap-4 md:grid-cols-2">{Object.entries({ Title: form.title || "Not set", Category: form.category || "Not set", Visibility: mode === "private" ? "Private / invite-only" : "Public", "Submission Types": form.submissionTypes.join(", "), "Submission Close": form.submissionDeadline, Plan: mode === "private" ? "Creator Plan" : planName }).map(([label, value]) => <Card key={label} className="p-4"><div className="text-sm font-bold text-slate-400">{label}</div><div className="mt-1 break-words text-base font-black text-white">{String(value)}</div></Card>)}</div><Card className="mt-5 p-4 text-sm leading-6 text-slate-300"><b className="text-white">Locked or excluded:</b> paid entry, cash prize release, sponsor money movement, livestream backend, advanced voting, revenue sharing, and automatic payouts are not enabled by this builder.</Card></section>;
}


function MediaBrandingStep({ form, base, updateMedia, track }: { form: FormState; base: string; updateMedia: (urlField: keyof FormState, pathField: keyof FormState, url: string, metadata?: { path: string }) => void; track: (field: string) => (status: MediaUploadStage) => void }) {
  return <section><StepTitle title="Media & Branding" body="Add real visuals for cards, promotion, and participant context." /><UploadGallery form={form} base={base} updateMedia={updateMedia} track={track} className="mt-6" /></section>;
}

function UploadGallery({ form, base, updateMedia, track, className = "" }: { form: FormState; base: string; updateMedia: (urlField: keyof FormState, pathField: keyof FormState, url: string, metadata?: { path: string }) => void; track: (field: string) => (status: MediaUploadStage) => void; className?: string }) {
  return <div className={`${className} space-y-7`}>
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-xl font-black text-white">Images</h3><p className="mt-1 text-sm text-slate-400">Add up to 3 challenge images. At least one image is required.</p></div><span className="rounded-full bg-[var(--gold)] px-3 py-1 text-xs font-black text-black">1 required</span></div>
      {!form.coverImageUrl ? <p className="mt-3 rounded-[8px] border border-yellow-500/25 bg-yellow-500/5 p-3 text-sm font-bold text-yellow-100">Add at least one challenge image to continue.</p> : null}
      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        <UploadPanel icon={<ImageIcon size={20} />} title="Image 1" purpose="Primary cover image used on challenge cards and detail pages." required><MediaUploadField label="Cover image" value={form.coverImageUrl} onChange={(url, metadata) => updateMedia("coverImageUrl", "coverImagePath", url, metadata)} storagePath={base + "/banner"} kind="image" buttonLabel="Browse cover image" required onStatusChange={track("coverImageUrl")} /></UploadPanel>
        <UploadPanel icon={<ImageIcon size={20} />} title="Image 2" purpose="Promo flyer / poster for campaign surfaces when supported."><MediaUploadField label="Promo flyer / poster" value={form.promoImageUrl} onChange={(url, metadata) => updateMedia("promoImageUrl", "promoImagePath", url, metadata)} storagePath={base + "/promo-flyer"} kind="image" buttonLabel="Browse promo asset" onStatusChange={track("promoImageUrl")} /></UploadPanel>
        <UploadPanel icon={<ImageIcon size={20} />} title="Image 3" purpose="Optional gallery preview. Backend gallery storage will be connected later."><MediaUploadField label="Gallery image" value={form.galleryImageUrl} onChange={(url, metadata) => updateMedia("galleryImageUrl", "galleryImagePath", url, metadata)} storagePath={base + "/gallery"} kind="image" buttonLabel="Browse gallery image" onStatusChange={track("galleryImageUrl")} /></UploadPanel>
      </div>
    </div>
    <div>
      <h3 className="text-xl font-black text-white">Video</h3>
      <p className="mt-1 text-sm text-slate-400">Optional intro video or trailer. You can continue without video.</p>
      <div className="mt-4 max-w-md"><UploadPanel icon={<Video size={20} />} title="Intro video / trailer" purpose="Optional short video to explain the challenge."><MediaUploadField label="Intro video / trailer" value={form.trailerVideoUrl} onChange={(url, metadata) => updateMedia("trailerVideoUrl", "trailerVideoPath", url, metadata)} storagePath={base + "/trailers"} kind="video" buttonLabel="Browse trailer video" onStatusChange={track("trailerVideoUrl")} /></UploadPanel></div>
    </div>
    <div>
      <h3 className="text-xl font-black text-white">Documents</h3>
      <p className="mt-1 text-sm text-slate-400">Add up to 2 optional documents. Challenge document persistence needs backend support.</p>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <DocumentSlot title="Document 1" />
        <DocumentSlot title="Document 2" />
      </div>
    </div>
  </div>;
}

function UploadPanel({ icon, title, purpose, required = false, children }: { icon: React.ReactNode; title: string; purpose: string; required?: boolean; children: React.ReactNode }) {
  return <Card className="flex min-h-[320px] flex-col border-white/10 bg-[#141414] p-5">
    <div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-[var(--gold)]/10 text-[var(--gold)]">{icon}</div><span className={`rounded-full px-3 py-1 text-xs font-black ${required ? "bg-[var(--gold)] text-black" : "bg-white/10 text-slate-300"}`}>{required ? "Required" : "Optional"}</span></div>
    <h3 className="mt-4 text-lg font-black text-white">{title}</h3>
    <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{purpose}</p>
    <div className="mt-4 flex-1 rounded-[8px] border border-dashed border-white/15 bg-black/25 p-4">{children}</div>
  </Card>;
}

function DocumentSlot({ title }: { title: string }) {
  return <UploadPanel icon={<FileText size={20} />} title={title} purpose="Optional rules, brief, or reference document for participants when backend document storage is connected.">
    <div className="flex min-h-36 flex-col items-center justify-center rounded-[8px] border border-dashed border-white/15 bg-black/20 p-5 text-center">
      <FileText className="text-slate-500" size={28} />
      <p className="mt-3 text-sm font-bold text-slate-300">Document upload setup required</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">Documents are not published until backend document persistence is connected.</p>
      <Button className="mt-4" variant="secondary" disabled>Browse document</Button>
    </div>
  </UploadPanel>;
}

function Helper({ mode, step }: { mode: Mode; step: number }) {
  const copy = mode === "private" && step === 1 ? ["Control who can enter", "Private challenges are invite-only.", "Share access only with intended participants.", "Use approval when entries need review."] : step === 0 ? ["Start with a clear challenge", "Make the goal easy to understand.", "Tell competitors what they are joining.", "Keep the title short and specific."] : step >= 4 ? ["Review before publishing", "Preview without saving records.", "Publish only when ready.", "Unsupported premium fields stay locked."] : ["Build a fair challenge", "Keep rules simple.", "Guide strong submissions.", "Keep timelines clear."];
  return <Card className="h-fit p-5 lg:sticky lg:top-24"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Builder Guide</p><h2 className="mt-3 text-xl font-black text-white">{copy[0]}</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">{copy.slice(1).map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]" /><span>{item}</span></li>)}</ul></Card>;
}

function Checklist({ readiness, className = "" }: { readiness: ChallengeValidationResult; className?: string }) {
  const blocking = readiness.errors.filter((issue) => issue.severity === "error");
  if (!blocking.length) return <Card className={className + " border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100"}>Ready to publish. The existing server validation will check this again before saving.</Card>;
  return <Card className={className + " border-yellow-500/30 bg-yellow-500/5 p-4"}><p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--gold)]">Publish checklist</p><h3 className="mt-1 text-lg font-black text-white">Complete {readiness.missingCount} item{readiness.missingCount === 1 ? "" : "s"}</h3><ul className="mt-3 space-y-1 text-sm text-slate-300">{blocking.slice(0, 5).map((issue) => <li key={issue.code + issue.field}>- {issue.message}</li>)}</ul></Card>;
}

function Preview({ mode, form, onClose, onPublish, publishDisabled, publishLabel }: { mode: Mode; form: FormState; onClose: () => void; onPublish: () => void; publishDisabled: boolean; publishLabel: string }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="challenge-preview-title"><Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Preview</p><h2 id="challenge-preview-title" className="mt-2 text-2xl font-black">{form.title || "Untitled challenge"}</h2><p className="mt-2 text-sm text-slate-400">{mode === "private" ? "Private / invite-only" : "Public"} - {form.category || "Category not set"}</p></div><button className="rounded-[8px] bg-white/10 p-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" onClick={onClose} aria-label="Close preview"><X size={18} /></button></div>{form.coverImageUrl ? <img src={form.coverImageUrl} alt="" className="mt-5 aspect-[16/9] w-full rounded-[8px] object-cover" /> : <div className="mt-5 flex aspect-[16/9] w-full items-center justify-center rounded-[8px] border border-dashed border-white/15 bg-[#181818] text-sm text-slate-500">Cover image preview</div>}<p className="mt-5 whitespace-pre-line text-sm leading-7 text-slate-300">{form.description || "Challenge description will appear here."}</p><div className="mt-7 grid gap-3 sm:flex sm:justify-end"><Button variant="secondary" onClick={onClose}>Back to editing</Button><Button onClick={onPublish} disabled={publishDisabled}>{publishLabel}</Button></div></Card></div>;
}
