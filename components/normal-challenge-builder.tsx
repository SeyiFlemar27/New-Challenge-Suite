"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ApiErrorPanel } from "@/components/api-error-panel";
import type { MediaUploadStage } from "@/components/media-upload-field";
import { NormalChallengeBuilderStep } from "@/components/normal-challenge-builder-steps";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { createChallengeDraft, fetchChallengeDraft, publishChallengeDraft, updateChallengeDraft } from "@/lib/api/services";
import { CHALLENGE_TYPE_OPTIONS, canCreateBuilderType, inferLegacyMaxUnlockedStep, normalizeBuilderPlan, normalizeNormalChallengeStep } from "@/lib/challenge-builder-foundation";
import { firebaseClientConfigStatus } from "@/lib/firebase/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { freshNormalChallengeForm, normalChallengeFormFromRecord, normalChallengePayload, type NormalChallengeForm } from "@/lib/normal-challenge-builder-model";
import { NORMAL_CHALLENGE_MAX_STEP, NORMAL_CHALLENGE_STEPS } from "@/lib/normal-challenge-config";
import { getNormalChallengeReadiness, normalChallengeSubmitIssue } from "@/lib/normal-challenge-readiness";

function builderStatus(record: Record<string, unknown>) {
  const value = String(record.managementState ?? record.status ?? record.lifecycleStatus ?? "draft").toLowerCase();
  return value === "changes_requested" ? "requires_changes" : value;
}

export function NormalChallengeBuilder({ draftId }: { draftId?: string }) {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const plan = normalizeBuilderPlan(user?.planId);
  const [chosen, setChosen] = useState(Boolean(draftId));
  const [form, setForm] = useState<NormalChallengeForm>(freshNormalChallengeForm);
  const [id, setId] = useState(draftId || "");
  const [step, setStep] = useState(draftId ? 1 : 0);
  const [unlocked, setUnlocked] = useState(draftId ? 1 : 0);
  const [status, setStatus] = useState("draft");
  const [reviewReason, setReviewReason] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftId));
  const [saving, setSaving] = useState(false);
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const [draftLimitReached, setDraftLimitReached] = useState(false);
  const [error, setError] = useState("");
  const [media, setMedia] = useState<Record<string, MediaUploadStage>>({});
  const hydrated = useRef(false);
  const version = useRef(0);
  const mediaDisabled = firebaseClientConfigStatus.mediaUploadsDisabled;
  const payload = useMemo(() => normalChallengePayload(form, id), [form, id]);
  const readiness = useMemo(() => getNormalChallengeReadiness(payload), [payload]);
  const uploadBusy = Object.values(media).some((value) => ["preparing", "uploading", "processing"].includes(value)) || (step === 6 && readiness.issues.some((item) => item.step < 6));
  const editable = status === "draft" || status === "requires_changes";

  useEffect(() => {
    const firstInvalid = readiness.steps.findIndex((item) => !item.complete);
    if (firstInvalid >= 0) setUnlocked((current) => Math.min(current, firstInvalid));
  }, [readiness]);

  useEffect(() => {
    if (!draftId || hydrated.current) return;
    hydrated.current = true;
    void fetchChallengeDraft(draftId).then((result) => {
      if (!result.ok || !result.data?.challenge) {
        setError(result.message || "Draft could not be loaded.");
        setLoadingDraft(false);
        return;
      }
      const challenge = result.data.challenge;
      const loadedReadiness = getNormalChallengeReadiness(challenge);
      const restoredStep = normalizeNormalChallengeStep(challenge.builderCurrentStep ?? challenge.creationStep ?? 1, loadedReadiness);
      const loadedStatus = builderStatus(challenge);
      setForm(normalChallengeFormFromRecord(challenge));
      setStatus(loadedStatus);
      setReviewReason(String(challenge.reviewReason ?? challenge.changesRequestedReason ?? ""));
      if (loadedStatus === "pending_review") { setError(""); setAutosaveFailed(false); }
      setUnlocked(Math.max(inferLegacyMaxUnlockedStep(challenge), restoredStep));
      setStep(restoredStep);
      setLoadingDraft(false);
    });
  }, [draftId]);

  useEffect(() => {
    if (!id || loadingDraft || saving || !editable) return;
    const currentVersion = ++version.current;
    const timer = window.setTimeout(() => {
      void updateChallengeDraft(id, { ...payload, builderCurrentStep: step }).then((result) => {
        if (currentVersion !== version.current) return;
        setAutosaveFailed(!result.ok);
        if (!result.ok) setError("We couldn't save your changes. Check your connection and try again.");
      }).catch(() => {
        if (currentVersion !== version.current) return;
        setAutosaveFailed(true);
        setError("We couldn't save your changes. Check your connection and try again.");
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [editable, id, loadingDraft, payload, saving, step]);

  function update<K extends keyof NormalChallengeForm>(key: K, value: NormalChallengeForm[K]) { setForm((current) => ({ ...current, [key]: value })); setError(""); }
  function focusIssue(target = step) { const issue = readiness.issues.find((item) => item.step === target); if (issue) document.querySelector<HTMLElement>(`[data-field="${issue.field}"] input,[data-field="${issue.field}"] textarea,[data-field="${issue.field}"] select,[data-field="${issue.field}"] button`)?.focus(); return issue; }

  async function persist(next = step) {
    if (!id || !editable) return false;
    const result = await updateChallengeDraft(id, { ...payload, builderCurrentStep: next, maxUnlockedStep: Math.max(unlocked, next) });
    if (!result.ok) {
      if (result.code === "CHALLENGE_NOT_EDITABLE") {
        const refreshed = await fetchChallengeDraft(id);
        if (refreshed.ok && refreshed.data?.challenge && builderStatus(refreshed.data.challenge) === "pending_review") {
          version.current += 1; setStatus("pending_review"); setAutosaveFailed(false); setError(""); return false;
        }
      }
      setAutosaveFailed(true); setError("We couldn't save your changes. Check your connection and try again."); return false;
    }
    setAutosaveFailed(false);
    return true;
  }

  async function next() {
    setError(""); setDraftLimitReached(false);
    if (step === 6) {
      const earlierIssue = readiness.issues.find((item) => item.step < 6);
      if (earlierIssue) { setError(earlierIssue.message); setStep(earlierIssue.step); window.setTimeout(() => focusIssue(earlierIssue.step), 0); return; }
    }
    const issue = focusIssue();
    if (issue) { setError(issue.message); return; }
    if (uploadBusy) { setError("Your media is still processing. Wait for the upload to finish."); return; }
    setSaving(true);
    if (!id) {
      const result = await createChallengeDraft(payload);
      setSaving(false);
      if (!result.ok || !result.data?.challenge?.id) { setDraftLimitReached(result.code === "DRAFT_LIMIT_REACHED"); setError(result.message || "Challenge draft could not be created."); return; }
      const newId = result.data.challenge.id;
      setId(newId); setStep(1); setUnlocked(1); router.replace(`/challenges/create/${newId}`); return;
    }
    const nextStep = Math.min(NORMAL_CHALLENGE_MAX_STEP, step + 1);
    const saved = await persist(nextStep);
    setSaving(false);
    if (saved) { setUnlocked((current) => Math.max(current, nextStep)); setStep(nextStep); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }

  async function submit() {
    if (!readiness.ready) {
      const target = readiness.nextRequiredStep;
      setError(readiness.issues[0]?.message || "Complete the required details before submitting.");
      if (target < NORMAL_CHALLENGE_MAX_STEP) { setStep(target); window.setTimeout(() => focusIssue(target), 0); }
      return;
    }
    if (!id || autosaveFailed || uploadBusy) { setError(autosaveFailed ? "We couldn't save your changes. Check your connection and try again." : "Wait for media uploads to finish."); return; }
    version.current += 1; setError(""); setSaving(true);
    if (!await persist(NORMAL_CHALLENGE_MAX_STEP)) { setSaving(false); return; }
    const result = await publishChallengeDraft(id, payload);
    if (!result.ok) {
      setSaving(false);
      const issue = normalChallengeSubmitIssue(result.details);
      setError(issue?.message || (result.code === "VALIDATION_ERROR" ? "Some required details need attention." : result.message || "Challenge could not be submitted for review."));
      if (issue?.step !== null && issue?.step !== undefined) { setStep(issue.step); window.setTimeout(() => focusIssue(issue.step ?? undefined), 0); }
      return;
    }
    version.current += 1; setAutosaveFailed(false); setError(""); setStatus(builderStatus(result.data?.challenge ?? {}) || "pending_review"); setSaving(false);
  }

  if (loading || loadingDraft) return <AppShell><main className="mx-auto max-w-6xl p-8" aria-busy="true" /></AppShell>;
  if (!user) return <AppShell><Card className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-black">Sign in to create a challenge</h1><LinkButton href="/auth/login?next=%2Fchallenges%2Fcreate" className="mt-5">Sign In</LinkButton></Card></AppShell>;
  if (draftLimitReached) return <DraftLimit onBack={() => { setDraftLimitReached(false); setError(""); setChosen(false); }} />;
  if (status === "pending_review" && id) return <SubmittedChallengeState challengeId={id} />;

  return <AppShell><main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6"><PageTitle title="Create Challenge" subtitle={id ? "Build your Normal Challenge one step at a time." : "Choose a challenge type, then complete Overview to create your draft."} />{!chosen ? <TypeCards plan={plan} choose={() => setChosen(true)} /> : <div className="mt-8 grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)_250px]"><nav className="hidden lg:block" aria-label="Challenge builder steps"><ol className="space-y-2">{NORMAL_CHALLENGE_STEPS.map((label, index) => { const locked = index > unlocked; return <li key={label}><button type="button" disabled={locked} aria-current={step === index ? "step" : undefined} onClick={() => !locked && setStep(index)} className={`flex min-h-12 w-full items-center gap-3 rounded-[8px] border px-3 text-left text-sm font-bold ${step === index ? "border-[var(--gold)] bg-yellow-50" : "border-black/10 bg-white"}`}><span className="grid size-7 shrink-0 place-items-center rounded-full border">{locked ? <LockKeyhole size={14} /> : index < step || readiness.steps[index]?.complete ? <Check size={14} /> : index + 1}</span>{label}</button></li>; })}</ol></nav><section className="min-w-0"><div className="mb-4 lg:hidden"><p className="text-sm font-black">Step {step + 1} of 8</p><p className="text-sm text-slate-600">{NORMAL_CHALLENGE_STEPS[step]}</p></div>{status === "requires_changes" && reviewReason ? <Card className="mb-4 border-amber-300 bg-amber-50 p-4"><p className="font-black">Changes requested</p><p className="mt-1 text-sm">{reviewReason}</p></Card> : null}<Card className="p-5 sm:p-7"><NormalChallengeBuilderStep step={step} form={form} update={update} userId={user.uid} mediaDisabled={mediaDisabled} track={(key) => (value) => setMedia((current) => ({ ...current, [key]: value }))} readiness={readiness} edit={setStep} plan={plan} />{error ? <div className="mt-6"><ApiErrorPanel title="Check this step" message={error} onRetry={autosaveFailed ? () => void persist() : () => setError("")} /></div> : null}<div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5"><Button variant="secondary" disabled={saving} onClick={() => step === 0 && !id ? setChosen(false) : setStep((current) => Math.max(0, current - 1))}>Back</Button><div className="flex flex-wrap gap-2">{id ? <Button variant="ghost" disabled={saving} onClick={() => router.push("/my-challenges")}>Finish Later</Button> : null}{step === NORMAL_CHALLENGE_MAX_STEP ? <Button disabled={saving || autosaveFailed || !readiness.ready} onClick={submit}>{saving ? "Submitting..." : status === "requires_changes" ? "Resubmit for Review" : "Submit for Review"}</Button> : <Button disabled={saving || autosaveFailed || uploadBusy} onClick={next}>{saving ? "Continuing..." : "Continue"}</Button>}</div></div></Card></section><aside><Card className="p-5"><p className="text-xs font-black uppercase text-[var(--gold)]">Builder guide</p><h2 className="mt-2 font-black">{NORMAL_CHALLENGE_STEPS[step]}</h2><p className="mt-3 text-sm leading-6 text-slate-600">Complete this step to unlock the next. Earlier steps remain editable and dependent checks update automatically.</p>{autosaveFailed ? <p className="mt-4 text-sm font-bold text-red-700">Changes are not saved. Continue is paused until retry succeeds.</p> : null}</Card></aside></div>}</main></AppShell>;
}

function SubmittedChallengeState({ challengeId }: { challengeId: string }) { return <AppShell><main className="mx-auto max-w-2xl px-4 py-10 sm:px-6"><Card className="p-6 sm:p-8"><div className="grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-800"><Check size={24} /></div><h1 className="mt-5 text-2xl font-black">Challenge submitted for review</h1><p role="status" className="mt-3 text-sm font-bold text-emerald-900">Challenge submitted for review. We'll notify you when it's approved.</p><p className="mt-3 text-sm leading-6 text-slate-600">Your challenge is being reviewed before it goes public. You can manage it from your dashboard while it is under review.</p><p className="mt-2 text-sm leading-6 text-slate-600">You can edit this challenge if an admin requests changes.</p><div className="mt-6 flex flex-wrap gap-3"><LinkButton href={`/challenges/${challengeId}`}>View Challenge</LinkButton><LinkButton href="/dashboard/host" variant="secondary">Back to Dashboard</LinkButton><LinkButton href="/contact" variant="ghost">Contact Support</LinkButton></div></Card></main></AppShell>; }
function DraftLimit({ onBack }: { onBack: () => void }) { return <AppShell><main className="mx-auto max-w-xl px-4 py-10"><Card className="p-6 sm:p-8"><h1 className="text-2xl font-black">You've reached your draft limit.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Continue an existing draft, delete one you no longer need, or upgrade your plan.</p><div className="mt-6 flex flex-wrap gap-3"><LinkButton href="/my-challenges">View Drafts</LinkButton><LinkButton href="/subscriptions" variant="secondary">Upgrade Plan</LinkButton><Button variant="ghost" onClick={onBack}>Back</Button></div></Card></main></AppShell>; }
function TypeCards({ plan, choose }: { plan: string; choose: () => void }) { const routes = { private: "/creator/private-challenges/create", tournament: "/tournaments/create", live_event: "/host/live/create" } as const; return <section className="mt-8"><h2 className="text-xl font-black">Choose challenge type</h2><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{CHALLENGE_TYPE_OPTIONS.map((option) => { const allowed = canCreateBuilderType(plan, option.id); return <Card key={option.id} className="flex min-h-52 flex-col p-5"><div className="flex justify-between gap-3"><h3 className="text-lg font-black">{option.title}</h3>{allowed ? null : <LockKeyhole aria-label="Locked" size={18} />}</div><p className="mt-3 text-sm leading-6 text-slate-600">{option.requirement}</p><div className="mt-auto pt-5">{option.id === "normal" ? <Button className="w-full" onClick={choose}>Choose Normal Challenge</Button> : allowed ? <LinkButton className="w-full" href={routes[option.id]}>Choose {option.title}</LinkButton> : <LinkButton className="w-full" variant="secondary" href="/subscriptions">View required plan</LinkButton>}</div></Card>; })}</div></section>; }
