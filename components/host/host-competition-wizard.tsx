"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { createChallenge, publishChallengeDraft, updateChallengeDraft } from "@/lib/api/services";
import { MediaUploadField } from "@/components/media-upload-field";
import { challengeDraftMediaPath } from "@/lib/media-upload-paths";
import { BuilderContent, BuilderFooter, BuilderStepHeading, BuilderSurface, ChallengeBuilderFrame, type BuilderGuideContent } from "@/components/challenge-builder-frame";
import { ChallengeTaxonomyFields, RegisteredAccountPicker } from "@/components/challenge-controlled-fields";
import { NORMAL_ELIGIBLE_COUNTRIES } from "@/lib/normal-challenge-config";
import { CHALLENGE_BUILDER_REGISTRY, canonicalBuilderSteps } from "@/lib/challenge-builder-registry";
import { validateCapacity } from "@/lib/normal-challenge-capacity";
import { useChallengeBuilderAutosave } from "@/lib/hooks/use-challenge-builder-autosave";

const liveEventSteps = canonicalBuilderSteps("live_event");
const liveEventGuides: BuilderGuideContent[] = CHALLENGE_BUILDER_REGISTRY.live_event.map((step) => step.guide);
const options = {  visibilityMode: ["public", "invite_only", "access_code", "approved_list", "hidden", "public_preview"],
  format: ["single_round", "multi_round", "knockout", "leaderboard", "judge_reviewed", "submission_voting", "registration_only"],
  winnerSelection: ["highest_votes", "judge_selection", "hybrid", "manual"]
};
function dateInput(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return `${date.toISOString().slice(0, 10)}T12:00`; }
const initial = {
  title: "", description: "", category: "Design & Creative", coverImageUrl: "", coverImagePath: "", competitionType: "Online Challenge",
  visibilityMode: "public", accessCode: "", format: "single_round", maxParticipants: "", minimumAge: "0", locationRestriction: "",
  approvalRequired: false, registrationQuestions: "", termsRequired: true, submissionType: "image", maxFileSizeMb: "25",
  maxVideoDurationSeconds: "180", allowResubmission: false, requireSubmissionApproval: true, submissionGuidelines: "",
  startsAt: dateInput(1), submissionDeadline: dateInput(5), votingStartsAt: dateInput(5), votingDeadline: dateInput(6), endsAt: dateInput(7),
  allowFreeVotes: true, votesPerUserPerDay: "1", allowDoroCoinVotes: true, weightedVotes: false, showVoteCount: true, showLeaderboard: true,
  winnerSelection: "highest_votes", multipleWinners: false, placementMode: "top_three", prizeDescription: "", prizeSponsor: "",
  prizeTerms: "", manualPayoutNote: "", promoImageUrl: "", promoImagePath: "", trailerVideoUrl: "", trailerVideoPath: "", eventLogoUrl: "", sponsorBannerUrl: "",
  brandColor: "#F5B700", allowSponsorInterest: false, showSponsorRequestButton: false, sponsorCategories: "",
  sponsorVisibilityAreas: "Challenge page\nWinner announcement", launchMode: "draft",
  subcategory: "", eventRules: "", venueName: "", eventAddress: "", eventCity: "", eventState: "", eventCountry: "", eventTimezone: "America/New_York",
  registrationOpensAt: "", registrationClosesAt: "", ticketType: "free", ticketPrice: "", ticketInstructions: "", checkInTime: "", checkInRequired: false,
  checkInStartAt: "", checkInEndAt: "", waitlistEnabled: true, participantListVisibility: "visible", eventFormat: "attendance_only", judgeAccountIds: "",
  sponsorshipGoal: "", sponsorNote: "", sponsorSupportTypes: "prize_funding\noperations_funding",
  externalLiveUrl: "", externalLiveProvider: "", externalLiveStatus: "not_ready", externalLiveOpensAt: "", externalLiveCtaLabel: "Watch live on partner site",
  tournamentType: "knockout"
};
type Form = typeof initial;

export function LiveEventBuilder({ enterpriseOwnership }: { enterpriseOwnership?: "official" | "personal" } = {}) {
  const auth = useAuth();
  const [step, setStep] = useState(0), [unlockedStep, setUnlockedStep] = useState(0), [form, setForm] = useState(() => ({ ...initial, competitionType: "Live Event", winnerSelection: "judge_selection" })), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [draftId, setDraftId] = useState(""), [submittedId, setSubmittedId] = useState("");
  const [autosaveFailed, setAutosaveFailed] = useState(false), [mobileGuideOpen, setMobileGuideOpen] = useState(false);
  const liveEvent = true;
  const activeSteps = liveEventSteps;
  const update = <K extends keyof Form>(key: K, value: Form[K]) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const validate = () => {
    if (step === 0 && (form.title.trim().length < 3 || form.description.trim().length < 10)) return "Add a title and a description of at least 10 characters.";
    if (liveEvent && step === 1 && (!form.venueName.trim() || !form.eventAddress.trim() || !form.eventCity.trim() || !form.eventCountry.trim() || !form.startsAt || !form.endsAt || new Date(form.startsAt) >= new Date(form.endsAt))) return "Add a complete physical venue and a valid event schedule.";
    if (liveEvent && step === 2 && (!form.registrationOpensAt || !form.registrationClosesAt || new Date(form.registrationOpensAt) >= new Date(form.registrationClosesAt))) return "Add a valid registration window.";
    if (liveEvent && step === 2 && form.ticketType === "paid" && Number(form.ticketPrice) <= 0) return "Set a valid paid ticket price.";
    if (step === 1 && form.visibilityMode === "access_code" && !form.accessCode.trim()) return "Add an access code.";
    try { validateCapacity(form.maxParticipants ? "limited" : "unlimited", form.maxParticipants); } catch { return "Maximum participants must be a whole number of at least 2."; }
    if (new Date(form.votingStartsAt) < new Date(form.submissionDeadline)) return "Voting cannot begin before submissions close.";
    if (new Date(form.votingDeadline) > new Date(form.endsAt)) return "Voting must end by the competition end date.";
    return "";
  };
  const payload = (publish: boolean) => {
    const live = form.competitionType === "Live Event";
    const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
    const capacityMode = form.maxParticipants ? "limited" : "unlimited";
    const participantCapacity = capacityMode === "limited" ? Number(form.maxParticipants) : null;
    return {
      title: form.title, description: form.description, category: form.category, subcategory: form.subcategory, type: form.competitionType,
      officialChallenge: enterpriseOwnership === "official",
      ownershipType: enterpriseOwnership === "official" ? "challenge_suite_official" : enterpriseOwnership === "personal" ? "enterprise_personal" : "creator_personal",
      visibility: ["public", "public_preview"].includes(form.visibilityMode) ? "public" : "private",
      acceptedSubmissionTypes: [form.submissionType === "video" ? "video" : "image"], competitionFormat: form.format, bestOf: "1 Rounder",
      startsAt: form.startsAt, endsAt: form.endsAt, submissionDeadline: form.submissionDeadline, votingStartsAt: form.votingStartsAt,
      votingDeadline: form.votingDeadline, standardRules: "Respect participants.\nSubmit original work.\nFollow published competition policies.",
      policyTerms: form.prizeTerms || "Participation remains subject to platform review.", challengeGuidelines: form.submissionGuidelines,
      coverImageUrl: form.coverImageUrl, coverImagePath: form.coverImagePath, promoImageUrl: form.promoImageUrl, promoImagePath: form.promoImagePath, trailerVideoUrl: form.trailerVideoUrl, trailerVideoPath: form.trailerVideoPath, promoVideoUrl: "", promoVideoPath: "",
      prizeType: form.prizeDescription ? "money" : "bragging_rights", prizeTitle: form.prizeDescription ? "Cash prize" : "",
      prizeDescription: form.prizeDescription, prizeValue: 0, prizeDeliveryNotes: form.manualPayoutNote,
      votingSettings: { allowFreeVotes: form.allowFreeVotes, allowPaidVotes: form.allowDoroCoinVotes, weightedVotes: false },
      requiresSubmissionApproval: form.requireSubmissionApproval, sponsorEnabled: form.allowSponsorInterest, sponsorSlots: form.allowSponsorInterest ? 3 : 0,
      minimumSponsorshipAmount: 0, sponsorPlacementOptions: lines(form.sponsorVisibilityAreas), sponsorPackages: [],
      isLiveEvent: live, venueName: live ? form.venueName || "Venue pending" : "", eventAddress: live ? form.eventAddress : "", eventCity: live ? form.eventCity || form.locationRestriction || "Location pending" : "",
      eventState: live ? form.eventState : "", eventCountry: live ? form.eventCountry || "Location pending" : "", eventMapUrl: "", eventCapacity: participantCapacity,
      externalLiveUrl: form.externalLiveUrl, externalLiveProvider: form.externalLiveProvider, externalLiveStatus: form.externalLiveStatus,
      externalLiveOpensAt: form.externalLiveOpensAt, externalLiveCtaLabel: form.externalLiveCtaLabel,
      tournamentType: form.competitionType === "Tournament" ? form.tournamentType : "none", tournamentStages: form.competitionType === "Tournament" ? [
        { id: "registration", name: "Registration", order: 1, status: "draft", advancementRule: "Approve participants before round one." },
        { id: "round_1", name: "Round 1", order: 2, status: "draft", advancementRule: "Collect submissions and votes or judge scores." },
        { id: "final", name: "Final", order: 3, status: "draft", advancementRule: "Host confirms results, then admin reviews winner announcement." }
      ] : [], divisionFormat: 2, capacityMode, maxParticipants: participantCapacity,
      scoringMode: "best_of", bestOfRounds: 3, pointsToWin: 10, timerEnabled: false, timerDuration: 0, roundDuration: 0,
      judgeScoringEnabled: ["judge_selection", "hybrid"].includes(form.winnerSelection),
      hostOperations: {
        visibilityMode: form.visibilityMode, accessCode: form.accessCode, format: form.format, minimumAge: Number(form.minimumAge),
        locationRestriction: form.locationRestriction, approvalRequired: false, registrationQuestions: lines(form.registrationQuestions),
        termsRequired: form.termsRequired, submissionType: form.submissionType, maxFileSizeMb: Number(form.maxFileSizeMb),
        maxVideoDurationSeconds: Number(form.maxVideoDurationSeconds), allowResubmission: form.allowResubmission,
        votesPerUserPerDay: 1, showVoteCount: form.showVoteCount, showLeaderboard: form.showLeaderboard,
        winnerSelection: form.winnerSelection, multipleWinners: form.multipleWinners, placementMode: form.placementMode,
        prizeSponsor: form.prizeSponsor, manualPayoutNote: form.manualPayoutNote, eventLogoUrl: form.eventLogoUrl,
        sponsorBannerUrl: form.sponsorBannerUrl, brandColor: form.brandColor, allowSponsorInterest: form.allowSponsorInterest,
        showSponsorRequestButton: form.showSponsorRequestButton, sponsorCategories: lines(form.sponsorCategories),
        sponsorVisibilityAreas: lines(form.sponsorVisibilityAreas), launchMode: form.launchMode,
        registrationOpensAt: form.registrationOpensAt, registrationClosesAt: form.registrationClosesAt,
        ticketType: live && form.ticketType === "paid" ? "paid_setup_required" : "free", ticketPrice: live ? Number(form.ticketPrice || 0) : 0,
        ticketInstructions: live ? form.ticketInstructions : "", checkInTime: live ? form.checkInTime : "", checkInStartAt: live ? form.checkInStartAt : "", checkInEndAt: live ? form.checkInEndAt : "", checkInRequired: live && form.checkInRequired,
        timezone: live ? form.eventTimezone : "America/New_York", waitlistEnabled: live && form.waitlistEnabled, participantListVisibility: live ? form.participantListVisibility : "visible", eventFormat: live ? form.eventFormat : "digital_submission", judgeAccountIds: live ? lines(form.judgeAccountIds) : [], eventRules: live ? lines(form.eventRules) : [],
        sponsorshipGoal: live ? Number(form.sponsorshipGoal || 0) : 0, sponsorNote: live ? form.sponsorNote : "", sponsorSupportTypes: live ? lines(form.sponsorSupportTypes) : [],
        ticketCheckoutActive: false, ticketPaymentConfirmationRequired: true, manualCheckInEnabled: true, qrCheckInRequiresServerToken: true
      }, publish
    };
  };
  const invalidateAutosave = useChallengeBuilderAutosave({
    enabled: Boolean(draftId) && !submittedId && !saving,
    revision: form,
    secondaryRevision: step,
    save: () => updateChallengeDraft(draftId, { ...payload(false), creationStep: step }),
    onResult: (result) => {
      setAutosaveFailed(!result.ok);
      if (!result.ok) setError("We couldn't save your changes. Check your connection and try again.");
    },
    onError: () => {
      setAutosaveFailed(true);
      setError("We couldn't save your changes. Check your connection and try again.");
    }
  });
  async function persistDraft(quiet = false) {
    const problem = validate(); if (problem) return setError(problem);
    invalidateAutosave();
    if (!quiet) setSaving(true);
    const result = draftId ? await updateChallengeDraft(draftId, { ...payload(false), creationStep: step }) : await createChallenge(payload(false));
    if (!quiet) setSaving(false);
    if (!result.ok) return setError(result.message || "Competition could not be saved.");
    const id = ((result.data?.challenge as { id?: string } | undefined)?.id) || draftId;
    if (id) setDraftId(id);
    setAutosaveFailed(false);
    return true;
  }

  async function submit(publish: boolean) {
    if (!publish) return void await persistDraft();
    const problem = validate(); if (problem) return setError(problem);
    setSaving(true);
    if (!draftId) { setSaving(false); return setError("Save the event draft before submitting it for review."); }
    const id = draftId;
    invalidateAutosave();
    const result = await publishChallengeDraft(id, payload(true));
    setSaving(false);
    if (!result.ok) return setError(result.message || "Event could not be submitted for review.");
    setError("");
    setSubmittedId(id);
  }

  if (submittedId) return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" /><h1 className="mt-5 text-3xl font-black">Event submitted for review</h1><p className="mt-3 text-slate-600">Editing is unavailable while admin review is pending.</p><div className="mt-6 flex justify-center gap-3"><LinkButton href={`/challenges/${submittedId}`}>View Event</LinkButton><LinkButton href="/dashboard/host" variant="secondary">Host Control Center</LinkButton></div></Card></AppShell>;
  {
    const guide = liveEventGuides[step] ?? liveEventGuides[0];
    return <AppShell><main className="mx-auto w-full max-w-[1560px] px-4 py-7 sm:px-6 lg:px-8" data-live-event-canonical-builder>
      <PageTitle title="Create Live Event" subtitle="Build a physical-first event with venue, schedule, automatic registration, media, and judging details." />
      <ChallengeBuilderFrame steps={activeSteps} currentStep={step} unlockedStep={unlockedStep} guide={guide} guideOpen={mobileGuideOpen} setGuideOpen={setMobileGuideOpen} onStepChange={setStep}><BuilderSurface><BuilderContent><div className="min-h-[470px]"><LiveEventStep step={step} form={form} update={update} userId={auth.user?.uid ?? "anonymous"} /></div>{error ? <p className="mt-5 rounded-[8px] border border-red-200 bg-red-50 p-4 text-red-800">{error}</p> : null}{step === activeSteps.length - 1 ? <LivePublishChecklist form={form} /> : null}</BuilderContent><BuilderFooter backDisabled={step === 0} busy={saving} finishLater={draftId ? () => void persistDraft() : undefined} onBack={() => setStep((value) => Math.max(0, value - 1))} onContinue={() => { if (step < activeSteps.length - 1) { const problem = validate(); if (problem) return setError(problem); void persistDraft(true).then((saved) => { if (saved) { const next = step + 1; setUnlockedStep((current) => Math.max(current, next)); setStep(next); } }); } else void submit(true); }} final={step === activeSteps.length - 1} finalDisabled={autosaveFailed} /></BuilderSurface></ChallengeBuilderFrame>
    </main></AppShell>;
  }
}
function LivePublishChecklist({ form }: { form: Form }) {
  const checks = [
    { label: "Event details", complete: form.title.trim().length >= 3 && form.description.trim().length >= 10 },
    { label: "Venue and location", complete: Boolean(form.venueName.trim() && form.eventCity.trim() && form.eventCountry.trim()) },
    { label: "Event timeline", complete: Boolean(form.startsAt && form.submissionDeadline && form.votingDeadline && form.endsAt) },
    { label: "Participation settings", complete: form.maxParticipants === "" || Number.isInteger(Number(form.maxParticipants)) && Number(form.maxParticipants) >= 2 }
  ];
  const remaining = checks.filter((item) => !item.complete).length;
  return <div className={`mt-7 rounded-[8px] border p-4 ${remaining ? "border-yellow-500/30 bg-yellow-500/5" : "border-emerald-500/25 bg-emerald-500/5"}`}>
    <p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--gold)]">Publish checklist</p>
    <p className="mt-1 text-sm text-slate-300">{remaining ? `${remaining} section${remaining === 1 ? "" : "s"} still need attention.` : "Core event details are ready for server validation."}</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">{checks.map((item) => <div key={item.label} className="flex items-center gap-2 text-sm font-bold text-slate-200">{item.complete ? <CheckCircle2 size={16} className="text-emerald-300" /> : <span className="h-4 w-4 rounded-full border border-yellow-300/50" />}<span>{item.label}</span></div>)}</div>
  </div>;
}

function LiveEventStep({ step, form, update, userId }: { step: number; form: Form; update: <K extends keyof Form>(key: K, value: Form[K]) => void; userId: string }) {
  const toggle = (key: keyof Form, label: string) => <label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-black/10 bg-slate-50 px-4 py-3 font-bold text-slate-950"><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => update(key, event.target.checked as never)} />{label}</label>;
  if (step === 0) return <Step title="Event Basics"><Grid><Field label="Event title"><input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field><ChallengeTaxonomyFields category={form.category} subcategory={form.subcategory} onCategory={(value) => update("category", value)} onSubcategory={(value) => update("subcategory", value)} /></Grid><Field label="Full description"><textarea className={textareaClass} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field><Field label="Event rules (one per line)"><textarea className={textareaClass} value={form.eventRules} onChange={(event) => update("eventRules", event.target.value)} /></Field></Step>;
  if (step === 1) return <Step title="Venue & Schedule"><Grid><Field label="Venue name"><input className={inputClass} value={form.venueName} onChange={(event) => update("venueName", event.target.value)} /></Field><Field label="Address"><input className={inputClass} value={form.eventAddress} onChange={(event) => update("eventAddress", event.target.value)} /></Field><Field label="City"><input className={inputClass} value={form.eventCity} onChange={(event) => update("eventCity", event.target.value)} /></Field><Field label="State / Region"><input className={inputClass} value={form.eventState} onChange={(event) => update("eventState", event.target.value)} /></Field><Field label="Country"><select className={inputClass} value={form.eventCountry} onChange={(event) => update("eventCountry", event.target.value)}><option value="">Choose country</option>{NORMAL_ELIGIBLE_COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field><Field label="Timezone"><select className={inputClass} value={form.eventTimezone} onChange={(event) => update("eventTimezone", event.target.value)}><option value="America/New_York">Eastern Time</option><option value="America/Chicago">Central Time</option><option value="America/Denver">Mountain Time</option><option value="America/Los_Angeles">Pacific Time</option><option value="America/Anchorage">Alaska Time</option><option value="Pacific/Honolulu">Hawaii Time</option><option value="Africa/Lagos">WAT / Lagos</option></select></Field><Field label="Event start"><input className={inputClass} type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /></Field><Field label="Event end"><input className={inputClass} type="datetime-local" value={form.endsAt} onChange={(event) => update("endsAt", event.target.value)} /></Field><Field label="Check-in start (optional)"><input className={inputClass} type="datetime-local" value={form.checkInStartAt} onChange={(event) => update("checkInStartAt", event.target.value)} /></Field><Field label="Check-in end (optional)"><input className={inputClass} type="datetime-local" value={form.checkInEndAt} onChange={(event) => update("checkInEndAt", event.target.value)} /></Field></Grid><p className="text-sm text-slate-400">Live Events are physical at launch. Virtual-only event mode is not available.</p></Step>;
  if (step === 2) return <Step title="Registration & Tickets"><Grid><Field label="Registration"><select className={inputClass} value={form.ticketType} onChange={(event) => update("ticketType", event.target.value)}><option value="free">Free</option><option value="paid">Paid</option></select></Field>{form.ticketType === "paid" ? <Field label="Ticket price"><input className={inputClass} type="number" min="0" step="0.01" value={form.ticketPrice} onChange={(event) => update("ticketPrice", event.target.value)} /></Field> : null}<Field label="Registration start"><input className={inputClass} type="datetime-local" value={form.registrationOpensAt} onChange={(event) => update("registrationOpensAt", event.target.value)} /></Field><Field label="Registration end"><input className={inputClass} type="datetime-local" value={form.registrationClosesAt} onChange={(event) => update("registrationClosesAt", event.target.value)} /></Field><Field label="Participant capacity"><input className={inputClass} type="number" inputMode="numeric" min="2" step="1" value={form.maxParticipants} onChange={(event) => update("maxParticipants", event.target.value)} placeholder="Unlimited" /></Field>{toggle("waitlistEnabled", "Waitlist enabled")}</Grid><Field label="Registration instructions"><textarea className={textareaClass} value={form.ticketInstructions} onChange={(event) => update("ticketInstructions", event.target.value)} /></Field><p className="text-sm text-slate-600">Eligible registrants are accepted automatically after any required provider-confirmed payment.</p></Step>;
  if (step === 3) return <Step title="Participants"><Grid><Field label="Location eligibility"><select className={inputClass} value={form.locationRestriction} onChange={(event) => update("locationRestriction", event.target.value)}><option value="">Worldwide</option>{NORMAL_ELIGIBLE_COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name} only</option>)}</select></Field><Field label="Minimum age"><input className={inputClass} type="number" min="0" max="120" step="1" value={form.minimumAge} onChange={(event) => update("minimumAge", event.target.value)} /></Field><Field label="Participant list"><select className={inputClass} value={form.participantListVisibility} onChange={(event) => update("participantListVisibility", event.target.value)}><option value="visible">Visible</option><option value="hidden">Hidden</option></select></Field>{toggle("checkInRequired", "Event-day check-in required")}</Grid><Field label="Registration questions (one per line)"><textarea className={textareaClass} value={form.registrationQuestions} onChange={(event) => update("registrationQuestions", event.target.value)} /></Field><p className="text-sm text-slate-400">QR check-in uses a server-validated token. Authorized managers retain a manual check-in fallback.</p></Step>;
  if (step === 4) return <Step title="Challenge Format"><div className="grid gap-4 md:grid-cols-3">{[["attendance_only", "Attendance-only", "Registration and check-in; no digital submission."], ["digital_submission", "Digital submission", "Participants submit media through Challenge Suite."], ["physical_competition", "Physical competition", "Competition happens on site without a platform submission."]].map(([value, label, help]) => <button type="button" key={value} onClick={() => update("eventFormat", value)} className={`rounded-[8px] border p-4 text-left ${form.eventFormat === value ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-white/10"}`}><b>{label}</b><p className="mt-2 text-sm text-slate-400">{help}</p></button>)}</div>{form.eventFormat === "digital_submission" ? <><Field label="Submission type"><select className={inputClass} value={form.submissionType} onChange={(event) => update("submissionType", event.target.value)}><option value="image">Image</option><option value="video">Video</option></select></Field><Field label="Submission guidelines"><textarea className={textareaClass} value={form.submissionGuidelines} onChange={(event) => update("submissionGuidelines", event.target.value)} /></Field></> : null}</Step>;
  if (step === 5) return <Step title="Voting & Judging"><Field label="Winner selection"><select className={inputClass} value={form.winnerSelection} onChange={(event) => update("winnerSelection", event.target.value)}><option value="judge_selection">Judges</option></select></Field><RegisteredAccountPicker selectedIds={form.judgeAccountIds.split("\n").map((item) => item.trim()).filter(Boolean)} onChange={(ids) => update("judgeAccountIds", ids.join("\n"))} /><p className="text-sm text-slate-400">Judge access is assignment-based and server-authorized. Ordinary participants cannot open judge controls.</p></Step>;
  if (step === 6) return <Step title="Prize Setup"><Field label="Cash prize description"><textarea className={textareaClass} value={form.prizeDescription} onChange={(event) => update("prizeDescription", event.target.value)} /></Field><Field label="Prize terms"><textarea className={textareaClass} value={form.prizeTerms} onChange={(event) => update("prizeTerms", event.target.value)} /></Field><Card className="p-4 text-sm leading-6 text-slate-300">Confirmed event-generated revenue uses 65% winners / 20% creator or host / 15% Challenge Suite. Creator-funded prizes go entirely to the prize pool. Sponsor funding stays separate.</Card></Step>;
  if (step === 7) return <Step title="Media & Branding"><Grid><MediaUploadField label="Primary event image" value={form.coverImageUrl} onChange={(url, metadata) => { update("coverImageUrl", url); update("coverImagePath", metadata?.path ?? ""); }} storagePath={challengeDraftMediaPath(userId, "banner")} kind="image" buttonLabel="Upload Primary Image" /><MediaUploadField label="Optional gallery image" value={form.promoImageUrl} onChange={(url, metadata) => { update("promoImageUrl", url); update("promoImagePath", metadata?.path ?? ""); }} storagePath={challengeDraftMediaPath(userId, "gallery")} kind="image" buttonLabel="Upload Gallery Image" /><MediaUploadField label="Optional video" value={form.trailerVideoUrl} onChange={(url, metadata) => { update("trailerVideoUrl", url); update("trailerVideoPath", metadata?.path ?? ""); }} storagePath={challengeDraftMediaPath(userId, "video")} kind="video" buttonLabel="Upload Event Video" /></Grid></Step>;
  if (step === 8) return <Step title="Sponsors"><Grid>{toggle("allowSponsorInterest", "Sponsor ready")}{toggle("showSponsorRequestButton", "Accept sponsor proposals")}<Field label="Sponsorship goal"><input className={inputClass} type="number" min="0" value={form.sponsorshipGoal} onChange={(event) => update("sponsorshipGoal", event.target.value)} /></Field><Field label="Preferred sponsor categories"><textarea className={textareaClass} value={form.sponsorCategories} onChange={(event) => update("sponsorCategories", event.target.value)} /></Field></Grid><Field label="Sponsor note"><textarea className={textareaClass} value={form.sponsorNote} onChange={(event) => update("sponsorNote", event.target.value)} /></Field><Field label="Support types (one per line)"><textarea className={textareaClass} value={form.sponsorSupportTypes} onChange={(event) => update("sponsorSupportTypes", event.target.value)} /></Field><p className="text-sm text-slate-400">Sponsor value is tracked separately and never enters the 65/20/15 event-revenue split.</p></Step>;
  return <Step title="Review & Submit"><div className="grid gap-3 sm:grid-cols-2">{[["Event", form.title || "Untitled"], ["Venue", form.venueName || "Missing"], ["Format", form.eventFormat], ["Registration", form.ticketType], ["Capacity", form.maxParticipants || "Unlimited"], ["Timezone", form.eventTimezone]].map(([label, value]) => <Card key={label} className="p-4"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-1 font-black capitalize">{value.replaceAll("_", " ")}</p></Card>)}</div><Card className="mt-5 p-4 text-sm text-slate-300">Submitting creates an admin-review state. It does not activate ticket checkout, external payouts, sponsor releases, or public discovery.</Card></Step>;
}

function Step({ title, children }: { title: string; children: React.ReactNode }) { return <section className="space-y-6 text-slate-950"><BuilderStepHeading title={title} eyebrow="Live Event Builder" />{children}</section>; }
function Grid({ children }: { children: React.ReactNode }) { return <div className="grid gap-4 sm:grid-cols-2">{children}</div>; }
