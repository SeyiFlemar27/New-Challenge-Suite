"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { redistributeSponsorship } from "@/lib/legal";
import { challengeSchema } from "@/lib/validation";

const steps = ["Basic Details", "Format & Rules", "Dates & Eligibility", "Prize & Monetization", "Media", "Preview & Publish"];

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
      <Card className="mx-auto max-w-[960px] p-10">
        <PageTitle title="Create New Challenge" subtitle="Loading challenge wizard..." />
      </Card>
    </AppShell>
  );
}

function CreateChallengeWizard() {
  const searchParams = useSearchParams();
  const defaultType = searchParams.get("mode") === "private" ? "Private / Exclusive" : "Public Challenge";
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<"wizard" | "success">("wizard");
  const [draftSaved, setDraftSaved] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "The Ultimate Showdown",
    category: "Fitness",
    customCategory: "",
    type: defaultType,
    description: "Describe the goal of this challenge.",
    competitionFormat: "Entry Competition",
    bestOf: "1 Rounder",
    submissionTypes: ["image"],
    prizeType: "Cash Jackpot",
    entryFee: "10"
  });
  const [allocations, setAllocations] = useState([
    { bucket: "Platform ROI", percent: 12, enabled: true },
    { bucket: "Creator Share", percent: 3, enabled: true },
    { bucket: "Community Pool", percent: 0, enabled: false }
  ]);
  const normalized = useMemo(() => redistributeSponsorship(15, allocations), [allocations]);
  const braggingRights = form.prizeType === "Bragging Rights (Leaderboard Ranking)";

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
    if (step === 3 && !braggingRights && Number(form.entryFee) <= 0) return "Entry fee must be greater than $0 unless Bragging Rights is selected.";
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

  function publish() {
    const result = challengeSchema.safeParse({
      title: form.title,
      description: form.description,
      category: form.category,
      customCategory: form.category === "Other" ? form.customCategory : undefined,
      acceptedSubmissionTypes: form.submissionTypes,
      competitionFormat: form.competitionFormat,
      bestOf: form.bestOf,
      prizeType: form.prizeType,
      entryFee: braggingRights ? null : Number(form.entryFee),
      registrationDeadline: "2026-01-22",
      startsAt: "2026-01-24",
      endsAt: "2026-02-01"
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid challenge");
      return;
    }
    setStage("success");
  }

  if (stage === "success") {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-10 text-center">
          <CheckCircle2 className="mx-auto h-20 w-20 text-emerald-400" />
          <h1 className="mt-6 text-4xl font-black">Challenge Published</h1>
          <p className="mt-3 text-slate-300">Your challenge is now ready for participants, voting, and media submissions.</p>
          <div className="mt-8 flex justify-center gap-3">
            <LinkButton href="/challenges">View Challenges</LinkButton>
            <LinkButton href="/my-challenges" variant="secondary">My Challenges</LinkButton>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Card className="mx-auto max-w-[960px] border-yellow-500/50 p-6 gold-glow md:p-10">
        <PageTitle title="Create New Challenge" subtitle="Build a public or private challenge through a guided setup." />
        <div className="mt-8 grid gap-2 md:grid-cols-6">
          {steps.map((label, index) => <button key={label} onClick={() => setStep(index)} className={`rounded-[8px] p-3 text-xs font-black ${step === index ? "bg-[var(--gold)] text-black" : "bg-[#1b1b1b] text-slate-300"}`}>{index + 1}. {label}</button>)}
        </div>

        <div className="mt-8 min-h-[470px]">
          {step === 0 ? <StepBasic form={form} update={update} /> : null}
          {step === 1 ? <StepFormat form={form} update={update} toggleSubmission={toggleSubmission} /> : null}
          {step === 2 ? <StepDates /> : null}
          {step === 3 ? <StepPrize form={form} update={update} braggingRights={braggingRights} normalized={normalized} setAllocations={setAllocations} /> : null}
          {step === 4 ? <StepMedia /> : null}
          {step === 5 ? <StepPreview form={form} /> : null}
        </div>

        {error ? <p className="mt-5 rounded-[8px] bg-red-950/50 p-4 text-red-200">{error}</p> : null}
        {draftSaved ? <p className="mt-5 rounded-[8px] bg-emerald-950/40 p-4 text-emerald-200">Draft saved locally.</p> : null}

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-6">
          <Button variant="secondary" onClick={() => setDraftSaved(true)}><Save size={17} /> Save Draft</Button>
          <div className="flex gap-3">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(value - 1, 0))}>Back</Button>
            {step < steps.length - 1 ? <Button onClick={next}>Next</Button> : <Button onClick={publish}>{form.type === "Private / Exclusive" ? "Publish Privately" : "Publish Publicly"}</Button>}
          </div>
        </div>
      </Card>
    </AppShell>
  );
}

function StepBasic({ form, update }: { form: any; update: any }) {
  const categories = form.type === "Private / Exclusive" ? ["Invite-only", "Premium Creator", "Sponsor-Only", "VIP Community", "Other"] : ["Fitness", "Creative", "Photography", "Food", "Gaming", "Other"];
  return <section><h2 className="text-2xl font-black">Step 1: Basic Details</h2><div className="mt-5 grid gap-3 rounded-[8px] bg-black p-2 md:grid-cols-2"><Button onClick={() => update("type", "Public Challenge")} variant={form.type === "Public Challenge" ? "primary" : "ghost"}>Public Challenge</Button><Button onClick={() => update("type", "Private / Exclusive")} variant={form.type === "Private / Exclusive" ? "primary" : "ghost"}>Private / Exclusive</Button></div><div className="mt-6 grid gap-6 md:grid-cols-[1fr_260px]"><Field label="Challenge Title"><input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field><Field label={form.type === "Private / Exclusive" ? "Private / Exclusive Category" : "Public Category"}><select className={inputClass} value={form.category} onChange={(event) => update("category", event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field></div>{form.category === "Other" ? <div className="mt-5"><Field label="Custom Category"><input className={inputClass} value={form.customCategory} onChange={(event) => update("customCategory", event.target.value)} /></Field></div> : null}<div className="mt-5"><Field label="Description"><textarea className={textareaClass} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field></div>{form.type === "Private / Exclusive" ? <Card className="mt-5 grid gap-4 p-5 md:grid-cols-2"><Field label="Invite Code Generation"><input className={inputClass} defaultValue="VAULT2026" /></Field><Field label="Approved Participant List"><textarea className={textareaClass} placeholder="Add approved emails, one per line" /></Field><label className="font-bold"><input className="mr-3" type="checkbox" defaultChecked /> Require access request approval</label><label className="font-bold"><input className="mr-3" type="checkbox" defaultChecked /> Invite-only access</label></Card> : null}</section>;
}

function StepFormat({ form, update, toggleSubmission }: { form: any; update: any; toggleSubmission: (type: string) => void }) {
  return <section><h2 className="text-2xl font-black">Step 2: Format & Rules</h2><div className="mt-6 grid gap-6 md:grid-cols-2"><Field label="Competition Format"><select className={inputClass} value={form.competitionFormat} onChange={(event) => update("competitionFormat", event.target.value)}><option>1 vs 1 Battle</option><option>Group Challenge</option><option>Entry Competition</option></select></Field><Field label="Best Of"><select className={inputClass} value={form.bestOf} onChange={(event) => update("bestOf", event.target.value)}><option>1 Rounder</option><option>Best of 3</option><option>Best of 5</option></select></Field></div><div className="mt-6"><div className="mb-2 font-bold">Submission Type</div><div className="flex flex-wrap gap-4">{["image", "video"].map((type) => <label key={type} className="flex items-center gap-3 rounded-[8px] border border-white/10 bg-[#181818] px-5 py-4 font-bold"><input type="checkbox" checked={form.submissionTypes.includes(type)} onChange={() => toggleSubmission(type)} /> {type === "image" ? "Image uploads" : "Video uploads"}</label>)}</div></div><div className="mt-6 grid gap-4 md:grid-cols-2">{["Time limit uploads", "Standard platform rules", "Voting policy acknowledgement", "Editable rules enabled"].map((rule) => <label key={rule} className="font-bold"><input className="mr-3" type="checkbox" defaultChecked /> {rule}</label>)}</div></section>;
}

function StepDates() {
  return <section><h2 className="text-2xl font-black">Step 3: Dates & Eligibility</h2><div className="mt-6 grid gap-5 md:grid-cols-3">{["Registration Deadline", "Start Date", "End Date"].map((label) => <Field key={label} label={label}><div className="flex gap-2"><input className={inputClass} type="date" /><Button variant="ghost">OK</Button></div></Field>)}</div><div className="mt-6 grid gap-5 md:grid-cols-2"><label className="font-bold"><input className="mr-3" type="checkbox" /> Age restriction</label><Field label="Minimum Age"><input className={inputClass} type="number" placeholder="13" /></Field><Field label="Location Restrictions"><select className={inputClass}><option>No restriction</option><option>United States only</option><option>Nigeria only</option><option>Invite list only</option></select></Field></div></section>;
}

function StepPrize({ form, update, braggingRights, normalized, setAllocations }: { form: any; update: any; braggingRights: boolean; normalized: any[]; setAllocations: any }) {
  return <section><h2 className="text-2xl font-black">Step 4: Prize & Monetization</h2><div className="mt-6 grid gap-6 md:grid-cols-2"><Field label="Prize Type"><select className={inputClass} value={form.prizeType} onChange={(event) => update("prizeType", event.target.value)}><option>Cash Jackpot</option><option>DoroCoin</option><option>Product Prize</option><option>Bragging Rights (Leaderboard Ranking)</option></select></Field>{!braggingRights ? <Field label="Entry Fee ($)"><input className={inputClass} type="number" min="0.01" value={form.entryFee} onChange={(event) => update("entryFee", event.target.value)} /></Field> : <Card className="p-4 text-slate-300">Payout and entry fee fields are hidden for Bragging Rights competitions.</Card>}</div><div className="mt-6 rounded-[8px] border border-blue-500/30 bg-blue-950/20 p-5"><label className="font-bold"><input className="mr-3" type="checkbox" /> Enable Sponsorship Collaboration</label><div className="mt-5 grid gap-4 md:grid-cols-3">{normalized.map((bucket, index) => <label key={bucket.bucket} className="rounded-[8px] bg-black/40 p-4 text-sm"><input className="mr-2" type="checkbox" checked={bucket.enabled} onChange={() => setAllocations((items: any[]) => items.map((item: any, i: number) => i === index ? { ...item, enabled: !item.enabled } : item))} /> {bucket.bucket}: <b>{bucket.percent}%</b></label>)}</div></div></section>;
}

function StepMedia() {
  return <section><h2 className="text-2xl font-black">Step 5: Media</h2><div className="mt-6 grid gap-6 md:grid-cols-2"><Field label="Promo Flyer Image Upload"><input className={inputClass} type="file" accept="image/*" /></Field><Field label="Trailer Video Upload"><input className={inputClass} type="file" accept="video/*" /></Field></div><Card className="mt-6 p-6 text-slate-300">Selected media will preview here before publishing. Local mock uploads are ready for Firebase Storage integration later.</Card></section>;
}

function StepPreview({ form }: { form: any }) {
  return <section><h2 className="text-2xl font-black">Step 6: Preview & Publish</h2><div className="mt-6 grid gap-4 md:grid-cols-2">{Object.entries({ Title: form.title, Type: form.type, Category: form.category === "Other" ? form.customCategory : form.category, Format: form.competitionFormat, "Best Of": form.bestOf, "Prize Type": form.prizeType, "Submission Types": form.submissionTypes.join(", ") }).map(([label, value]) => <Card key={label} className="p-4"><div className="text-sm font-bold text-slate-400">{label}</div><div className="mt-1 text-lg font-black">{String(value)}</div></Card>)}</div></section>;
}
