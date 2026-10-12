"use client";

import { useMemo, useState } from "react";
import { Check, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MediaUploadField, type MediaUploadStage } from "@/components/media-upload-field";
import { Button, Card, Field, LinkButton, PageTitle, inputClass, textareaClass } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { apiRequest } from "@/lib/api/client";
import { firebaseClientConfigStatus } from "@/lib/firebase/client";
import { tournamentDraftMediaPath } from "@/lib/media-upload-paths";
import { bracketSizeForParticipants, buildRoundPlan, defaultPrizeDistribution, doubleEliminationMatchCount, singleEliminationMatchCount, singleEliminationStageCount } from "@/lib/server/tournaments";
import { ChallengeTaxonomyFields } from "@/components/challenge-controlled-fields";
import { BuilderContent, BuilderFooter, BuilderSurface, ChallengeBuilderFrame } from "@/components/challenge-builder-frame";
import { CHALLENGE_BUILDER_REGISTRY, canonicalBuilderSteps } from "@/lib/challenge-builder-registry";
import { TOURNAMENT_BRACKET_SIZES } from "@/lib/server/tournament-validation";
import { useChallengeBuilderAutosave } from "@/lib/hooks/use-challenge-builder-autosave";

const steps = canonicalBuilderSteps("tournament");
const tournamentRegistry = CHALLENGE_BUILDER_REGISTRY.tournament;

type BuilderForm = {
  title: string; description: string; category: string; subcategory: string; tournamentRules: string;
  coverImageUrl: string; coverImagePath: string; trailerUrl: string; trailerPath: string;
  format: "single_elimination" | "double_elimination"; participationMode: "individual" | "team"; participantCapacity: number; minimumTeamSize: number; maximumTeamSize: number; teamJoiningMode: "invite_only" | "invite_and_requests"; privacy: "public" | "private" | "invite_only"; registrationType: "open" | "invite_only";
  submissionDurationHours: 12 | 24 | 48 | 72; votingDurationHours: 12 | 24 | 48 | 72; paidVotingEnabled: boolean;
  seedingMethod: "random"; resultMethod: "votes"; scoreVisibility: "final_only"; tieBreaker: "pre_recorded_priority"; thirdPlaceMethod: "third_place_match" | "none";
  entryType: "free" | "paid_entry_setup_required"; entryFeeAmountMinor: number; currency: string; sponsorReady: boolean; acceptSponsorshipProposals: boolean; sponsorshipGoal: number; sponsorCategories: string; sponsorNote: string; sponsorPlacementPreferences: string; prizeDistribution: Array<{ placement: 1 | 2 | 3; percent: number }>;
};

const initialForm: BuilderForm = {
  title: "", description: "", category: "", subcategory: "", tournamentRules: "",
  coverImageUrl: "", coverImagePath: "", trailerUrl: "", trailerPath: "",
  format: "single_elimination", participationMode: "individual", participantCapacity: 8, minimumTeamSize: 2, maximumTeamSize: 5, teamJoiningMode: "invite_only", privacy: "public", registrationType: "open",
  submissionDurationHours: 48, votingDurationHours: 72, paidVotingEnabled: false,
  seedingMethod: "random", resultMethod: "votes", scoreVisibility: "final_only", tieBreaker: "pre_recorded_priority", thirdPlaceMethod: "third_place_match",
  entryType: "free", entryFeeAmountMinor: 0, currency: "USD", sponsorReady: false, acceptSponsorshipProposals: false, sponsorshipGoal: 0, sponsorCategories: "", sponsorNote: "", sponsorPlacementPreferences: "", prizeDistribution: defaultPrizeDistribution()
};

export function TournamentBuilder({ enterpriseOwnership }: { enterpriseOwnership?: "personal" | "official" }) {
  const auth = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [unlocked, setUnlocked] = useState(0);
  const [form, setForm] = useState<BuilderForm>(initialForm);
  const [coverStatus, setCoverStatus] = useState<MediaUploadStage>("idle");
  const [trailerStatus, setTrailerStatus] = useState<MediaUploadStage>("idle");
  const [notice, setNotice] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [mobileGuideOpen, setMobileGuideOpen] = useState(false);
  const mediaDisabled = firebaseClientConfigStatus.mediaUploadsDisabled;
  const roundPlan = useMemo(() => buildRoundPlan(bracketSizeForParticipants(form.participantCapacity), "votes", form.format === "single_elimination" ? "third_place_match" : "none"), [form.participantCapacity, form.format]);
  const readiness = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!form.title.trim()) errors.push("Tournament name is required.");
    if (form.description.trim().length < 20 || form.description.trim().length > 1200) errors.push("Full description must be 20–1,200 characters.");
    if (!form.category.trim()) errors.push("Category is required.");
    if (!form.coverImageUrl && !mediaDisabled) errors.push("Cover media upload must complete.");
    if (form.participationMode === "team" && (!Number.isInteger(form.minimumTeamSize) || !Number.isInteger(form.maximumTeamSize) || form.minimumTeamSize < 1 || form.minimumTeamSize > form.maximumTeamSize || form.maximumTeamSize > 20)) errors.push("Team size must satisfy 1 <= minimum <= maximum <= 20.");
    if (form.entryType === "paid_entry_setup_required" && form.entryFeeAmountMinor < 100) errors.push("Set a valid paid entry amount.");
    if (form.entryType === "paid_entry_setup_required") warnings.push("Paid entry remains provider-confirmed and setup-gated.");
    if (coverStatus === "uploading" || coverStatus === "preparing") errors.push("Wait for cover upload to finish.");
    if (trailerStatus === "uploading" || trailerStatus === "preparing") errors.push("Wait for trailer upload to finish.");
    return { errors, warnings, ready: errors.length === 0 };
  }, [coverStatus, form, mediaDisabled, trailerStatus]);

  function update<K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function draftPayload(status: "draft" | "pending_review" = "draft") {
    return {
      ...form,
      ...(enterpriseOwnership ? { officialChallenge: enterpriseOwnership === "official", ownershipType: enterpriseOwnership === "official" ? "challenge_suite_official" : "enterprise_personal" } : {}),
      currency: "USD",
      configVersion: 3,
      status,
      roundPlan,
      submissionDurationHours: form.submissionDurationHours,
      votingDurationHours: form.votingDurationHours,
      seedingMethod: "random",
      resultMethod: "votes",
      advancementMethod: "bracket",
      tieBreaker: "pre_recorded_priority",
      thirdPlaceMethod: form.format === "single_elimination" ? "third_place_match" : "none",
      scoreVisibility: "final_only",
      coverMedia: { url: form.coverImageUrl || null, path: form.coverImagePath || null, status: form.coverImageUrl ? "uploaded" : mediaDisabled ? "storage_disabled" : "missing" },
      trailerMedia: { url: form.trailerUrl || null, path: form.trailerPath || null, status: form.trailerUrl ? "uploaded" : mediaDisabled ? "storage_disabled" : "missing" },
      eligibility: {},
      voting: { paidVotesActive: form.paidVotingEnabled, webhookConfirmationRequired: true, freeVotePolicy: "one_per_match_per_local_day" },
      sponsorship: { sponsorReady: form.sponsorReady, acceptSponsorshipProposals: form.acceptSponsorshipProposals, sponsorPlacementPreferences: form.sponsorPlacementPreferences, confirmedSponsorFundingMinor: 0 }
    };
  }

  const invalidateAutosave = useChallengeBuilderAutosave({
    enabled: Boolean(createdId) && !submitted && !saving,
    revision: form,
    secondaryRevision: step,
    save: () => apiRequest<{ tournament: { id: string } }>(`/api/tournaments/${createdId}`, { method: "PATCH", body: JSON.stringify(draftPayload("draft")) }),
    onResult: (result) => {
      setAutosaveFailed(!result.ok);
      if (!result.ok) setNotice(result.message || "We couldn't save your changes. Check your connection and try again.");
    },
    onError: () => {
      setAutosaveFailed(true);
      setNotice("We couldn't save your changes. Check your connection and try again.");
    }
  });

  async function saveDraft(status: "draft" | "pending_review" = "draft", quiet = false, background = false) {
    invalidateAutosave();
    if (!background) setSaving(true);
    if (!quiet) setNotice("");
    const payload = draftPayload(status);
    const result = await apiRequest<{ tournament: { id: string } }>(createdId ? `/api/tournaments/${createdId}` : "/api/tournaments", { method: createdId ? "PATCH" : "POST", body: JSON.stringify(payload) });
    if (!background) setSaving(false);
    if (!result.ok || !result.data) {
      setAutosaveFailed(true);
      if (!quiet || background) setNotice(result.message || "We couldn't save your changes. Check your connection and try again.");
      return false;
    }
    setAutosaveFailed(false);
    setCreatedId(result.data.tournament.id);
    if (status === "pending_review") {
      invalidateAutosave();
      setSubmitted(true);
      setNotice("");
    }
    if (!quiet) setNotice(status === "pending_review" ? "Tournament submitted for readiness review." : "Tournament draft saved.");
    return true;
  }

  async function next() {
    const stepError = currentStepError();
    if (stepError) {
      setNotice(stepError);
      return;
    }
    if (!(await saveDraft("draft", true))) return;
    const nextStep = Math.min(steps.length - 1, step + 1);
    setUnlocked((current) => Math.max(current, nextStep));
    setStep(nextStep);
  }

  function currentStepError() {
    if (step === 0 && (!form.title.trim() || !form.category.trim() || !form.subcategory.trim() || form.description.trim().length < 20 || form.description.trim().length > 1200)) return "Add a title, category, subcategory, and a 20–1,200 character full description before continuing.";
    if (step === 1 && form.participationMode === "team" && (form.minimumTeamSize < 1 || form.minimumTeamSize > form.maximumTeamSize || form.maximumTeamSize > 20)) return "Set valid tournament team sizes before continuing.";
    if (step === 3 && form.entryType === "paid_entry_setup_required" && form.entryFeeAmountMinor < 100) return "Set a valid paid entry amount.";
    if (step === 4 && !mediaDisabled && !form.coverImageUrl) return "Upload the tournament cover before continuing.";
    return "";
  }

  async function finishLater() {
    if (await saveDraft("draft", true)) router.push("/my-tournaments");
  }

  if (auth.loading) return <AppShell><main className="mx-auto min-h-[50vh] max-w-7xl p-8" aria-busy="true" /></AppShell>;
  if (!auth.user) return <AppShell><main className="mx-auto max-w-xl px-4 py-10"><Card className="p-8"><h1 className="text-2xl font-black">Sign in to create a tournament</h1><LinkButton href="/auth/login?next=%2Ftournaments%2Fcreate" className="mt-5">Sign In</LinkButton></Card></main></AppShell>;
  if (submitted && createdId) return <AppShell><main className="mx-auto max-w-2xl px-4 py-10 sm:px-6"><Card className="p-6 sm:p-8"><div className="grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-800"><Check size={24} /></div><h1 className="mt-5 text-2xl font-black">Tournament Submitted</h1><p className="mt-3 text-sm font-bold text-emerald-900">Your tournament has been sent for review.</p><p className="mt-3 text-sm leading-6 text-slate-600">Editing is unavailable while admin review is pending.</p><div className="mt-6 flex flex-wrap gap-3"><LinkButton href={`/tournaments/${createdId}`}>View Tournament</LinkButton><LinkButton href="/dashboard/host" variant="secondary">Back to Dashboard</LinkButton><LinkButton href="/contact" variant="ghost">Contact Support</LinkButton></div></Card></main></AppShell>;

  const userId = auth.user.uid;
  const guide = (tournamentRegistry[step] ?? tournamentRegistry[0]).guide;
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1560px] px-4 py-7 sm:px-6 lg:px-8">
        <PageTitle title="Create Tournament Challenge" subtitle="Configure a first-class Tournament Challenge using the reviewed publishing workflow." icon={<Trophy />} />
        <ChallengeBuilderFrame steps={steps} currentStep={step} unlockedStep={unlocked} guide={guide} guideOpen={mobileGuideOpen} setGuideOpen={setMobileGuideOpen} onStepChange={setStep}>
            <BuilderSurface>
             <BuilderContent>
             {step === 0 ? <OverviewStep form={form} update={update} /> : null}
             {step === 1 ? <FormatStep form={form} update={update} /> : null}
             {step === 2 ? <RegistrationStep form={form} update={update} /> : null}
             {step === 3 ? <><PrizeStep form={form} update={update} /><SponsorsStep form={form} update={update} /></> : null}
             {step === 4 ? <MediaStep form={form} update={update} mediaDisabled={mediaDisabled} userId={userId} setCoverStatus={setCoverStatus} setTrailerStatus={setTrailerStatus} /> : null}
             {step === 5 ? <RulesStep form={form} update={update} /> : null}
             {step === 6 ? <RoundsStep roundPlan={roundPlan} form={form} update={update} /> : null}
             {step === 7 ? <RoundSubmissionStep form={form} /> : null}
             {step === 8 ? <ReviewStep form={form} readiness={readiness} roundPlan={roundPlan} /> : null}
             {notice ? <div className="mt-5 rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">{notice}</div> : null}
            {createdId ? <LinkButton href={`/tournaments/${createdId}`} className="mt-5" variant="secondary">View tournament draft</LinkButton> : null}
             </BuilderContent>
             <BuilderFooter backDisabled={step === 0} busy={saving} finishLater={createdId ? () => void finishLater() : undefined} onBack={() => setStep((value) => Math.max(0, value - 1))} onContinue={step < steps.length - 1 ? () => void next() : () => void saveDraft("pending_review")} final={step === steps.length - 1} finalDisabled={autosaveFailed || (step === steps.length - 1 && !readiness.ready)} />
            </BuilderSurface>
        </ChallengeBuilderFrame>
      </main>
    </AppShell>
  );
}

function OverviewStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Overview" body="Define the tournament before configuring its bracket and operations." /><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Tournament title"><input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field><ChallengeTaxonomyFields category={form.category} subcategory={form.subcategory} onCategory={(value) => update("category", value)} onSubcategory={(value) => update("subcategory", value)} /></div><div className="mt-5 grid gap-5"><Field label="Full description"><textarea className={textareaClass} maxLength={1200} value={form.description} onChange={(event) => update("description", event.target.value)} /><span className="mt-1 block text-right text-xs text-slate-500">{form.description.length}/1,200</span></Field><Field label="Tournament rules"><textarea className={textareaClass} value={form.tournamentRules} onChange={(event) => update("tournamentRules", event.target.value)} /></Field></div></section>;
}

function MediaStep({ form, update, mediaDisabled, userId, setCoverStatus, setTrailerStatus }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void; mediaDisabled: boolean; userId: string; setCoverStatus: (status: MediaUploadStage) => void; setTrailerStatus: (status: MediaUploadStage) => void }) {
  return <section><StepTitle title="Media & Branding" body="Use storage-confirmed tournament media. No external URL or fake upload state is accepted." /><div className="mt-5 grid gap-5 md:grid-cols-2"><MediaUploadField label="Cover media" value={form.coverImageUrl} storagePath={tournamentDraftMediaPath(userId, "cover")} required disabled={mediaDisabled} onStatusChange={setCoverStatus} onChange={(url, meta) => { update("coverImageUrl", url); update("coverImagePath", meta?.path ?? ""); }} /><MediaUploadField label="Optional trailer" value={form.trailerUrl} kind="video" storagePath={tournamentDraftMediaPath(userId, "trailer")} disabled={mediaDisabled} onStatusChange={setTrailerStatus} onChange={(url, meta) => { update("trailerUrl", url); update("trailerPath", meta?.path ?? ""); }} /></div>{mediaDisabled ? <p className="mt-4 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">Media uploads are temporarily unavailable. Real upload mode resumes when Storage is configured.</p> : null}</section>;
}

function FormatStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Tournament Format" body="Choose one bracket entity type and one elimination format. Bracket size is the competitive capacity." /><div className="mt-5 grid gap-4 md:grid-cols-2">{(["individual", "team"] as const).map((mode) => <button type="button" key={mode} onClick={() => update("participationMode", mode)} className={`rounded-[8px] border p-4 text-left ${form.participationMode === mode ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-black/10"}`}><p className="font-black">{mode === "individual" ? "Individual" : "Team"}</p><p className="mt-2 text-sm text-slate-600">Every bracket slot represents one {mode === "individual" ? "participant" : "tournament team"}.</p></button>)}</div><div className="mt-5 grid gap-4 md:grid-cols-2">{(["single_elimination", "double_elimination"] as const).map((format) => <button type="button" key={format} onClick={() => update("format", format)} className={`rounded-[8px] border p-4 text-left ${form.format === format ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-black/10"}`}><p className="font-black">{format === "single_elimination" ? "Single Elimination" : "Double Elimination"}</p><p className="mt-2 text-sm text-slate-600">{format === "single_elimination" ? "One match loss eliminates a competitor. A Third-Place Match is included." : "The first loss moves a competitor to the Losers Bracket; a second loss eliminates them."}</p></button>)}</div><Field label="Bracket size"><select className={inputClass} value={form.participantCapacity} onChange={(event) => update("participantCapacity", Number(event.target.value))}>{TOURNAMENT_BRACKET_SIZES.map((capacity) => <option key={capacity} value={capacity}>{capacity} {form.participationMode === "team" ? "teams" : "participants"}</option>)}</select></Field>{form.participationMode === "team" ? <div className="mt-5 grid gap-5 md:grid-cols-3"><Field label="Minimum team size"><input className={inputClass} type="number" min="1" max="20" value={form.minimumTeamSize} onChange={(event) => update("minimumTeamSize", Number(event.target.value))} /></Field><Field label="Maximum team size"><input className={inputClass} type="number" min="1" max="20" value={form.maximumTeamSize} onChange={(event) => update("maximumTeamSize", Number(event.target.value))} /></Field><Field label="Team joining"><select className={inputClass} value={form.teamJoiningMode} onChange={(event) => update("teamJoiningMode", event.target.value as BuilderForm["teamJoiningMode"])}><option value="invite_only">Invite Only</option><option value="invite_and_requests">Invite + Join Requests</option></select></Field><p className="md:col-span-3 text-sm text-slate-600">Each team occupies one bracket slot after its roster is complete and eligibility is confirmed. The Captain submits each round entry.</p></div> : null}<div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Capacity" value={form.participantCapacity} /><Metric label="Winners rounds" value={singleEliminationStageCount(form.participantCapacity)} /><Metric label="Maximum matches" value={form.format === "double_elimination" ? doubleEliminationMatchCount(form.participantCapacity) : singleEliminationMatchCount(form.participantCapacity)} /></div><Card className="mt-5 p-4 text-sm text-slate-600">Entrants are paired by a server-generated random order. Every bracket slot must be filled; the system does not create initial byes.</Card></section>;
}


function RegistrationStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Eligibility & Registration" body="Eligible entrants confirm automatically when access, eligibility, and payment requirements pass. Registration stays open until every bracket slot is full." /><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Registration access"><select className={inputClass} value={form.registrationType} onChange={(e) => update("registrationType", e.target.value as BuilderForm["registrationType"])}><option value="open">Anyone Eligible</option><option value="invite_only">Invite Only</option></select></Field><Field label="Tournament visibility"><select className={inputClass} value={form.privacy} onChange={(e) => update("privacy", e.target.value as BuilderForm["privacy"])}><option value="public">Public</option><option value="private">Unlisted</option><option value="invite_only">Invite Only</option></select></Field></div><Card className="mt-5 p-4 text-sm leading-6 text-slate-600">There is no scheduled opening, registration cutoff, creator approval, or mandatory check-in. Creator cancellation is available only before activation.</Card></section>;
}

function RoundsStep({ roundPlan, form, update }: { roundPlan: ReturnType<typeof buildRoundPlan>; form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  const durations = [12, 24, 48, 72] as const;
  return <section><StepTitle title="Round Timing" body="Every match uses the selected presets. Each window starts from its actual server-recorded phase opening; both settings lock when the first entrant is confirmed." /><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Submission duration"><select className={inputClass} value={form.submissionDurationHours} onChange={(e) => update("submissionDurationHours", Number(e.target.value) as BuilderForm["submissionDurationHours"])}>{durations.map((hours) => <option key={hours} value={hours}>{hours} hours</option>)}</select></Field><Field label="Voting duration"><select className={inputClass} value={form.votingDurationHours} onChange={(e) => update("votingDurationHours", Number(e.target.value) as BuilderForm["votingDurationHours"])}>{durations.map((hours) => <option key={hours} value={hours}>{hours} hours</option>)}</select></Field></div><div className="mt-5 grid gap-4">{roundPlan.map((round) => <Card key={round.title} className="p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Match stage {round.roundNumber}</p><h3 className="mt-1 text-lg font-black">{round.title}</h3><p className="mt-2 text-sm text-slate-500">{form.submissionDurationHours}h submission · {form.votingDurationHours}h voting</p></Card>)}</div></section>;
}

function RoundSubmissionStep({ form }: { form: BuilderForm }) {
  return <section><StepTitle title="Entry & Round Submissions" body="Every advancing competitor submits new content for every round they reach." /><div className="mt-5 grid gap-4 md:grid-cols-2"><Card className="p-5"><h3 className="font-black">New submission every round</h3><p className="mt-2 text-sm leading-6 text-slate-400">Round submissions are independent, moderated content. A previous round entry is never reused automatically.</p></Card><Card className="p-5"><h3 className="font-black">{form.participationMode === "team" ? "Captain submits for the team" : "Competitor submission"}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{form.participationMode === "team" ? "Only the registered Captain can finalize the team&apos;s round entry in v1." : "Only the assigned active competitor can submit for their matchup."}</p></Card></div><p className="mt-4 text-sm text-slate-400">Image, Video, or Image and/or Video use the canonical Challenge Suite upload and moderation rules. Submission deadlines remain exact and server-authoritative.</p></section>;
}

function RulesStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Voting & Advancement" body="Validated public votes determine ordinary match outcomes. Live totals and leading indicators remain private until an outcome is finalized." /><div className="mt-5 grid gap-5 md:grid-cols-2"><Card className="p-4"><h3 className="font-black">Free Vote</h3><p className="mt-2 text-sm text-slate-500">One free vote per eligible account, per match, per local calendar day.</p></Card><label className="flex items-start gap-3 rounded-[8px] border border-black/10 p-4 text-sm font-bold"><input className="mt-1" type="checkbox" checked={form.paidVotingEnabled} onChange={(event) => update("paidVotingEnabled", event.target.checked)} /><span>Allow optional DoroCoin voting<p className="mt-1 font-normal text-slate-500">5 DoroCoins add one vote. Each paid vote requires an atomic wallet debit and confirmation.</p></span></label><Card className="p-4 text-sm leading-6 text-slate-600 md:col-span-2">Ties first use the verified vote event sequence. If that cannot distinguish a winner, the independent priority stored before the match opens is used. Single Elimination includes a mandatory third-place match; a missing valid result is held rather than assigned arbitrarily.</Card></div></section>;
}

function PrizeStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Monetization & Prize Pool" body="Fees and confirmed prize funding are shown separately. Prize-designated contributions go to the winner pool without creator/platform revenue shares." /><div className="mt-5 grid gap-5 md:grid-cols-3"><Field label="Entry mode"><select className={inputClass} value={form.entryType} onChange={(e) => update("entryType", e.target.value as BuilderForm["entryType"])}><option value="free">Free</option><option value="paid_entry_setup_required">Paid entry (payment setup required)</option></select></Field>{form.entryType === "paid_entry_setup_required" ? <Field label="Entry fee (minor units)"><input className={inputClass} type="number" min="100" value={form.entryFeeAmountMinor} onChange={(e) => update("entryFeeAmountMinor", Number(e.target.value))} /></Field> : null}<Field label="Currency"><div className={`${inputClass} flex items-center`} aria-label="Currency: United States dollars">USD</div></Field></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{form.prizeDistribution.map((item) => <Card key={item.placement} className="p-4"><p className="text-xs font-bold text-slate-500">{item.placement === 1 ? "1st" : item.placement === 2 ? "2nd" : "3rd"} place</p><p className="mt-2 text-2xl font-black">{item.percent}%</p><p className="mt-1 text-xs text-slate-400">of the winner allocation</p></Card>)}</div><Card className="mt-5 p-4 text-sm leading-6 text-slate-300">Where paid-entry revenue sharing applies, 65% is allocated to winners, 20% to creator/host, and 15% to the platform. The winners share is split 60% / 25% / 15% across three placements, or 100% for one. Prize-designated contributions do not receive creator/platform shares.</Card></section>;
}

function SponsorsStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Sponsors" body="Invite sponsor interest without mixing sponsor funding into tournament-generated revenue." /><div className="mt-5 grid gap-5 md:grid-cols-2"><label className="flex items-center gap-3 rounded-[8px] border border-white/10 p-4 text-sm font-bold"><input type="checkbox" checked={form.sponsorReady} onChange={(e) => update("sponsorReady", e.target.checked)} /> Sponsor ready</label><label className="flex items-center gap-3 rounded-[8px] border border-white/10 p-4 text-sm font-bold"><input type="checkbox" checked={form.acceptSponsorshipProposals} onChange={(e) => update("acceptSponsorshipProposals", e.target.checked)} /> Accept sponsor proposals</label>{form.sponsorReady ? <><Field label="Sponsorship goal (minor units)"><input className={inputClass} type="number" min="0" value={form.sponsorshipGoal} onChange={(e) => update("sponsorshipGoal", Number(e.target.value))} /></Field><Field label="Preferred sponsor categories"><input className={inputClass} value={form.sponsorCategories} onChange={(e) => update("sponsorCategories", e.target.value)} /></Field><Field label="Sponsor note"><textarea className={textareaClass} value={form.sponsorNote} onChange={(e) => update("sponsorNote", e.target.value)} /></Field><Field label="Visibility preferences"><textarea className={textareaClass} value={form.sponsorPlacementPreferences} onChange={(e) => update("sponsorPlacementPreferences", e.target.value)} /></Field></> : null}</div><p className="mt-4 text-sm text-slate-400">Sponsor records and public branding require canonical proposal, payment-confirmation, and review states.</p></section>;
}

function ReviewStep({ form, readiness, roundPlan }: { form: BuilderForm; readiness: { ready: boolean; errors: string[]; warnings: string[] }; roundPlan: ReturnType<typeof buildRoundPlan> }) {
  return <section><StepTitle title="Review & Publish" body="Review the tournament configuration before submitting it for admin review." /><div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]"><Card className="p-5"><h3 className="text-xl font-black">{form.title || "Untitled tournament"}</h3><p className="mt-2 text-sm text-slate-400">{form.description || "Full description required."}</p><p className="mt-3 text-sm font-bold capitalize">{form.format.replaceAll("_", " ")} / {form.seedingMethod} seeding / {form.registrationType.replaceAll("_", " ")}</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Capacity" value={form.participantCapacity} /><Metric label="Rounds" value={roundPlan.length} /><Metric label="Maximum matches" value={form.format === "double_elimination" ? doubleEliminationMatchCount(form.participantCapacity) : singleEliminationMatchCount(form.participantCapacity)} /></div></Card><Card className="p-5"><p className="font-black">{readiness.ready ? "Ready to submit for review" : "Needs fixes"}</p><div className="mt-3 space-y-2 text-sm">{readiness.errors.map((item) => <p key={item} className="text-red-300">{item}</p>)}{readiness.warnings.map((item) => <p key={item} className="text-yellow-100">{item}</p>)}{!readiness.errors.length && !readiness.warnings.length ? <p className="text-emerald-300">Admin review remains required before discovery or registration.</p> : null}</div></Card></div></section>;
}

function StepTitle({ title, body }: { title: string; body: string }) {
  return <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Tournament Builder</p><h2 className="mt-2 text-2xl font-black">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{body}</p></div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card className="p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></Card>;
}
