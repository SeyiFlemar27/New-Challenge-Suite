"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Save, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MediaUploadField, type MediaUploadStage } from "@/components/media-upload-field";
import { Button, Card, Field, LinkButton, PageTitle, inputClass, textareaClass } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { apiRequest } from "@/lib/api/client";
import { firebaseClientConfigStatus } from "@/lib/firebase/client";
import { tournamentDraftMediaPath } from "@/lib/media-upload-paths";
import { bracketSizeForParticipants, buildRoundPlan, defaultPrizeDistribution, doubleEliminationMatchCount, singleEliminationMatchCount, singleEliminationStageCount } from "@/lib/server/tournaments";

const steps = ["Overview", "Format & Capacity", "Registration", "Seeding & Bracket", "Rounds & Schedule", "Rules & Scoring", "Monetization & Prize Pool", "Media & Branding", "Sponsors", "Review & Publish"];
const capacities = [4, 8, 16, 32, 64];

type BuilderForm = {
  title: string; shortDescription: string; description: string; category: string; subcategory: string; tournamentRules: string;
  coverImageUrl: string; coverImagePath: string; trailerUrl: string; trailerPath: string;
  format: "single_elimination" | "double_elimination"; participantCapacity: number; privacy: "public" | "private" | "invite_only"; registrationType: "open" | "approval_required" | "invite_only";
  registrationOpensAt: string; registrationClosesAt: string; tournamentStartsAt: string; expectedEndAt: string;
  eligibilityRules: string; profileRequirements: string; ageRestriction: string; requiresCheckIn: boolean;
  seedingMethod: "manual" | "random"; resultMethod: "votes" | "judges" | "hybrid"; audiencePercent: number; judgesPercent: number; scoreVisibility: "live" | "hidden" | "final_only"; tieBreaker: string; thirdPlaceMethod: "none" | "bronze_match";
  entryType: "free" | "paid_entry_setup_required"; entryFeeAmountMinor: number; currency: string; sponsorReady: boolean; acceptSponsorshipProposals: boolean; sponsorshipGoal: number; sponsorCategories: string; sponsorNote: string; sponsorPlacementPreferences: string; prizeDistribution: Array<{ placement: 1 | 2 | 3; percent: number }>;
};

const initialForm: BuilderForm = {
  title: "", shortDescription: "", description: "", category: "", subcategory: "", tournamentRules: "",
  coverImageUrl: "", coverImagePath: "", trailerUrl: "", trailerPath: "",
  format: "single_elimination", participantCapacity: 8, privacy: "public", registrationType: "open",
  registrationOpensAt: "", registrationClosesAt: "", tournamentStartsAt: "", expectedEndAt: "",
  eligibilityRules: "", profileRequirements: "", ageRestriction: "", requiresCheckIn: false,
  seedingMethod: "manual", resultMethod: "votes", audiencePercent: 50, judgesPercent: 50, scoreVisibility: "final_only", tieBreaker: "host_review", thirdPlaceMethod: "bronze_match",
  entryType: "free", entryFeeAmountMinor: 0, currency: "USD", sponsorReady: false, acceptSponsorshipProposals: false, sponsorshipGoal: 0, sponsorCategories: "", sponsorNote: "", sponsorPlacementPreferences: "", prizeDistribution: defaultPrizeDistribution()
};

export function TournamentBuilder() {
  const auth = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<BuilderForm>(initialForm);
  const [coverStatus, setCoverStatus] = useState<MediaUploadStage>("idle");
  const [trailerStatus, setTrailerStatus] = useState<MediaUploadStage>("idle");
  const [notice, setNotice] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [saving, setSaving] = useState(false);
  const mediaDisabled = firebaseClientConfigStatus.mediaUploadsDisabled;
  const roundPlan = useMemo(() => buildRoundPlan(bracketSizeForParticipants(form.participantCapacity), form.resultMethod, form.thirdPlaceMethod), [form.participantCapacity, form.resultMethod, form.thirdPlaceMethod]);
  const readiness = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!form.title.trim()) errors.push("Tournament name is required.");
    if (!form.description.trim()) errors.push("Full description is required.");
    if (!form.category.trim()) errors.push("Category is required.");
    if (!form.coverImageUrl && !mediaDisabled) errors.push("Cover media upload must complete.");
    if (form.registrationOpensAt && form.registrationClosesAt && new Date(form.registrationOpensAt) >= new Date(form.registrationClosesAt)) errors.push("Registration must close after it opens.");
    if (form.registrationClosesAt && form.tournamentStartsAt && new Date(form.registrationClosesAt) >= new Date(form.tournamentStartsAt)) errors.push("Registration must close before the tournament starts.");
    if (form.resultMethod === "hybrid" && form.audiencePercent + form.judgesPercent !== 100) errors.push("Hybrid scoring must total 100%.");
    if (form.prizeDistribution.reduce((sum, item) => sum + item.percent, 0) !== 65) errors.push("Winner allocations must total 65% of eligible generated revenue.");
    if (form.entryType === "paid_entry_setup_required" && form.entryFeeAmountMinor < 100) errors.push("Set a valid paid entry amount.");
    if (form.entryType === "paid_entry_setup_required") warnings.push("Paid entry remains provider-confirmed and setup-gated.");
    if (coverStatus === "uploading" || coverStatus === "preparing") errors.push("Wait for cover upload to finish.");
    if (trailerStatus === "uploading" || trailerStatus === "preparing") errors.push("Wait for trailer upload to finish.");
    return { errors, warnings, ready: errors.length === 0 };
  }, [coverStatus, form, mediaDisabled, trailerStatus]);

  function update<K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveDraft(status: "draft" | "pending_review" = "draft") {
    setSaving(true);
    setNotice("");
    const payload = {
      ...form,
      status,
      roundPlan,
      hybridScoring: [{ name: "audience", percent: form.audiencePercent }, { name: "judges", percent: form.judgesPercent }],
      coverMedia: { url: form.coverImageUrl || null, path: form.coverImagePath || null, status: form.coverImageUrl ? "uploaded" : mediaDisabled ? "storage_disabled" : "missing" },
      trailerMedia: { url: form.trailerUrl || null, path: form.trailerPath || null, status: form.trailerUrl ? "uploaded" : mediaDisabled ? "storage_disabled" : "missing" },
      eligibility: { rules: form.eligibilityRules, profileRequirements: form.profileRequirements, ageRestriction: form.ageRestriction },
      sponsorship: { sponsorReady: form.sponsorReady, acceptSponsorshipProposals: form.acceptSponsorshipProposals, sponsorPlacementPreferences: form.sponsorPlacementPreferences, confirmedSponsorFundingMinor: 0 }
    };
    const result = await apiRequest<{ tournament: { id: string } }>(createdId ? `/api/tournaments/${createdId}` : "/api/tournaments", { method: createdId ? "PATCH" : "POST", body: JSON.stringify(payload) });
    setSaving(false);
    if (!result.ok || !result.data) {
      setNotice(result.message || "Tournament draft could not be saved.");
      return;
    }
    setCreatedId(result.data.tournament.id);
    setNotice(status === "pending_review" ? "Tournament submitted for readiness review." : "Tournament draft saved.");
  }

  const userId = auth.user?.uid ?? "signed-in-user";
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageTitle title="Create Tournament" subtitle="Build a dedicated tournament with registration, bracket, rounds, scoring, sponsorship, and admin-reviewed prize flow." icon={<Trophy />} />
        <div className="mt-6 grid gap-5 lg:grid-cols-[240px_1fr]">
          <Card className="p-4">
            <div className="space-y-2">{steps.map((label, index) => <button key={label} className={`w-full rounded-[8px] px-3 py-3 text-left text-sm font-bold ${index === step ? "bg-[var(--gold)] text-black" : "bg-white/[0.03] text-slate-300"}`} onClick={() => setStep(index)}>{index + 1}. {label}</button>)}</div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Drafts are saved through tournament APIs. Publishing is readiness-gated server-side.</p>
          </Card>
          <Card className="p-5 sm:p-7">
             {step === 0 ? <OverviewStep form={form} update={update} /> : null}
             {step === 1 ? <FormatStep form={form} update={update} /> : null}
             {step === 2 ? <RegistrationStep form={form} update={update} /> : null}
             {step === 3 ? <SeedingStep form={form} update={update} /> : null}
             {step === 4 ? <RoundsStep roundPlan={roundPlan} /> : null}
             {step === 5 ? <RulesStep form={form} update={update} /> : null}
             {step === 6 ? <PrizeStep form={form} update={update} /> : null}
             {step === 7 ? <MediaStep form={form} update={update} mediaDisabled={mediaDisabled} userId={userId} setCoverStatus={setCoverStatus} setTrailerStatus={setTrailerStatus} /> : null}
             {step === 8 ? <SponsorsStep form={form} update={update} /> : null}
             {step === 9 ? <ReviewStep form={form} readiness={readiness} roundPlan={roundPlan} /> : null}
            {notice ? <Card className="mt-5 border-yellow-500/20 bg-yellow-500/[0.03] p-4 text-sm text-yellow-100">{notice}</Card> : null}
            {createdId ? <LinkButton href={`/tournaments/${createdId}`} className="mt-5" variant="secondary">View tournament draft</LinkButton> : null}
            <div className="mt-7 flex flex-wrap justify-between gap-3">
              <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ChevronLeft size={16} /> Previous</Button>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => void saveDraft("draft")} disabled={saving}><Save size={16} /> {saving ? "Saving..." : "Save Draft"}</Button>
                {step < steps.length - 1 ? <Button onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>Next <ChevronRight size={16} /></Button> : <Button onClick={() => void saveDraft("pending_review")} disabled={saving || !readiness.ready}><CheckCircle2 size={16} /> Submit for Review</Button>}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function OverviewStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Overview" body="Define this individual tournament before configuring its bracket and operations." /><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Tournament title"><input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field><Field label="Category"><input className={inputClass} value={form.category} onChange={(event) => update("category", event.target.value)} /></Field><Field label="Subcategory"><input className={inputClass} value={form.subcategory} onChange={(event) => update("subcategory", event.target.value)} /></Field><Field label="Short description"><input className={inputClass} value={form.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} /></Field></div><div className="mt-5 grid gap-5"><Field label="Full description"><textarea className={textareaClass} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field><Field label="Tournament rules"><textarea className={textareaClass} value={form.tournamentRules} onChange={(event) => update("tournamentRules", event.target.value)} /></Field></div><p className="mt-4 text-sm text-slate-400">Launch supports individual participants only. Team brackets are not available.</p></section>;
}

function Basics({ form, update, mediaDisabled, userId, setCoverStatus, setTrailerStatus }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void; mediaDisabled: boolean; userId: string; setCoverStatus: (status: MediaUploadStage) => void; setTrailerStatus: (status: MediaUploadStage) => void }) {
  return <section><StepTitle title="Basics" body="Name the tournament and upload real media when Storage is available." /><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Tournament name"><input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field><Field label="Category"><input className={inputClass} value={form.category} onChange={(event) => update("category", event.target.value)} /></Field><Field label="Short description"><input className={inputClass} value={form.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} /></Field><Field label="Full description"><textarea className={textareaClass} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field></div><div className="mt-5 grid gap-5 md:grid-cols-2"><MediaUploadField label="Cover media" value={form.coverImageUrl} storagePath={tournamentDraftMediaPath(userId, "cover")} required disabled={mediaDisabled} onStatusChange={setCoverStatus} onChange={(url, meta) => { update("coverImageUrl", url); update("coverImagePath", meta?.path ?? ""); }} /><MediaUploadField label="Optional trailer" value={form.trailerUrl} kind="video" storagePath={tournamentDraftMediaPath(userId, "trailer")} disabled={mediaDisabled} onStatusChange={setTrailerStatus} onChange={(url, meta) => { update("trailerUrl", url); update("trailerPath", meta?.path ?? ""); }} /></div>{mediaDisabled ? <p className="mt-4 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">Media uploads are temporarily unavailable. The draft may be saved with storage-disabled media metadata; real upload mode resumes when Storage is configured.</p> : null}</section>;
}

function MediaStep({ form, update, mediaDisabled, userId, setCoverStatus, setTrailerStatus }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void; mediaDisabled: boolean; userId: string; setCoverStatus: (status: MediaUploadStage) => void; setTrailerStatus: (status: MediaUploadStage) => void }) {
  return <section><StepTitle title="Media & Branding" body="Use storage-confirmed tournament media. No external URL or fake upload state is accepted." /><div className="mt-5 grid gap-5 md:grid-cols-2"><MediaUploadField label="Cover media" value={form.coverImageUrl} storagePath={tournamentDraftMediaPath(userId, "cover")} required disabled={mediaDisabled} onStatusChange={setCoverStatus} onChange={(url, meta) => { update("coverImageUrl", url); update("coverImagePath", meta?.path ?? ""); }} /><MediaUploadField label="Optional trailer" value={form.trailerUrl} kind="video" storagePath={tournamentDraftMediaPath(userId, "trailer")} disabled={mediaDisabled} onStatusChange={setTrailerStatus} onChange={(url, meta) => { update("trailerUrl", url); update("trailerPath", meta?.path ?? ""); }} /></div>{mediaDisabled ? <p className="mt-4 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">Media uploads are temporarily unavailable. Real upload mode resumes when Storage is configured.</p> : null}</section>;
}

function FormatStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Format & Capacity" body="Choose the launch format. Brackets use only confirmed participants after registration closes and handle unused bracket slots as byes." /><div className="mt-5 grid gap-4 md:grid-cols-2">{(["single_elimination", "double_elimination"] as const).map((format) => <button type="button" key={format} onClick={() => update("format", format)} className={`rounded-[8px] border p-4 text-left ${form.format === format ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-white/10"}`}><p className="font-black">{format === "single_elimination" ? "Single Elimination" : "Double Elimination"}</p><p className="mt-2 text-sm text-slate-400">{format === "single_elimination" ? "One confirmed matchup loss eliminates a participant." : "A participant moves through the losers bracket after one loss and is eliminated after the second."}</p></button>)}</div><Field label="Capacity"><select className={inputClass} value={form.participantCapacity} onChange={(event) => update("participantCapacity", Number(event.target.value))}>{capacities.map((capacity) => <option key={capacity} value={capacity}>{capacity} participants</option>)}</select></Field><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Capacity" value={form.participantCapacity} /><Metric label="Winners rounds" value={singleEliminationStageCount(form.participantCapacity)} /><Metric label="Maximum matches" value={form.format === "double_elimination" ? doubleEliminationMatchCount(form.participantCapacity) : singleEliminationMatchCount(form.participantCapacity)} /></div></section>;
}

function SeedingStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Seeding & Bracket" body="The final bracket is generated server-side after registration closes from real confirmed participants." /><div className="mt-5 grid gap-4 md:grid-cols-2">{(["random", "manual"] as const).map((method) => <button type="button" key={method} onClick={() => update("seedingMethod", method)} className={`rounded-[8px] border p-4 text-left ${form.seedingMethod === method ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-white/10"}`}><p className="font-black capitalize">{method} seeding</p><p className="mt-2 text-sm text-slate-400">{method === "random" ? "The server shuffles confirmed participants once, then locks the seeds." : "The host orders confirmed participants before bracket generation."}</p></button>)}</div><Card className="mt-5 p-4 text-sm text-slate-300">Bracket regeneration is blocked after matches exist. Consequential corrections require authorized operations and audit records.</Card></section>;
}

function RegistrationStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Registration" body="Registration outcome is calculated server-side: registered, pending approval, waitlisted, rejected, or blocked." /><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Registration type"><select className={inputClass} value={form.registrationType} onChange={(e) => update("registrationType", e.target.value as BuilderForm["registrationType"])}><option value="open">Open Registration</option><option value="approval_required">Application Required</option><option value="invite_only">Invite Only</option></select></Field><Field label="Privacy"><select className={inputClass} value={form.privacy} onChange={(e) => update("privacy", e.target.value as BuilderForm["privacy"])}><option value="public">Public</option><option value="private">Unlisted</option><option value="invite_only">Invite Only</option></select></Field>{["registrationOpensAt", "registrationClosesAt", "tournamentStartsAt", "expectedEndAt"].map((key) => <Field key={key} label={key.replaceAll(/([A-Z])/g, " $1")}><input className={inputClass} type="datetime-local" value={String(form[key as keyof BuilderForm] ?? "")} onChange={(e) => update(key as keyof BuilderForm, e.target.value as never)} /></Field>)}<Field label="Eligibility rules"><textarea className={textareaClass} value={form.eligibilityRules} onChange={(e) => update("eligibilityRules", e.target.value)} /></Field><Field label="Profile requirements"><textarea className={textareaClass} value={form.profileRequirements} onChange={(e) => update("profileRequirements", e.target.value)} /></Field><Field label="Age restriction"><input className={inputClass} value={form.ageRestriction} onChange={(e) => update("ageRestriction", e.target.value)} /></Field><label className="flex items-center gap-3 rounded-[8px] border border-white/10 p-4 text-sm font-bold"><input type="checkbox" checked={form.requiresCheckIn} onChange={(e) => update("requiresCheckIn", e.target.checked)} /> Check-in required</label></div></section>;
}

function RoundsStep({ roundPlan }: { roundPlan: ReturnType<typeof buildRoundPlan> }) {
  return <section><StepTitle title="Rounds" body="Round plan is generated from capacity while titles and briefs remain customizable in saved configuration." /><div className="mt-5 grid gap-4">{roundPlan.map((round) => <Card key={round.title} className="p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Round {round.roundNumber}</p><h3 className="mt-1 text-lg font-black">{round.title}</h3><p className="mt-2 text-sm text-slate-400">{round.advancementRule.replaceAll("_", " ")}</p></Card>)}</div></section>;
}

function RulesStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Rules & Scoring" body="Official scoring is calculated server-side. Ties require an explicit configured rule." /><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Result method"><select className={inputClass} value={form.resultMethod} onChange={(e) => update("resultMethod", e.target.value as BuilderForm["resultMethod"])}><option value="votes">Audience Voting</option><option value="judges">Judges</option><option value="hybrid">Hybrid</option></select></Field><Field label="Score visibility"><select className={inputClass} value={form.scoreVisibility} onChange={(e) => update("scoreVisibility", e.target.value as BuilderForm["scoreVisibility"])}><option value="live">Live</option><option value="hidden">Hidden</option><option value="final_only">Final only</option></select></Field>{form.resultMethod === "hybrid" ? <><Field label="Audience %"><input className={inputClass} type="number" value={form.audiencePercent} onChange={(e) => update("audiencePercent", Number(e.target.value))} /></Field><Field label="Judges %"><input className={inputClass} type="number" value={form.judgesPercent} onChange={(e) => update("judgesPercent", Number(e.target.value))} /></Field></> : null}<Field label="Tie-breaker"><select className={inputClass} value={form.tieBreaker} onChange={(e) => update("tieBreaker", e.target.value)}><option value="host_review">Host review</option><option value="judge_review">Judge decision</option><option value="sudden_death_voting">Sudden-death voting</option><option value="predefined_rule">Predefined rule</option></select></Field><Field label="Third-place method"><select className={inputClass} value={form.thirdPlaceMethod} onChange={(e) => update("thirdPlaceMethod", e.target.value as BuilderForm["thirdPlaceMethod"])}><option value="bronze_match">Bronze Match</option><option value="none">No third place</option></select></Field></div></section>;
}

function PrizeStep({ form, update }: { form: BuilderForm; update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void }) {
  return <section><StepTitle title="Monetization & Prize Pool" body="Only confirmed tournament-generated revenue enters the 65/20/15 allocation. No external payout is executed here." /><div className="mt-5 grid gap-5 md:grid-cols-3"><Field label="Entry mode"><select className={inputClass} value={form.entryType} onChange={(e) => update("entryType", e.target.value as BuilderForm["entryType"])}><option value="free">Free</option><option value="paid_entry_setup_required">Paid</option></select></Field>{form.entryType === "paid_entry_setup_required" ? <Field label="Entry fee (minor units)"><input className={inputClass} type="number" min="100" value={form.entryFeeAmountMinor} onChange={(e) => update("entryFeeAmountMinor", Number(e.target.value))} /></Field> : null}<Field label="Currency"><select className={inputClass} value={form.currency} onChange={(e) => update("currency", e.target.value)}><option value="USD">USD</option><option value="NGN">NGN</option></select></Field></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{form.prizeDistribution.map((item) => <Card key={item.placement} className="p-4"><p className="text-xs font-bold text-slate-500">{item.placement === 1 ? "1st" : item.placement === 2 ? "2nd" : "3rd"} place</p><p className="mt-2 text-2xl font-black">{item.percent}%</p><p className="mt-1 text-xs text-slate-400">of eligible generated revenue</p></Card>)}</div><Card className="mt-5 p-4 text-sm leading-6 text-slate-300">65% winners / 20% creator or host / 15% Challenge Suite. Creator-funded prizes go 100% to the prize pool. Confirmed sponsor value remains separate and directed to its approved purpose.</Card></section>;
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
