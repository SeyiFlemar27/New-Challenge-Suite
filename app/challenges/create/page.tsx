"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { CheckCircle2, LockKeyhole, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { redistributeSponsorship } from "@/lib/legal";
import { validateChallengeForPublish, type ChallengeValidationResult } from "@/lib/server/challenge-validation";
// Publish validation is shared with the server; the API remains the final authority.

import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getPlanExperience, getUserPlanAccess, type PlanExperience } from "@/lib/plan-access";
import { createChallenge, fetchChallengeUsage } from "@/lib/api/services";
import { HostCompetitionWizard } from "@/components/host/host-competition-wizard";
import { MediaUploadField, type MediaUploadStage } from "@/components/media-upload-field";

const steps = ["Basic Details", "Format & Rules", "Dates & Eligibility", "Prize Foundation", "Media", "Preview & Publish"];

function dateInput(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return `${date.toISOString().slice(0, 10)}T12:00`;
}

export default function CreateChallengePage() {
  return (
    <Suspense fallback={<CreateChallengeFallback />}>
      <CreateChallengeWizard />
    </Suspense>
  );
}

function CreateChallengeFallback() {
  return (
    <AppShell>
      <Card className="mx-auto max-w-[960px] p-6 sm:p-8 lg:p-10">
        <PageTitle title="Create New Challenge" subtitle="Loading challenge wizard..." />
      </Card>
    </AppShell>
  );
}

function CreateChallengeWizard() {
  const { user, loading: userLoading } = useCurrentUser();
  const planProfile = { planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType };
  const planAccess = getUserPlanAccess(planProfile);
  const planExperience = getPlanExperience(planProfile);
  const selectedAccountType = user?.selectedAccountType ?? user?.role ?? user?.accountType;
  const freePlan = planExperience.planId === "free";
  const freeBasicUser = freePlan && selectedAccountType !== "sponsor";
  const [freeUsage, setFreeUsage] = useState({ used: 0, limit: 3, remaining: 3, loaded: false });
  const defaultType = "Public Challenge";
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<"wizard" | "success">("wizard");
  const [draftSaved, setDraftSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [serverPublishValidation, setServerPublishValidation] = useState<ChallengeValidationResult | null>(null);
  const [createdChallengeId, setCreatedChallengeId] = useState("");
  const [form, setForm] = useState({
    title: "The Ultimate Showdown",
    category: "Fitness",
    customCategory: "",
    type: defaultType,
    description: "Describe the goal of this challenge.",
    competitionFormat: "Entry Competition",
    bestOf: "1 Rounder",
    submissionTypes: ["image"],
    prizeType: "bragging_rights",
    prizeTitle: "",
    prizeDescription: "",
    prizeValue: "0",
    prizeDeliveryNotes: "",
    numberOfWinners: "1",
    winnerSelection: "highest_votes",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    entryFee: "0",
    startsAt: dateInput(1),
    submissionDeadline: dateInput(5),
    votingDeadline: dateInput(6),
    endsAt: dateInput(7),
    coverImageUrl: "",
    coverImagePath: "",
    promoImageUrl: "",
    promoImagePath: "",
    trailerVideoUrl: "",
    trailerVideoPath: "",
    promoVideoUrl: "",
    promoVideoPath: "",
    standardRules: "Respect all participants.\nSubmit original work.\nFollow the published voting policy.",
    policyTerms: "Challenge entries remain subject to platform review and community standards.",
    challengeGuidelines: "Keep submissions relevant to the challenge brief and accepted media types.",
    sponsorEnabled: "false",
    sponsorSlots: "2",
    minimumSponsorshipAmount: "0",
    sponsorPlacementOptions: ["Challenge page logo", "CTA button"],
    sponsorPackageName: "Main Sponsor",
    sponsorPackagePrice: "0",
    sponsorPackageSlots: "1",
    sponsorPackageBenefits: "Challenge page logo\nCTA placement\nWinner announcement mention",
    isLiveEvent: "false",
    venueName: "",
    eventAddress: "",
    eventCity: "",
    eventState: "",
    eventCountry: "",
    eventMapUrl: "",
    eventCapacity: "50",
    externalLiveUrl: "",
    externalLiveProvider: "",
    externalLiveStatus: "not_ready",
    externalLiveOpensAt: "",
    externalLiveCtaLabel: "Watch live on partner site",
    tournamentType: "none",
    divisionFormat: "2",
    maxParticipants: "50",
    scoringMode: "best_of",
    bestOfRounds: "3",
    pointsToWin: "10",
    timerEnabled: "false",
    timerDuration: "300",
    roundDuration: "300",
    judgeScoringEnabled: "false",
    weightedVotes: "false",
    requiresSubmissionApproval: "false"
  });
  const [mediaUploadStatuses, setMediaUploadStatuses] = useState<Record<string, MediaUploadStage>>({});
  const mediaUploadInProgress = Object.values(mediaUploadStatuses).some((status) => ["preparing", "uploading", "processing"].includes(status));
  const mediaUploadFailed = Object.values(mediaUploadStatuses).some((status) => status === "failed");
  const trackMediaStatus = (field: string) => (status: MediaUploadStage) => {
    setMediaUploadStatuses((current) => ({ ...current, [field]: status }));
    setServerPublishValidation(null);
  };
  function updateMedia(urlField: keyof typeof form, pathField: keyof typeof form, url: string, metadata?: { path: string }) {
    setForm((current) => ({ ...current, [urlField]: url, [pathField]: metadata?.path ?? "" }));
    setError("");
    setServerPublishValidation(null);
  }
  const [allocations, setAllocations] = useState([
    { bucket: "Platform Operations", percent: 12, enabled: true },
    { bucket: "Creator Share", percent: 3, enabled: true },
    { bucket: "Community Pool", percent: 0, enabled: false }
  ]);
  const normalized = useMemo(() => redistributeSponsorship(15, allocations), [allocations]);
  const braggingRights = form.prizeType === "bragging_rights" || form.prizeType === "none";
  const monetizedLocked = !planAccess.canCreatePaidChallenges && !braggingRights && Number(form.entryFee) > 0;
  const prizeLocked = !planAccess.canCreatePrizeChallenges && !braggingRights;
  const privateLocked = false;
  const draftOnlyFormat = form.competitionFormat.includes("Program") || form.competitionFormat.includes("Campaign");

  useEffect(() => {
    if (!userLoading && freeBasicUser) {
      fetchChallengeUsage().then((result) => {
        if (result.ok && result.data) {
          setFreeUsage({ ...result.data.freeBasic, loaded: true });
        } else {
          setFreeUsage((current) => ({ ...current, loaded: true }));
        }
      });
    }
  }, [freeBasicUser, userLoading]);

  function update(field: keyof typeof form, value: string | string[]) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setServerPublishValidation(null);
  }

  function toggleSubmission(type: string) {
    update("submissionTypes", form.submissionTypes.includes(type) ? form.submissionTypes.filter((item) => item !== type) : [...form.submissionTypes, type]);
  }

  function validateCurrentStep() {
    if (step === 0 && (!form.title.trim() || !form.description.trim())) return "Title and description are required.";
    if (step === 0 && form.category === "Other" && !form.customCategory.trim()) return "Custom category is required.";
    if (step === 1 && form.submissionTypes.length === 0) return "Select at least one submission type.";
    if (step === 2) {
      const startsAt = new Date(form.startsAt);
      const endsAt = new Date(form.endsAt);
      const submissionDeadline = new Date(form.submissionDeadline);
      const votingDeadline = new Date(form.votingDeadline);
      if (startsAt >= endsAt) return "Start date must be before end date.";
      if (submissionDeadline > votingDeadline) return "Submission deadline must not be after voting deadline.";
      if (votingDeadline > endsAt) return "Voting deadline must not be after end date.";
      if (votingDeadline <= startsAt) return "Voting deadline must be after start date.";
    }
    return "";
  }

  function next() {
    const problem = validateCurrentStep();
    if (problem) {
      setError(problem);
      return;
    }
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  function goToStep(targetStep: number) {
    if (targetStep <= step) {
      setStep(targetStep);
      return;
    }
    const problem = validateCurrentStep();
    if (problem) {
      setError(problem);
      return;
    }
    setStep(Math.min(targetStep, step + 1));
  }

  function challengePayload(publish: boolean) {
    return {
      title: form.title,
      description: form.description,
      category: form.category,
      customCategory: form.category === "Other" ? form.customCategory : undefined,
      type: form.type,
      visibility: "public",
      acceptedSubmissionTypes: form.submissionTypes,
      competitionFormat: form.competitionFormat,
      bestOf: form.bestOf,
      prizeType: form.prizeType,
      prizeTitle: form.prizeTitle,
      prizeDescription: form.prizeDescription,
      prizeValue: Number(form.prizeValue || 0),
      prizeDeliveryNotes: form.prizeDeliveryNotes,
      numberOfWinners: Number(form.numberOfWinners || 1),
      winnerSelection: form.winnerSelection,
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
      timeZone: form.timeZone,
      coverImageUrl: form.coverImageUrl,
      coverImagePath: form.coverImagePath,
      promoImageUrl: form.promoImageUrl,
      promoImagePath: form.promoImagePath,
      trailerVideoUrl: form.trailerVideoUrl,
      trailerVideoPath: form.trailerVideoPath,
      promoVideoUrl: form.promoVideoUrl,
      promoVideoPath: form.promoVideoPath,
      standardRules: form.standardRules,
      policyTerms: form.policyTerms,
      challengeGuidelines: form.challengeGuidelines,
      sponsorEnabled: form.sponsorEnabled === "true",
      sponsorSlots: Number(form.sponsorSlots || 0),
      minimumSponsorshipAmount: Number(form.minimumSponsorshipAmount || 0),
      sponsorPlacementOptions: form.sponsorPlacementOptions,
      sponsorPackages: form.sponsorEnabled === "true" ? [{
        id: "main-sponsor",
        name: form.sponsorPackageName,
        price: Number(form.sponsorPackagePrice || 0),
        slotLimit: Number(form.sponsorPackageSlots || 1),
        benefits: form.sponsorPackageBenefits.split("\n").map((item) => item.trim()).filter(Boolean),
        logoPlacement: true,
        ctaButton: true,
        leaderboardMention: true,
        winnerAnnouncementMention: true,
        feedBannerPlacement: false,
        campaignReportAvailable: true
      }] : [],
      isLiveEvent: form.isLiveEvent === "true",
      venueName: form.venueName,
      eventAddress: form.eventAddress,
      eventCity: form.eventCity,
      eventState: form.eventState,
      eventCountry: form.eventCountry,
      eventMapUrl: form.eventMapUrl,
      eventCapacity: Number(form.eventCapacity || 0),
      externalLiveUrl: form.externalLiveUrl,
      externalLiveProvider: form.externalLiveProvider,
      externalLiveStatus: form.externalLiveStatus,
      externalLiveOpensAt: form.externalLiveOpensAt,
      externalLiveCtaLabel: form.externalLiveCtaLabel,
      tournamentType: form.tournamentType,
      divisionFormat: Number(form.divisionFormat),
      maxParticipants: Number(form.maxParticipants),
      scoringMode: form.scoringMode,
      bestOfRounds: Number(form.bestOfRounds),
      pointsToWin: Number(form.pointsToWin),
      timerEnabled: form.timerEnabled === "true",
      timerDuration: Number(form.timerDuration),
      roundDuration: Number(form.roundDuration),
      judgeScoringEnabled: form.judgeScoringEnabled === "true",
      requiresSubmissionApproval: form.requiresSubmissionApproval === "true",
      votingSettings: { allowFreeVotes: true, allowDoroCoinVotes: true, weightedVotes: planExperience.features.performance_analytics && form.weightedVotes === "true" },
      publish
    };
  }

  const localPublishReadiness = validateChallengeForPublish(challengePayload(true) as Record<string, unknown>, { mode: "publish", userId: user?.uid });
  const publishReadiness = serverPublishValidation ?? localPublishReadiness;
  const publishBlocked = mediaUploadInProgress || mediaUploadFailed || draftOnlyFormat || !localPublishReadiness.valid;
  const publishBlockLabel = mediaUploadInProgress ? "Upload in Progress" : mediaUploadFailed ? "Fix Upload" : draftOnlyFormat ? "Draft Only" : !localPublishReadiness.valid ? `Complete ${localPublishReadiness.missingCount} Item${localPublishReadiness.missingCount === 1 ? "" : "s"}` : "Publish";

  function stepFromIssue(stepName: string) {
    const normalizedStep = stepName.toLowerCase();
    if (normalizedStep.includes("basic")) return 0;
    if (normalizedStep.includes("format") || normalizedStep.includes("access")) return 1;
    if (normalizedStep.includes("schedule") || normalizedStep.includes("live event") || normalizedStep.includes("tournament")) return 2;
    if (normalizedStep.includes("prize")) return 3;
    if (normalizedStep.includes("media")) return 4;
    return 5;
  }

  function openPublishChecklist() {
    const first = publishReadiness.errors.find((issue) => issue.severity === "error") ?? publishReadiness.errors[0];
    if (first) setStep(stepFromIssue(first.step));
  }

  async function saveDraft() {
    setSaving(true);
    setError("");
    const result = await createChallenge(challengePayload(false));
    setSaving(false);
    if (!result.ok) {
      setError(result.message || "Draft could not be saved.");
      return;
    }
    setDraftSaved(true);
  }

  async function publish() {
    setServerPublishValidation(null);
    if (mediaUploadInProgress) {
      setError("Wait for media uploads to complete before publishing.");
      openPublishChecklist();
      return;
    }
    if (mediaUploadFailed) {
      setError("Resolve failed media uploads or remove them before publishing.");
      openPublishChecklist();
      return;
    }
    if (draftOnlyFormat) {
      setError("This advanced format is a foundation-only builder in the current version. Save it as a draft until its full workflow is activated.");
      return;
    }
    if (!localPublishReadiness.valid) {
      setError(`Complete ${localPublishReadiness.missingCount} required item${localPublishReadiness.missingCount === 1 ? "" : "s"} before publishing.`);
      openPublishChecklist();
      return;
    }
    setSaving(true);
    const response = await createChallenge(challengePayload(true));
    setSaving(false);
    if (!response.ok) {
      const nextValidation = (response as any).details?.publishValidation as ChallengeValidationResult | undefined;
      if (nextValidation) setServerPublishValidation(nextValidation);
      setError(response.message || "Challenge could not be published.");
      if (nextValidation?.errors?.length) setStep(stepFromIssue(nextValidation.errors[0].step));
      return;
    }
    const challenge = response.data?.challenge as { id?: string } | undefined;
    setCreatedChallengeId(challenge?.id ?? "");
    setStage("success");
  }

  if (userLoading) return <CreateChallengeFallback />;

  if (stage === "success") {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-6 text-center sm:p-8 lg:p-10">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400 sm:h-20 sm:w-20" />
          <h1 className="mt-6 text-3xl font-black sm:text-4xl">Challenge Published</h1>
          <p className="mt-3 text-slate-300">Your challenge was saved with the appropriate review status. Advanced, physical-event, sponsor, and prize settings remain subject to review.</p>
          <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap sm:justify-center">
            <LinkButton href={createdChallengeId ? `/challenges/${createdChallengeId}` : "/challenges"} className="w-full sm:w-auto">View Challenge</LinkButton>
            <LinkButton href="/challenges/create" variant="secondary" className="w-full sm:w-auto">Create Another</LinkButton>
            <LinkButton href="/my-challenges" variant="secondary" className="w-full sm:w-auto">My Challenges</LinkButton>
            <LinkButton href="/dashboard" variant="ghost" className="w-full sm:w-auto">Go to Dashboard</LinkButton>
          </div>
        </Card>
      </AppShell>
    );
  }

  if (user?.accountType === "sponsor") {
    return (
      <AppShell>
        <Card className="mx-auto mt-14 max-w-2xl p-8 text-center">
          <LockKeyhole className="mx-auto h-12 w-12 text-[var(--gold)]" />
          <h1 className="mt-5 text-3xl font-black">Use Brand Command Center</h1>
          <p className="mt-3 text-slate-300">Sponsor accounts create and manage campaign foundations from the dedicated sponsor experience.</p>
          <LinkButton href="/sponsor/dashboard" className="mt-6">Open Brand Command Center</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (freeBasicUser) {
    const usedAllFreeChallenges = freeUsage.loaded && freeUsage.remaining <= 0;
    return (
      <AppShell>
        <Card className="mx-auto max-w-3xl p-5 sm:p-7 lg:p-9">
          <PageTitle title="Create a Basic Public Challenge" subtitle="Free accounts can publish up to three lifetime public, non-monetized challenges before upgrading." />
          <p className="mt-4 rounded-[8px] border border-[var(--gold)]/20 bg-[var(--gold)]/5 px-4 py-3 text-sm font-bold text-[var(--gold-2)]">Free Basic Challenges Used: {freeUsage.loaded ? freeUsage.used : "..."} of {freeUsage.limit}. Basic Challenges Remaining: {freeUsage.loaded ? freeUsage.remaining : "..."}. This lifetime limit is enforced on the server.</p>
          {usedAllFreeChallenges ? <Card className="mt-6 border-yellow-500/30 bg-yellow-500/5 p-5 text-center"><LockKeyhole className="mx-auto text-[var(--gold)]" /><h2 className="mt-3 text-2xl font-black">Upgrade to keep creating</h2><p className="mt-2 text-sm leading-6 text-slate-300">You have used all three lifetime Free Basic Challenges. Creator and Host plans unlock more creation tools.</p><LinkButton href="/subscriptions" className="mt-5">Upgrade to Creator</LinkButton></Card> : null}
          <div className="mt-8 grid gap-6">
            <Field label="Challenge Title"><input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Category"><select className={inputClass} value={form.category} onChange={(event) => update("category", event.target.value)}>{["Fitness", "Creative", "Photography", "Food", "Gaming", "Other"].map((category) => <option key={category}>{category}</option>)}</select></Field>
              <Field label="Submission Type"><select className={inputClass} value={form.submissionTypes[0]} onChange={(event) => setForm((current) => ({ ...current, submissionTypes: [event.target.value] }))}><option value="image">Image</option><option value="video">Video</option></select></Field>
            </div>
            <Field label="Description"><textarea className={textareaClass} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field>
            <Field label="Rules"><textarea className={textareaClass} value={form.standardRules} onChange={(event) => update("standardRules", event.target.value)} /></Field>
            <MediaUploadField label="Cover Image" value={form.coverImageUrl} onChange={(url, metadata) => updateMedia("coverImageUrl", "coverImagePath", url, metadata)} storagePath={`challenges/drafts/${user?.uid ?? "anonymous"}/banner`} required onStatusChange={trackMediaStatus("coverImageUrl")} kind="image" buttonLabel="Upload Cover Image" helperText="Free basic challenges use uploaded public cover art only after secure Storage rules are published." />
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Start Date"><input className={inputClass} type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /></Field>
              <Field label="Entry Deadline"><input className={inputClass} type="datetime-local" value={form.submissionDeadline} onChange={(event) => update("submissionDeadline", event.target.value)} /></Field>
              <Field label="Voting Deadline"><input className={inputClass} type="datetime-local" value={form.votingDeadline} onChange={(event) => update("votingDeadline", event.target.value)} /></Field>
              <Field label="End Date"><input className={inputClass} type="datetime-local" value={form.endsAt} onChange={(event) => update("endsAt", event.target.value)} /></Field>
            </div>
            <Card className="border-emerald-500/20 bg-emerald-500/5 p-4 text-sm leading-6 text-slate-300">Public visibility only. Entry fees, prize pools, sponsorships, tournaments, live events, revenue sharing, Prediction Arena, boosts, advanced voting, and premium analytics are unavailable in this free flow.</Card>
            {error ? <p className="rounded-[8px] bg-red-950/50 p-4 text-red-200">{error}</p> : null}
            <PublishChecklist readiness={publishReadiness} onOpenIssue={openPublishChecklist} />
            {draftSaved ? <p className="rounded-[8px] bg-emerald-950/40 p-4 text-emerald-200">Draft saved.</p> : null}
            <div className="grid gap-3 border-t border-white/10 pt-6 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
              <LinkButton href="/subscriptions" variant="secondary">Upgrade for More Creator Tools</LinkButton>
              <div className="grid gap-3 sm:flex">
                <Button variant="secondary" onClick={saveDraft} disabled={saving}><Save size={17} /> Save Draft</Button>
                <Button onClick={publish} disabled={saving || usedAllFreeChallenges || publishBlocked}>{saving ? "Publishing..." : publishBlocked ? publishBlockLabel : "Publish Basic Challenge"}</Button>
              </div>
            </div>
          </div>
        </Card>
      </AppShell>
    );
  }

  if (planExperience.planId === "host") {
    return <HostCompetitionWizard initialCompetitionType="Online Challenge" />;
  }

  return (
    <AppShell>
      <Card className="mx-auto max-w-[960px] border-yellow-500/50 p-4 gold-glow sm:p-6 lg:p-10">
        <PageTitle title="Create Challenge" subtitle="Build a normal online challenge. Private, live, tournament, and hybrid builders now live in their own workspace sections." />
        <Card className="mt-6 border-[var(--gold)]/30 bg-[var(--gold)]/10 p-4 sm:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--gold-2)]">{planExperience.dashboardName} - {planExperience.badgeLabel}</div>
              <p className="mt-1 text-sm text-slate-300">{planExperience.challengeLimitLabel}. {planExperience.privateChallengeLimitLabel}. Paid-entry prize pools remain disabled.</p>
            </div>
            {!planAccess.isCreatorPro ? <LinkButton href="/subscriptions" variant="secondary" className="w-full shrink-0 md:w-auto">Upgrade Plan</LinkButton> : null}
          </div>
        </Card>
        {privateLocked || monetizedLocked || prizeLocked ? (
          <Card className="mt-4 border-yellow-500/30 bg-yellow-950/20 p-4 sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-3 text-yellow-100">
                <LockKeyhole className="mt-1 shrink-0" size={20} />
                <div className="min-w-0">
                  <div className="font-black">Some selected options require an upgraded creator plan</div>
                  <p className="mt-1 text-sm text-yellow-100/80">You can upgrade, or continue with a free public non-monetized challenge.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:flex sm:flex-wrap md:justify-end">
                <LinkButton href="/subscriptions" className="w-full sm:w-auto">Upgrade Plan</LinkButton>
                <Button className="w-full sm:w-auto" variant="secondary" onClick={() => {
                  update("type", "Public Challenge");
                  update("prizeType", "bragging_rights");
                  update("entryFee", "0");
                }}>Continue with Free Public Challenge</Button>
              </div>
            </div>
          </Card>
        ) : null}
        <div className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {steps.map((label, index) => <button key={label} onClick={() => goToStep(index)} className={`min-h-11 rounded-[8px] p-3 text-xs font-black leading-tight ${step === index ? "bg-[var(--gold)] text-black" : "bg-[#1b1b1b] text-slate-300"}`}>{index + 1}. {label}</button>)}
        </div>

        <div className="mt-8 min-h-[360px] sm:min-h-[470px]">
          {step === 0 ? <StepBasic form={form} update={update} planAccess={planAccess} /> : null}
          {step === 1 ? <StepFormat form={form} update={update} toggleSubmission={toggleSubmission} experience={planExperience} /> : null}
          {step === 2 ? <StepDates form={form} update={update} /> : null}
          {step === 3 ? <StepPrize form={form} update={update} braggingRights={braggingRights} normalized={normalized} setAllocations={setAllocations} planAccess={planAccess} /> : null}
          {step === 4 ? <StepMedia form={form} updateMedia={updateMedia} userId={user?.uid ?? "anonymous"} trackMediaStatus={trackMediaStatus} /> : null}
          {step === 5 ? <StepPreview form={form} /> : null}
        </div>

        {error ? <p className="mt-5 rounded-[8px] bg-red-950/50 p-4 text-red-200">{error}</p> : null}
        <PublishChecklist readiness={publishReadiness} onOpenIssue={openPublishChecklist} className="mt-5" />
        {draftSaved ? <p className="mt-5 rounded-[8px] bg-emerald-950/40 p-4 text-emerald-200">Draft saved locally.</p> : null}

        <div className="mt-8 grid gap-3 border-t border-white/10 pt-6 sm:flex sm:flex-wrap sm:justify-between">
          <Button className="w-full sm:w-auto" variant="secondary" onClick={saveDraft} disabled={saving}><Save size={17} /> {saving ? "Saving..." : "Save Draft"}</Button>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Button className="w-full sm:w-auto" variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(value - 1, 0))}>Back</Button>
            {step < steps.length - 1 ? <Button className="w-full sm:w-auto" onClick={next}>Next</Button> : <Button className="w-full sm:w-auto" onClick={publish} disabled={saving || publishBlocked}>{saving ? "Publishing..." : publishBlocked ? publishBlockLabel : "Publish Publicly"}</Button>}
          </div>
        </div>
      </Card>
    </AppShell>
  );
}

function StepBasic({ form, update, planAccess }: { form: any; update: any; planAccess: ReturnType<typeof getUserPlanAccess> }) {
  const categories = ["Fitness", "Creative", "Photography", "Food", "Gaming", "Other"];
  return <section><h2 className="text-xl font-black sm:text-2xl">Step 1: Basic Details</h2><Card className="mt-4 border-emerald-500/20 bg-emerald-500/5 p-4 text-sm leading-6 text-slate-300">This builder creates a normal public online challenge. Use Private / Exclusive, Live Events, Tournaments, or Hybrid Competition from their dedicated workspace sections.</Card><div className="mt-6 grid gap-5 md:grid-cols-[1fr_260px]"><Field label="Challenge Title"><input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field><Field label="Public Category"><select className={inputClass} value={form.category} onChange={(event) => update("category", event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field></div>{form.category === "Other" ? <div className="mt-5"><Field label="Custom Category"><input className={inputClass} value={form.customCategory} onChange={(event) => update("customCategory", event.target.value)} /></Field></div> : null}<div className="mt-5"><Field label="Description"><textarea className={textareaClass} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field></div>{!planAccess.canCreatePrivateChallenges ? <Card className="mt-5 border-dashed p-4 text-sm text-[#8fa6ca]"><LockKeyhole className="mb-2 text-[var(--gold)]" size={18} /> Private Challenges are a Creator feature. Upgrade to Creator to create invite-only challenges with access approval.</Card> : null}</section>;
}

function StepFormat({ form, update, toggleSubmission, experience }: { form: any; update: any; toggleSubmission: (type: string) => void; experience: PlanExperience }) {
  const formats = ["Group Challenge", "Entry Competition"];
  if (experience.features.ranked_challenges) formats.push("Ranked Challenge");
  if (experience.features.host_control_center) formats.push("1 vs 1 Battle");
  if (experience.features.programs) formats.push("Program Challenge (Draft Foundation)", "Campaign Challenge (Draft Foundation)");
  const lockedFormats = [
    !experience.features.ranked_challenges ? "Ranked Challenge - Pro" : null,
    !experience.features.host_control_center ? "1 vs 1 Battle - Host" : null,
    !experience.features.programs ? "Programs / Campaigns - Enterprise" : null
  ].filter(Boolean);

  return (
    <section>
      <h2 className="text-xl font-black sm:text-2xl">Step 2: Format & Rules</h2>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Competition Format">
          <select className={inputClass} value={form.competitionFormat} onChange={(event) => update("competitionFormat", event.target.value)}>
            {formats.map((format) => <option key={format}>{format}</option>)}
          </select>
        </Field>
        <Field label="Best Of"><select className={inputClass} value={form.bestOf} onChange={(event) => update("bestOf", event.target.value)}><option>1 Rounder</option><option>Best of 3</option><option>Best of 5</option></select></Field>
      </div>
      {lockedFormats.length ? <Card className="mt-4 border-dashed p-4 text-sm text-[#8fa6ca]"><LockKeyhole className="mb-2 text-[var(--gold)]" size={18} /> {lockedFormats.join(" - ")}</Card> : null}

      <div className="mt-6">
        <div className="mb-2 font-bold">Submission Type</div>
        <div className="grid gap-3 sm:grid-cols-2">{["image", "video"].map((type) => <label key={type} className="flex min-h-14 items-center gap-3 rounded-[8px] border border-white/10 bg-[#181818] px-4 py-4 font-bold"><input className="shrink-0" type="checkbox" checked={form.submissionTypes.includes(type)} onChange={() => toggleSubmission(type)} /> {type === "image" ? "Image uploads" : "Video uploads"}</label>)}</div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {["Time limit uploads", "Standard platform rules", "Voting policy acknowledgement", "Editable rules enabled"].map((rule) => <label key={rule} className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" defaultChecked /> <span>{rule}</span></label>)}
        <label className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" checked={form.weightedVotes === "true"} disabled={!experience.features.performance_analytics} onChange={(event) => update("weightedVotes", event.target.checked ? "true" : "false")} /> <span>Weighted vote multipliers {!experience.features.performance_analytics ? "(Pro plan+)" : ""}</span></label>
        <label className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" checked={form.requiresSubmissionApproval === "true"} disabled={!experience.features.submission_moderation} onChange={(event) => update("requiresSubmissionApproval", event.target.checked ? "true" : "false")} /> <span>Submission approval control {!experience.features.submission_moderation ? "(Host plan+)" : ""}</span></label>
      </div>
      <div className="mt-6 grid gap-5 rounded-[8px] border border-white/10 p-4 md:grid-cols-2">
        <Field label="Standard Rules"><textarea className={textareaClass} value={form.standardRules} onChange={(event) => update("standardRules", event.target.value)} /></Field>
        <Field label="Policy / Terms"><textarea className={textareaClass} value={form.policyTerms} onChange={(event) => update("policyTerms", event.target.value)} /></Field>
        <Field label="Challenge Guidelines"><textarea className={textareaClass} value={form.challengeGuidelines} onChange={(event) => update("challengeGuidelines", event.target.value)} /></Field>
        <Card className="p-4 text-sm text-slate-300">Money-related rules, physical prizes, live events, and non-standard policies require platform review before public activation.</Card>
      </div>
      {form.competitionFormat.includes("Tournament") || form.competitionFormat.includes("1 vs 1") ? (
        <div className="mt-6 grid gap-5 rounded-[8px] border border-[var(--gold)]/20 bg-[var(--gold)]/5 p-4 md:grid-cols-2">
          <Field label="Bracket Type"><select className={inputClass} value={form.tournamentType} onChange={(event) => update("tournamentType", event.target.value)}><option value="one_vs_one">1v1</option><option value="group">Group Challenge</option></select></Field>
          <Field label="Division Format"><select className={inputClass} value={form.divisionFormat} onChange={(event) => update("divisionFormat", event.target.value)}><option value="2">2 Divisions</option><option value="4">4 Divisions</option><option value="6">6 Divisions</option></select></Field>
          <Field label="Maximum Participants (50 max)"><input className={inputClass} type="number" min="2" max="50" value={form.maxParticipants} onChange={(event) => update("maxParticipants", event.target.value)} /></Field>
          <Field label="Scoring Mode"><select className={inputClass} value={form.scoringMode} onChange={(event) => update("scoringMode", event.target.value)}><option value="best_of">Best Of</option><option value="points">Points Based</option></select></Field>
          {form.scoringMode === "best_of" ? <Field label="Best Of"><select className={inputClass} value={form.bestOfRounds} onChange={(event) => update("bestOfRounds", event.target.value)}><option value="3">Best of 3</option><option value="5">Best of 5</option><option value="7">Best of 7</option></select></Field> : <Field label="Points To Win"><input className={inputClass} type="number" min="1" value={form.pointsToWin} onChange={(event) => update("pointsToWin", event.target.value)} /></Field>}
          <label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={form.timerEnabled === "true"} onChange={(event) => update("timerEnabled", event.target.checked ? "true" : "false")} /> Timer enabled</label>
          {form.timerEnabled === "true" ? <Field label="Timer Duration (seconds)"><input className={inputClass} type="number" min="1" value={form.timerDuration} onChange={(event) => update("timerDuration", event.target.value)} /></Field> : null}
        </div>
      ) : null}
    </section>
  );
}

function StepDates({ form, update }: { form: any; update: any }) {
  return (
    <section>
      <h2 className="text-xl font-black sm:text-2xl">Step 3: Dates & Eligibility</h2>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Challenge Start"><input className={inputClass} type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /></Field>
        <Field label="Entry / Submission Deadline"><input className={inputClass} type="datetime-local" value={form.submissionDeadline} onChange={(event) => update("submissionDeadline", event.target.value)} /></Field>
        <Field label="Voting End"><input className={inputClass} type="datetime-local" value={form.votingDeadline} onChange={(event) => update("votingDeadline", event.target.value)} /></Field>
        <Field label="Challenge End"><input className={inputClass} type="datetime-local" value={form.endsAt} onChange={(event) => update("endsAt", event.target.value)} /></Field>
      </div>
      <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-slate-300">Submission deadline must be on or before voting deadline. Voting deadline must be after start date and on or before end date.</Card>
      <div className="mt-6 grid gap-5 md:grid-cols-2"><label className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" /> Age restriction</label><Field label="Minimum Age"><input className={inputClass} type="number" placeholder="13" /></Field><Field label="Location Restrictions"><select className={inputClass}><option>No restriction</option><option>United States only</option><option>Nigeria only</option><option>Invite list only</option></select></Field><label className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" checked={form.isLiveEvent === "true"} onChange={(event) => update("isLiveEvent", event.target.checked ? "true" : "false")} /> Physical / live event</label></div>
      {form.isLiveEvent === "true" ? <div className="mt-6 grid gap-5 rounded-[8px] border border-[var(--gold)]/20 p-4 md:grid-cols-2"><Field label="Venue Name"><input className={inputClass} value={form.venueName} onChange={(event) => update("venueName", event.target.value)} /></Field><Field label="Address"><input className={inputClass} value={form.eventAddress} onChange={(event) => update("eventAddress", event.target.value)} /></Field><Field label="City"><input className={inputClass} value={form.eventCity} onChange={(event) => update("eventCity", event.target.value)} /></Field><Field label="State / Region"><input className={inputClass} value={form.eventState} onChange={(event) => update("eventState", event.target.value)} /></Field><Field label="Country"><input className={inputClass} value={form.eventCountry} onChange={(event) => update("eventCountry", event.target.value)} /></Field><Field label="Capacity"><input className={inputClass} type="number" min="1" value={form.eventCapacity} onChange={(event) => update("eventCapacity", event.target.value)} /></Field><Field label="Map Link (optional)"><input className={inputClass} value={form.eventMapUrl} onChange={(event) => update("eventMapUrl", event.target.value)} placeholder="https://..." /></Field><Card className="p-4 text-sm text-slate-300">Live-event sync remains hidden until platform approval. Event reminders are saved for a future notification worker.</Card></div> : null}
    </section>
  );
}

function StepPrize({ form, update, braggingRights, normalized, setAllocations, planAccess }: { form: any; update: any; braggingRights: boolean; normalized: any[]; setAllocations: any; planAccess: ReturnType<typeof getUserPlanAccess> }) {
  const sponsorEnabled = form.sponsorEnabled === "true";
  return (
    <section>
      <h2 className="text-xl font-black sm:text-2xl">Step 4: Prize Foundation</h2>
      <Card className="mt-4 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-slate-300"><LockKeyhole className="mb-2 text-[var(--gold)]" size={18} /> Paid-entry prize pools, cash payouts, automatic refunds, and sponsor money release are locked. Challenges are created as non-monetized or sponsor-ready metadata only.</Card>
      {!planAccess.canCreatePrizeChallenges ? <Card className="mt-4 border-dashed p-4 text-sm text-[#8fa6ca]">Free accounts can publish up to three lifetime basic public non-monetized challenges. Creator Plan or higher is required for sponsor-enabled, private, prize, or advanced settings.</Card> : null}
      <div className="mt-6 grid gap-6 md:grid-cols-2"><Field label="Prize Type"><select className={inputClass} value={form.prizeType} onChange={(event) => update("prizeType", event.target.value)}><option value="bragging_rights">Bragging Rights</option><option value="physical_product" disabled={!planAccess.canCreatePrizeChallenges}>Physical Product {!planAccess.canCreatePrizeChallenges ? "(Creator plan+)" : ""}</option><option value="digital_product" disabled={!planAccess.canCreatePrizeChallenges}>Digital Product {!planAccess.canCreatePrizeChallenges ? "(Creator plan+)" : ""}</option><option value="money" disabled={!planAccess.canCreatePrizeChallenges}>Money (Review Only) {!planAccess.canCreatePrizeChallenges ? "(Creator plan+)" : ""}</option></select></Field><Card className="p-4 text-slate-300">Money and physical-product prizes require platform review. Entry fees, cash payout execution, and prize release remain inactive.</Card></div>
      {!braggingRights ? <div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Prize Title"><input className={inputClass} value={form.prizeTitle} onChange={(event) => update("prizeTitle", event.target.value)} /></Field><Field label="Estimated Prize Value"><input className={inputClass} type="number" min="0" value={form.prizeValue} onChange={(event) => update("prizeValue", event.target.value)} /></Field><Field label="Prize Description"><textarea className={textareaClass} value={form.prizeDescription} onChange={(event) => update("prizeDescription", event.target.value)} /></Field><Field label="Delivery Notes"><textarea className={textareaClass} value={form.prizeDeliveryNotes} onChange={(event) => update("prizeDeliveryNotes", event.target.value)} /></Field></div> : null}
      <div className="mt-6 rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)]/5 p-5">
        <label className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" checked={sponsorEnabled} disabled={!planAccess.canCreateSponsoredChallenges} onChange={(event) => update("sponsorEnabled", event.target.checked ? "true" : "false")} /> <span>Enable Sponsorship Collaboration {!planAccess.canCreateSponsoredChallenges ? "(Creator plan+)" : ""}</span></label>
        {sponsorEnabled ? <div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Total Sponsor Slots"><input className={inputClass} type="number" min="0" value={form.sponsorSlots} onChange={(event) => update("sponsorSlots", event.target.value)} /></Field><Field label="Minimum Sponsor Proposal Amount"><input className={inputClass} type="number" min="0" value={form.minimumSponsorshipAmount} onChange={(event) => update("minimumSponsorshipAmount", event.target.value)} /></Field><Field label="Package Name"><input className={inputClass} value={form.sponsorPackageName} onChange={(event) => update("sponsorPackageName", event.target.value)} /></Field><Field label="Package Price (proposal only)"><input className={inputClass} type="number" min="0" value={form.sponsorPackagePrice} onChange={(event) => update("sponsorPackagePrice", event.target.value)} /></Field><Field label="Package Slot Limit"><input className={inputClass} type="number" min="1" max="20" value={form.sponsorPackageSlots} onChange={(event) => update("sponsorPackageSlots", event.target.value)} /></Field><Field label="Package Benefits"><textarea className={textareaClass} value={form.sponsorPackageBenefits} onChange={(event) => update("sponsorPackageBenefits", event.target.value)} /></Field></div> : null}
        <div className="mt-5 grid gap-4 md:grid-cols-3">{normalized.map((bucket, index) => <label key={bucket.bucket} className="flex items-start gap-2 rounded-[8px] bg-black/40 p-4 text-sm"><input className="mt-1 shrink-0" type="checkbox" checked={bucket.enabled} disabled={!planAccess.canCreateSponsoredChallenges} onChange={() => setAllocations((items: any[]) => items.map((item: any, i: number) => i === index ? { ...item, enabled: !item.enabled } : item))} /> <span>{bucket.bucket}: <b>{bucket.percent}%</b></span></label>)}</div>
      </div>
    </section>
  );
}

function StepMedia({ form, updateMedia, userId, trackMediaStatus }: { form: any; updateMedia: any; userId: string; trackMediaStatus: (field: string) => (status: MediaUploadStage) => void }) {
  const basePath = `challenges/drafts/${userId}`;
  return (
    <section>
      <h2 className="text-xl font-black sm:text-2xl">Step 5: Media</h2>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <MediaUploadField label="Cover Media" value={form.coverImageUrl} onChange={(url, metadata) => updateMedia("coverImageUrl", "coverImagePath", url, metadata)} storagePath={`${basePath}/banner`} kind="image" buttonLabel="Upload Cover Image" required onStatusChange={trackMediaStatus("coverImageUrl")} />
        <MediaUploadField label="Promo Flyer" value={form.promoImageUrl} onChange={(url, metadata) => updateMedia("promoImageUrl", "promoImagePath", url, metadata)} storagePath={`${basePath}/promo-flyer`} kind="image" buttonLabel="Upload Promo Image" onStatusChange={trackMediaStatus("promoImageUrl")} />
        <MediaUploadField label="Trailer Video" value={form.trailerVideoUrl} onChange={(url, metadata) => updateMedia("trailerVideoUrl", "trailerVideoPath", url, metadata)} storagePath={`${basePath}/trailers`} kind="video" buttonLabel="Upload Trailer Video" onStatusChange={trackMediaStatus("trailerVideoUrl")} />
        <MediaUploadField label="Promo Video" value={form.promoVideoUrl} onChange={(url, metadata) => updateMedia("promoVideoUrl", "promoVideoPath", url, metadata)} storagePath={`${basePath}/promo-video`} kind="video" buttonLabel="Upload Promo Video" onStatusChange={trackMediaStatus("promoVideoUrl")} />
      </div>
      <Card className="mt-6 border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-300 sm:p-6"><p className="font-black text-white">Media upload status</p><p className="mt-2">Save Draft stays available while media is incomplete. Publishing stays blocked until the required cover image finishes uploading with a saved URL and storage path.</p></Card>
    </section>
  );
}

function StepPreview({ form }: { form: any }) {
  return <section><h2 className="text-xl font-black sm:text-2xl">Step 6: Preview & Publish</h2><div className="mt-6 grid gap-4 md:grid-cols-2">{Object.entries({ Title: form.title, Type: form.type, Category: form.category === "Other" ? form.customCategory : form.category, Format: form.competitionFormat, "Best Of": form.bestOf, "Prize Type": form.prizeType, "Submission Types": form.submissionTypes.join(", "), "Start Date": form.startsAt, "Submission Deadline": form.submissionDeadline, "Voting Deadline": form.votingDeadline, "End Date": form.endsAt, "Sponsor Enabled": form.sponsorEnabled === "true" ? "Yes" : "No" }).map(([label, value]) => <Card key={label} className="p-4"><div className="text-sm font-bold text-slate-400">{label}</div><div className="mt-1 break-words text-base font-black sm:text-lg">{String(value)}</div></Card>)}</div></section>;
}


function PublishChecklist({ readiness, onOpenIssue, className = "" }: { readiness: ChallengeValidationResult; onOpenIssue: () => void; className?: string }) {
  const blocking = readiness.errors.filter((issue) => issue.severity === "error");
  if (!blocking.length) {
    return <Card className={`${className} border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100`}>Ready to publish. The server will validate these requirements again before the challenge status changes.</Card>;
  }
  return (
    <Card className={`${className} border-yellow-500/30 bg-yellow-500/5 p-4 sm:p-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--gold)]">Publish checklist</p>
          <h3 className="mt-1 text-lg font-black text-white">Before publishing, complete {readiness.missingCount} item{readiness.missingCount === 1 ? "" : "s"}</h3>
        </div>
        <Button type="button" variant="secondary" onClick={onOpenIssue}>Go to first item</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {Object.entries(readiness.groupedByStep).map(([stepName, issues]) => {
          const stepIssues = issues.filter((issue) => issue.severity === "error");
          if (!stepIssues.length) return null;
          return (
            <div key={stepName} className="rounded-[8px] border border-white/10 bg-black/25 p-3">
              <p className="text-sm font-black text-white">{stepName}</p>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-300">
                {stepIssues.map((issue) => <li key={`${issue.code}-${issue.field}`} className="flex gap-2"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]" /><span>{issue.message}</span></li>)}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

