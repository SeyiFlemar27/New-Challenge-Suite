"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, FileText, ImageIcon, LockKeyhole, Save, Sparkles, Video, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { MediaUploadField, type MediaUploadStage } from "@/components/media-upload-field";
import { createChallenge, fetchChallengeUsage } from "@/lib/api/services";
import { firebaseClientConfigStatus } from "@/lib/firebase/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { challengeDraftMediaPath } from "@/lib/media-upload-paths";
import { getPlanExperience, getUserPlanAccess } from "@/lib/plan-access";
import { validateChallengeForPublish, type ChallengeValidationResult } from "@/lib/server/challenge-validation";

type Mode = "public" | "private";
const SPONSOR_PLACEMENTS = ["challenge_detail", "voting_page", "leaderboard", "winner_announcement", "share_card"] as const;
const sponsorPlacementLabels: Record<string, string> = {
  challenge_detail: "Challenge page",
  voting_page: "Voting page",
  leaderboard: "Leaderboard",
  winner_announcement: "Winner announcement",
  share_card: "Share card"
};

type FormState = {
  title: string; category: string; description: string; shortDescription: string;
  rules: string; terms: string; submission: string; access: string;
  submissionTypes: string[]; startsAt: string; submissionDeadline: string; votingDeadline: string; endsAt: string;
  coverImageUrl: string; coverImagePath: string; promoImageUrl: string; promoImagePath: string; galleryImageUrl: string; galleryImagePath: string; trailerVideoUrl: string; trailerVideoPath: string; documentOneUrl: string; documentOnePath: string; documentTwoUrl: string; documentTwoPath: string;
  paidEntryEnabled: boolean; entryFeeAmount: string; entryCurrency: string; sponsorReady: boolean; prizePoolEnabled: boolean; paidVotesEnabled: boolean;
  sponsorshipGoal: string; preferredSponsorCategory: string; sponsorNote: string; sponsorPlacementPreferences: string[];
};

const publicSteps = ["Overview", "Rules & Eligibility", "Entry & Submission", "Voting & Timeline", "Monetization & Prize Pool", "Media & Branding", "Review & Publish"];
const privateSteps = ["Overview", "Access & Invites", "Rules & Eligibility", "Entry & Submission", "Timeline", "Monetization & Prize Pool", "Review & Publish"];
const categories = ["Fitness", "Creative", "Photography", "Food", "Gaming", "Education", "Business", "Other"];

function dateInput(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10) + "T12:00";
}

function initialForm(): FormState {
  return { title: "", category: "", description: "", shortDescription: "", rules: "", terms: "", submission: "", access: "", submissionTypes: ["image"], startsAt: dateInput(8), submissionDeadline: dateInput(5), votingDeadline: dateInput(6), endsAt: dateInput(9), coverImageUrl: "", coverImagePath: "", promoImageUrl: "", promoImagePath: "", galleryImageUrl: "", galleryImagePath: "", trailerVideoUrl: "", trailerVideoPath: "", documentOneUrl: "", documentOnePath: "", documentTwoUrl: "", documentTwoPath: "", paidEntryEnabled: false, entryFeeAmount: "", entryCurrency: "USD", sponsorReady: false, prizePoolEnabled: false, paidVotesEnabled: false, sponsorshipGoal: "", preferredSponsorCategory: "", sponsorNote: "", sponsorPlacementPreferences: ["challenge_detail", "voting_page"] };
}

export function ChallengeBuilder({ mode }: { mode: Mode }) {
  const { user, loading } = useCurrentUser();
  const planProfile = { planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType };
  const planAccess = getUserPlanAccess(planProfile);
  const planExperience = getPlanExperience(planProfile);
  const enterpriseApproved = planAccess.isEnterprise && String((user as any)?.enterpriseAccessStatus ?? (user as any)?.enterpriseApprovalStatus ?? "").toLowerCase() === "approved";
  const monetizationEligible = planAccess.isCreator || planAccess.isHost || enterpriseApproved;
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
  const mediaUploadDisabled = firebaseClientConfigStatus.mediaUploadsDisabled;
  const mediaUploadDisabledReason = firebaseClientConfigStatus.mediaUploadAvailability === "disabled_demo_mode"
    ? "Media uploads are temporarily disabled for demo mode. You can publish this challenge without media for now."
    : "Media uploads are temporarily unavailable while storage is being connected. You can publish this challenge without media for now.";
  const uploadInProgress = Object.values(media).some((status) => ["preparing", "uploading", "processing"].includes(status));
  const uploadFailed = Object.values(media).some((status) => status === "failed");
  const freeLimitReached = isFreePublic && freeUsage.loaded && freeUsage.remaining <= 0;
  const requiredImageMissing = !mediaUploadDisabled && (!form.coverImageUrl || !form.coverImagePath);
  const entryFeeCents = Math.max(0, Math.round(Number(form.entryFeeAmount || 0) * 100));
  const monetizedIntent = form.paidEntryEnabled || form.sponsorReady || form.prizePoolEnabled || form.paidVotesEnabled;
  const monetizationProblem = !monetizationEligible && monetizedIntent
    ? "Monetized challenges are available to Creator, Host, and approved Enterprise accounts."
    : form.paidEntryEnabled && entryFeeCents < 500
      ? "Entry fee must be at least $5."
      : "";

  useEffect(() => {
    if (!loading && isFreePublic) {
      fetchChallengeUsage().then((result) => result.ok && result.data ? setFreeUsage({ ...result.data.freeBasic, loaded: true }) : setFreeUsage((current) => ({ ...current, loaded: true })));
    }
  }, [isFreePublic, loading]);

  function update(field: keyof FormState, value: FormState[keyof FormState]) {
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

  function togglePlacement(surface: string) {
    update("sponsorPlacementPreferences", form.sponsorPlacementPreferences.includes(surface) ? form.sponsorPlacementPreferences.filter((item) => item !== surface) : [...form.sponsorPlacementPreferences, surface]);
  }

  function payload(publish: boolean) {
    const privateMode = mode === "private";
    const safeSponsorReady = Boolean(monetizationEligible && form.sponsorReady);
    const safePaidEntryRequested = Boolean(monetizationEligible && form.paidEntryEnabled);
    const safePrizePoolRequested = Boolean(monetizationEligible && form.prizePoolEnabled);
    const safePaidVotesRequested = Boolean(monetizationEligible && form.paidVotesEnabled);
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
      coverImageUrl: mediaUploadDisabled ? "" : form.coverImageUrl,
      coverImagePath: mediaUploadDisabled ? "" : form.coverImagePath,
      promoImageUrl: form.promoImageUrl,
      promoImagePath: form.promoImagePath,
      trailerVideoUrl: form.trailerVideoUrl,
      trailerVideoPath: form.trailerVideoPath,
      documentUrls: [form.documentOneUrl, form.documentTwoUrl].filter(Boolean),
      documentPaths: [form.documentOnePath, form.documentTwoPath].filter(Boolean),
      mediaUploadStatus: mediaUploadDisabled ? "storage_disabled" : form.coverImagePath ? "uploaded" : "required",
      mediaStatus: mediaUploadDisabled ? "skipped_storage_not_configured" : form.coverImagePath ? "uploaded" : "required",
      usesPlaceholderMedia: mediaUploadDisabled,
      mediaFallbackType: mediaUploadDisabled ? "challenge_suite_placeholder" : "",
      standardRules: form.rules,
      policyTerms: form.terms,
      challengeGuidelines: form.submission,
      privateAccessInstructions: privateMode ? form.access : "",
      privateAccessMethod: privateMode ? "Invite-only access" : "",
      requiresSubmissionApproval: privateMode,
      sponsorEnabled: safeSponsorReady,
      sponsorSlots: safeSponsorReady ? 4 : 0,
      minimumSponsorshipAmount: 0,
      sponsorPlacementOptions: safeSponsorReady ? form.sponsorPlacementPreferences : [],
      sponsorPackages: [],
      monetization: {
        enabled: Boolean(safePaidEntryRequested || safeSponsorReady || safePrizePoolRequested || safePaidVotesRequested),
        paidEntryRequested: safePaidEntryRequested,
        entryFeeAmountCents: safePaidEntryRequested ? entryFeeCents : 0,
        currency: "USD",
        sponsorReady: safeSponsorReady,
        prizePoolRequested: safePrizePoolRequested,
        paidVotesRequested: safePaidVotesRequested,
        sponsorshipGoal: safeSponsorReady ? form.sponsorshipGoal.trim() : "",
        preferredSponsorCategory: safeSponsorReady ? form.preferredSponsorCategory.trim() : "",
        sponsorNote: safeSponsorReady ? form.sponsorNote.trim() : "",
        placements: safeSponsorReady ? form.sponsorPlacementPreferences : [],
        status: safePaidEntryRequested || safeSponsorReady || safePrizePoolRequested || safePaidVotesRequested ? "setup_required" : "not_requested",
        paymentActive: false,
        checkoutActive: false,
        ledgerCreationEnabled: false,
        prizeReleaseActive: false,
        payoutReleaseActive: false
      },
      isLiveEvent: false,
      tournamentType: "none",
      votingSettings: { allowFreeVotes: true, allowDoroCoinVotes: true, weightedVotes: false },
      publish
    };
  }

  const localValidation = useMemo(() => validateChallengeForPublish(payload(true) as Record<string, unknown>, { mode: "publish", userId: user?.uid }), [form, mode, user?.uid]);
  const validation = serverValidation ?? localValidation;
  const publishBlocked = uploadInProgress || uploadFailed || privateLocked || freeLimitReached || requiredImageMissing || Boolean(monetizationProblem) || !localValidation.valid;
  const publishLabel = uploadInProgress ? "Please wait for your image upload to finish." : uploadFailed ? "Please retry the failed image upload before publishing." : privateLocked ? "Upgrade Required" : freeLimitReached ? "Limit Reached" : requiredImageMissing ? "Add Challenge Image" : monetizationProblem ? monetizationProblem : !localValidation.valid ? "Complete " + localValidation.missingCount + " Item" + (localValidation.missingCount === 1 ? "" : "s") : mode === "private" ? "Publish Private Challenge" : "Publish Challenge";

  function validateStep() {
    if (step === 0 && (!form.title.trim() || !form.category || form.description.trim().length < 20)) return "Add title, category, and a clear description.";
    if (mode === "private" && step === 1 && !form.access.trim()) return "Add private access instructions.";
    if (step === (mode === "private" ? 2 : 1) && (!form.rules.trim() || !form.terms.trim())) return "Rules and eligibility terms are required.";
    if (step === (mode === "private" ? 3 : 2) && (!form.submissionTypes.length || !form.submission.trim())) return "Submission type and instructions are required.";
    if (step === (mode === "private" ? 5 : 4) && monetizationProblem) return monetizationProblem;
    if (step === (mode === "private" ? 6 : 5) && requiredImageMissing) return "Add at least one challenge image to continue.";
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
  if (createdId) return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" /><h1 className="mt-6 text-3xl font-black">{mode === "private" ? "Private Challenge Submitted" : "Challenge Submitted"}</h1><p className="mt-3 text-slate-300">{mediaUploadDisabled ? "Challenge published successfully without media. A branded Challenge Suite placeholder will be shown until uploads are available." : "Your challenge was saved through the existing creation flow."}</p><div className="mt-8 grid gap-3 sm:flex sm:justify-center"><LinkButton href={"/challenges/" + createdId}>View Challenge</LinkButton><LinkButton href={mode === "private" ? "/creator/private-challenges" : "/creator/challenges"} variant="secondary">Back to Challenges</LinkButton></div></Card></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><PageTitle title={mode === "private" ? "Create Private Challenge" : "Create Challenge"} subtitle={mode === "private" ? "Build an invite-only challenge with access, submissions, timeline, and review." : "Build a public challenge through a focused multi-step workflow."} icon={<Sparkles />} /><div className="flex flex-col gap-3 sm:flex-row"><Button variant="secondary" onClick={saveDraft} disabled={saving}><Save size={17} /> Save Draft</Button><Button variant="ghost" onClick={() => setPreview(true)}><Eye size={17} /> Preview</Button></div></div>
        <Card className="mt-6 p-4"><Stepper steps={steps} current={step} onSelect={setStep} /></Card>
        {isFreePublic ? <Card className="mt-6 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-4 text-sm text-slate-300"><b className="text-white">Free Basic builder.</b> Public, non-monetized challenges are available up to three lifetime publishes. Used: {freeUsage.loaded ? freeUsage.used : "..."} of {freeUsage.limit}.</Card> : null}
        <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px]"><Card className="p-4 sm:p-6 lg:p-8"><StepContent mode={mode} step={step} form={form} update={update} toggleType={toggleType} togglePlacement={togglePlacement} updateMedia={updateMedia} track={track} userId={user?.uid ?? "anonymous"} planAccess={planAccess} planName={planExperience.badgeLabel} monetizationEligible={monetizationEligible} entryFeeCents={entryFeeCents} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} /></Card><Helper mode={mode} step={step} /></div>
        {error ? <p className="mt-5 rounded-[8px] bg-red-950/50 p-4 text-red-200">{error}</p> : null}{notice ? <p className="mt-5 rounded-[8px] bg-emerald-950/40 p-4 text-emerald-200">{notice}</p> : null}<Checklist readiness={validation} uploadInProgress={uploadInProgress} uploadFailed={uploadFailed} requiredImageMissing={requiredImageMissing} mediaUploadDisabled={mediaUploadDisabled} className="mt-5" />
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

function StepContent({ mode, step, form, update, toggleType, togglePlacement, updateMedia, track, userId, planAccess, planName, monetizationEligible, entryFeeCents, mediaUploadDisabled, mediaUploadDisabledReason }: { mode: Mode; step: number; form: FormState; update: (field: keyof FormState, value: FormState[keyof FormState]) => void; toggleType: (type: string) => void; togglePlacement: (surface: string) => void; updateMedia: (urlField: keyof FormState, pathField: keyof FormState, url: string, metadata?: { path: string }) => void; track: (field: string) => (status: MediaUploadStage) => void; userId: string; planAccess: ReturnType<typeof getUserPlanAccess>; planName: string; monetizationEligible: boolean; entryFeeCents: number; mediaUploadDisabled: boolean; mediaUploadDisabledReason: string }) {
  const privateOffset = mode === "private" ? 1 : 0;
  if (step === 0) return <section><StepTitle title="Overview" body={mode === "private" ? "Set the private challenge brief and visibility." : "Set the public challenge brief and discovery details."} /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label={mode === "private" ? "Private challenge title" : "Challenge title"}><input className={inputClass} value={form.title} maxLength={120} onChange={(e) => update("title", e.target.value)} placeholder="Name the challenge" /></Field><Field label="Category"><select className={inputClass} value={form.category} onChange={(e) => update("category", e.target.value)}><option value="">Select category</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></Field></div><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Visibility"><input className={inputClass} value={mode === "private" ? "Private / invite-only" : "Public"} disabled /></Field><Field label="Short description"><input className={inputClass} value={form.shortDescription} maxLength={160} onChange={(e) => update("shortDescription", e.target.value)} /></Field></div><div className="mt-5"><Field label="Detailed description"><textarea className={textareaClass} value={form.description} maxLength={2000} onChange={(e) => update("description", e.target.value)} /></Field></div></section>;
  if (mode === "private" && step === 1) return <section><StepTitle title="Access & Invites" body="Control who can enter without creating fake invite records." /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Access method"><input className={inputClass} value="Invite-only access" disabled /></Field><Field label="Invite code/link"><input className={inputClass} value="Created after private challenge setup" disabled /></Field></div><div className="mt-5"><Field label="Access instructions"><textarea className={textareaClass} value={form.access} onChange={(e) => update("access", e.target.value)} /></Field></div></section>;
  if (step === 1 + privateOffset) return <section><StepTitle title="Rules & Eligibility" body="Define fair participation terms before entries open." /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Challenge rules"><textarea className={textareaClass} value={form.rules} onChange={(e) => update("rules", e.target.value)} /></Field><Field label="Eligibility terms"><textarea className={textareaClass} value={form.terms} onChange={(e) => update("terms", e.target.value)} /></Field><Card className="p-4 text-sm leading-6 text-slate-300"><LockKeyhole className="mb-2 text-[var(--gold)]" size={18} /><b className="text-white">Upgrade required.</b><br />Paid entry, prize pools, sponsor tools, tournaments, live events, and advanced voting stay locked unless existing plan access allows them.</Card></div></section>;
  if (step === 2 + privateOffset) return <section><StepTitle title="Entry & Submission" body="Tell participants exactly what to submit." /><div className="mt-6 grid gap-3 sm:grid-cols-2">{["image", "video"].map((type) => <label key={type} className="flex min-h-14 items-center gap-3 rounded-[8px] border border-white/10 bg-[#181818] px-4 py-4 font-bold"><input type="checkbox" checked={form.submissionTypes.includes(type)} onChange={() => toggleType(type)} /> {type === "image" ? "Image upload" : "Video upload"}</label>)}</div><div className="mt-5"><Field label="Submission instructions"><textarea className={textareaClass} value={form.submission} onChange={(e) => update("submission", e.target.value)} /></Field></div><Card className="mt-5 border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">Uploads use the existing media flow. No upload is marked successful until the upload component reports a saved URL and storage path.</Card></section>;
  if (step === 3 + privateOffset) return <section><StepTitle title={mode === "private" ? "Timeline" : "Voting & Timeline"} body="Keep entry, voting, and announcement dates clear." /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Registration or invite close"><input className={inputClass} type="datetime-local" value={form.submissionDeadline} onChange={(e) => update("submissionDeadline", e.target.value)} /></Field><Field label="Challenge starts"><input className={inputClass} type="datetime-local" value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} /></Field><Field label="Voting or review closes"><input className={inputClass} type="datetime-local" value={form.votingDeadline} onChange={(e) => update("votingDeadline", e.target.value)} /></Field><Field label="Winner announcement"><input className={inputClass} type="datetime-local" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} /></Field></div></section>;
  if (step === (mode === "private" ? 5 : 4)) return <MonetizationStep form={form} update={update} togglePlacement={togglePlacement} planAccess={planAccess} planName={planName} monetizationEligible={monetizationEligible} entryFeeCents={entryFeeCents} />;
  if (mode === "public" && step === 5) return <MediaBrandingStep form={form} userId={userId} updateMedia={updateMedia} track={track} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} />;
  return <section><StepTitle title="Review & Publish" body="Check the challenge before creating a record." />{mode === "private" ? <div className="mt-6"><h3 className="text-lg font-black text-white">Media & Branding</h3><p className="mt-1 text-sm text-slate-400">Assets stay in the existing media flow and do not create invite records.</p><UploadGallery form={form} userId={userId} updateMedia={updateMedia} track={track} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} className="mt-4" /></div> : null}<div className="mt-6 grid gap-4 md:grid-cols-2">{Object.entries({ Title: form.title || "Not set", Category: form.category || "Not set", Visibility: mode === "private" ? "Private / invite-only" : "Public", "Submission Types": form.submissionTypes.join(", "), "Submission Close": form.submissionDeadline, Plan: mode === "private" ? "Creator Plan" : planName, Media: mediaUploadDisabled ? "Publishing without media" : form.coverImageUrl ? "Uploaded" : "Required", "Paid Entry": form.paidEntryEnabled ? "Requested / setup required" : "Off", "Sponsor Ready": form.sponsorReady ? "Requested / setup required" : "Off", "Prize Pool": form.prizePoolEnabled ? "Starts at $0 until confirmed payments" : "Off" }).map(([label, value]) => <Card key={label} className="p-4"><div className="text-sm font-bold text-slate-400">{label}</div><div className="mt-1 break-words text-base font-black text-white">{String(value)}</div></Card>)}</div><Card className="mt-5 p-4 text-sm leading-6 text-slate-300"><b className="text-white">Payment and payout controls:</b> checkout, paid vote processing, ledger creation, sponsor funding, winner allocation, cash prize release, and automatic payouts remain inactive until provider setup and admin approval are complete.</Card></section>;
}

function MonetizationStep({ form, update, togglePlacement, planAccess, planName, monetizationEligible, entryFeeCents }: { form: FormState; update: (field: keyof FormState, value: FormState[keyof FormState]) => void; togglePlacement: (surface: string) => void; planAccess: ReturnType<typeof getUserPlanAccess>; planName: string; monetizationEligible: boolean; entryFeeCents: number }) {
  const entryFeeEstimate = form.paidEntryEnabled && entryFeeCents >= 500 ? {
    platform: Math.floor(entryFeeCents * 0.15),
    generatedNet: entryFeeCents - Math.floor(entryFeeCents * 0.15)
  } : null;
  return <section>
    <StepTitle title="Monetization & Prize Pool" body="Choose how this challenge can be funded. Paid features require payment setup, admin review, and payout rules before they can go live." />
    {!monetizationEligible ? <Card className="mt-6 border-yellow-500/25 bg-yellow-500/5 p-5 text-sm leading-6 text-yellow-50"><LockKeyhole className="mb-2 text-[var(--gold)]" size={18} /><b>Monetized challenges are available to Creator, Host, and approved Enterprise accounts.</b><br />Free Basic challenges remain public, non-prize, and non-monetized.</Card> : <Card className="mt-6 border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-slate-300"><b className="text-white">{planName} monetization setup.</b><br />KYC is required before withdrawals. Payments are provider-confirmed only. Winner allocation requires admin approval and a 24-hour cash hold.</Card>}
    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <MonetizationCard title="Enable Paid Entry" enabled={form.paidEntryEnabled} disabled={!monetizationEligible} onChange={(enabled) => update("paidEntryEnabled", enabled)} setupCopy="Paid entry checkout will activate only after payment setup and provider confirmation are complete.">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
            <Field label="Entry fee amount"><input className={inputClass} type="number" min="5" step="1" value={form.entryFeeAmount} disabled={!form.paidEntryEnabled || !monetizationEligible} onChange={(event) => update("entryFeeAmount", event.target.value)} placeholder="5" /></Field>
            <Field label="Currency"><input className={inputClass} value={form.entryCurrency} disabled /></Field>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-400">Minimum entry fee is $5. USD is used until multi-currency checkout is connected.</p>
          {form.paidEntryEnabled && entryFeeCents > 0 && entryFeeCents < 500 ? <p className="mt-2 rounded-[8px] bg-red-950/40 p-3 text-sm text-red-200">Entry fee must be at least $5.</p> : null}
        </MonetizationCard>
        <MonetizationCard title="Make this challenge Sponsor Ready" enabled={form.sponsorReady} disabled={!monetizationEligible} onChange={(enabled) => update("sponsorReady", enabled)} setupCopy="Sponsor-ready challenges can appear in Sponsor Discovery after publish. Confirmed sponsor contributions go 100% to winners.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Sponsorship goal"><input className={inputClass} value={form.sponsorshipGoal} disabled={!form.sponsorReady || !monetizationEligible} onChange={(event) => update("sponsorshipGoal", event.target.value)} placeholder="Increase the winner prize pool" /></Field>
            <Field label="Preferred sponsor category"><input className={inputClass} value={form.preferredSponsorCategory} disabled={!form.sponsorReady || !monetizationEligible} onChange={(event) => update("preferredSponsorCategory", event.target.value)} placeholder="Fitness, beauty, gaming..." /></Field>
          </div>
          <Field label="Sponsor note"><textarea className={textareaClass} value={form.sponsorNote} disabled={!form.sponsorReady || !monetizationEligible} onChange={(event) => update("sponsorNote", event.target.value)} placeholder="Tell sponsors what kind of brand fit makes sense." /></Field>
          <div><p className="text-sm font-bold text-slate-300">Sponsor visibility placements</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{SPONSOR_PLACEMENTS.map((surface) => <label key={surface} className="flex items-center gap-3 rounded-[8px] border border-white/10 bg-black/25 p-3 text-sm font-bold text-slate-300"><input type="checkbox" disabled={!form.sponsorReady || !monetizationEligible} checked={form.sponsorPlacementPreferences.includes(surface)} onChange={() => togglePlacement(surface)} /> {sponsorPlacementLabels[surface]}</label>)}</div></div>
        </MonetizationCard>
        <MonetizationCard title="Enable Prize Pool" enabled={form.prizePoolEnabled} disabled={!monetizationEligible} onChange={(enabled) => update("prizePoolEnabled", enabled)} setupCopy="Prize pools start at $0 until confirmed payments or sponsor contributions are received.">
          <ul className="space-y-2 text-sm leading-6 text-slate-300">
            <li>- Platform fee is 15% of confirmed generated revenue only.</li>
            <li>- Entry-fee and paid-vote net distribution remains a ledger finalization foundation.</li>
            <li>- 100% of confirmed sponsor contributions goes to winners.</li>
            <li>- Winner payout requires admin approval, KYC, and a 24-hour hold.</li>
          </ul>
        </MonetizationCard>
        <MonetizationCard title="Enable Paid Votes" enabled={form.paidVotesEnabled} disabled={!monetizationEligible} onChange={(enabled) => update("paidVotesEnabled", enabled)} setupCopy="Paid votes unlock for Creator premium, Host premium, and approved Enterprise accounts, but checkout remains setup-required and webhook-confirmed until payment setup is complete." />
      </div>
      <Card className="h-fit p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Monetization Preview</p>
        <h3 className="mt-2 text-xl font-black text-white">Rules, not actual earnings</h3>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
          <p><b className="text-white">Generated revenue:</b> platform fee is 15% of confirmed paid entry, paid vote, and boost revenue only.</p>
          <p><b className="text-white">Sponsor contributions:</b> excluded from platform fee and 100% goes to approved winners after provider confirmation.</p>
          <p><b className="text-white">Withdrawal rules:</b> admin approval, 24-hour hold, and KYC are required.</p>
          {entryFeeEstimate ? <div className="rounded-[8px] bg-black/30 p-3"><p className="font-bold text-white">Gross paid-entry preview.</p><p>Gross entry fee: {formatCents(entryFeeCents)}</p><p>Platform fee foundation: {formatCents(entryFeeEstimate.platform)}</p><p>Generated revenue after platform fee: {formatCents(entryFeeEstimate.generatedNet)}</p></div> : null}
          <p className="text-xs text-slate-500">Estimates are not saved as revenue and do not create ledger entries.</p>
        </div>
      </Card>
    </div>
  </section>;
}

function MonetizationCard({ title, enabled, disabled, setupCopy, onChange, children }: { title: string; enabled: boolean; disabled: boolean; setupCopy: string; onChange: (enabled: boolean) => void; children?: React.ReactNode }) {
  return <Card className="border-white/10 bg-[#141414] p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-lg font-black text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{setupCopy}</p></div><label className={`flex min-w-28 items-center justify-between gap-3 rounded-[8px] border px-3 py-2 text-sm font-black ${disabled ? "border-white/10 text-slate-500" : "border-[var(--gold)]/30 text-white"}`}><span>{enabled ? "On" : disabled ? "Locked" : "Off"}</span><input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label></div>
    {children ? <div className={`mt-5 space-y-4 ${disabled || !enabled ? "opacity-70" : ""}`}>{children}</div> : null}
  </Card>;
}

function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}


function MediaBrandingStep({ form, userId, updateMedia, track, mediaUploadDisabled, mediaUploadDisabledReason }: { form: FormState; userId: string; updateMedia: (urlField: keyof FormState, pathField: keyof FormState, url: string, metadata?: { path: string }) => void; track: (field: string) => (status: MediaUploadStage) => void; mediaUploadDisabled: boolean; mediaUploadDisabledReason: string }) {
  return <section><StepTitle title="Media & Branding" body="Add real visuals for cards, promotion, and participant context." />{mediaUploadDisabled ? <Card className="mt-5 border-yellow-500/25 bg-yellow-500/5 p-4 text-sm leading-6 text-yellow-50"><b className="text-white">Media uploads are temporarily unavailable while storage is being connected.</b><br />You can publish this challenge without media for now. A branded Challenge Suite placeholder will appear in feeds and challenge cards.</Card> : null}<UploadGallery form={form} userId={userId} updateMedia={updateMedia} track={track} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} className="mt-6" /></section>;
}

function UploadGallery({ form, userId, updateMedia, track, mediaUploadDisabled, mediaUploadDisabledReason, className = "" }: { form: FormState; userId: string; updateMedia: (urlField: keyof FormState, pathField: keyof FormState, url: string, metadata?: { path: string }) => void; track: (field: string) => (status: MediaUploadStage) => void; mediaUploadDisabled: boolean; mediaUploadDisabledReason: string; className?: string }) {
  return <div className={`${className} space-y-7`}>
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-xl font-black text-white">Images</h3><p className="mt-1 text-sm text-slate-400">{mediaUploadDisabled ? "Media skipped for now. Uploads can be restored after Firebase Storage is connected." : "Add up to 3 challenge images. At least one image is required."}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${mediaUploadDisabled ? "bg-white/10 text-slate-300" : "bg-[var(--gold)] text-black"}`}>{mediaUploadDisabled ? "Optional now" : "1 required"}</span></div>
      {mediaUploadDisabled ? <p className="mt-3 rounded-[8px] border border-yellow-500/25 bg-yellow-500/5 p-3 text-sm font-bold text-yellow-100">Publishing without media. No upload request will be attempted.</p> : !form.coverImageUrl || !form.coverImagePath ? <p className="mt-3 rounded-[8px] border border-yellow-500/25 bg-yellow-500/5 p-3 text-sm font-bold text-yellow-100">Add at least one challenge image to continue.</p> : null}
      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        <UploadPanel icon={<ImageIcon size={20} />} title="Image 1" purpose="Primary cover image used on challenge cards and detail pages." required={!mediaUploadDisabled}><MediaUploadField label="Cover image" value={form.coverImageUrl} onChange={(url, metadata) => updateMedia("coverImageUrl", "coverImagePath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "banner")} kind="image" buttonLabel="Browse cover image" required={!mediaUploadDisabled} disabled={mediaUploadDisabled} disabledReason={mediaUploadDisabledReason} onStatusChange={track("coverImageUrl")} /></UploadPanel>
        <UploadPanel icon={<ImageIcon size={20} />} title="Image 2" purpose="Optional gallery / promo image for campaign surfaces when supported."><MediaUploadField label="Gallery / promo image" value={form.promoImageUrl} onChange={(url, metadata) => updateMedia("promoImageUrl", "promoImagePath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "gallery")} kind="image" buttonLabel="Browse image" disabled={mediaUploadDisabled} disabledReason={mediaUploadDisabledReason} onStatusChange={track("promoImageUrl")} /></UploadPanel>
        <UploadPanel icon={<ImageIcon size={20} />} title="Image 3" purpose="Optional gallery preview. Backend gallery display will be connected later."><MediaUploadField label="Gallery image" value={form.galleryImageUrl} onChange={(url, metadata) => updateMedia("galleryImageUrl", "galleryImagePath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "gallery")} kind="image" buttonLabel="Browse gallery image" disabled={mediaUploadDisabled} disabledReason={mediaUploadDisabledReason} onStatusChange={track("galleryImageUrl")} /></UploadPanel>
      </div>
    </div>
    <div>
      <h3 className="text-xl font-black text-white">Video</h3>
      <p className="mt-1 text-sm text-slate-400">Optional intro video or trailer. You can continue without video.</p>
      <div className="mt-4 max-w-md"><UploadPanel icon={<Video size={20} />} title="Intro video / trailer" purpose="Optional short video to explain the challenge."><MediaUploadField label="Intro video / trailer" value={form.trailerVideoUrl} onChange={(url, metadata) => updateMedia("trailerVideoUrl", "trailerVideoPath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "video")} kind="video" buttonLabel="Browse trailer video" disabled={mediaUploadDisabled} disabledReason={mediaUploadDisabledReason} onStatusChange={track("trailerVideoUrl")} /></UploadPanel></div>
    </div>
    <div>
      <h3 className="text-xl font-black text-white">Documents</h3>
      <p className="mt-1 text-sm text-slate-400">Add up to 2 optional documents. Challenge document persistence needs backend support.</p>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <DocumentSlot title="Document 1" value={form.documentOneUrl} onChange={(url, metadata) => updateMedia("documentOneUrl", "documentOnePath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "documents")} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} onStatusChange={track("documentOneUrl")} />
        <DocumentSlot title="Document 2" value={form.documentTwoUrl} onChange={(url, metadata) => updateMedia("documentTwoUrl", "documentTwoPath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "documents")} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} onStatusChange={track("documentTwoUrl")} />
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

function DocumentSlot({ title, value, onChange, storagePath, mediaUploadDisabled = false, mediaUploadDisabledReason, onStatusChange }: { title: string; value: string; onChange: (url: string, metadata?: { path: string }) => void; storagePath: string; mediaUploadDisabled?: boolean; mediaUploadDisabledReason: string; onStatusChange: (status: MediaUploadStage) => void }) {
  return <UploadPanel icon={<FileText size={20} />} title={title} purpose="Optional rules, brief, or reference document for participants when backend document storage is connected.">
    <MediaUploadField label={title} value={value} onChange={onChange} storagePath={storagePath} kind="document" buttonLabel="Browse document" disabled={mediaUploadDisabled} disabledReason={mediaUploadDisabledReason} onStatusChange={onStatusChange} helperText={mediaUploadDisabled ? "Documents are optional and no upload request will be attempted while storage is disabled." : "Documents are stored as optional challenge metadata. Public document display remains a future backend/UI step."} />
  </UploadPanel>;
}

function Helper({ mode, step }: { mode: Mode; step: number }) {
  const copy = mode === "private" && step === 1 ? ["Control who can enter", "Private challenges are invite-only.", "Share access only with intended participants.", "Use approval when entries need review."] : step === 0 ? ["Start with a clear challenge", "Make the goal easy to understand.", "Tell competitors what they are joining.", "Keep the title short and specific."] : step >= 4 ? ["Review before publishing", "Preview without saving records.", "Publish only when ready.", "Unsupported premium fields stay locked."] : ["Build a fair challenge", "Keep rules simple.", "Guide strong submissions.", "Keep timelines clear."];
  return <Card className="h-fit p-5 lg:sticky lg:top-24"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Builder Guide</p><h2 className="mt-3 text-xl font-black text-white">{copy[0]}</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">{copy.slice(1).map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]" /><span>{item}</span></li>)}</ul></Card>;
}

function Checklist({ readiness, uploadInProgress, uploadFailed, requiredImageMissing, mediaUploadDisabled, className = "" }: { readiness: ChallengeValidationResult; uploadInProgress: boolean; uploadFailed: boolean; requiredImageMissing: boolean; mediaUploadDisabled: boolean; className?: string }) {
  const blocking = readiness.errors.filter((issue) => issue.severity === "error").map((issue) => {
    if (issue.code === "REQUIRED_BANNER" && mediaUploadDisabled) return null;
    if (issue.code === "REQUIRED_BANNER" && uploadInProgress) return { ...issue, message: "Please wait for your image upload to finish." };
    if (issue.code === "REQUIRED_BANNER" && uploadFailed) return { ...issue, message: "Please retry the failed image upload before publishing." };
    return issue;
  }).filter((issue): issue is NonNullable<typeof issue> => Boolean(issue));
  if (requiredImageMissing && uploadInProgress && !blocking.some((issue) => issue.code === "REQUIRED_BANNER")) blocking.unshift({ code: "REQUIRED_BANNER", field: "coverImageUrl", step: "Media", message: "Please wait for your image upload to finish.", severity: "error" });
  if (requiredImageMissing && uploadFailed && !blocking.some((issue) => issue.code === "REQUIRED_BANNER")) blocking.unshift({ code: "REQUIRED_BANNER", field: "coverImageUrl", step: "Media", message: "Please retry the failed image upload before publishing.", severity: "error" });
  if (!blocking.length) return <Card className={className + " border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100"}>{mediaUploadDisabled ? "Ready to publish without media. The existing server validation will check all non-media requirements again before saving." : "Ready to publish. The existing server validation will check this again before saving."}</Card>;
  return <Card className={className + " border-yellow-500/30 bg-yellow-500/5 p-4"}><p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--gold)]">Publish checklist</p><h3 className="mt-1 text-lg font-black text-white">Complete {readiness.missingCount} item{readiness.missingCount === 1 ? "" : "s"}</h3><ul className="mt-3 space-y-1 text-sm text-slate-300">{blocking.slice(0, 5).map((issue) => <li key={issue.code + issue.field}>- {issue.message}</li>)}</ul></Card>;
}

function Preview({ mode, form, onClose, onPublish, publishDisabled, publishLabel }: { mode: Mode; form: FormState; onClose: () => void; onPublish: () => void; publishDisabled: boolean; publishLabel: string }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="challenge-preview-title"><Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Preview</p><h2 id="challenge-preview-title" className="mt-2 text-2xl font-black">{form.title || "Untitled challenge"}</h2><p className="mt-2 text-sm text-slate-400">{mode === "private" ? "Private / invite-only" : "Public"} - {form.category || "Category not set"}</p></div><button className="rounded-[8px] bg-white/10 p-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" onClick={onClose} aria-label="Close preview"><X size={18} /></button></div>{form.coverImageUrl ? <img src={form.coverImageUrl} alt="" className="mt-5 aspect-[16/9] w-full rounded-[8px] object-cover" /> : <ChallengeSuitePlaceholder className="mt-5 aspect-[16/9] w-full rounded-[8px]" label="Live Challenge" />}<p className="mt-5 whitespace-pre-line text-sm leading-7 text-slate-300">{form.description || "Challenge description will appear here."}</p><div className="mt-7 grid gap-3 sm:flex sm:justify-end"><Button variant="secondary" onClick={onClose}>Back to editing</Button><Button onClick={onPublish} disabled={publishDisabled}>{publishLabel}</Button></div></Card></div>;
}

function ChallengeSuitePlaceholder({ className = "", label = "Challenge Suite" }: { className?: string; label?: string }) {
  return <div className={`flex items-center justify-center overflow-hidden border border-[var(--gold)]/20 bg-[radial-gradient(circle_at_top,rgba(246,198,75,.22),transparent_46%),linear-gradient(135deg,#161616,#050505)] px-4 text-center ${className}`}>
    <div>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--gold)]">Challenge Suite</p>
      <p className="mt-2 text-2xl font-black text-white">{label}</p>
    </div>
  </div>;
}
