"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Circle, LockKeyhole, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ApiErrorPanel } from "@/components/api-error-panel";
import type { MediaUploadStage } from "@/components/media-upload-field";
import { NormalChallengeBuilderStep } from "@/components/normal-challenge-builder-steps";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { createChallengeDraft, fetchChallengeDraft, publishChallengeDraft, updateChallengeDraft } from "@/lib/api/services";
import {
  CHALLENGE_TYPE_OPTIONS,
  NORMAL_CHALLENGE_STEP_DEFINITIONS,
  canCreateBuilderType,
  inferLegacyMaxUnlockedStep,
  normalizeBuilderPlan,
  normalizeNormalChallengeStep
} from "@/lib/challenge-builder-foundation";
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
  const [attemptedSteps, setAttemptedSteps] = useState<Set<number>>(new Set());
  const [mobileGuideOpen, setMobileGuideOpen] = useState(false);
  const hydrated = useRef(false);
  const version = useRef(0);
  const mediaDisabled = firebaseClientConfigStatus.mediaUploadsDisabled;
  const payload = useMemo(() => normalChallengePayload(form, id), [form, id]);
  const readiness = useMemo(() => getNormalChallengeReadiness(payload), [payload]);
  const stepDefinition = NORMAL_CHALLENGE_STEP_DEFINITIONS[step] ?? NORMAL_CHALLENGE_STEP_DEFINITIONS[0];
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
      if (loadedStatus === "pending_review") {
        setError("");
        setAutosaveFailed(false);
      }
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

  function update<K extends keyof NormalChallengeForm>(key: K, value: NormalChallengeForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function focusIssue(target = step) {
    const issue = readiness.issues.find((item) => item.step === target);
    if (issue) {
      document.querySelector<HTMLElement>(`[data-field="${issue.field}"] input,[data-field="${issue.field}"] textarea,[data-field="${issue.field}"] select,[data-field="${issue.field}"] button`)?.focus();
    }
    return issue;
  }

  async function persist(next = step) {
    if (!id || !editable) return false;
    const result = await updateChallengeDraft(id, { ...payload, builderCurrentStep: next, maxUnlockedStep: Math.max(unlocked, next) });
    if (!result.ok) {
      if (result.code === "CHALLENGE_NOT_EDITABLE") {
        const refreshed = await fetchChallengeDraft(id);
        if (refreshed.ok && refreshed.data?.challenge && builderStatus(refreshed.data.challenge) === "pending_review") {
          version.current += 1;
          setStatus("pending_review");
          setAutosaveFailed(false);
          setError("");
          return false;
        }
      }
      setAutosaveFailed(true);
      setError("We couldn't save your changes. Check your connection and try again.");
      return false;
    }
    setAutosaveFailed(false);
    return true;
  }

  async function next() {
    setAttemptedSteps((current) => new Set(current).add(step));
    setError("");
    setDraftLimitReached(false);
    if (step === 6) {
      const earlierIssue = readiness.issues.find((item) => item.step < 6);
      if (earlierIssue) {
        setError(earlierIssue.message);
        setStep(earlierIssue.step);
        setAttemptedSteps((current) => new Set(current).add(earlierIssue.step));
        window.setTimeout(() => focusIssue(earlierIssue.step), 0);
        return;
      }
    }
    const issue = focusIssue();
    if (issue) {
      setError(issue.message);
      return;
    }
    if (uploadBusy) {
      setError("Your media is still processing. Wait for the upload to finish.");
      return;
    }
    setSaving(true);
    if (!id) {
      const result = await createChallengeDraft(payload);
      setSaving(false);
      if (!result.ok || !result.data?.challenge?.id) {
        setDraftLimitReached(result.code === "DRAFT_LIMIT_REACHED");
        setError(result.message || "Challenge draft could not be created.");
        return;
      }
      const newId = result.data.challenge.id;
      setId(newId);
      setStep(1);
      setUnlocked(1);
      router.replace(`/challenges/create/${newId}`);
      return;
    }
    const nextStep = Math.min(NORMAL_CHALLENGE_MAX_STEP, step + 1);
    const saved = await persist(nextStep);
    setSaving(false);
    if (saved) {
      setUnlocked((current) => Math.max(current, nextStep));
      setStep(nextStep);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function submit() {
    setAttemptedSteps(new Set(NORMAL_CHALLENGE_STEPS.map((_, index) => index)));
    if (!readiness.ready) {
      const target = readiness.nextRequiredStep;
      setError(readiness.issues[0]?.message || "Complete the required details before submitting.");
      if (target < NORMAL_CHALLENGE_MAX_STEP) {
        setStep(target);
        window.setTimeout(() => focusIssue(target), 0);
      }
      return;
    }
    if (!id || autosaveFailed || uploadBusy) {
      setError(autosaveFailed ? "We couldn't save your changes. Check your connection and try again." : "Wait for media uploads to finish.");
      return;
    }
    version.current += 1;
    setError("");
    setSaving(true);
    if (!await persist(NORMAL_CHALLENGE_MAX_STEP)) {
      setSaving(false);
      return;
    }
    const result = await publishChallengeDraft(id, payload);
    if (!result.ok) {
      setSaving(false);
      const issue = normalChallengeSubmitIssue(result.details);
      setError(issue?.message || (result.code === "VALIDATION_ERROR" ? "Some required details need attention." : result.message || "Challenge could not be submitted for review."));
      if (issue?.step !== null && issue?.step !== undefined) {
        setStep(issue.step);
        window.setTimeout(() => focusIssue(issue.step ?? undefined), 0);
      }
      return;
    }
    version.current += 1;
    setAutosaveFailed(false);
    setError("");
    setStatus(builderStatus(result.data?.challenge ?? {}) || "pending_review");
    setSaving(false);
  }

  if (loading || loadingDraft) return <AppShell><main className="mx-auto max-w-7xl p-8" aria-busy="true" /></AppShell>;
  if (!user) return <AppShell><Card className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-black">Sign in to create a challenge</h1><LinkButton href="/auth/login?next=%2Fchallenges%2Fcreate" className="mt-5">Sign In</LinkButton></Card></AppShell>;
  if (draftLimitReached) return <DraftLimit onBack={() => { setDraftLimitReached(false); setError(""); setChosen(false); }} />;
  if (status === "pending_review" && id) return <SubmittedChallengeState challengeId={id} />;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1560px] px-4 py-7 sm:px-6 lg:px-8">
        <PageTitle title="Create Challenge" subtitle={id ? "Build your Normal Challenge one step at a time." : "Choose a challenge type, then complete Overview to create your draft."} />
        {!chosen ? <TypeCards plan={plan} choose={() => setChosen(true)} /> : (
          <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,760px)_280px] 2xl:grid-cols-[290px_minmax(0,840px)_300px]">
            <BuilderStepRail step={step} unlocked={unlocked} readiness={readiness.steps} onSelect={setStep} />
            <section className="min-w-0">
              <div className="mb-5 lg:hidden">
                <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-500" htmlFor="builder-mobile-step">Step {step + 1} of 8</label>
                <select id="builder-mobile-step" value={step} onChange={(event) => setStep(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-[8px] border border-black/10 bg-white px-3 font-bold text-slate-950">
                  {NORMAL_CHALLENGE_STEPS.map((label, index) => <option key={label} value={index} disabled={index > unlocked}>{index + 1}. {label}</option>)}
                </select>
              </div>
              {status === "requires_changes" && reviewReason ? <div className="mb-5 rounded-[8px] border border-amber-200 bg-amber-50 p-4"><p className="font-black text-amber-950">Changes requested</p><p className="mt-1 text-sm leading-6 text-amber-900">{reviewReason}</p></div> : null}
              <div className="overflow-hidden rounded-[12px] border border-black/[0.08] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
                <div className="p-5 sm:p-8 lg:p-10">
                  <NormalChallengeBuilderStep step={step} form={form} update={update} userId={user.uid} mediaDisabled={mediaDisabled} track={(key) => (value) => setMedia((current) => ({ ...current, [key]: value }))} readiness={readiness} edit={setStep} plan={plan} showErrors={attemptedSteps.has(step)} draftId={id} />
                  {error ? <div className="mt-7"><ApiErrorPanel title="Check this step" message={error} onRetry={autosaveFailed ? () => void persist() : () => setError("")} /></div> : null}
                </div>
                <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.08] bg-white/95 px-5 py-4 backdrop-blur sm:px-8 lg:px-10">
                  <Button variant="secondary" disabled={saving} onClick={() => step === 0 && !id ? setChosen(false) : setStep((current) => Math.max(0, current - 1))}>Back</Button>
                  <div className="flex flex-wrap justify-end gap-2">
                    {id ? <Button variant="ghost" disabled={saving} onClick={() => router.push("/my-challenges")}>Finish Later</Button> : null}
                    {step === NORMAL_CHALLENGE_MAX_STEP ? <Button disabled={saving || autosaveFailed || !readiness.ready} onClick={submit}>{saving ? "Submitting..." : status === "requires_changes" ? "Resubmit for Review" : "Submit for Review"}</Button> : <Button disabled={saving || autosaveFailed || uploadBusy} onClick={next}>{saving ? "Continuing..." : "Continue"}</Button>}
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setMobileGuideOpen(true)} className="mt-4 flex min-h-11 w-full items-center justify-between rounded-[8px] border border-black/10 bg-white px-4 text-sm font-black text-slate-950 xl:hidden">
                Builder Guide <ChevronDown size={18} />
              </button>
            </section>
            <BuilderGuide definition={stepDefinition} autosaveFailed={autosaveFailed} />
          </div>
        )}
      </main>
      {mobileGuideOpen ? <MobileGuide definition={stepDefinition} close={() => setMobileGuideOpen(false)} /> : null}
    </AppShell>
  );
}

function BuilderStepRail({ step, unlocked, readiness, onSelect }: { step: number; unlocked: number; readiness: Array<{ complete: boolean }>; onSelect: (step: number) => void }) {
  return <nav className="hidden lg:block" aria-label="Challenge builder steps"><ol className="sticky top-24 space-y-1">{NORMAL_CHALLENGE_STEP_DEFINITIONS.map((definition, index) => { const locked = index > unlocked; const complete = index < step || readiness[index]?.complete; return <li key={definition.key}><button type="button" disabled={locked} aria-current={step === index ? "step" : undefined} onClick={() => !locked && onSelect(index)} className={`group flex min-h-12 w-full items-center gap-3 rounded-[8px] px-3 text-left text-sm font-bold transition ${step === index ? "bg-amber-50 text-slate-950 shadow-sm" : locked ? "cursor-not-allowed text-slate-400" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}><span className={`grid size-7 shrink-0 place-items-center rounded-full border ${step === index ? "border-[var(--gold)] bg-[var(--gold)] text-black" : complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white"}`}>{locked ? <LockKeyhole size={13} /> : complete ? <Check size={14} /> : <span className="text-xs">{index + 1}</span>}</span><span className="leading-5">{definition.navLabel}</span></button></li>; })}</ol></nav>;
}

function BuilderGuide({ definition, autosaveFailed }: { definition: (typeof NORMAL_CHALLENGE_STEP_DEFINITIONS)[number]; autosaveFailed: boolean }) {
  return <aside className="hidden xl:block"><div className="sticky top-24 rounded-[12px] border border-black/[0.08] bg-white p-6 shadow-[0_14px_44px_rgba(15,23,42,0.06)]"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-700"><Circle size={8} fill="currentColor" /> Builder Guide</div><h2 className="mt-4 text-lg font-black text-slate-950">{definition.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{definition.description}</p><ul className="mt-5 space-y-4">{definition.guide.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600"><Check className="mt-1 shrink-0 text-amber-700" size={16} /><span>{item}</span></li>)}</ul>{autosaveFailed ? <p className="mt-5 rounded-[8px] bg-red-50 p-3 text-sm font-bold text-red-800">Changes are not saved. Continue is paused until retry succeeds.</p> : null}</div></aside>;
}

function MobileGuide({ definition, close }: { definition: (typeof NORMAL_CHALLENGE_STEP_DEFINITIONS)[number]; close: () => void }) {
  return <div className="fixed inset-0 z-[100] bg-black/45 xl:hidden" role="dialog" aria-modal="true" aria-label="Builder Guide" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[16px] bg-white p-6 text-slate-950 shadow-2xl"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Builder Guide</p><button type="button" onClick={close} className="grid size-10 place-items-center rounded-full bg-slate-100" aria-label="Close Builder Guide"><X size={18} /></button></div><h2 className="mt-4 text-2xl font-black">{definition.title}</h2><p className="mt-2 leading-7 text-slate-600">{definition.description}</p><ul className="mt-6 space-y-4">{definition.guide.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600"><Check className="mt-1 shrink-0 text-amber-700" size={17} /><span>{item}</span></li>)}</ul></div></div>;
}

function SubmittedChallengeState({ challengeId }: { challengeId: string }) {
  return <AppShell><main className="mx-auto max-w-2xl px-4 py-10 sm:px-6"><Card className="p-6 sm:p-8"><div className="grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-800"><Check size={24} /></div><h1 className="mt-5 text-2xl font-black">Challenge Submitted</h1><p role="status" className="mt-3 text-sm font-bold text-emerald-900">Your challenge has been sent for review.</p><p className="mt-3 text-sm leading-6 text-slate-600">Status: Under Review. Editing is unavailable until an admin requests changes.</p><div className="mt-6 flex flex-wrap gap-3"><LinkButton href={`/challenges/${challengeId}`}>View Challenge</LinkButton><LinkButton href="/dashboard/host" variant="secondary">Back to Dashboard</LinkButton><LinkButton href="/contact" variant="ghost">Contact Support</LinkButton></div></Card></main></AppShell>;
}

function DraftLimit({ onBack }: { onBack: () => void }) {
  return <AppShell><main className="mx-auto max-w-xl px-4 py-10"><Card className="p-6 sm:p-8"><h1 className="text-2xl font-black">You've reached your draft limit.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Continue an existing draft, delete one you no longer need, or upgrade your plan.</p><div className="mt-6 flex flex-wrap gap-3"><LinkButton href="/my-challenges">View Drafts</LinkButton><LinkButton href="/subscriptions" variant="secondary">Upgrade Plan</LinkButton><Button variant="ghost" onClick={onBack}>Back</Button></div></Card></main></AppShell>;
}

function TypeCards({ plan, choose }: { plan: string; choose: () => void }) {
  const routes = { private: "/creator/private-challenges/create", tournament: "/tournaments/create", live_event: "/host/live/create" } as const;
  return <section className="mt-8"><h2 className="text-xl font-black">Choose challenge type</h2><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{CHALLENGE_TYPE_OPTIONS.map((option) => { const allowed = canCreateBuilderType(plan, option.id); return <Card key={option.id} className="flex min-h-52 flex-col p-5"><div className="flex justify-between gap-3"><h3 className="text-lg font-black">{option.title}</h3>{allowed ? null : <LockKeyhole aria-label="Locked" size={18} />}</div><p className="mt-3 text-sm leading-6 text-slate-600">{option.requirement}</p><div className="mt-auto pt-5">{option.id === "normal" ? <Button className="w-full" onClick={choose}>Choose Normal Challenge</Button> : allowed ? <LinkButton className="w-full" href={routes[option.id]}>Choose {option.title}</LinkButton> : <LinkButton className="w-full" variant="secondary" href="/subscriptions">View required plan</LinkButton>}</div></Card>; })}</div></section>;
}
