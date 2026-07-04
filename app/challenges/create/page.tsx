"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, LockKeyhole, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { redistributeSponsorship } from "@/lib/legal";
import { challengeSchema } from "@/lib/validation";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getPlanExperience, getUserPlanAccess, type PlanExperience } from "@/lib/plan-access";
import { createChallenge } from "@/lib/api/services";

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
  const searchParams = useSearchParams();
  const { user, loading: userLoading } = useCurrentUser();
  const planProfile = { planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType };
  const planAccess = getUserPlanAccess(planProfile);
  const planExperience = getPlanExperience(planProfile);
  const selectedAccountType = user?.selectedAccountType ?? user?.role ?? user?.accountType;
  const freePlan = planExperience.planId === "free";
  const freeCompetitor = freePlan && selectedAccountType !== "creator" && selectedAccountType !== "host";
  const freeCreatorOrHost = freePlan && (selectedAccountType === "creator" || selectedAccountType === "host");
  const defaultType = searchParams.get("mode") === "private" ? "Private / Exclusive" : "Public Challenge";
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<"wizard" | "success">("wizard");
  const [draftSaved, setDraftSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
    entryFee: "0",
    startsAt: dateInput(1),
    submissionDeadline: dateInput(5),
    votingDeadline: dateInput(6),
    endsAt: dateInput(7),
    coverImageUrl: "",
    promoImageUrl: "",
    trailerVideoUrl: "",
    promoVideoUrl: "",
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
  });  const [allocations, setAllocations] = useState([
    { bucket: "Platform Operations", percent: 12, enabled: true },
    { bucket: "Creator Share", percent: 3, enabled: true },
    { bucket: "Community Pool", percent: 0, enabled: false }
  ]);
  const normalized = useMemo(() => redistributeSponsorship(15, allocations), [allocations]);
  const braggingRights = form.prizeType === "bragging_rights" || form.prizeType === "none";
  const monetizedLocked = !planAccess.canCreatePaidChallenges && !braggingRights && Number(form.entryFee) > 0;
  const prizeLocked = !planAccess.canCreatePrizeChallenges && !braggingRights;
  const privateLocked = !planAccess.canCreatePrivateChallenges && form.type === "Private / Exclusive";
  const draftOnlyFormat = form.competitionFormat.includes("Program") || form.competitionFormat.includes("Campaign");

  function update(field: keyof typeof form, value: string | string[]) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
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
      visibility: form.type === "Private / Exclusive" ? "private" : "public",
      acceptedSubmissionTypes: form.submissionTypes,
      competitionFormat: form.competitionFormat,
      bestOf: form.bestOf,
      prizeType: form.prizeType,
      prizeTitle: form.prizeTitle,
      prizeDescription: form.prizeDescription,
      prizeValue: Number(form.prizeValue || 0),
      prizeDeliveryNotes: form.prizeDeliveryNotes,
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
      coverImageUrl: form.coverImageUrl,
      promoImageUrl: form.promoImageUrl,
      trailerVideoUrl: form.trailerVideoUrl,
      promoVideoUrl: form.promoVideoUrl,
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
    if (draftOnlyFormat) {
      setError("This advanced format is a foundation-only builder in the current version. Save it as a draft until its full workflow is activated.");
      return;
    }
    const result = challengeSchema.safeParse({
      title: form.title,
      description: form.description,
      category: form.category,
      customCategory: form.category === "Other" ? form.customCategory : undefined,
      acceptedSubmissionTypes: form.submissionTypes,
      competitionFormat: form.competitionFormat,
      bestOf: form.bestOf,
      prizeType: form.prizeType === "physical_product" ? "Physical Product" : form.prizeType === "digital_product" ? "Digital Product" : form.prizeType === "money" ? "Money" : "Bragging Rights (Leaderboard Ranking)",
      entryFee: 0,
      registrationDeadline: form.submissionDeadline,
      submissionDeadline: form.submissionDeadline,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      votingDeadline: form.votingDeadline,
      votingEndsAt: form.votingDeadline,
      publish: true
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid challenge");
      return;
    }
    setSaving(true);
    const response = await createChallenge(challengePayload(true));
    setSaving(false);
    if (!response.ok) {
      setError(response.message || "Challenge could not be published.");
      return;
    }
    const challenge = response.data?.challenge as { id?: string } | undefined;
    setCreatedChallengeId(challenge?.id ?? "");
    setStage("success");
  }

  if (userLoading) return <CreateChallengeFallback />;

  if (freeCompetitor) {
    return (
      <AppShell>
        <Card className="mx-auto mt-10 max-w-2xl border-yellow-500/30 p-6 text-center sm:p-8 lg:p-10">
          <LockKeyhole className="mx-auto h-12 w-12 text-[var(--gold)]" />
          <h1 className="mt-5 text-3xl font-black">Create Challenge is for Creators and Hosts</h1>
          <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">Free competitor accounts are built for joining, voting, saving, and competing in challenges. Switch to a Creator or Host plan to create challenges.</p>
          <div className="mt-7 grid gap-3 sm:flex sm:justify-center">
            <LinkButton href="/subscriptions">Compare Plans</LinkButton>
            <LinkButton href="/challenges" variant="secondary">Go Back to Challenges</LinkButton>
          </div>
        </Card>
      </AppShell>
    );
  }

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

  if (freeCreatorOrHost) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-3xl p-5 sm:p-7 lg:p-9">
          <PageTitle title="Create a Basic Public Challenge" subtitle="Free creator and host accounts can publish one simple, public, non-monetized challenge per month." />
          <p className="mt-4 rounded-[8px] border border-[var(--gold)]/20 bg-[var(--gold)]/5 px-4 py-3 text-sm font-bold text-[var(--gold-2)]">1 free public challenge is available each month. Published usage is enforced on the server.</p>
          <div className="mt-8 grid gap-6">
            <Field label="Challenge Title"><input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Category"><select className={inputClass} value={form.category} onChange={(event) => update("category", event.target.value)}>{["Fitness", "Creative", "Photography", "Food", "Gaming", "Other"].map((category) => <option key={category}>{category}</option>)}</select></Field>
              <Field label="Submission Type"><select className={inputClass} value={form.submissionTypes[0]} onChange={(event) => setForm((current) => ({ ...current, submissionTypes: [event.target.value] }))}><option value="image">Image</option><option value="video">Video</option></select></Field>
            </div>
            <Field label="Description"><textarea className={textareaClass} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field>
            <Field label="Rules"><textarea className={textareaClass} value={form.standardRules} onChange={(event) => update("standardRules", event.target.value)} /></Field>
            <Field label="Cover Image URL"><input className={inputClass} value={form.coverImageUrl} onChange={(event) => update("coverImageUrl", event.target.value)} placeholder="https://..." /></Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Start Date"><input className={inputClass} type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /></Field>
              <Field label="Entry Deadline"><input className={inputClass} type="datetime-local" value={form.submissionDeadline} onChange={(event) => update("submissionDeadline", event.target.value)} /></Field>
              <Field label="Voting Deadline"><input className={inputClass} type="datetime-local" value={form.votingDeadline} onChange={(event) => update("votingDeadline", event.target.value)} /></Field>
              <Field label="End Date"><input className={inputClass} type="datetime-local" value={form.endsAt} onChange={(event) => update("endsAt", event.target.value)} /></Field>
            </div>
            <Card className="border-emerald-500/20 bg-emerald-500/5 p-4 text-sm leading-6 text-slate-300">Public visibility only. Entry fees, prize pools, sponsorships, tournaments, live events, boosts, advanced voting, and promo media are unavailable in this free flow.</Card>
            {error ? <p className="rounded-[8px] bg-red-950/50 p-4 text-red-200">{error}</p> : null}
            {draftSaved ? <p className="rounded-[8px] bg-emerald-950/40 p-4 text-emerald-200">Draft saved.</p> : null}
            <div className="grid gap-3 border-t border-white/10 pt-6 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
              <LinkButton href="/subscriptions" variant="secondary">Upgrade for More Creator Tools</LinkButton>
              <div className="grid gap-3 sm:flex">
                <Button variant="secondary" onClick={saveDraft} disabled={saving}><Save size={17} /> Save Draft</Button>
                <Button onClick={publish} disabled={saving}>{saving ? "Publishing..." : "Publish Basic Challenge"}</Button>
              </div>
            </div>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Card className="mx-auto max-w-[960px] border-yellow-500/50 p-4 gold-glow sm:p-6 lg:p-10">
        <PageTitle title="Create New Challenge" subtitle="Build a public or private challenge through a guided setup." />
        <Card className="mt-6 border-[var(--gold)]/30 bg-[var(--gold)]/10 p-4 sm:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--gold-2)]">{planExperience.dashboardName} · {planExperience.badgeLabel}</div>
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
          {step === 4 ? <StepMedia form={form} update={update} /> : null}
          {step === 5 ? <StepPreview form={form} /> : null}
        </div>

        {error ? <p className="mt-5 rounded-[8px] bg-red-950/50 p-4 text-red-200">{error}</p> : null}
        {draftSaved ? <p className="mt-5 rounded-[8px] bg-emerald-950/40 p-4 text-emerald-200">Draft saved locally.</p> : null}

        <div className="mt-8 grid gap-3 border-t border-white/10 pt-6 sm:flex sm:flex-wrap sm:justify-between">
          <Button className="w-full sm:w-auto" variant="secondary" onClick={saveDraft} disabled={saving}><Save size={17} /> {saving ? "Saving..." : "Save Draft"}</Button>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Button className="w-full sm:w-auto" variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(value - 1, 0))}>Back</Button>
            {step < steps.length - 1 ? <Button className="w-full sm:w-auto" onClick={next}>Next</Button> : <Button className="w-full sm:w-auto" onClick={publish} disabled={saving}>{saving ? "Publishing..." : form.type === "Private / Exclusive" ? "Publish Privately" : "Publish Publicly"}</Button>}
          </div>
        </div>
      </Card>
    </AppShell>
  );
}

function StepBasic({ form, update, planAccess }: { form: any; update: any; planAccess: ReturnType<typeof getUserPlanAccess> }) {
  const categories = form.type === "Private / Exclusive" ? ["Invite-only", "Premium Creator", "Sponsor-Only", "VIP Community", "Other"] : ["Fitness", "Creative", "Photography", "Food", "Gaming", "Other"];
  return <section><h2 className="text-xl font-black sm:text-2xl">Step 1: Basic Details</h2><div className="mt-5 grid gap-3 rounded-[8px] bg-black p-2 sm:grid-cols-2"><Button className="w-full" onClick={() => update("type", "Public Challenge")} variant={form.type === "Public Challenge" ? "primary" : "ghost"}>Public Challenge</Button><Button className="w-full" onClick={() => update("type", "Private / Exclusive")} variant={form.type === "Private / Exclusive" ? "primary" : "ghost"}>Private / Exclusive {!planAccess.canCreatePrivateChallenges ? "Locked" : ""}</Button></div>{!planAccess.canCreatePrivateChallenges ? <Card className="mt-4 border-dashed p-4 text-sm text-[#8fa6ca]"><LockKeyhole className="mb-2 text-[var(--gold)]" size={18} /> Private and exclusive challenges require the Creator plan or higher. You can still preview the fields, but publishing is blocked until you upgrade.</Card> : null}<div className="mt-6 grid gap-5 md:grid-cols-[1fr_260px]"><Field label="Challenge Title"><input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field><Field label={form.type === "Private / Exclusive" ? "Private / Exclusive Category" : "Public Category"}><select className={inputClass} value={form.category} onChange={(event) => update("category", event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field></div>{form.category === "Other" ? <div className="mt-5"><Field label="Custom Category"><input className={inputClass} value={form.customCategory} onChange={(event) => update("customCategory", event.target.value)} /></Field></div> : null}<div className="mt-5"><Field label="Description"><textarea className={textareaClass} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field></div>{form.type === "Private / Exclusive" ? <Card className="mt-5 grid gap-4 p-4 sm:p-5 md:grid-cols-2"><Field label="Invite Code Generation"><input className={inputClass} defaultValue="VAULT2026" /></Field><Field label="Approved Participant List"><textarea className={textareaClass} placeholder="Add approved emails, one per line" /></Field><label className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" defaultChecked /> Require access request approval</label><label className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" defaultChecked /> Invite-only access</label></Card> : null}</section>;
}

function StepFormat({ form, update, toggleSubmission, experience }: { form: any; update: any; toggleSubmission: (type: string) => void; experience: PlanExperience }) {
  const formats = ["Group Challenge", "Entry Competition"];
  if (experience.features.ranked_challenges) formats.push("Ranked Challenge");
  if (experience.features.host_control_center) formats.push("1 vs 1 Battle", "Tournament Builder", "Live Event Challenge");
  if (experience.features.programs) formats.push("Program Challenge (Draft Foundation)", "Campaign Challenge (Draft Foundation)");
  const lockedFormats = [
    !experience.features.ranked_challenges ? "Ranked Challenge · Pro" : null,
    !experience.features.host_control_center ? "1 vs 1 / Tournament / Live Event · Host" : null,
    !experience.features.programs ? "Programs / Campaigns · Enterprise" : null
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
      {lockedFormats.length ? <Card className="mt-4 border-dashed p-4 text-sm text-[#8fa6ca]"><LockKeyhole className="mb-2 text-[var(--gold)]" size={18} /> {lockedFormats.join(" · ")}</Card> : null}
      {form.competitionFormat.includes("Tournament") || form.competitionFormat.includes("Live Event") ? <Card className="mt-4 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-slate-300">Tournament and live-event challenges are submitted for platform review. Prize and payout execution remains inactive.</Card> : null}
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
      {!planAccess.canCreatePrizeChallenges ? <Card className="mt-4 border-dashed p-4 text-sm text-[#8fa6ca]">Free users can publish basic public non-monetized challenges. Creator plan or higher is required for sponsor-enabled or advanced challenge settings.</Card> : null}
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

function StepMedia({ form, update }: { form: any; update: any }) {
  return (
    <section>
      <h2 className="text-xl font-black sm:text-2xl">Step 5: Media</h2>
      <div className="mt-6 grid gap-6 md:grid-cols-2"><Field label="Cover Media URL"><input className={inputClass} value={form.coverImageUrl} onChange={(event) => update("coverImageUrl", event.target.value)} placeholder="https://..." /></Field><Field label="Promo Flyer Image URL"><input className={inputClass} value={form.promoImageUrl} onChange={(event) => update("promoImageUrl", event.target.value)} placeholder="https://..." /></Field><Field label="Trailer Video URL"><input className={inputClass} value={form.trailerVideoUrl} onChange={(event) => update("trailerVideoUrl", event.target.value)} placeholder="https://..." /></Field><Field label="Promo Video URL"><input className={inputClass} value={form.promoVideoUrl} onChange={(event) => update("promoVideoUrl", event.target.value)} placeholder="https://..." /></Field></div>
      <Card className="mt-6 p-4 text-slate-300 sm:p-6">Media upload storage will be connected later. For now, preview media fields accept URLs and are validated server-side when provided.</Card>
    </section>
  );
}

function StepPreview({ form }: { form: any }) {
  return <section><h2 className="text-xl font-black sm:text-2xl">Step 6: Preview & Publish</h2><div className="mt-6 grid gap-4 md:grid-cols-2">{Object.entries({ Title: form.title, Type: form.type, Category: form.category === "Other" ? form.customCategory : form.category, Format: form.competitionFormat, "Best Of": form.bestOf, "Prize Type": form.prizeType, "Submission Types": form.submissionTypes.join(", "), "Start Date": form.startsAt, "Submission Deadline": form.submissionDeadline, "Voting Deadline": form.votingDeadline, "End Date": form.endsAt, "Sponsor Enabled": form.sponsorEnabled === "true" ? "Yes" : "No" }).map(([label, value]) => <Card key={label} className="p-4"><div className="text-sm font-bold text-slate-400">{label}</div><div className="mt-1 break-words text-base font-black sm:text-lg">{String(value)}</div></Card>)}</div></section>;
}

