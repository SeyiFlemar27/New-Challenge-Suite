"use client";

import { useState } from "react";
import { CheckCircle2, Save, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { createChallenge } from "@/lib/api/services";
import { MediaUploadField } from "@/components/media-upload-field";
import { challengeDraftMediaPath } from "@/lib/media-upload-paths";

const steps = ["Basic Details", "Visibility", "Format & Rounds", "Participants", "Submissions", "Voting", "Judging", "Prize Setup", "Media & Branding", "Sponsor Readiness", "Review & Publish"];
const options = {  visibilityMode: ["public", "invite_only", "access_code", "approved_list", "hidden", "public_preview"],
  format: ["single_round", "multi_round", "knockout", "leaderboard", "judge_reviewed", "submission_voting", "registration_only"],
  winnerSelection: ["highest_votes", "judge_selection", "hybrid", "manual"]
};
function dateInput(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return `${date.toISOString().slice(0, 10)}T12:00`; }
const initial = {
  title: "", description: "", category: "Creative", coverImageUrl: "", coverImagePath: "", competitionType: "Online Challenge",
  visibilityMode: "public", accessCode: "", format: "single_round", maxParticipants: "50", minimumAge: "0", locationRestriction: "",
  approvalRequired: true, registrationQuestions: "", termsRequired: true, submissionType: "image", maxFileSizeMb: "25",
  maxVideoDurationSeconds: "180", allowResubmission: false, requireSubmissionApproval: true, submissionGuidelines: "",
  startsAt: dateInput(1), submissionDeadline: dateInput(5), votingStartsAt: dateInput(5), votingDeadline: dateInput(6), endsAt: dateInput(7),
  allowFreeVotes: true, votesPerUserPerDay: "1", allowDoroCoinVotes: true, weightedVotes: false, showVoteCount: true, showLeaderboard: true,
  winnerSelection: "highest_votes", multipleWinners: false, placementMode: "top_three", prizeDescription: "", prizeSponsor: "",
  prizeTerms: "", manualPayoutNote: "", promoImageUrl: "", promoImagePath: "", trailerVideoUrl: "", trailerVideoPath: "", eventLogoUrl: "", sponsorBannerUrl: "",
  brandColor: "#F5B700", allowSponsorInterest: false, showSponsorRequestButton: false, sponsorCategories: "",
  sponsorVisibilityAreas: "Challenge page\nWinner announcement", launchMode: "draft",
  venueName: "", eventAddress: "", eventCity: "", eventState: "", eventCountry: "",
  externalLiveUrl: "", externalLiveProvider: "", externalLiveStatus: "not_ready", externalLiveOpensAt: "", externalLiveCtaLabel: "Watch live on partner site",
  tournamentType: "knockout"
};
type Form = typeof initial;

export function HostCompetitionWizard({ initialCompetitionType }: { initialCompetitionType?: string } = {}) {
  const auth = useAuth();
  const [step, setStep] = useState(0), [form, setForm] = useState(() => ({ ...initial, competitionType: initialCompetitionType ?? initial.competitionType })), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [createdId, setCreatedId] = useState("");
  const update = <K extends keyof Form>(key: K, value: Form[K]) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const validate = () => {
    if (step === 0 && (form.title.trim().length < 3 || form.description.trim().length < 10)) return "Add a title and a description of at least 10 characters.";
    if (step === 1 && form.visibilityMode === "access_code" && !form.accessCode.trim()) return "Add an access code.";
    if (Number(form.maxParticipants) < 2) return "Maximum participants must be at least 2.";
    if (new Date(form.votingStartsAt) < new Date(form.submissionDeadline)) return "Voting cannot begin before submissions close.";
    if (new Date(form.votingDeadline) > new Date(form.endsAt)) return "Voting must end by the competition end date.";
    return "";
  };
  const payload = (publish: boolean) => {
    const live = form.competitionType === "Live Event";
    const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
    return {
      title: form.title, description: form.description, category: form.category, type: form.competitionType,
      visibility: ["public", "public_preview"].includes(form.visibilityMode) ? "public" : "private",
      acceptedSubmissionTypes: [form.submissionType === "video" ? "video" : "image"], competitionFormat: form.format, bestOf: "1 Rounder",
      startsAt: form.startsAt, endsAt: form.endsAt, submissionDeadline: form.submissionDeadline, votingStartsAt: form.votingStartsAt,
      votingDeadline: form.votingDeadline, standardRules: "Respect participants.\nSubmit original work.\nFollow published competition policies.",
      policyTerms: form.prizeTerms || "Participation remains subject to platform review.", challengeGuidelines: form.submissionGuidelines,
      coverImageUrl: form.coverImageUrl, coverImagePath: form.coverImagePath, promoImageUrl: form.promoImageUrl, promoImagePath: form.promoImagePath, trailerVideoUrl: form.trailerVideoUrl, trailerVideoPath: form.trailerVideoPath, promoVideoUrl: "", promoVideoPath: "",
      prizeType: form.prizeDescription ? "physical_product" : "bragging_rights", prizeTitle: form.prizeDescription ? "Competition prize" : "",
      prizeDescription: form.prizeDescription, prizeValue: 0, prizeDeliveryNotes: form.manualPayoutNote,
      votingSettings: { allowFreeVotes: form.allowFreeVotes, allowDoroCoinVotes: form.allowDoroCoinVotes, weightedVotes: form.weightedVotes },
      requiresSubmissionApproval: form.requireSubmissionApproval, sponsorEnabled: form.allowSponsorInterest, sponsorSlots: form.allowSponsorInterest ? 3 : 0,
      minimumSponsorshipAmount: 0, sponsorPlacementOptions: lines(form.sponsorVisibilityAreas), sponsorPackages: [],
      isLiveEvent: live, venueName: live ? form.venueName || "Venue pending" : "", eventAddress: live ? form.eventAddress : "", eventCity: live ? form.eventCity || form.locationRestriction || "Location pending" : "",
      eventState: live ? form.eventState : "", eventCountry: live ? form.eventCountry || "Location pending" : "", eventMapUrl: "", eventCapacity: Number(form.maxParticipants),
      externalLiveUrl: form.externalLiveUrl, externalLiveProvider: form.externalLiveProvider, externalLiveStatus: form.externalLiveStatus,
      externalLiveOpensAt: form.externalLiveOpensAt, externalLiveCtaLabel: form.externalLiveCtaLabel,
      tournamentType: form.competitionType === "Tournament" ? form.tournamentType : "none", tournamentStages: form.competitionType === "Tournament" ? [
        { id: "registration", name: "Registration", order: 1, status: "draft", advancementRule: "Approve participants before round one." },
        { id: "round_1", name: "Round 1", order: 2, status: "draft", advancementRule: "Collect submissions and votes or judge scores." },
        { id: "final", name: "Final", order: 3, status: "draft", advancementRule: "Host confirms results, then admin reviews winner announcement." }
      ] : [], divisionFormat: 2, maxParticipants: Math.min(50, Number(form.maxParticipants)),
      scoringMode: "best_of", bestOfRounds: 3, pointsToWin: 10, timerEnabled: false, timerDuration: 0, roundDuration: 0,
      judgeScoringEnabled: ["judge_selection", "hybrid"].includes(form.winnerSelection),
      hostOperations: {
        visibilityMode: form.visibilityMode, accessCode: form.accessCode, format: form.format, minimumAge: Number(form.minimumAge),
        locationRestriction: form.locationRestriction, approvalRequired: form.approvalRequired, registrationQuestions: lines(form.registrationQuestions),
        termsRequired: form.termsRequired, submissionType: form.submissionType, maxFileSizeMb: Number(form.maxFileSizeMb),
        maxVideoDurationSeconds: Number(form.maxVideoDurationSeconds), allowResubmission: form.allowResubmission,
        votesPerUserPerDay: Number(form.votesPerUserPerDay), showVoteCount: form.showVoteCount, showLeaderboard: form.showLeaderboard,
        winnerSelection: form.winnerSelection, multipleWinners: form.multipleWinners, placementMode: form.placementMode,
        prizeSponsor: form.prizeSponsor, manualPayoutNote: form.manualPayoutNote, eventLogoUrl: form.eventLogoUrl,
        sponsorBannerUrl: form.sponsorBannerUrl, brandColor: form.brandColor, allowSponsorInterest: form.allowSponsorInterest,
        showSponsorRequestButton: form.showSponsorRequestButton, sponsorCategories: lines(form.sponsorCategories),
        sponsorVisibilityAreas: lines(form.sponsorVisibilityAreas), launchMode: form.launchMode
      }, publish
    };
  };
  async function submit(publish: boolean) {
    const problem = validate(); if (problem) return setError(problem);
    setSaving(true); const result = await createChallenge(payload(publish)); setSaving(false);
    if (!result.ok) return setError(result.message || "Competition could not be saved.");
    setCreatedId(((result.data?.challenge as { id?: string } | undefined)?.id) || "saved");
  }
  if (createdId) return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" /><h1 className="mt-5 text-3xl font-black">Competition saved</h1><p className="mt-3 text-slate-300">Advanced events, tournaments, sponsor settings, and prizes remain subject to review. No money movement was enabled.</p><div className="mt-6 flex justify-center gap-3"><LinkButton href={createdId === "saved" ? "/challenges" : `/challenges/${createdId}`}>View Competition</LinkButton><LinkButton href="/dashboard/host" variant="secondary">Host Control Center</LinkButton></div></Card></AppShell>;
  const pageTitle = form.competitionType === "Private Challenge" ? "Create Private Challenge" : form.competitionType === "Live Event" ? "Create Live Event" : form.competitionType === "Tournament" ? "Create Tournament Challenge" : "Create Challenge";
  const pageSubtitle = form.competitionType === "Private Challenge" ? "Set invite access, participant approval, dates, media, and review-safe rules." : form.competitionType === "Live Event" ? "Build a physical-first event with venue, schedule, registration, media, and livestream details." : form.competitionType === "Tournament" ? "Plan a multi-stage tournament with rounds, advancement rules, voting or judging, finals, and review-safe winner confirmation." : "Build a normal online challenge. Private challenges, live events, and tournaments have dedicated creation flows.";
  const actions = <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
    <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>Back</Button>
    <div className="grid gap-3 sm:flex">
      <Button variant="secondary" onClick={() => submit(false)} disabled={saving}><Save size={17} /> Save Draft</Button>
      {step < steps.length - 1 ? <Button onClick={() => { const problem = validate(); problem ? setError(problem) : setStep((value) => value + 1); }}>Continue</Button> : <Button onClick={() => submit(form.launchMode !== "draft")} disabled={saving}>{saving ? "Saving..." : form.launchMode === "schedule" ? "Schedule Launch" : "Publish Competition"}</Button>}
    </div>
  </div>;
  if (form.competitionType === "Live Event") {
    return <AppShell><div className="mx-auto max-w-[1440px]">
      <PageTitle title={pageTitle} subtitle={pageSubtitle} />
      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="lg:sticky lg:top-24"><HostVerticalStepper steps={steps} current={step} onSelect={setStep} /></aside>
        <Card className="min-w-0 p-5 sm:p-7">
          <div className="min-h-[470px]"><WizardStep step={step} form={form} update={update} userId={auth.user?.uid ?? "anonymous"} /></div>
          {error ? <p className="mt-5 rounded-[8px] bg-red-950/50 p-4 text-red-200">{error}</p> : null}
          <LivePublishChecklist form={form} />
          {actions}
        </Card>
        <LiveBuilderGuide step={step} />
      </div>
    </div></AppShell>;
  }
  return <AppShell><div className="mx-auto max-w-6xl" data-mobile-creator-management><PageTitle title={pageTitle} subtitle={pageSubtitle} /><Card className="mt-6 p-4 sm:p-6">
    <div className="grid gap-2 sm:grid-cols-2 lg:flex" data-mobile-builder-steps>{steps.map((label, index) => <button key={label} onClick={() => index <= step && setStep(index)} className={`min-h-11 rounded-[8px] px-3 text-left text-xs font-black lg:min-w-40 ${index === step ? "bg-[var(--gold)] text-black" : "bg-[#191919] text-slate-300"}`}>{index + 1}. {label}</button>)}</div>
    <div className="mt-8 min-h-[470px]"><WizardStep step={step} form={form} update={update} userId={auth.user?.uid ?? "anonymous"} /></div>
    {error ? <p className="mt-5 rounded-[8px] bg-red-950/50 p-4 text-red-200">{error}</p> : null}
    {actions}
  </Card></div></AppShell>;
}

function HostVerticalStepper({ steps, current, onSelect }: { steps: string[]; current: number; onSelect: (step: number) => void }) {
  return <Card className="p-3"><div className="grid gap-2">{steps.map((label, index) => <button key={label} type="button" onClick={() => index <= current && onSelect(index)} className={`flex min-h-14 w-full items-center gap-3 rounded-[8px] border px-4 py-3 text-left text-sm font-black ${index === current ? "border-[var(--gold)] bg-[var(--gold)] text-black" : index < current ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-[#171717] text-slate-400"}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/20">{index < current ? <CheckCircle2 size={16} /> : index + 1}</span><span className="min-w-0 break-words">{label}</span></button>)}</div></Card>;
}

function LiveBuilderGuide({ step }: { step: number }) {
  const guidance = step === 0 ? ["Set the event identity", "Use a clear title and concise event description.", "Upload media you are authorized to publish."] : step === 3 ? ["Plan attendance", "Confirm the venue, city, country, and capacity.", "Use real livestream details only when available."] : step >= 8 ? ["Prepare to publish", "Review media, sponsor visibility, and launch settings.", "No ticket payment is created by this builder."] : ["Keep event details consistent", "Use the same dates and rules participants will see.", "Save a draft whenever details are still changing."];
  return <Card className="h-fit p-5 lg:sticky lg:top-24"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Builder Guide</p><h2 className="mt-3 text-xl font-black text-white">{guidance[0]}</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">{guidance.slice(1).map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]" /><span>{item}</span></li>)}</ul></Card>;
}

function LivePublishChecklist({ form }: { form: Form }) {
  const checks = [
    { label: "Event details", complete: form.title.trim().length >= 3 && form.description.trim().length >= 10 },
    { label: "Venue and location", complete: Boolean(form.venueName.trim() && form.eventCity.trim() && form.eventCountry.trim()) },
    { label: "Event timeline", complete: Boolean(form.startsAt && form.submissionDeadline && form.votingDeadline && form.endsAt) },
    { label: "Participation settings", complete: Number(form.maxParticipants) >= 2 }
  ];
  const remaining = checks.filter((item) => !item.complete).length;
  return <div className={`mt-7 rounded-[8px] border p-4 ${remaining ? "border-yellow-500/30 bg-yellow-500/5" : "border-emerald-500/25 bg-emerald-500/5"}`}>
    <p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--gold)]">Publish checklist</p>
    <p className="mt-1 text-sm text-slate-300">{remaining ? `${remaining} section${remaining === 1 ? "" : "s"} still need attention.` : "Core event details are ready for server validation."}</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">{checks.map((item) => <div key={item.label} className="flex items-center gap-2 text-sm font-bold text-slate-200">{item.complete ? <CheckCircle2 size={16} className="text-emerald-300" /> : <span className="h-4 w-4 rounded-full border border-yellow-300/50" />}<span>{item.label}</span></div>)}</div>
  </div>;
}

function WizardStep({ step, form, update, userId }: { step: number; form: Form; update: <K extends keyof Form>(key: K, value: Form[K]) => void; userId: string }) {
  const check = (key: keyof Form, label: string) => <label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-white/10 px-4 py-3 font-bold"><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => update(key, event.target.checked as never)} />{label}</label>;
  const selectButtons = (key: "visibilityMode" | "format" | "winnerSelection", values: string[]) => <Grid>{values.map((value) => <Button key={value} variant={form[key] === value ? "primary" : "secondary"} onClick={() => update(key, value)}>{value.replaceAll("_", " ")}</Button>)}</Grid>;
  if (step === 0) return <Step title="Basic Details"><Field label="Title"><input className={inputClass} value={form.title} onChange={(e) => update("title", e.target.value)} /></Field><Field label="Description"><textarea className={textareaClass} value={form.description} onChange={(e) => update("description", e.target.value)} /></Field><Grid><Field label="Category"><input className={inputClass} value={form.category} onChange={(e) => update("category", e.target.value)} /></Field><MediaUploadField label="Cover Image" value={form.coverImageUrl} onChange={(url, metadata) => { update("coverImageUrl", url); update("coverImagePath", metadata?.path ?? ""); }} storagePath={challengeDraftMediaPath(userId, "banner")} kind="image" buttonLabel="Upload Cover Image" /></Grid><SpecializedFlowNotice competitionType={form.competitionType} /></Step>;
  if (step === 1) return <Step title="Visibility">{selectButtons("visibilityMode", options.visibilityMode)}{form.visibilityMode === "access_code" ? <Field label="Access Code"><input className={inputClass} value={form.accessCode} onChange={(e) => update("accessCode", e.target.value)} /></Field> : null}</Step>;
  if (step === 2) return <Step title="Format & Rounds">{selectButtons("format", options.format)}{form.competitionType === "Tournament" ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Tournament Type"><select className={inputClass} value={form.tournamentType} onChange={(e) => update("tournamentType", e.target.value)}>{["knockout", "bracket", "league_table", "audition_to_final", "group_stage_to_final", "custom_rounds"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></Field><Card className="p-4 text-sm text-slate-300">Tournaments are multi-stage competitions: registration, rounds, advancement, final, winner confirmation, and admin review. Brackets are generated after registration closes.</Card></div> : null}</Step>;
  if (step === 3) return <Step title="Participants & Registration"><Grid><Field label="Maximum Participants"><input className={inputClass} type="number" min="2" max="50" value={form.maxParticipants} onChange={(e) => update("maxParticipants", e.target.value)} /></Field><Field label="Minimum Age"><input className={inputClass} type="number" min="0" value={form.minimumAge} onChange={(e) => update("minimumAge", e.target.value)} /></Field></Grid><Field label="Location Restriction"><input className={inputClass} value={form.locationRestriction} onChange={(e) => update("locationRestriction", e.target.value)} /></Field>{form.competitionType === "Live Event" ? <Grid><Field label="Venue"><input className={inputClass} value={form.venueName} onChange={(e) => update("venueName", e.target.value)} /></Field><Field label="Address"><input className={inputClass} value={form.eventAddress} onChange={(e) => update("eventAddress", e.target.value)} /></Field><Field label="City"><input className={inputClass} value={form.eventCity} onChange={(e) => update("eventCity", e.target.value)} /></Field><Field label="Country"><input className={inputClass} value={form.eventCountry} onChange={(e) => update("eventCountry", e.target.value)} /></Field><Field label="External Livestream URL"><input className={inputClass} value={form.externalLiveUrl} onChange={(e) => update("externalLiveUrl", e.target.value)} placeholder="https://partner-site.com/live" /></Field><Field label="External Live Status"><select className={inputClass} value={form.externalLiveStatus} onChange={(e) => update("externalLiveStatus", e.target.value)}>{["not_ready", "scheduled", "live", "ended"].map((value) => <option key={value}>{value}</option>)}</select></Field></Grid> : null}<Field label="Registration Questions (one per line)"><textarea className={textareaClass} value={form.registrationQuestions} onChange={(e) => update("registrationQuestions", e.target.value)} /></Field><Grid>{check("approvalRequired", "Participant approval required")}{check("termsRequired", "Terms agreement required")}</Grid><Card className="p-4 text-sm text-slate-300">Live events are physical-first. Challenge Suite stores registration, venue, schedule, lineup, voting/results connection, and external livestream link/status only.</Card></Step>;
  if (step === 4) return <Step title="Submission Settings"><Grid><Field label="Submission Type"><select className={inputClass} value={form.submissionType} onChange={(e) => update("submissionType", e.target.value)}>{["image", "video", "text", "link"].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="Max File Size (MB)"><input className={inputClass} type="number" value={form.maxFileSizeMb} onChange={(e) => update("maxFileSizeMb", e.target.value)} /></Field><Field label="Max Video Duration (seconds)"><input className={inputClass} type="number" value={form.maxVideoDurationSeconds} onChange={(e) => update("maxVideoDurationSeconds", e.target.value)} /></Field><Field label="Submission Deadline"><input className={inputClass} type="datetime-local" value={form.submissionDeadline} onChange={(e) => update("submissionDeadline", e.target.value)} /></Field></Grid><Field label="Submission Guidelines"><textarea className={textareaClass} value={form.submissionGuidelines} onChange={(e) => update("submissionGuidelines", e.target.value)} /></Field><Grid>{check("allowResubmission", "Allow resubmission")}{check("requireSubmissionApproval", "Approve before public display")}</Grid></Step>;
  if (step === 5) return <Step title="Voting Settings"><Grid><Field label="Voting Starts"><input className={inputClass} type="datetime-local" value={form.votingStartsAt} onChange={(e) => update("votingStartsAt", e.target.value)} /></Field><Field label="Voting Ends"><input className={inputClass} type="datetime-local" value={form.votingDeadline} onChange={(e) => update("votingDeadline", e.target.value)} /></Field><Field label="Votes Per User / Day"><input className={inputClass} type="number" min="0" value={form.votesPerUserPerDay} onChange={(e) => update("votesPerUserPerDay", e.target.value)} /></Field><Field label="Competition End"><input className={inputClass} type="datetime-local" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} /></Field></Grid><Grid>{check("allowFreeVotes", "Allow free votes")}{check("allowDoroCoinVotes", "Allow DoroCoin votes")}{check("weightedVotes", "Vote multiplier")}{check("showVoteCount", "Show vote count")}{check("showLeaderboard", "Show leaderboard")}</Grid></Step>;
  if (step === 6) return <Step title="Judging & Winner Selection">{selectButtons("winnerSelection", options.winnerSelection)}<Grid>{check("multipleWinners", "Allow multiple winners")}<Field label="Placement"><select className={inputClass} value={form.placementMode} onChange={(e) => update("placementMode", e.target.value)}><option value="single">Single winner</option><option value="top_three">1st / 2nd / 3rd</option><option value="categories">Category winners</option></select></Field></Grid></Step>;
  if (step === 7) return <Step title="Prize Setup"><Field label="Prize Description"><textarea className={textareaClass} value={form.prizeDescription} onChange={(e) => update("prizeDescription", e.target.value)} /></Field><Grid><Field label="Prize Sponsor"><input className={inputClass} value={form.prizeSponsor} onChange={(e) => update("prizeSponsor", e.target.value)} /></Field><Field label="Manual Payout Note"><input className={inputClass} value={form.manualPayoutNote} onChange={(e) => update("manualPayoutNote", e.target.value)} /></Field></Grid><Field label="Prize Terms"><textarea className={textareaClass} value={form.prizeTerms} onChange={(e) => update("prizeTerms", e.target.value)} /></Field><Card className="border-yellow-500/30 p-4 text-sm text-yellow-100"><ShieldCheck className="mb-2" />Automatic cash payouts and prize-pool releases are not active yet.</Card></Step>;
  if (step === 8) return <Step title="Media & Branding"><Grid><MediaUploadField label="Promo Flyer" value={form.promoImageUrl} onChange={(url, metadata) => { update("promoImageUrl", url); update("promoImagePath", metadata?.path ?? ""); }} storagePath={challengeDraftMediaPath(userId, "gallery")} kind="image" buttonLabel="Upload Promo Image" /><MediaUploadField label="Trailer Video" value={form.trailerVideoUrl} onChange={(url, metadata) => { update("trailerVideoUrl", url); update("trailerVideoPath", metadata?.path ?? ""); }} storagePath={challengeDraftMediaPath(userId, "video")} kind="video" buttonLabel="Upload Trailer Video" /><MediaUploadField label="Event Logo" value={form.eventLogoUrl} onChange={(url) => update("eventLogoUrl", url)} storagePath={challengeDraftMediaPath(userId, "gallery")} kind="image" buttonLabel="Upload Event Logo" /><MediaUploadField label="Sponsor Banner" value={form.sponsorBannerUrl} onChange={(url) => update("sponsorBannerUrl", url)} storagePath={challengeDraftMediaPath(userId, "gallery")} kind="image" buttonLabel="Upload Sponsor Banner" /><Field label="Brand Color"><input className={inputClass} type="color" value={form.brandColor} onChange={(e) => update("brandColor", e.target.value)} /></Field></Grid><p className="text-sm text-slate-400">Media uploads fail closed until secure Storage rules are manually published. External livestream links remain partner URLs only.</p></Step>;
  if (step === 9) return <Step title="Sponsor Readiness"><Grid>{check("allowSponsorInterest", "Allow sponsor interest")}{check("showSponsorRequestButton", "Show sponsor request button")}</Grid><Field label="Sponsor Categories"><textarea className={textareaClass} value={form.sponsorCategories} onChange={(e) => update("sponsorCategories", e.target.value)} /></Field><Field label="Visibility Areas"><textarea className={textareaClass} value={form.sponsorVisibilityAreas} onChange={(e) => update("sponsorVisibilityAreas", e.target.value)} /></Field><Card className="p-4 text-sm text-slate-300">Sponsor requests remain review-only. No sponsor capture or release is activated.</Card></Step>;
  return <Step title="Review & Publish"><div className="grid gap-3 sm:grid-cols-2">{[["Competition", form.competitionType], ["Visibility", form.visibilityMode], ["Format", form.format], ["Participants", form.maxParticipants], ["Voting", `${form.votesPerUserPerDay} vote(s)/day`], ["Winner selection", form.winnerSelection]].map(([label, value]) => <Card key={label} className="p-4"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-1 font-black capitalize">{value.replaceAll("_", " ")}</p></Card>)}</div><Grid>{["draft", "publish", "schedule"].map((value) => <Button key={value} variant={form.launchMode === value ? "primary" : "secondary"} onClick={() => update("launchMode", value)}>{value}</Button>)}</Grid><Card className="p-4 text-sm text-slate-300">Review the competition details before saving, scheduling, or publishing.</Card></Step>;
}
function Step({ title, children }: { title: string; children: React.ReactNode }) { return <section className="space-y-6"><div><p className="text-xs font-black uppercase text-[var(--gold)]">Host competition builder</p><h2 className="mt-2 text-2xl font-black">{title}</h2></div>{children}</section>; }
function Grid({ children }: { children: React.ReactNode }) { return <div className="grid gap-4 sm:grid-cols-2">{children}</div>; }

function SpecializedFlowNotice({ competitionType }: { competitionType: string }) {
  if (competitionType === "Live Event") return <Card className="p-4 text-sm leading-6 text-slate-300"><b className="text-white">Live Event.</b> Capture venue, schedule, registration, check-in, attendee limits, rules, contacts, media permissions, sponsor placements, livestream details, prizes, judges, and publish review. Ticket checkout remains unavailable until a payment route is configured.</Card>;
  if (competitionType === "Tournament") return <Card className="p-4 text-sm leading-6 text-slate-300"><b className="text-white">Tournament.</b> Configure format, participants, registration, seeding, rounds, match rules, scoring, tie-breakers, bracket visibility, disputes, prizes, sponsors, and publish review. Brackets and participants are generated only from real registration data.</Card>;
  if (competitionType === "Private Challenge") return <Card className="p-4 text-sm leading-6 text-slate-300"><b className="text-white">Private Challenge.</b> Configure invite access, participant limits, visibility, expiration, approvals, timeline, submissions, and plan-gated monetization.</Card>;
  return <Card className="p-4 text-sm leading-6 text-slate-300">Private challenges, live events, and tournaments use dedicated workspace entries for their format.</Card>;
}

