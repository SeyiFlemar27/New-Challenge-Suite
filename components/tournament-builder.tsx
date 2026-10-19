"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MediaUploadField, type MediaUploadStage } from "@/components/media-upload-field";
import { Button, Card, Field, LinkButton, PageTitle, inputClass, textareaClass } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { apiRequest } from "@/lib/api/client";
import { firebaseClientConfigStatus } from "@/lib/firebase/client";
import { tournamentDraftMediaPath } from "@/lib/media-upload-paths";
import { bracketSizeForParticipants, buildTournamentRoundPlan, defaultPrizeDistribution, doubleEliminationMatchCount, singleEliminationMatchCount, singleEliminationStageCount } from "@/lib/server/tournaments";
import { ChallengeTaxonomyFields } from "@/components/challenge-controlled-fields";
import { BuilderContent, BuilderFooter, BuilderSurface, ChallengeBuilderFrame } from "@/components/challenge-builder-frame";
import { CHALLENGE_BUILDER_REGISTRY, canonicalBuilderSteps } from "@/lib/challenge-builder-registry";
import { TOURNAMENT_BRACKET_SIZES } from "@/lib/server/tournament-validation";
import { useChallengeBuilderAutosave } from "@/lib/hooks/use-challenge-builder-autosave";
import { tournamentBasePrizeReadiness, tournamentBuilderStep, tournamentOrderedText, TOURNAMENT_BUILDER_STEP_KEYS, TOURNAMENT_TEAM_PAYMENT_WINDOWS, TOURNAMENT_PRODUCT_POLICY } from "@/lib/tournament-builder-policy";

const steps = canonicalBuilderSteps("tournament");
const tournamentRegistry = CHALLENGE_BUILDER_REGISTRY.tournament;

type BuilderForm = {
  title: string; description: string; category: string; subcategory: string; tournamentRules: string[];
  submissionInstructions: string[]; submissionMediaTypes: ("image" | "video")[]; teamPaymentWindowMinutes: number;
  basePrizeAmountMinor: number;
  galleryMedia: Array<{ url: string; path: string }>;
  coverImageUrl: string; coverImagePath: string; trailerUrl: string; trailerPath: string;
  format: "single_elimination" | "double_elimination"; participationMode: "individual" | "team"; participantCapacity: number; minimumTeamSize: number; maximumTeamSize: number; teamJoiningMode: "invite_only" | "invite_and_requests"; privacy: "public" | "private" | "invite_only"; registrationType: "open" | "invite_only";
  submissionDurationHours: 12 | 24 | 48 | 72; votingDurationHours: 12 | 24 | 48 | 72; paidVotingEnabled: boolean;
  seedingMethod: "random"; resultMethod: "votes"; scoreVisibility: "final_only"; tieBreaker: "pre_recorded_priority"; thirdPlaceMethod: "third_place_match" | "none";
  entryType: "free" | "paid_entry_setup_required"; entryFeeAmountMinor: number; currency: string; sponsorReady: boolean; acceptSponsorshipProposals: boolean; sponsorshipGoal: number; sponsorCategories: string; sponsorNote: string; sponsorPlacementPreferences: string; prizeDistribution: Array<{ placement: 1 | 2 | 3; percent: number }>;
};

const initialForm: BuilderForm = {
  title: "", description: "", category: "", subcategory: "", tournamentRules: [],
  submissionInstructions: [], submissionMediaTypes: ["image", "video"], teamPaymentWindowMinutes: 60,
  basePrizeAmountMinor: 0,
  galleryMedia: [],
  coverImageUrl: "", coverImagePath: "", trailerUrl: "", trailerPath: "",
  format: "single_elimination", participationMode: "individual", participantCapacity: 8, minimumTeamSize: 2, maximumTeamSize: 5, teamJoiningMode: "invite_and_requests", privacy: "public", registrationType: "open",
  submissionDurationHours: 48, votingDurationHours: 72, paidVotingEnabled: false,
  seedingMethod: "random", resultMethod: "votes", scoreVisibility: "final_only", tieBreaker: "pre_recorded_priority", thirdPlaceMethod: "third_place_match",
  entryType: "free", entryFeeAmountMinor: 0, currency: "USD", sponsorReady: false, acceptSponsorshipProposals: false, sponsorshipGoal: 0, sponsorCategories: "", sponsorNote: "", sponsorPlacementPreferences: "", prizeDistribution: defaultPrizeDistribution()
};

export function TournamentBuilder({ enterpriseOwnership, draftId }: { enterpriseOwnership?: "personal" | "official"; draftId?: string }) {
  const auth = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [unlocked, setUnlocked] = useState(0);
  const [form, setForm] = useState<BuilderForm>(initialForm);
  const [coverStatus, setCoverStatus] = useState<MediaUploadStage>("idle");
  const [trailerStatus, setTrailerStatus] = useState<MediaUploadStage>("idle");
  const [galleryStatus, setGalleryStatus] = useState<Record<number, MediaUploadStage>>({});
  const mediaBusy = [coverStatus, trailerStatus, ...Object.values(galleryStatus)].some(status => ["preparing", "uploading", "processing"].includes(status));
  const [notice, setNotice] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState("pending_review");
  const [mobileGuideOpen, setMobileGuideOpen] = useState(false);
  const [restoring, setRestoring] = useState(Boolean(draftId));
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [legacyDraftHeld, setLegacyDraftHeld] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [confirmedCreatorCents, setConfirmedCreatorCents] = useState(0);
  const [fundingStatus, setFundingStatus] = useState("not_funded");
  const [fundingBusy, setFundingBusy] = useState(false);
  const serverUpdatedAt = useRef<string | undefined>(undefined);
  const creationKey = useRef("");
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const mainRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const stepKey = TOURNAMENT_BUILDER_STEP_KEYS[step];
  const viewerUid = auth.user?.uid;
  useEffect(() => { mainRef.current?.querySelector<HTMLElement>("[data-tournament-step-heading]")?.focus({ preventScroll: true }); }, [step]);
  useEffect(() => {
    if (!draftId || !viewerUid) return;
    let cancelled = false;
    void apiRequest<{ tournament: Record<string, unknown> }>(`/api/tournaments/${encodeURIComponent(draftId)}?view=builder`).then(result => {
      if (cancelled) return;
      if (!result.ok || !result.data) { setRestoreFailed(true); setNotice(result.message || "Your draft could not be restored. Reload to retry."); return; }
      const saved = result.data.tournament;
      serverUpdatedAt.current = typeof saved.updatedAt === "string" ? saved.updatedAt : undefined;
      if (saved.status === "draft" && saved.productPolicyVersion !== TOURNAMENT_PRODUCT_POLICY) {
        setLegacyDraftHeld(true);
        return;
      }
      const team = saved.teamConfig as Record<string, unknown> | undefined;
      const cover = saved.coverMedia as Record<string, unknown> | undefined;
      const trailer = saved.trailerMedia as Record<string, unknown> | undefined;
      const sponsorship = saved.sponsorship as Record<string, unknown> | undefined;
      setConfirmedCreatorCents(Number(saved.confirmedCreatorPrizeFundingCents ?? 0));
      setFundingStatus(String(saved.creatorPrizeFundingStatus ?? "not_funded"));
      setForm({ ...initialForm, ...Object.fromEntries(Object.keys(initialForm).filter(key => key in saved).map(key => [key, saved[key]])),
        tournamentRules: tournamentOrderedText(saved.tournamentRules), submissionInstructions: tournamentOrderedText(saved.submissionInstructions),
        minimumTeamSize: Number(team?.minimumSize ?? 2), maximumTeamSize: Number(team?.maximumSize ?? 5),
        teamJoiningMode: team?.joiningMode === "invite_only" ? "invite_only" : "invite_and_requests",
        coverImageUrl: String(saved.coverImageUrl ?? cover?.url ?? ""), coverImagePath: String(saved.coverImagePath ?? cover?.path ?? ""),
        trailerUrl: String(saved.trailerUrl ?? trailer?.url ?? ""), trailerPath: String(saved.trailerPath ?? trailer?.path ?? ""),
        sponsorReady: sponsorship?.sponsorReady === true, acceptSponsorshipProposals: sponsorship?.sponsorReady === true
      } as BuilderForm);
      const restoredKey = tournamentBuilderStep(saved.builderCurrentStep ?? saved.builderCurrentStepIndex, saved.builderNavigationVersion);
      const unlockedKey = tournamentBuilderStep(saved.builderUnlockedStep ?? restoredKey, saved.builderNavigationVersion);
      setStep(TOURNAMENT_BUILDER_STEP_KEYS.indexOf(restoredKey));
      setUnlocked(Math.max(TOURNAMENT_BUILDER_STEP_KEYS.indexOf(restoredKey), TOURNAMENT_BUILDER_STEP_KEYS.indexOf(unlockedKey)));
      setCreatedId(draftId);
      if (["rejected", "changes_requested"].includes(String(saved.reviewStatus)) && saved.reviewReason) setNotice(`Review feedback: ${String(saved.reviewReason)}`);
      if (saved.status !== "draft") { setSubmittedStatus(String(saved.status)); setSubmitted(true); }
    }).catch(() => { if (!cancelled) { setRestoreFailed(true); setNotice("Your draft could not be restored. Reload to retry."); } }).finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, [viewerUid, draftId]);
  const mediaDisabled = firebaseClientConfigStatus.mediaUploadsDisabled;
  const roundPlan = useMemo(() => buildTournamentRoundPlan(bracketSizeForParticipants(form.participantCapacity), form.format), [form.participantCapacity, form.format]);
  const readiness = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!form.title.trim() || form.title.trim().length > 120) errors.push("Tournament title is required and must be 120 characters or fewer.");
    if (form.description.trim().length < 20 || form.description.trim().length > 1200) errors.push("Full description must be 20–1,200 characters.");
    if (!form.category.trim()) errors.push("Category is required.");
    if (!form.coverImageUrl || !form.coverImagePath) errors.push("Cover media upload must complete.");
    if (form.participationMode === "team" && (!Number.isInteger(form.minimumTeamSize) || !Number.isInteger(form.maximumTeamSize) || form.minimumTeamSize < 1 || form.minimumTeamSize > form.maximumTeamSize || form.maximumTeamSize > 20)) errors.push("Team size must satisfy 1 <= minimum <= maximum <= 20.");
    if (form.entryType === "paid_entry_setup_required" && form.entryFeeAmountMinor < 500) errors.push("Set a valid paid entry amount.");
    const funding = tournamentBasePrizeReadiness(form.basePrizeAmountMinor, confirmedCreatorCents);
    if (!funding.valid) errors.push("Choose no Base Prize or a Base Prize of at least $5.");
    else if (!funding.fullyFunded) errors.push(`Your Base Prize is $${(form.basePrizeAmountMinor / 100).toFixed(2)}, but only $${(confirmedCreatorCents / 100).toFixed(2)} is confirmed. Fund the remaining $${(funding.outstandingCents / 100).toFixed(2)} before Admin Review.`);
    if (form.entryType === "paid_entry_setup_required") warnings.push("Paid entry remains provider-confirmed and setup-gated.");
    if (["uploading", "preparing", "processing"].includes(coverStatus)) errors.push("Wait for cover upload to finish.");
    if (["uploading", "preparing", "processing"].includes(trailerStatus)) errors.push("Wait for trailer upload to finish.");
    if (Object.values(galleryStatus).some(status => ["uploading", "preparing", "processing"].includes(status))) errors.push("Wait for additional image uploads to finish.");
    return { errors, warnings, ready: errors.length === 0 };
  }, [coverStatus, form, trailerStatus, confirmedCreatorCents, galleryStatus]);

  function update<K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function draftPayload(status: "draft" | "pending_review" = "draft") {
    return {
      ...form,
      galleryMedia: form.galleryMedia.filter(media => media.url && media.path),
      privacy: "public",
      registrationType: "open",
      builderCurrentStep: stepKey,
      builderUnlockedStep: TOURNAMENT_BUILDER_STEP_KEYS[unlocked],
      builderNavigationVersion: 2,
      ...(enterpriseOwnership ? { officialChallenge: enterpriseOwnership === "official", ownershipType: enterpriseOwnership === "official" ? "challenge_suite_official" : "enterprise_personal" } : {}),
      currency: "USD",
      configVersion: 3,
      status,
      roundPlan,
      submissionDurationHours: form.submissionDurationHours,
      votingDurationHours: form.votingDurationHours,
      seedingMethod: "random",
      resultMethod: "votes",
      tieBreaker: "pre_recorded_priority",
      thirdPlaceMethod: form.format === "single_elimination" ? "third_place_match" : "none",
      scoreVisibility: "final_only",
      coverMedia: { url: form.coverImageUrl || null, path: form.coverImagePath || null, status: form.coverImageUrl ? "uploaded" : mediaDisabled ? "storage_disabled" : "missing" },
      trailerMedia: { url: form.trailerUrl || null, path: form.trailerPath || null, status: form.trailerUrl ? "uploaded" : mediaDisabled ? "storage_disabled" : "missing" },
      eligibility: {},
      sponsorship: { sponsorReady: form.sponsorReady, acceptSponsorshipProposals: form.acceptSponsorshipProposals, sponsorPlacementPreferences: form.sponsorPlacementPreferences, confirmedSponsorFundingMinor: 0 }
    };
  }

  function persistDraft(payload: ReturnType<typeof draftPayload>) {
    const pending = saveQueue.current.then(async () => {
      if (!creationKey.current) creationKey.current = crypto.randomUUID();
      const result = await apiRequest<{ tournament: { id: string; updatedAt?: string } }>(createdId ? `/api/tournaments/${createdId}` : "/api/tournaments", { method: createdId ? "PATCH" : "POST", ...(!createdId ? { headers: { "x-challenge-creation-key": creationKey.current } } : {}), body: JSON.stringify({ ...payload, ...(createdId && serverUpdatedAt.current ? { expectedUpdatedAt: serverUpdatedAt.current } : {}) }) });
      if (result.ok && result.data?.tournament.updatedAt) serverUpdatedAt.current = result.data.tournament.updatedAt;
      return result;
    });
    saveQueue.current = pending.then(() => undefined, () => undefined);
    return pending;
  }

  const invalidateAutosave = useChallengeBuilderAutosave({
    enabled: Boolean(createdId) && !submitted && !saving,
    revision: form,
    secondaryRevision: step,
    save: () => persistDraft(draftPayload("draft")),
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
    if (mediaBusy) { setNotice("Wait for your media upload to finish before saving or submitting."); return false; }
    invalidateAutosave();
    if (!background) setSaving(true);
    if (!quiet) setNotice("");
    const payload = draftPayload(status);
    let result;
    try { result = await persistDraft(payload); }
    catch {
      if (!background) setSaving(false);
      setAutosaveFailed(true);
      setNotice("Your draft save could not be confirmed. Your edits remain here; retry before leaving.");
      return false;
    }
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
    if (!quiet) setNotice(status === "pending_review" ? "Your challenge has been submitted for review." : "Tournament draft saved.");
    return result.data.tournament.id;
  }

  async function refreshFunding() {
    if (!createdId) return;
    setFundingBusy(true);
    try {
      const result = await apiRequest<{ tournament: Record<string, unknown> }>(`/api/tournaments/${encodeURIComponent(createdId)}?view=builder`);
      if (!result.ok || !result.data) { setNotice(result.message || "Funding confirmation could not be checked."); return; }
      setConfirmedCreatorCents(Number(result.data.tournament.confirmedCreatorPrizeFundingCents ?? 0));
      setFundingStatus(String(result.data.tournament.creatorPrizeFundingStatus ?? "not_funded"));
    } catch {
      setNotice("Funding confirmation could not be checked. Your previously confirmed funding has not been changed; retry the check.");
    } finally { setFundingBusy(false); }
  }

  async function fundBasePrize() {
    setFundingBusy(true);
    try {
      const draftId = await saveDraft("draft", true);
      if (!draftId) return;
      const result = await apiRequest<{ url?: string; status: string }>(`/api/tournaments/${encodeURIComponent(draftId)}/prize-funding`, { method: "POST" });
      if (result.ok && result.data?.url) window.location.assign(result.data.url);
      else setNotice(result.message || "Funding could not be opened. No funding has been confirmed.");
    } catch {
      setNotice("The funding request could not be confirmed. Check the existing funding status before trying again; returning from checkout does not confirm payment.");
    } finally { setFundingBusy(false); }
  }

  async function next() {
    const stepError = currentStepError();
    if (stepError) {
      setNotice(stepError);
      requestAnimationFrame(() => { (mainRef.current?.querySelector<HTMLElement>("input:invalid, textarea:invalid, select:invalid") ?? noticeRef.current)?.focus(); });
      return;
    }
    if (!(await saveDraft("draft", true))) return;
    const nextStep = Math.min(steps.length - 1, step + 1);
    setUnlocked((current) => Math.max(current, nextStep));
    setStep(nextStep);
  }

  function currentStepError() {
    if (stepKey === "overview" && (!form.title.trim() || form.title.trim().length > 120 || !form.category.trim() || !form.subcategory.trim() || form.description.trim().length < 20 || form.description.trim().length > 1200)) return "Add a title of up to 120 characters, category, subcategory, and a 20–1,200 character full description before continuing.";
    if (stepKey === "registration" && form.participationMode === "team" && (form.minimumTeamSize < 1 || form.minimumTeamSize > form.maximumTeamSize || form.maximumTeamSize > 20)) return "Set valid tournament team sizes before continuing.";
    if (stepKey === "monetization" && form.entryType === "paid_entry_setup_required" && form.entryFeeAmountMinor < 500) return "Set a valid paid entry amount.";
    if (stepKey === "media" && (!form.coverImageUrl || !form.coverImagePath)) return "Upload the tournament cover before continuing.";
    return "";
  }

  async function finishLater() {
    if (await saveDraft("draft", true)) router.push("/my-tournaments");
  }

  async function adoptLegacyDraft() {
    if (!draftId || saving || !window.confirm("Convert this unused draft to the current public, open-registration Tournament rules: automatic Free-first + optional 5 DoroCoin voting, fixed 60/25/15 placement shares, and individual member payments for teams? The original draft is archived. Existing activity or financial records will block conversion. Review every section afterward.")) return;
    setSaving(true);
    try {
      const result = await apiRequest(`/api/tournaments/${encodeURIComponent(draftId)}/adopt-draft-policy`, { method: "POST", body: JSON.stringify({ confirmed: true, expectedUpdatedAt: serverUpdatedAt.current ?? null }) });
      if (result.ok) window.location.reload();
      else setNotice(result.message || "The existing draft remains unchanged. Contact Support for review.");
    } catch { setNotice("Conversion could not be confirmed. Reload to check the draft; no payment was started."); }
    finally { setSaving(false); }
  }

  if (auth.loading || (restoring && auth.user)) return <AppShell><main className="mx-auto min-h-[50vh] max-w-7xl p-8" aria-busy="true" /></AppShell>;
  if (!auth.user) return <AppShell><main className="mx-auto max-w-xl px-4 py-10"><Card className="p-8"><h1 className="text-2xl font-black">Sign in to create a tournament</h1><LinkButton href="/auth/login?next=%2Ftournaments%2Fcreate" className="mt-5">Sign In</LinkButton></Card></main></AppShell>;
  if (legacyDraftHeld) return <AppShell><main className="mx-auto max-w-2xl px-4 py-10"><Card className="p-6"><h1 className="text-xl font-black">Existing Tournament draft preserved</h1><p role="status" className="mt-3">This draft uses earlier competition or financial terms. No saved fields, media, funding or participant records have been changed.</p><p className="mt-3 text-sm text-[var(--muted)]">The responsible owner may explicitly convert an unused draft to the current public Tournament rules. The server archives its original contents and refuses conversion if competition activity, funding or financial references exist. Those drafts require Support review.</p>{notice ? <p role="alert" className="mt-3 text-sm">{notice}</p> : null}<div className="mt-5 flex flex-wrap gap-3"><Button disabled={saving} onClick={() => void adoptLegacyDraft()}>Convert unused draft to current rules</Button><LinkButton href="/my-tournaments" variant="secondary">My Tournaments</LinkButton><LinkButton href="/support/new" variant="secondary">Contact Support</LinkButton></div></Card></main></AppShell>;
  if (restoreFailed) return <AppShell><Card className="mx-auto my-10 max-w-xl p-6"><h1 className="text-xl font-black">Draft unavailable</h1><p role="alert" className="mt-3">{notice}</p><Button className="mt-4" onClick={() => window.location.reload()}>Retry</Button></Card></AppShell>;
  if (submitted && createdId) return <AppShell><main className="mx-auto max-w-2xl px-4 py-10 sm:px-6"><Card className="p-6 sm:p-8"><div className="grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-800"><Check size={24} /></div><h1 className="mt-5 text-2xl font-black">{submittedStatus === "pending_review" ? "Tournament Submitted" : "Tournament is read-only"}</h1><p className="mt-3 text-sm font-bold">Current status: {submittedStatus.replaceAll("_", " ")}.</p><p className="mt-3 text-sm leading-6 text-slate-600">Editing is unavailable during Admin review and after publication. Your existing Tournament has not been recreated.</p><div className="mt-6 flex flex-wrap gap-3"><LinkButton href={`/tournaments/${createdId}`}>View Tournament</LinkButton><LinkButton href="/dashboard/host" variant="secondary">Back to Dashboard</LinkButton><LinkButton href="/contact" variant="ghost">Contact Support</LinkButton></div></Card></main></AppShell>;

  const userId = auth.user.uid;
  const guide = (tournamentRegistry[step] ?? tournamentRegistry[0]).guide;
  return (
    <AppShell>
      <main ref={mainRef} className="mx-auto w-full max-w-[1560px] px-4 py-7 sm:px-6 lg:px-8">
        <PageTitle title="Create Tournament Challenge" subtitle="Configure a first-class Tournament Challenge using the reviewed publishing workflow." icon={<Trophy />} />
        <ChallengeBuilderFrame steps={steps} currentStep={step} unlockedStep={unlocked} guide={guide} guideOpen={mobileGuideOpen} setGuideOpen={setMobileGuideOpen} onStepChange={value => { if (mediaBusy) { setNotice("Wait for your media upload to finish before leaving this step."); return; } setStep(value); }}>
            <BuilderSurface>
             <BuilderContent>
             {step === 0 ? <OverviewStep form={form} update={update} /> : null}
             {step === 1 ? <FormatStep form={form} update={update} /> : null}
             {step === 2 ? <RegistrationStep form={form} update={update} /> : null}
             {step === 3 ? <><PrizeStep form={form} update={update} /><Field label="Creator-funded Base Prize (USD, optional)"><input className={inputClass} type="number" min="0" step="0.01" value={form.basePrizeAmountMinor === 0 ? "" : form.basePrizeAmountMinor / 100} disabled={confirmedCreatorCents > 0 || fundingStatus === "pending_confirmation" || fundingStatus === "review_required"} onChange={event => update("basePrizeAmountMinor", Math.round(Number(event.target.value) * 100))} /></Field><div role="status" className="mt-3 text-sm text-[var(--muted)]">{form.basePrizeAmountMinor === 0 ? "No Base Prize funding required. No guaranteed cash prize has been selected." : `Base Prize: $${(form.basePrizeAmountMinor / 100).toFixed(2)}. Confirmed creator funding: $${(confirmedCreatorCents / 100).toFixed(2)}. Outstanding: $${(Math.max(0, form.basePrizeAmountMinor - confirmedCreatorCents) / 100).toFixed(2)}. ${fundingStatus.replaceAll("_", " ")}.`}</div>{form.basePrizeAmountMinor > 0 ? <div className="mt-3 flex flex-wrap gap-3"><Button type="button" disabled={fundingBusy || saving || !tournamentBasePrizeReadiness(form.basePrizeAmountMinor, confirmedCreatorCents).valid || confirmedCreatorCents >= form.basePrizeAmountMinor || fundingStatus === "review_required"} onClick={() => void fundBasePrize()}>Fund Base Prize</Button><Button type="button" variant="secondary" disabled={fundingBusy || !createdId} onClick={() => void refreshFunding()}>Check funding confirmation</Button></div> : null}<SponsorsStep form={form} update={update} /></> : null}
             {step === 4 ? <MediaStep form={form} update={update} mediaDisabled={mediaDisabled} userId={userId} setCoverStatus={setCoverStatus} setTrailerStatus={setTrailerStatus} setGalleryStatus={(index, status) => setGalleryStatus(current => ({ ...current, [index]: status }))} /> : null}
             {stepKey === "rounds" ? <><RoundsStep roundPlan={roundPlan} form={form} update={update} /><RoundSubmissionStep form={form} /><OrderedText label="Instruction" values={form.submissionInstructions} update={values => update("submissionInstructions", values)} reorder /><Field label="Submission format"><select className={inputClass} value={form.submissionMediaTypes.length === 2 ? "both" : form.submissionMediaTypes[0]} onChange={event => update("submissionMediaTypes", event.target.value === "both" ? ["image", "video"] : [event.target.value as "image" | "video"])}><option value="both">Image and/or Video</option><option value="image">Image</option><option value="video">Video</option></select></Field></> : null}
             {stepKey === "review" ? <><ReviewStep form={form} readiness={readiness} roundPlan={roundPlan} confirmedCreatorCents={confirmedCreatorCents} edit={key => setStep(TOURNAMENT_BUILDER_STEP_KEYS.indexOf(key))} /><div className="mt-5 grid gap-4"><label className="flex gap-3 text-sm"><input type="checkbox" checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)} /> I confirm the Tournament information is accurate.</label><label className="flex gap-3 text-sm"><input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)} /> I have the rights and permission to use the uploaded media.</label></div></> : null}
             {notice ? <div ref={noticeRef} tabIndex={-1} role={autosaveFailed ? "alert" : "status"} className="mt-5 rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">{notice}{autosaveFailed ? <Button className="mt-3" variant="secondary" disabled={saving} onClick={() => void saveDraft("draft")}>Retry save</Button> : null}</div> : null}
            {createdId ? <LinkButton href={`/tournaments/${createdId}`} className="mt-5" variant="secondary">View tournament draft</LinkButton> : null}
             </BuilderContent>
             <BuilderFooter backDisabled={step === 0} busy={saving || mediaBusy} finishLater={() => void finishLater()} onBack={() => setStep((value) => Math.max(0, value - 1))} onContinue={step < steps.length - 1 ? () => void next() : () => void saveDraft("pending_review")} final={step === steps.length - 1} finalDisabled={autosaveFailed || (step === steps.length - 1 && (!readiness.ready || !reviewConfirmed || !rightsConfirmed))} />
            </BuilderSurface>
        </ChallengeBuilderFrame>
      </main>
    </AppShell>
  );
}

function OverviewStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Overview" body="Introduce your Tournament and the rules every competitor should know." />
    <div className="mt-5 grid gap-5">
      <Field label="Tournament title"><input className={inputClass} maxLength={120} required value={form.title} onChange={event => update("title", event.target.value)} /></Field>
      <ChallengeTaxonomyFields category={form.category} subcategory={form.subcategory} onCategory={value => { update("category", value); update("subcategory", ""); }} onSubcategory={value => update("subcategory", value)} />
      <Field label="Full description"><textarea aria-label="Full description" aria-describedby="tournament-description-count" className={textareaClass} minLength={20} maxLength={1200} required value={form.description} onChange={event => update("description", event.target.value)} /><span id="tournament-description-count" className="mt-1 block text-right text-xs text-[var(--muted)]">{form.description.length}/1,200</span></Field>
      <OrderedText label="Rule" values={form.tournamentRules} update={values => update("tournamentRules", values)} />
    </div>
  </section>;
}

function MediaStep({ form, update, mediaDisabled, userId, setCoverStatus, setTrailerStatus, setGalleryStatus }: {
  form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void;
  mediaDisabled: boolean; userId: string; setCoverStatus: (status: MediaUploadStage) => void;
  setTrailerStatus: (status: MediaUploadStage) => void; setGalleryStatus: (index: number, status: MediaUploadStage) => void;
}) {
  return <section><StepTitle title="Media" body="Choose the cover participants will see throughout your Tournament." />
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <MediaUploadField label="Cover image" value={form.coverImageUrl} storagePath={tournamentDraftMediaPath(userId, "cover")} maxSizeMb={10} required disabled={mediaDisabled} onStatusChange={setCoverStatus} onChange={(url, meta) => { update("coverImageUrl", url); update("coverImagePath", meta?.path ?? ""); }} />
      {[0, 1].map(index => <MediaUploadField key={index} label={`Additional image ${index + 1} (optional)`} value={form.galleryMedia[index]?.url ?? ""} storagePath={tournamentDraftMediaPath(userId, "cover")} maxSizeMb={10} disabled={mediaDisabled} onStatusChange={status => setGalleryStatus(index, status)} onChange={(url, meta) => {
        const images = [form.galleryMedia[0] ?? { url: "", path: "" }, form.galleryMedia[1] ?? { url: "", path: "" }];
        images[index] = { url, path: meta?.path ?? "" }; update("galleryMedia", images);
      }} />)}
      <MediaUploadField label="Promotional video (optional)" kind="video" value={form.trailerUrl} storagePath={tournamentDraftMediaPath(userId, "trailer")} maxSizeMb={49} disabled={mediaDisabled} onStatusChange={setTrailerStatus} onChange={(url, meta) => { update("trailerUrl", url); update("trailerPath", meta?.path ?? ""); }} />
    </div>
    {form.galleryMedia.filter(image => image.url).length === 2 ? <Button type="button" variant="secondary" className="mt-4" onClick={() => update("galleryMedia", [...form.galleryMedia].reverse())}>Swap additional image order</Button> : null}
    {mediaDisabled ? <p role="status" className="mt-4 text-sm text-[var(--muted)]">Media uploads are temporarily unavailable. Your saved media is preserved.</p> : null}
  </section>;
}

function FormatStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Tournament Format" body="Choose one bracket entity type and one elimination format. Bracket size is the competitive capacity." /><div className="mt-5 grid gap-4 md:grid-cols-2">{(["individual", "team"] as const).map((mode) => <button type="button" key={mode} onClick={() => update("participationMode", mode)} className={`rounded-[8px] border p-4 text-left ${form.participationMode === mode ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-black/10"}`}><p className="font-black">{mode === "individual" ? "Individual" : "Team"}</p><p className="mt-2 text-sm text-slate-600">Every bracket slot represents one {mode === "individual" ? "participant" : "tournament team"}.</p></button>)}</div><div className="mt-5 grid gap-4 md:grid-cols-2">{(["single_elimination", "double_elimination"] as const).map((format) => <button type="button" key={format} onClick={() => update("format", format)} className={`rounded-[8px] border p-4 text-left ${form.format === format ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-black/10"}`}><p className="font-black">{format === "single_elimination" ? "Single Elimination" : "Double Elimination"}</p><p className="mt-2 text-sm text-slate-600">{format === "single_elimination" ? "One match loss eliminates a competitor. A Third-Place Match is included." : "The first loss moves a competitor to the Losers Bracket; a second loss eliminates them."}</p></button>)}</div><Field label="Bracket size"><select className={inputClass} value={form.participantCapacity} onChange={(event) => update("participantCapacity", Number(event.target.value))}>{TOURNAMENT_BRACKET_SIZES.map((capacity) => <option key={capacity} value={capacity}>{capacity} {form.participationMode === "team" ? "teams" : "participants"}</option>)}</select></Field>{form.participationMode === "team" ? <div className="mt-5 grid gap-5 md:grid-cols-3"><Field label="Minimum team size"><input className={inputClass} type="number" min="1" max="20" value={form.minimumTeamSize} onChange={(event) => update("minimumTeamSize", Number(event.target.value))} /></Field><Field label="Maximum team size"><input className={inputClass} type="number" min="1" max="20" value={form.maximumTeamSize} onChange={(event) => update("maximumTeamSize", Number(event.target.value))} /></Field><p className="md:col-span-2 text-sm text-slate-600">Each team occupies one bracket slot after its roster is complete and eligibility is confirmed. The Captain submits each round entry.</p></div> : null}<div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Capacity" value={form.participantCapacity} /><Metric label="Winners rounds" value={singleEliminationStageCount(form.participantCapacity)} /><Metric label="Maximum matches" value={form.format === "double_elimination" ? doubleEliminationMatchCount(form.participantCapacity) : singleEliminationMatchCount(form.participantCapacity)} /></div><Card className="mt-5 p-4 text-sm text-slate-600">Entrants are paired by a server-generated random order. Every bracket slot must be filled; the system does not create initial byes.</Card></section>;
}


function RegistrationStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Registration & Teams" body="This Tournament will be publicly discoverable. Eligible entrants register until every bracket slot is confirmed." />
    {form.participationMode === "team" ? <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <Field label="Team joining"><select aria-label="Team joining" className={inputClass} value={form.teamJoiningMode} onChange={event => update("teamJoiningMode", event.target.value as BuilderForm["teamJoiningMode"])}><option value="invite_only">Invite Only</option><option value="invite_and_requests">Invitations + Join Requests</option></select></Field>
      <Field label="Team payment window"><select aria-label="Team payment window" className={inputClass} value={form.teamPaymentWindowMinutes} onChange={event => update("teamPaymentWindowMinutes", Number(event.target.value))}>{TOURNAMENT_TEAM_PAYMENT_WINDOWS.map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></Field>
      <p className="text-sm text-[var(--muted)] sm:col-span-2">The captain recruits a valid roster and starts registration. Every member must consent to membership. Paid team registration requires each member&apos;s verified payment before the team receives a confirmed bracket slot.</p>
    </div> : <p className="mt-5 text-sm text-[var(--muted)]">Each eligible individual occupies one slot after the applicable entry requirements pass.</p>}
    <p className="mt-5 text-sm text-[var(--muted)]">Registration has no fixed calendar or mandatory check-in. The server rechecks eligibility and capacity before activation.</p>
  </section>;
}

function RoundsStep({ roundPlan, form, update }: { roundPlan: ReturnType<typeof buildTournamentRoundPlan>; form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  const durations = [12, 24, 48, 72] as const;
  return <section><StepTitle title="Round Timing & Submissions" body="Every match uses the selected presets. Each window starts from its actual server-recorded phase opening; both settings lock when the first entrant is confirmed." /><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Submission duration"><select className={inputClass} value={form.submissionDurationHours} onChange={(e) => update("submissionDurationHours", Number(e.target.value) as BuilderForm["submissionDurationHours"])}>{durations.map((hours) => <option key={hours} value={hours}>{hours} hours</option>)}</select></Field><Field label="Voting duration"><select className={inputClass} value={form.votingDurationHours} onChange={(e) => update("votingDurationHours", Number(e.target.value) as BuilderForm["votingDurationHours"])}>{durations.map((hours) => <option key={hours} value={hours}>{hours} hours</option>)}</select></Field></div><div className="mt-5 grid gap-4">{roundPlan.map((round) => <Card key={round.title} className="p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Match stage {round.roundNumber}</p><h3 className="mt-1 text-lg font-black">{round.title}</h3><p className="mt-2 text-sm text-slate-500">{form.submissionDurationHours}h submission · {form.votingDurationHours}h voting</p></Card>)}</div></section>;
}

function RoundSubmissionStep({ form }: { form: BuilderForm }) {
  return <section><StepTitle title="Entry & Round Submissions" body="Every advancing competitor submits new content for every round they reach." /><div className="mt-5 grid gap-4 md:grid-cols-2"><Card className="p-5"><h3 className="font-black">New submission every round</h3><p className="mt-2 text-sm leading-6 text-slate-400">Round submissions are independent, moderated content. A previous round entry is never reused automatically.</p></Card><Card className="p-5"><h3 className="font-black">{form.participationMode === "team" ? "Captain submits for the team" : "Competitor submission"}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{form.participationMode === "team" ? "Only the registered Captain can finalize the team&apos;s round entry in v1." : "Only the assigned active competitor can submit for their matchup."}</p></Card></div><p className="mt-4 text-sm text-slate-400">Image, Video, or Image and/or Video use the canonical Challenge Suite upload and moderation rules. Submission deadlines remain exact and server-authoritative.</p></section>;
}

function OrderedText({ label, values, update, reorder = false }: { label: string; values: string[]; update: (values: string[]) => void; reorder?: boolean }) {
  function move(index: number, direction: -1 | 1) {
    const next = [...values];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    update(next);
  }
  return <fieldset className="mt-5 grid gap-3"><legend className="text-sm font-bold">{label === "Rule" ? "Tournament Rules" : "Submission Instructions (optional)"}</legend><ol className="grid gap-3">{values.map((value, index) => <li key={index} className="grid gap-2 sm:grid-cols-[1fr_auto]"><textarea className={textareaClass} rows={2} maxLength={1000} aria-label={`${label} ${index + 1}`} value={value} onChange={event => update(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /><div className="flex flex-wrap gap-2">{reorder ? <><Button type="button" variant="ghost" aria-label={`Move ${label.toLowerCase()} ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>Up</Button><Button type="button" variant="ghost" aria-label={`Move ${label.toLowerCase()} ${index + 1} down`} disabled={index === values.length - 1} onClick={() => move(index, 1)}>Down</Button></> : null}<Button type="button" variant="ghost" aria-label={`Remove ${label.toLowerCase()} ${index + 1}`} onClick={() => update(values.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></div></li>)}</ol><Button type="button" className="justify-self-start" variant="secondary" onClick={() => update([...values, ""])}>Add {label}</Button></fieldset>;
}

function PrizeStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Monetization & Prize Pool" body="Fees and confirmed prize funding are shown separately. Prize-designated contributions go to the winner pool without creator/platform revenue shares." /><div className="mt-5 grid gap-5 md:grid-cols-3"><Field label="Entry mode"><select className={inputClass} value={form.entryType} onChange={(e) => update("entryType", e.target.value as BuilderForm["entryType"])}><option value="free">Free</option><option value="paid_entry_setup_required">Paid entry (payment setup required)</option></select></Field>{form.entryType === "paid_entry_setup_required" ? <Field label={form.participationMode === "team" ? "Entry fee per member (USD)" : "Entry fee (USD)"}><input className={inputClass} type="number" min="5" step="0.01" value={form.entryFeeAmountMinor ? form.entryFeeAmountMinor / 100 : ""} onChange={(e) => update("entryFeeAmountMinor", Math.round(Number(e.target.value) * 100))} /></Field> : null}<Field label="Currency"><div className={`${inputClass} flex items-center`} aria-label="Currency: United States dollars">USD</div></Field></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{form.prizeDistribution.map((item) => <Card key={item.placement} className="p-4"><p className="text-xs font-bold text-slate-500">{item.placement === 1 ? "1st" : item.placement === 2 ? "2nd" : "3rd"} place</p><p className="mt-2 text-2xl font-black">{item.percent}%</p><p className="mt-1 text-xs text-slate-400">of the winner allocation</p></Card>)}</div><Card className="mt-5 p-4 text-sm leading-6 text-slate-300">Where paid-entry revenue sharing applies, 65% is allocated to winners, 20% to creator/host, and 15% to the platform. The winners share is split 60% / 25% / 15% across the three placements. Prize-designated contributions do not receive creator/platform shares.</Card></section>;
}

function SponsorsStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <label className="mt-5 flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={form.sponsorReady} onChange={event => { update("sponsorReady", event.target.checked); update("acceptSponsorshipProposals", event.target.checked); }} /> Open this tournament to sponsors</label>;
}

function ReviewStep({ form, readiness, roundPlan, confirmedCreatorCents, edit }: { form: BuilderForm; readiness: { ready: boolean; errors: string[]; warnings: string[] }; roundPlan: ReturnType<typeof buildTournamentRoundPlan>; confirmedCreatorCents: number; edit: (key: (typeof TOURNAMENT_BUILDER_STEP_KEYS)[number]) => void }) {
  const funding = tournamentBasePrizeReadiness(form.basePrizeAmountMinor, confirmedCreatorCents);
  const summaries = [
    ["overview", "Overview", `${form.title}\n${form.category} / ${form.subcategory}\n\n${form.description}\n\n${form.tournamentRules.join("\n")}`],
    ["format", "Tournament Format & Bracket", `${form.participationMode} / ${form.format.replaceAll("_", " ")}\n${form.participantCapacity} slots; up to ${roundPlan.length} stages${form.format === "double_elimination" ? ", including a conditional Grand Final reset" : ", including the Third-Place Match"}; full-capacity random pairing without initial byes.`],
    ["registration", "Registration & Teams", form.participationMode === "team" ? `${form.minimumTeamSize}–${form.maximumTeamSize} members; ${form.teamJoiningMode.replaceAll("_", " ")}. Each member pays their own fee within the captain-started ${form.teamPaymentWindowMinutes}-minute window.` : "Open registration for eligible individuals. Paid entry requires server-confirmed payment."],
    ["monetization", "Monetization & Prize Pool", `${form.entryType === "free" ? "Free entry" : `$${(form.entryFeeAmountMinor / 100).toFixed(2)} entry per ${form.participationMode === "team" ? "member" : "individual"}`}\nBase Prize: $${(form.basePrizeAmountMinor / 100).toFixed(2)}. Confirmed creator funding: $${(confirmedCreatorCents / 100).toFixed(2)}. ${form.basePrizeAmountMinor === 0 ? "No Base Prize funding required." : `Outstanding: $${(funding.outstandingCents / 100).toFixed(2)}.`}\nSponsorship: ${form.sponsorReady ? "open to proposals; no unconfirmed money counted" : "off"}. Winner allocation: 60% / 25% / 15%.`],
    ["media", "Media", `${form.coverImagePath ? "Cover uploaded" : "Cover required"}; ${form.galleryMedia.length} additional images; ${form.trailerPath ? "optional video uploaded" : "no optional video"}. Server verification is required before review.`],
    ["rounds", "Round Timing & Submissions", `${form.submissionDurationHours}-hour submission window; ${form.votingDurationHours}-hour voting window. Accepted media: ${form.submissionMediaTypes.join(" / ")}.\n${form.submissionInstructions.join("\n") || "No additional submission instructions."}\nAutomatic Free-first voting, then optional additional votes at 5 DoroCoins each.`],
  ] as const;
  return <section><StepTitle title="Review & Publish" body="Review the actual saved configuration and confirmed funding before Admin Review." />
    <div className="mt-5 divide-y divide-[var(--line)]">{summaries.map(([key, label, body]) => <section key={key} className="flex items-start justify-between gap-4 py-5"><div className="min-w-0"><h3 className="font-black">{label}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--muted)]">{body}</p></div><Button variant="ghost" onClick={() => edit(key)} aria-label={`Edit ${label}`}>Edit</Button></section>)}</div>
    <Card className="mt-5 p-5"><h3 className="font-black">{readiness.ready ? "Ready to submit for review" : "Needs fixes"}</h3><ul className="mt-3 space-y-2 text-sm">{readiness.errors.map(item => <li key={item} className="text-red-700 dark:text-red-300">{item}</li>)}{readiness.warnings.map(item => <li key={item} className="text-amber-800 dark:text-amber-200">{item}</li>)}</ul></Card>
  </section>;
}

function StepTitle({ title, body }: { title: string; body: string }) {
  return <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Tournament Builder</p><h2 data-tournament-step-heading tabIndex={-1} className="mt-2 text-2xl font-black">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{body}</p></div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card className="p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></Card>;
}
