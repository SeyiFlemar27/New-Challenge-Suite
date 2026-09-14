"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ApiErrorPanel } from "@/components/api-error-panel";
import type { MediaUploadStage } from "@/components/media-upload-field";
import { NormalChallengeBuilderStep } from "@/components/normal-challenge-builder-steps";
import { BuilderContent, BuilderFooter, BuilderSurface, ChallengeBuilderFrame } from "@/components/challenge-builder-frame";
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
import { useChallengeBuilderAutosave } from "@/lib/hooks/use-challenge-builder-autosave";
import { freshNormalChallengeForm, normalChallengeFormFromRecord, normalChallengePayload, type NormalChallengeForm } from "@/lib/normal-challenge-builder-model";
import { NORMAL_CHALLENGE_MAX_STEP, NORMAL_CHALLENGE_STEPS } from "@/lib/normal-challenge-config";
import { getNormalChallengeReadiness, normalChallengeSubmitIssue } from "@/lib/normal-challenge-readiness";

function builderStatus(record: Record<string, unknown>) {
  const value = String(record.managementState ?? record.status ?? record.lifecycleStatus ?? "draft").toLowerCase();
  return value === "changes_requested" ? "requires_changes" : value;
}
type EnterpriseOwnership = "personal" | "official";

export function NormalChallengeBuilder({ draftId, enterpriseOwnership }: { draftId?: string; enterpriseOwnership?: EnterpriseOwnership }) {
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
  const mediaDisabled = firebaseClientConfigStatus.mediaUploadsDisabled;
  const payload = useMemo(() => ({
    ...normalChallengePayload(form, id),
    ...(enterpriseOwnership ? {
      officialChallenge: enterpriseOwnership === "official",
      ownershipType: enterpriseOwnership === "official" ? "challenge_suite_official" : "enterprise_personal"
    } : {})
  }), [enterpriseOwnership, form, id]);
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

  const invalidateAutosave = useChallengeBuilderAutosave({
    enabled: Boolean(id) && !loadingDraft && !saving && editable,
    revision: payload,
    secondaryRevision: step,
    save: () => updateChallengeDraft(id, { ...payload, builderCurrentStep: step }),
    onResult: (result) => {
      setAutosaveFailed(!result.ok);
      if (!result.ok) setError("We couldn't save your changes. Check your connection and try again.");
    },
    onError: () => {
      setAutosaveFailed(true);
      setError("We couldn't save your changes. Check your connection and try again.");
    }
  });

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
    invalidateAutosave();
    const result = await updateChallengeDraft(id, { ...payload, builderCurrentStep: next, maxUnlockedStep: Math.max(unlocked, next) });
    if (!result.ok) {
      if (result.code === "CHALLENGE_NOT_EDITABLE") {
        const refreshed = await fetchChallengeDraft(id);
        if (refreshed.ok && refreshed.data?.challenge && builderStatus(refreshed.data.challenge) === "pending_review") {
          invalidateAutosave();
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
    invalidateAutosave();
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
    invalidateAutosave();
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
          <ChallengeBuilderFrame
            steps={NORMAL_CHALLENGE_STEPS}
            currentStep={step}
            unlockedStep={unlocked}
            completedSteps={readiness.steps.map((item) => item.complete)}
            guide={{ title: stepDefinition.title, description: stepDefinition.description, points: stepDefinition.guide }}
            guideOpen={mobileGuideOpen}
            setGuideOpen={setMobileGuideOpen}
            onStepChange={setStep}
            guideStatus={autosaveFailed ? <p className="mt-5 rounded-[8px] bg-red-50 p-3 text-sm font-bold text-red-800">Changes are not saved. Continue is paused until retry succeeds.</p> : null}
          >
              {status === "requires_changes" && reviewReason ? <div className="mb-5 rounded-[8px] border border-amber-200 bg-amber-50 p-4"><p className="font-black text-amber-950">Changes requested</p><p className="mt-1 text-sm leading-6 text-amber-900">{reviewReason}</p></div> : null}
              <BuilderSurface>
                <BuilderContent>
                  <NormalChallengeBuilderStep step={step} form={form} update={update} userId={user.uid} mediaDisabled={mediaDisabled} track={(key) => (value) => setMedia((current) => ({ ...current, [key]: value }))} readiness={readiness} edit={setStep} plan={plan} showErrors={attemptedSteps.has(step)} draftId={id} />
                  {error ? <div className="mt-7"><ApiErrorPanel title="Check this step" message={error} onRetry={autosaveFailed ? () => void persist() : () => setError("")} /></div> : null}
                </BuilderContent>
                <BuilderFooter
                  backDisabled={saving}
                  busy={saving}
                  finishLater={id ? () => router.push("/my-challenges") : undefined}
                  onBack={() => step === 0 && !id ? setChosen(false) : setStep((current) => Math.max(0, current - 1))}
                  onContinue={step === NORMAL_CHALLENGE_MAX_STEP ? submit : next}
                  final={step === NORMAL_CHALLENGE_MAX_STEP}
                  finalDisabled={autosaveFailed || (step === NORMAL_CHALLENGE_MAX_STEP ? !readiness.ready : uploadBusy)}
                  submitLabel={status === "requires_changes" ? "Resubmit for Review" : "Submit for Review"}
                />
              </BuilderSurface>
          </ChallengeBuilderFrame>
        )}
      </main>
    </AppShell>
  );
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
