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
  return date.toISOString().slice(0, 10);
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
  const { user } = useCurrentUser();
  const planProfile = { planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType };
  const planAccess = getUserPlanAccess(planProfile);
  const planExperience = getPlanExperience(planProfile);
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
    prizeType: "Bragging Rights (Leaderboard Ranking)",
    entryFee: "0",
    startsAt: dateInput(1),
    submissionDeadline: dateInput(5),
    votingDeadline: dateInput(6),
    endsAt: dateInput(7),
    coverImageUrl: "",
    promoImageUrl: "",
    trailerVideoUrl: "",
    sponsorEnabled: "false",
    sponsorSlots: "2",
    minimumSponsorshipAmount: "0",
    sponsorPlacementOptions: ["Challenge page logo", "CTA button"],
    weightedVotes: "false",
    requiresSubmissionApproval: "false"
  });  const [allocations, setAllocations] = useState([
    { bucket: "Platform Operations", percent: 12, enabled: true },
    { bucket: "Creator Share", percent: 3, enabled: true },
    { bucket: "Community Pool", percent: 0, enabled: false }
  ]);
  const normalized = useMemo(() => redistributeSponsorship(15, allocations), [allocations]);
  const braggingRights = form.prizeType === "Bragging Rights (Leaderboard Ranking)";
  const monetizedLocked = !planAccess.canCreatePaidChallenges && !braggingRights && Number(form.entryFee) > 0;
  const prizeLocked = !planAccess.canCreatePrizeChallenges && !braggingRights;
  const privateLocked = !planAccess.canCreatePrivateChallenges && form.type === "Private / Exclusive";
  const draftOnlyFormat = form.competitionFormat.includes("Draft Foundation");

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
      sponsorEnabled: form.sponsorEnabled === "true",
      sponsorSlots: Number(form.sponsorSlots || 0),
      minimumSponsorshipAmount: Number(form.minimumSponsorshipAmount || 0),
      sponsorPlacementOptions: form.sponsorPlacementOptions,
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
      prizeType: form.prizeType,
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

  if (stage === "success") {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-6 text-center sm:p-8 lg:p-10">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400 sm:h-20 sm:w-20" />
          <h1 className="mt-6 text-3xl font-black sm:text-4xl">Challenge Published</h1>
          <p className="mt-3 text-slate-300">Your challenge is now ready for participants, voting, and media submissions.</p>
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
                  update("prizeType", "Bragging Rights (Leaderboard Ranking)");
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
  if (experience.features.host_control_center) formats.push("1 vs 1 Battle", "Tournament Builder (Draft Foundation)", "Live Event Challenge (Draft Foundation)");
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
      {form.competitionFormat.includes("Draft Foundation") ? <Card className="mt-4 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-slate-300">This advanced builder can be saved as a draft. Publishing remains locked until its complete operational workflow is activated.</Card> : null}
      <div className="mt-6">
        <div className="mb-2 font-bold">Submission Type</div>
        <div className="grid gap-3 sm:grid-cols-2">{["image", "video"].map((type) => <label key={type} className="flex min-h-14 items-center gap-3 rounded-[8px] border border-white/10 bg-[#181818] px-4 py-4 font-bold"><input className="shrink-0" type="checkbox" checked={form.submissionTypes.includes(type)} onChange={() => toggleSubmission(type)} /> {type === "image" ? "Image uploads" : "Video uploads"}</label>)}</div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {["Time limit uploads", "Standard platform rules", "Voting policy acknowledgement", "Editable rules enabled"].map((rule) => <label key={rule} className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" defaultChecked /> <span>{rule}</span></label>)}
        <label className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" checked={form.weightedVotes === "true"} disabled={!experience.features.performance_analytics} onChange={(event) => update("weightedVotes", event.target.checked ? "true" : "false")} /> <span>Weighted vote multipliers {!experience.features.performance_analytics ? "(Pro plan+)" : ""}</span></label>
        <label className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" checked={form.requiresSubmissionApproval === "true"} disabled={!experience.features.submission_moderation} onChange={(event) => update("requiresSubmissionApproval", event.target.checked ? "true" : "false")} /> <span>Submission approval control {!experience.features.submission_moderation ? "(Host plan+)" : ""}</span></label>
      </div>
    </section>
  );
}

function StepDates({ form, update }: { form: any; update: any }) {
  return (
    <section>
      <h2 className="text-xl font-black sm:text-2xl">Step 3: Dates & Eligibility</h2>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Start Date"><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input className={inputClass} type="date" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /><Button type="button" variant="ghost">OK</Button></div></Field>
        <Field label="Submission Deadline"><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input className={inputClass} type="date" value={form.submissionDeadline} onChange={(event) => update("submissionDeadline", event.target.value)} /><Button type="button" variant="ghost">OK</Button></div></Field>
        <Field label="Voting Deadline"><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input className={inputClass} type="date" value={form.votingDeadline} onChange={(event) => update("votingDeadline", event.target.value)} /><Button type="button" variant="ghost">OK</Button></div></Field>
        <Field label="End Date"><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input className={inputClass} type="date" value={form.endsAt} onChange={(event) => update("endsAt", event.target.value)} /><Button type="button" variant="ghost">OK</Button></div></Field>
      </div>
      <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-slate-300">Submission deadline must be on or before voting deadline. Voting deadline must be after start date and on or before end date.</Card>
      <div className="mt-6 grid gap-5 md:grid-cols-2"><label className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" /> Age restriction</label><Field label="Minimum Age"><input className={inputClass} type="number" placeholder="13" /></Field><Field label="Location Restrictions"><select className={inputClass}><option>No restriction</option><option>United States only</option><option>Nigeria only</option><option>Invite list only</option></select></Field></div>
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
      <div className="mt-6 grid gap-6 md:grid-cols-2"><Field label="Prize Type"><select className={inputClass} value={form.prizeType} onChange={(event) => update("prizeType", event.target.value)}><option>Bragging Rights (Leaderboard Ranking)</option><option disabled={!planAccess.canCreatePrizeChallenges}>Product Prize {!planAccess.canCreatePrizeChallenges ? "(Creator plan+)" : ""}</option><option disabled={!planAccess.canCreatePrizeChallenges}>DoroCoin {!planAccess.canCreatePrizeChallenges ? "(Creator plan+)" : ""}</option></select></Field><Card className="p-4 text-slate-300">Entry fee, cash payout, and prize release fields are locked for this phase. Server will keep paid-entry prize pools and cash payouts inactive.</Card></div>
      <div className="mt-6 rounded-[8px] border border-blue-500/30 bg-blue-950/20 p-5">
        <label className="flex items-start gap-3 font-bold"><input className="mt-1 shrink-0" type="checkbox" checked={sponsorEnabled} disabled={!planAccess.canCreateSponsoredChallenges} onChange={(event) => update("sponsorEnabled", event.target.checked ? "true" : "false")} /> <span>Enable Sponsorship Collaboration {!planAccess.canCreateSponsoredChallenges ? "(Creator plan+)" : ""}</span></label>
        {sponsorEnabled ? <div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Sponsor Slots"><input className={inputClass} type="number" min="0" value={form.sponsorSlots} onChange={(event) => update("sponsorSlots", event.target.value)} /></Field><Field label="Minimum Sponsor Proposal Amount"><input className={inputClass} type="number" min="0" value={form.minimumSponsorshipAmount} onChange={(event) => update("minimumSponsorshipAmount", event.target.value)} /></Field></div> : null}
        <div className="mt-5 grid gap-4 md:grid-cols-3">{normalized.map((bucket, index) => <label key={bucket.bucket} className="flex items-start gap-2 rounded-[8px] bg-black/40 p-4 text-sm"><input className="mt-1 shrink-0" type="checkbox" checked={bucket.enabled} disabled={!planAccess.canCreateSponsoredChallenges} onChange={() => setAllocations((items: any[]) => items.map((item: any, i: number) => i === index ? { ...item, enabled: !item.enabled } : item))} /> <span>{bucket.bucket}: <b>{bucket.percent}%</b></span></label>)}</div>
      </div>
    </section>
  );
}

function StepMedia({ form, update }: { form: any; update: any }) {
  return (
    <section>
      <h2 className="text-xl font-black sm:text-2xl">Step 5: Media</h2>
      <div className="mt-6 grid gap-6 md:grid-cols-2"><Field label="Cover Media URL"><input className={inputClass} value={form.coverImageUrl} onChange={(event) => update("coverImageUrl", event.target.value)} placeholder="https://..." /></Field><Field label="Promo Flyer Image URL"><input className={inputClass} value={form.promoImageUrl} onChange={(event) => update("promoImageUrl", event.target.value)} placeholder="https://..." /></Field><Field label="Trailer Video URL"><input className={inputClass} value={form.trailerVideoUrl} onChange={(event) => update("trailerVideoUrl", event.target.value)} placeholder="https://..." /></Field></div>
      <Card className="mt-6 p-4 text-slate-300 sm:p-6">Media upload storage will be connected later. For now, preview media fields accept URLs and are validated server-side when provided.</Card>
    </section>
  );
}

function StepPreview({ form }: { form: any }) {
  return <section><h2 className="text-xl font-black sm:text-2xl">Step 6: Preview & Publish</h2><div className="mt-6 grid gap-4 md:grid-cols-2">{Object.entries({ Title: form.title, Type: form.type, Category: form.category === "Other" ? form.customCategory : form.category, Format: form.competitionFormat, "Best Of": form.bestOf, "Prize Type": form.prizeType, "Submission Types": form.submissionTypes.join(", "), "Start Date": form.startsAt, "Submission Deadline": form.submissionDeadline, "Voting Deadline": form.votingDeadline, "End Date": form.endsAt, "Sponsor Enabled": form.sponsorEnabled === "true" ? "Yes" : "No" }).map(([label, value]) => <Card key={label} className="p-4"><div className="text-sm font-bold text-slate-400">{label}</div><div className="mt-1 break-words text-base font-black sm:text-lg">{String(value)}</div></Card>)}</div></section>;
}

