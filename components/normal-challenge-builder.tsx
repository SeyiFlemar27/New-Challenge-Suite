"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ApiErrorPanel } from "@/components/api-error-panel";
import type { MediaUploadStage } from "@/components/media-upload-field";
import { NormalChallengeBuilderStep } from "@/components/normal-challenge-builder-steps";
import { BuilderContent, BuilderFooter, BuilderSurface, ChallengeBuilderFrame } from "@/components/challenge-builder-frame";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { createChallengeDraft, fetchChallengeDraft, fetchChallengeUsage, publishChallengeDraft, updateChallengeDraft } from "@/lib/api/services";
import { normalizeBuilderPlan } from "@/lib/challenge-builder-foundation";
import { creatorBasePrizeFunding, getNormalFrontendReadiness, NORMAL_FRONTEND_STEPS, normalFrontendDraftProgress, normalFrontendPayload, normalFrontendSubmitIssue, normalRestoredStep, normalStepIndex } from "@/lib/normal-challenge-frontend";
import { getEffectiveTier, getPersonalCapabilities } from "@/lib/plan-access";
import { firebaseClientConfigStatus } from "@/lib/firebase/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useChallengeBuilderAutosave } from "@/lib/hooks/use-challenge-builder-autosave";
import { freshNormalChallengeForm, normalChallengeFormFromRecord, type NormalChallengeForm } from "@/lib/normal-challenge-builder-model";
import { freshPrivateAccess, PRIVATE_FRONTEND_STEPS, privateBuilderPayload, privateBuilderReadiness, privateSharedStep, privateVisibleStep, type PrivateBuilderAccess } from "@/lib/private-challenge-builder";
import { PrivateBuilderAccessStep } from "@/components/private-builder-access";

function builderStatus(record: Record<string, unknown>) {
  const value = String(record.managementState ?? record.status ?? record.lifecycleStatus ?? "draft").toLowerCase();
  return value === "changes_requested" ? "requires_changes" : value;
}
type EnterpriseOwnership = "personal" | "official";

export function NormalChallengeBuilder({ draftId, enterpriseOwnership, privateMode = false }: { draftId?: string; enterpriseOwnership?: EnterpriseOwnership; privateMode?: boolean }) {
  const definitions = privateMode ? PRIVATE_FRONTEND_STEPS : NORMAL_FRONTEND_STEPS;
  const NORMAL_CHALLENGE_STEPS = definitions.map((item) => item.navLabel);
  const NORMAL_CHALLENGE_MAX_STEP = definitions.length - 1;
  const reviewStep = privateMode ? 6 : normalStepIndex("review");
  const [privateAccess, setPrivateAccess] = useState<PrivateBuilderAccess>(freshPrivateAccess);
  const sharedStep = (value: number) => privateMode ? privateSharedStep(value) : value;
  const visibleStep = (value: number) => privateMode ? privateVisibleStep(value) : value;
  function draftProgress(values: Record<string, unknown>, position: number, max: number, record: Record<string, unknown> | null) {
    return { ...normalFrontendDraftProgress(values, sharedStep(position), sharedStep(max), record), ...(privateMode ? { privateBuilderStep: position } : {}) };
  }
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const officialContext = enterpriseOwnership === "official";
  const plan = officialContext ? "enterprise" : normalizeBuilderPlan(getEffectiveTier({ ...user }).id);
  const capabilities = getPersonalCapabilities({ ...user });
  const [authoritativeDraft, setAuthoritativeDraft] = useState<Record<string, unknown> | null>(null);
  const [fundingBusy, setFundingBusy] = useState(false);
  const [draftLoadFailed, setDraftLoadFailed] = useState(false);
  const [usage, setUsage] = useState<{ uid: string; remaining: number } | null>(null);
  const [usageError, setUsageError] = useState("");
  const [form, setForm] = useState<NormalChallengeForm>(freshNormalChallengeForm);
  const [id, setId] = useState(draftId || "");
  const [step, setStep] = useState(0);
  const [unlocked, setUnlocked] = useState(0);
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
  const savingDraft = useRef(false);
  const draftSaveQueue = useRef<Promise<unknown>>(Promise.resolve());
  function saveDraft(values: Record<string, unknown>) {
    const request = draftSaveQueue.current.catch(() => undefined).then(() => updateChallengeDraft(id, values));
    draftSaveQueue.current = request;
    return request;
  }
  const mediaDisabled = firebaseClientConfigStatus.mediaUploadsDisabled;
  const payload = useMemo(() => ({
    ...normalFrontendPayload(form, id),
    ...(privateMode ? privateBuilderPayload(privateAccess) : {}),
    ...(enterpriseOwnership ? {
      officialChallenge: enterpriseOwnership === "official",
      ownershipType: enterpriseOwnership === "official" ? "challenge_suite_official" : "enterprise_personal"
    } : {})
  }), [enterpriseOwnership, form, id, privateMode, privateAccess]);
  const funding = useMemo(() => creatorBasePrizeFunding(form.basePrizeAmount, authoritativeDraft), [form.basePrizeAmount, authoritativeDraft]);
  const readiness = useMemo(() => (privateMode ? privateBuilderReadiness : getNormalFrontendReadiness)({ ...authoritativeDraft, ...payload }, funding), [authoritativeDraft, payload, funding, privateMode]);
  const stepDefinition = definitions[step] ?? definitions[0];
  const uploadBusy = Object.values(media).some((value) => ["preparing", "uploading", "processing"].includes(value)) ;
  const editable = status === "draft" || status === "requires_changes";
  const firstInvalidStep = readiness.steps.findIndex((item) => !item.complete);
  const accessibleStep = firstInvalidStep >= 0 ? Math.min(unlocked, firstInvalidStep) : unlocked;

  useEffect(() => {
    if (!draftId || hydrated.current) return;
    hydrated.current = true;
    void fetchChallengeDraft(draftId).then((result) => {
      if (!result.ok || !result.data?.challenge) {
        setError(result.message || "Draft could not be loaded.");
        setDraftLoadFailed(true);
        setLoadingDraft(false);
        return;
      }
      const challenge = result.data.challenge;
      if (!privateMode && (challenge.privateAccessPolicyVersion === 2 || /private|exclusive/i.test(String(challenge.visibility ?? challenge.type ?? "")))) { router.replace(`/private/create/${draftId}`); return; }
      const restoredStep = privateMode ? Math.max(0, Math.min(7, Number(challenge.privateBuilderStep ?? 0))) : normalRestoredStep(challenge.builderCurrentStep ?? challenge.creationStep ?? 0);
      if (privateMode) {
        if (challenge.privateAccessPolicyVersion !== 2) { setDraftLoadFailed(true); setError("This historical Private draft uses the legacy builder. Its settings are preserved and require a compatibility review before migration."); setLoadingDraft(false); return; }
        setPrivateAccess({ ...freshPrivateAccess, publicPreviewEnabled: challenge.publicPreviewEnabled === true, privateAccessMethod: challenge.privateAccessMethod === "invitation_code" ? "invitation_code" : "invite_link", privateVotingAccess: challenge.privateVotingAccess === "public_voting" ? "public_voting" : "access_restricted" });
      }
      setAuthoritativeDraft(challenge);
      const loadedStatus = builderStatus(challenge);
      setForm(normalChallengeFormFromRecord(challenge));
      setStatus(loadedStatus);
      setReviewReason(String(challenge.reviewReason ?? challenge.changesRequestedReason ?? ""));
      if (loadedStatus === "pending_review") {
        setError("");
        setAutosaveFailed(false);
      }
      const sharedUnlocked = normalRestoredStep(challenge.maxUnlockedStep ?? challenge.creationStep ?? 0);
      setUnlocked(Math.max(privateMode ? privateVisibleStep(sharedUnlocked) : sharedUnlocked, restoredStep));
      setStep(restoredStep);
      setLoadingDraft(false);
    }).catch(() => {
      setError("Draft could not be loaded. Check your connection and sign-in session, then retry.");
      setDraftLoadFailed(true);
      setLoadingDraft(false);
    });
  }, [draftId, privateMode, router]);

  useEffect(() => {
    if (!user || draftId || privateMode || plan !== "free") return;
    let active = true;
    void fetchChallengeUsage().then((result) => {
      if (!active) return;
      if (result.ok && result.data) setUsage({ uid: user.uid, remaining: result.data.freeBasic.remaining });
      else setUsageError(result.message || "Challenge allowance could not be checked.");
    }).catch(() => { if (active) setUsageError("Challenge allowance could not be checked. Try again."); });
    return () => { active = false; };
  }, [draftId, plan, user, privateMode]);

  async function refreshFunding() {
    if (!id || fundingBusy) return;
    invalidateAutosave();
    setFundingBusy(true);
    try { const result = await fetchChallengeDraft(id); if (result.ok && result.data?.challenge) { setAuthoritativeDraft(result.data.challenge); setError(""); } else { setAuthoritativeDraft(null); setError(result.message || "Funding confirmation could not be loaded."); } }
    catch { setAuthoritativeDraft(null); setError("Funding confirmation could not be loaded. Try again."); }
    finally { setFundingBusy(false); }
  }
  async function finishLater() {
    if (savingDraft.current || saving) return;
    savingDraft.current = true; setSaving(true);
    try { if (await persist()) router.push("/my-challenges"); }
    catch { setAutosaveFailed(true); setError("Your changes are not saved. Stay here and retry before leaving."); }
    finally { savingDraft.current = false; setSaving(false); }
  }
  async function openFunding() {
    if (savingDraft.current || saving || !id) return;
    savingDraft.current = true; setSaving(true);
    try { if (await persist()) router.push(`/challenges/${id}/prize-funding`); }
    catch { setError("Save your Base Prize before opening funding. Try again."); }
    finally { savingDraft.current = false; setSaving(false); }
  }

  useEffect(() => {
    document.querySelector<HTMLElement>("[data-normal-step-heading]")?.focus();
  }, [step, loadingDraft]);

  const invalidateAutosave = useChallengeBuilderAutosave({
    enabled: Boolean(id) && !loadingDraft && !saving && editable,
    revision: payload,
    secondaryRevision: step,
    save: () => saveDraft({ ...payload, ...draftProgress(payload, step, unlocked, authoritativeDraft) }),
    onResult: (result) => {
      if (result.ok && result.data?.challenge) setAuthoritativeDraft(result.data.challenge);
      setAutosaveFailed(!result.ok);
      if (result.ok) setError((current) => current === "We couldn't save your changes. Check your connection and try again." ? "" : current);
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

  function focusField(field: string) {
    document.querySelector<HTMLElement>(`[data-field="${CSS.escape(field)}"] input:not([disabled]),[data-field="${CSS.escape(field)}"] textarea:not([disabled]),[data-field="${CSS.escape(field)}"] select:not([disabled]),[data-field="${CSS.escape(field)}"] button:not([disabled])`)?.focus();
  }
  function focusIssue(target = step) {
    const issue = readiness.issues.find((item) => item.step === target);
    if (issue) {
      focusField(issue.field);
    }
    return issue;
  }

  async function persist(next = step) {
    if (!id || !editable) return false;
    invalidateAutosave();
    const result = await saveDraft({ ...payload, ...draftProgress(payload, next, unlocked, authoritativeDraft) });
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
    if (result.data?.challenge) setAuthoritativeDraft(result.data.challenge);
    setAutosaveFailed(false);
    setError("");
    return true;
  }

  async function next() {
    setAttemptedSteps((current) => new Set(current).add(step));
    setError("");
    setDraftLimitReached(false);
    if (step === reviewStep) {
      const earlierIssue = readiness.issues.find((item) => item.step < reviewStep);
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
    try {
    if (!id) {
      const result = await createChallengeDraft(payload);
      if (!result.ok || !result.data?.challenge?.id) {
        setSaving(false);
        setDraftLimitReached(["DRAFT_LIMIT_REACHED", "FREE_BASIC_LIMIT_REACHED", "PLAN_LIMIT_REACHED"].includes(result.code ?? ""));
        setError(result.message || "Challenge draft could not be created.");
        return;
      }
      const newId = result.data.challenge.id;
      setId(newId);
      const progress = await updateChallengeDraft(newId, { ...payload, ...draftProgress(payload, 1, 1, result.data.challenge) });
      setAuthoritativeDraft(progress.ok && progress.data?.challenge ? progress.data.challenge : result.data.challenge);
      setStep(progress.ok ? 1 : 0);
      setUnlocked(progress.ok ? 1 : 0);
      setAutosaveFailed(!progress.ok);
      if (!progress.ok) setError("Your draft was created, but its progress could not be saved. Retry without creating another draft.");
      setSaving(false);
      router.replace(privateMode ? `/private/create/${newId}` : `/challenges/create/${newId}`);
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
    } catch {
      setAutosaveFailed(Boolean(id));
      setError("Your changes could not be saved. Check your connection and sign-in session, then retry.");
    } finally {
      setSaving(false);
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
    try {
    if (!await persist(NORMAL_CHALLENGE_MAX_STEP)) {
      setSaving(false);
      return;
    }
    const refreshed = await fetchChallengeDraft(id);
    if (!refreshed.ok || !refreshed.data?.challenge) {
      setSaving(false);
      setAuthoritativeDraft(null);
      setError("Creator funding could not be verified. Refresh before submitting.");
      return;
    }
    const freshRecord = refreshed.data.challenge;
    setAuthoritativeDraft(freshRecord);
    const freshReadiness = (privateMode ? privateBuilderReadiness : getNormalFrontendReadiness)({ ...freshRecord, ...payload }, creatorBasePrizeFunding(form.basePrizeAmount, freshRecord));
    if (!freshReadiness.ready) {
      setSaving(false);
      setError(freshReadiness.issues[0]?.message || "Submission requirements are not satisfied.");
      return;
    }
    const result = await publishChallengeDraft(id, { ...payload, ...normalFrontendPayload(form, id, freshRecord), ...(privateMode ? privateBuilderPayload(privateAccess) : {}) });
    if (!result.ok) {
      setSaving(false);
      if (["FREE_BASIC_LIMIT_REACHED", "PLAN_LIMIT_REACHED"].includes(result.code ?? "")) setDraftLimitReached(true);
      const issue = normalFrontendSubmitIssue(result.details);
      setError(issue?.message || (result.code === "VALIDATION_ERROR" ? "Some required details need attention." : result.message || "Challenge could not be submitted for review."));
      if (issue?.step !== null && issue?.step !== undefined) {
        setStep(visibleStep(issue.step));
        window.setTimeout(() => focusField(issue.field), 0);
      }
      return;
    }
    invalidateAutosave();
    setAutosaveFailed(false);
    setError("");
    setStatus(builderStatus(result.data?.challenge ?? {}) || "pending_review");
    setSaving(false);
    } catch {
      setAutosaveFailed(true);
      setError("Submission could not be confirmed. Check your sign-in session and reload the saved draft before retrying.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || loadingDraft) return <AppShell><section className="mx-auto max-w-7xl p-8" aria-busy="true" /></AppShell>;
  if (!user) return <AppShell><Card className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-black">Sign in to create a challenge</h1><LinkButton href="/auth/login?next=%2Fchallenges%2Fcreate" className="mt-5">Sign In</LinkButton></Card></AppShell>;
  if (draftLimitReached) return <DraftLimit message={error} />;
  if (draftLoadFailed) return <AppShell><ApiErrorPanel title="Draft could not be restored" message={error} onRetry={() => window.location.reload()} /></AppShell>;
  if (officialContext ? !user.enterprisePermissions?.includes("challenge.create_official") : privateMode ? !capabilities.canCreatePrivateChallenge : !capabilities.canCreateNormalChallenge) return <AppShell><Card className="p-8"><h1 className="text-2xl font-black">Challenge creation is unavailable in this workspace</h1><LinkButton href="/dashboard" className="mt-5">Return to your workspace</LinkButton></Card></AppShell>;
  if (!privateMode && !draftId && plan === "free" && (!usage || usage.uid !== user.uid)) return <AppShell><ApiErrorPanel title={usageError ? "Creation entitlement could not be checked" : "Checking your creation entitlement"} message={usageError || "Loading your server-confirmed challenge allowance."} onRetry={usageError ? () => window.location.reload() : undefined} /></AppShell>;
  if (!privateMode && !draftId && plan === "free" && usage?.remaining === 0) return <DraftLimit message="You have used your Free plan lifetime Normal Challenge allowance. Continue an existing draft or review available plans. Backend publication limits still apply to existing drafts." />;
  if (status === "pending_review" && id) return <SubmittedChallengeState challengeId={id} />;
  if (!editable) return <AppShell><Card className="p-8"><h1 className="text-2xl font-black">Editing is unavailable for this challenge</h1><p className="mt-3">The server has recorded its status as {status.replaceAll("_", " ")}.</p><LinkButton className="mt-5" href={`/challenges/${id}`}>View Challenge</LinkButton></Card></AppShell>;

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-[1560px] py-7">
        <PageTitle title="Create Challenge" subtitle={`Build your ${privateMode ? "Private" : "Normal"} Challenge one step at a time.`} />

          <ChallengeBuilderFrame
            steps={NORMAL_CHALLENGE_STEPS}
            currentStep={step}
            unlockedStep={accessibleStep}
            completedSteps={readiness.steps.map((item) => item.complete)}
            guide={{ title: stepDefinition.title, description: stepDefinition.description, points: stepDefinition.guide }}
            guideKeyboardSupport
            normalLayout
            guideOpen={mobileGuideOpen}
            setGuideOpen={setMobileGuideOpen}
            onStepChange={setStep}
            guideStatus={autosaveFailed ? <p className="mt-5 rounded-[8px] bg-red-50 p-3 text-sm font-bold text-red-800">Changes are not saved. Continue is paused until retry succeeds.</p> : null}
          >
              {status === "requires_changes" && reviewReason ? <div className="mb-5 rounded-[8px] border border-amber-200 bg-amber-50 p-4"><p className="font-black text-amber-950">Changes requested</p><p className="mt-1 text-sm leading-6 text-amber-900">{reviewReason}</p></div> : null}
              <BuilderSurface>
                <BuilderContent>
                  {privateMode && step === 5 ? <PrivateBuilderAccessStep value={privateAccess} onChange={setPrivateAccess} /> : <NormalChallengeBuilderStep step={sharedStep(step)} visibleStep={step} stepCount={definitions.length} form={form} update={update} userId={user.uid} mediaDisabled={mediaDisabled} track={(key) => (value) => setMedia((current) => ({ ...current, [key]: value }))} readiness={privateMode ? { ...readiness, issues: readiness.issues.map((issue) => ({ ...issue, step: privateSharedStep(issue.step) })) } : readiness} edit={(target) => setStep(visibleStep(target))} plan={plan} showErrors={attemptedSteps.has(step)} draftId={id} funding={funding} fundBasePrize={() => void openFunding()} refreshFunding={() => void refreshFunding()} fundingBusy={fundingBusy || saving} />}
                  {privateMode && step === 6 ? <section className="mt-6 rounded-lg border p-5"><h3 className="font-black">Access</h3><p className="mt-2">{privateAccess.publicPreviewEnabled ? "Visible on Explore; requests permitted" : "Invitation-only; requests unavailable"} · {privateAccess.privateAccessMethod === "invite_link" ? "Invite Link" : "Invitation Code"} · {privateAccess.publicPreviewEnabled && privateAccess.privateVotingAccess === "public_voting" ? "Public voting during voting period" : "Voting requires private access"}</p><button className="mt-3 min-h-11 font-bold underline" onClick={() => setStep(5)}>Edit Access</button></section> : null}
                  {error ? <div className="mt-7"><ApiErrorPanel title="Check this step" message={error} onRetry={autosaveFailed ? () => void persist() : () => setError("")} /></div> : null}
                </BuilderContent>
                <BuilderFooter
                  backDisabled={saving || step === 0}
                  busy={saving}
                  finishLater={id ? () => void finishLater() : undefined}
                  onBack={() => setStep((current) => Math.max(0, current - 1))}
                  onContinue={step === NORMAL_CHALLENGE_MAX_STEP ? submit : next}
                  final={step === NORMAL_CHALLENGE_MAX_STEP}
                  finalDisabled={autosaveFailed || (step === NORMAL_CHALLENGE_MAX_STEP ? !readiness.ready : uploadBusy)}
                  submitLabel={status === "requires_changes" ? "Resubmit for Review" : "Submit for Review"}
                />
              </BuilderSurface>
          </ChallengeBuilderFrame>

      </section>
    </AppShell>
  );
}

function SubmittedChallengeState({ challengeId }: { challengeId: string }) {
  return <AppShell><section className="mx-auto max-w-2xl px-4 py-10 sm:px-6"><Card className="p-6 sm:p-8"><div className="grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-800"><Check size={24} /></div><h1 className="mt-5 text-2xl font-black">Challenge Submitted</h1><p role="status" className="mt-3 text-sm font-bold text-emerald-900">Your challenge has been sent for review.</p><p className="mt-3 text-sm leading-6 text-slate-600">Status: Under Review. Editing is unavailable until an admin requests changes.</p><div className="mt-6 flex flex-wrap gap-3"><LinkButton href={`/challenges/${challengeId}`}>View Challenge</LinkButton><LinkButton href="/dashboard/host" variant="secondary">Back to Dashboard</LinkButton><LinkButton href="/contact" variant="ghost">Contact Support</LinkButton></div></Card></section></AppShell>;
}

function DraftLimit({ message }: { message: string }) {
  return <AppShell><section className="mx-auto max-w-xl px-4 py-10"><Card className="p-6 sm:p-8"><h1 className="text-2xl font-black">Challenge creation limit reached</h1><p className="mt-3 text-sm leading-6 text-slate-600">{message || "Your current plan cannot create another draft. Continue an existing draft or review your plan allowance."}</p><div className="mt-6 flex flex-wrap gap-3"><LinkButton href="/my-challenges">View Drafts</LinkButton><LinkButton href="/subscriptions" variant="secondary">View Plans</LinkButton></div></Card></section></AppShell>;
}
