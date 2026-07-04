"use client";

import { useState } from "react";
import { CheckCircle2, Save, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { createChallenge } from "@/lib/api/services";

const steps = ["Basic Details", "Visibility", "Format & Rounds", "Participants", "Submissions", "Voting", "Judging", "Prize Foundation", "Media & Branding", "Sponsor Readiness", "Review & Publish"];
const options = {
  competitionType: ["Online Challenge", "Private Challenge", "Live Event", "Tournament", "Hybrid Competition"],
  visibilityMode: ["public", "invite_only", "access_code", "approved_list", "hidden", "public_preview"],
  format: ["single_round", "multi_round", "knockout", "leaderboard", "judge_reviewed", "submission_voting", "registration_only"],
  winnerSelection: ["highest_votes", "judge_selection", "hybrid", "manual"]
};
function dateInput(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return `${date.toISOString().slice(0, 10)}T12:00`; }
const initial = {
  title: "", description: "", category: "Creative", coverImageUrl: "", competitionType: "Online Challenge",
  visibilityMode: "public", accessCode: "", format: "single_round", maxParticipants: "50", minimumAge: "0", locationRestriction: "",
  approvalRequired: true, registrationQuestions: "", termsRequired: true, submissionType: "image", maxFileSizeMb: "25",
  maxVideoDurationSeconds: "180", allowResubmission: false, requireSubmissionApproval: true, submissionGuidelines: "",
  startsAt: dateInput(1), submissionDeadline: dateInput(5), votingStartsAt: dateInput(5), votingDeadline: dateInput(6), endsAt: dateInput(7),
  allowFreeVotes: true, votesPerUserPerDay: "1", allowDoroCoinVotes: true, weightedVotes: false, showVoteCount: true, showLeaderboard: true,
  winnerSelection: "highest_votes", multipleWinners: false, placementMode: "top_three", prizeDescription: "", prizeSponsor: "",
  prizeTerms: "", manualPayoutNote: "", promoImageUrl: "", trailerVideoUrl: "", eventLogoUrl: "", sponsorBannerUrl: "",
  brandColor: "#F5B700", allowSponsorInterest: false, showSponsorRequestButton: false, sponsorCategories: "",
  sponsorVisibilityAreas: "Challenge page\nWinner announcement", launchMode: "draft"
};
type Form = typeof initial;

export function HostCompetitionWizard() {
  const [step, setStep] = useState(0), [form, setForm] = useState(initial), [saving, setSaving] = useState(false);
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
    const live = ["Live Event", "Hybrid Competition"].includes(form.competitionType);
    const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
    return {
      title: form.title, description: form.description, category: form.category, type: form.competitionType,
      visibility: ["public", "public_preview"].includes(form.visibilityMode) ? "public" : "private",
      acceptedSubmissionTypes: [form.submissionType === "video" ? "video" : "image"], competitionFormat: form.format, bestOf: "1 Rounder",
      startsAt: form.startsAt, endsAt: form.endsAt, submissionDeadline: form.submissionDeadline, votingStartsAt: form.votingStartsAt,
      votingDeadline: form.votingDeadline, standardRules: "Respect participants.\nSubmit original work.\nFollow published competition policies.",
      policyTerms: form.prizeTerms || "Participation remains subject to platform review.", challengeGuidelines: form.submissionGuidelines,
      coverImageUrl: form.coverImageUrl, promoImageUrl: form.promoImageUrl, trailerVideoUrl: form.trailerVideoUrl, promoVideoUrl: "",
      prizeType: form.prizeDescription ? "physical_product" : "bragging_rights", prizeTitle: form.prizeDescription ? "Competition prize" : "",
      prizeDescription: form.prizeDescription, prizeValue: 0, prizeDeliveryNotes: form.manualPayoutNote,
      votingSettings: { allowFreeVotes: form.allowFreeVotes, allowDoroCoinVotes: form.allowDoroCoinVotes, weightedVotes: form.weightedVotes },
      requiresSubmissionApproval: form.requireSubmissionApproval, sponsorEnabled: form.allowSponsorInterest, sponsorSlots: form.allowSponsorInterest ? 3 : 0,
      minimumSponsorshipAmount: 0, sponsorPlacementOptions: lines(form.sponsorVisibilityAreas), sponsorPackages: [],
      isLiveEvent: live, venueName: live ? "Venue pending" : "", eventAddress: "", eventCity: live ? form.locationRestriction || "Location pending" : "",
      eventState: "", eventCountry: live ? "Location pending" : "", eventMapUrl: "", eventCapacity: Number(form.maxParticipants),
      tournamentType: form.competitionType === "Tournament" ? "group" : "none", divisionFormat: 2, maxParticipants: Math.min(50, Number(form.maxParticipants)),
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
  if (createdId) return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" /><h1 className="mt-5 text-3xl font-black">Competition saved</h1><p className="mt-3 text-slate-300">Advanced events, tournaments, sponsor settings, and prizes remain subject to review. No money movement was enabled.</p><div className="mt-6 flex justify-center gap-3"><LinkButton href={createdId === "saved" ? "/my-challenges" : `/challenges/${createdId}`}>View Competition</LinkButton><LinkButton href="/dashboard/host" variant="secondary">Host Control Center</LinkButton></div></Card></AppShell>;
  return <AppShell><div className="mx-auto max-w-6xl"><PageTitle title="Build Competition" subtitle="Configure participants, submissions, voting, judging, media, and review-safe prize foundations." /><Card className="mt-6 p-4 sm:p-6">
    <div className="flex gap-2 overflow-x-auto pb-2">{steps.map((label, index) => <button key={label} onClick={() => index <= step && setStep(index)} className={`min-h-11 min-w-40 rounded-[8px] px-3 text-left text-xs font-black ${index === step ? "bg-[var(--gold)] text-black" : "bg-[#191919] text-slate-300"}`}>{index + 1}. {label}</button>)}</div>
    <div className="mt-8 min-h-[470px]"><WizardStep step={step} form={form} update={update} /></div>
    {error ? <p className="mt-5 rounded-[8px] bg-red-950/50 p-4 text-red-200">{error}</p> : null}
    <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:justify-between"><Button variant="secondary" onClick={() => submit(false)} disabled={saving}><Save size={17} /> Save Draft</Button><div className="flex gap-3"><Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>Back</Button>{step < 10 ? <Button onClick={() => { const problem = validate(); problem ? setError(problem) : setStep((value) => value + 1); }}>Next</Button> : <Button onClick={() => submit(form.launchMode !== "draft")} disabled={saving}>{saving ? "Saving..." : form.launchMode === "schedule" ? "Schedule Launch" : "Publish Competition"}</Button>}</div></div>
  </Card></div></AppShell>;
}

function WizardStep({ step, form, update }: { step: number; form: Form; update: <K extends keyof Form>(key: K, value: Form[K]) => void }) {
  const check = (key: keyof Form, label: string) => <label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-white/10 px-4 py-3 font-bold"><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => update(key, event.target.checked as never)} />{label}</label>;
  const selectButtons = (key: "competitionType" | "visibilityMode" | "format" | "winnerSelection", values: string[]) => <Grid>{values.map((value) => <Button key={value} variant={form[key] === value ? "primary" : "secondary"} onClick={() => update(key, value)}>{value.replaceAll("_", " ")}</Button>)}</Grid>;
  if (step === 0) return <Step title="Basic Details"><Field label="Title"><input className={inputClass} value={form.title} onChange={(e) => update("title", e.target.value)} /></Field><Field label="Description"><textarea className={textareaClass} value={form.description} onChange={(e) => update("description", e.target.value)} /></Field><Grid><Field label="Category"><input className={inputClass} value={form.category} onChange={(e) => update("category", e.target.value)} /></Field><Field label="Cover Image URL"><input className={inputClass} value={form.coverImageUrl} onChange={(e) => update("coverImageUrl", e.target.value)} /></Field></Grid>{selectButtons("competitionType", options.competitionType)}</Step>;
  if (step === 1) return <Step title="Visibility">{selectButtons("visibilityMode", options.visibilityMode)}{form.visibilityMode === "access_code" ? <Field label="Access Code"><input className={inputClass} value={form.accessCode} onChange={(e) => update("accessCode", e.target.value)} /></Field> : null}</Step>;
  if (step === 2) return <Step title="Format & Rounds">{selectButtons("format", options.format)}</Step>;
  if (step === 3) return <Step title="Participants & Registration"><Grid><Field label="Maximum Participants"><input className={inputClass} type="number" min="2" max="50" value={form.maxParticipants} onChange={(e) => update("maxParticipants", e.target.value)} /></Field><Field label="Minimum Age"><input className={inputClass} type="number" min="0" value={form.minimumAge} onChange={(e) => update("minimumAge", e.target.value)} /></Field></Grid><Field label="Location Restriction"><input className={inputClass} value={form.locationRestriction} onChange={(e) => update("locationRestriction", e.target.value)} /></Field><Field label="Registration Questions (one per line)"><textarea className={textareaClass} value={form.registrationQuestions} onChange={(e) => update("registrationQuestions", e.target.value)} /></Field><Grid>{check("approvalRequired", "Participant approval required")}{check("termsRequired", "Terms agreement required")}</Grid></Step>;
  if (step === 4) return <Step title="Submission Settings"><Grid><Field label="Submission Type"><select className={inputClass} value={form.submissionType} onChange={(e) => update("submissionType", e.target.value)}>{["image", "video", "text", "link"].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="Max File Size (MB)"><input className={inputClass} type="number" value={form.maxFileSizeMb} onChange={(e) => update("maxFileSizeMb", e.target.value)} /></Field><Field label="Max Video Duration (seconds)"><input className={inputClass} type="number" value={form.maxVideoDurationSeconds} onChange={(e) => update("maxVideoDurationSeconds", e.target.value)} /></Field><Field label="Submission Deadline"><input className={inputClass} type="datetime-local" value={form.submissionDeadline} onChange={(e) => update("submissionDeadline", e.target.value)} /></Field></Grid><Field label="Submission Guidelines"><textarea className={textareaClass} value={form.submissionGuidelines} onChange={(e) => update("submissionGuidelines", e.target.value)} /></Field><Grid>{check("allowResubmission", "Allow resubmission")}{check("requireSubmissionApproval", "Approve before public display")}</Grid></Step>;
  if (step === 5) return <Step title="Voting Settings"><Grid><Field label="Voting Starts"><input className={inputClass} type="datetime-local" value={form.votingStartsAt} onChange={(e) => update("votingStartsAt", e.target.value)} /></Field><Field label="Voting Ends"><input className={inputClass} type="datetime-local" value={form.votingDeadline} onChange={(e) => update("votingDeadline", e.target.value)} /></Field><Field label="Votes Per User / Day"><input className={inputClass} type="number" min="0" value={form.votesPerUserPerDay} onChange={(e) => update("votesPerUserPerDay", e.target.value)} /></Field><Field label="Competition End"><input className={inputClass} type="datetime-local" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} /></Field></Grid><Grid>{check("allowFreeVotes", "Allow free votes")}{check("allowDoroCoinVotes", "Allow DoroCoin votes")}{check("weightedVotes", "Vote multiplier")}{check("showVoteCount", "Show vote count")}{check("showLeaderboard", "Show leaderboard")}</Grid></Step>;
  if (step === 6) return <Step title="Judging & Winner Selection">{selectButtons("winnerSelection", options.winnerSelection)}<Grid>{check("multipleWinners", "Allow multiple winners")}<Field label="Placement"><select className={inputClass} value={form.placementMode} onChange={(e) => update("placementMode", e.target.value)}><option value="single">Single winner</option><option value="top_three">1st / 2nd / 3rd</option><option value="categories">Category winners</option></select></Field></Grid></Step>;
  if (step === 7) return <Step title="Prize Foundation"><Field label="Prize Description"><textarea className={textareaClass} value={form.prizeDescription} onChange={(e) => update("prizeDescription", e.target.value)} /></Field><Grid><Field label="Prize Sponsor"><input className={inputClass} value={form.prizeSponsor} onChange={(e) => update("prizeSponsor", e.target.value)} /></Field><Field label="Manual Payout Note"><input className={inputClass} value={form.manualPayoutNote} onChange={(e) => update("manualPayoutNote", e.target.value)} /></Field></Grid><Field label="Prize Terms"><textarea className={textareaClass} value={form.prizeTerms} onChange={(e) => update("prizeTerms", e.target.value)} /></Field><Card className="border-yellow-500/30 p-4 text-sm text-yellow-100"><ShieldCheck className="mb-2" />Automatic cash payouts and prize-pool releases are not active yet.</Card></Step>;
  if (step === 8) return <Step title="Media & Branding"><Grid><Field label="Promo Flyer URL"><input className={inputClass} value={form.promoImageUrl} onChange={(e) => update("promoImageUrl", e.target.value)} /></Field><Field label="Trailer Video URL"><input className={inputClass} value={form.trailerVideoUrl} onChange={(e) => update("trailerVideoUrl", e.target.value)} /></Field><Field label="Event Logo URL"><input className={inputClass} value={form.eventLogoUrl} onChange={(e) => update("eventLogoUrl", e.target.value)} /></Field><Field label="Sponsor Banner URL"><input className={inputClass} value={form.sponsorBannerUrl} onChange={(e) => update("sponsorBannerUrl", e.target.value)} /></Field><Field label="Brand Color"><input className={inputClass} type="color" value={form.brandColor} onChange={(e) => update("brandColor", e.target.value)} /></Field></Grid><p className="text-sm text-slate-400">Media remains URL metadata until the upload pipeline is enabled.</p></Step>;
  if (step === 9) return <Step title="Sponsor Readiness"><Grid>{check("allowSponsorInterest", "Allow sponsor interest")}{check("showSponsorRequestButton", "Show sponsor request button")}</Grid><Field label="Sponsor Categories"><textarea className={textareaClass} value={form.sponsorCategories} onChange={(e) => update("sponsorCategories", e.target.value)} /></Field><Field label="Visibility Areas"><textarea className={textareaClass} value={form.sponsorVisibilityAreas} onChange={(e) => update("sponsorVisibilityAreas", e.target.value)} /></Field><Card className="p-4 text-sm text-slate-300">Sponsor requests remain review-only. No sponsor capture or release is activated.</Card></Step>;
  return <Step title="Review & Publish"><div className="grid gap-3 sm:grid-cols-2">{[["Competition", form.competitionType], ["Visibility", form.visibilityMode], ["Format", form.format], ["Participants", form.maxParticipants], ["Voting", `${form.votesPerUserPerDay} vote(s)/day`], ["Winner selection", form.winnerSelection]].map(([label, value]) => <Card key={label} className="p-4"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-1 font-black capitalize">{value.replaceAll("_", " ")}</p></Card>)}</div><Grid>{["draft", "publish", "schedule"].map((value) => <Button key={value} variant={form.launchMode === value ? "primary" : "secondary"} onClick={() => update("launchMode", value)}>{value}</Button>)}</Grid><Card className="p-4 text-sm text-slate-300">Moderation, vote controls, winner publication, exports, sponsor money, payouts, refunds, and prize releases remain safe foundations.</Card></Step>;
}
function Step({ title, children }: { title: string; children: React.ReactNode }) { return <section className="space-y-6"><div><p className="text-xs font-black uppercase text-[var(--gold)]">Host competition builder</p><h2 className="mt-2 text-2xl font-black">{title}</h2></div>{children}</section>; }
function Grid({ children }: { children: React.ReactNode }) { return <div className="grid gap-4 sm:grid-cols-2">{children}</div>; }
