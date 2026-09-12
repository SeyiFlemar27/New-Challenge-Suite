"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ApiErrorPanel } from "@/components/api-error-panel";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { MediaUploadField, type MediaUploadStage } from "@/components/media-upload-field";
import { BuilderContent, BuilderFooter, BuilderStepHeading, BuilderSurface, ChallengeBuilderFrame, type BuilderGuideContent } from "@/components/challenge-builder-frame";
import { createChallenge, fetchChallengeDraft, fetchChallengeUsage, publishChallengeDraft, updateChallengeDraft } from "@/lib/api/services";
import { firebaseClientConfigStatus } from "@/lib/firebase/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { challengeDraftMediaPath } from "@/lib/media-upload-paths";
import { getPlanExperience, getUserPlanAccess } from "@/lib/plan-access";
import { validateChallengeForPublish, type ChallengeValidationResult } from "@/lib/server/challenge-validation";
import { CHALLENGE_TIME_ZONE_OPTIONS, DEFAULT_CHALLENGE_TIME_ZONE, challengeDateTimeForStorage, challengeDateTimeInputValue, formatChallengeLocalDateTime, resolveChallengeTimeZone } from "@/lib/challenge-date-time";
import { generatePrivateChallengeAccessCode } from "@/lib/private-challenge-access";
import { challengePublishError } from "@/lib/challenge-publish-feedback";
import { challengeReviewMonetizationLabels, getChallengePublishBlocker } from "@/lib/challenge-publish-readiness";

type Mode = "public" | "private";
const SPONSOR_PLACEMENTS = ["challenge_detail", "voting_page", "leaderboard", "winner_announcement", "share_card"] as const;
const sponsorPlacementLabels: Record<string, string> = {
  challenge_detail: "Challenge page",
  voting_page: "Voting page",
  leaderboard: "Leaderboard",
  winner_announcement: "Winner announcement",
  share_card: "Share card"
};

type FormState = {
  title: string; category: string; description: string; shortDescription: string;
  rules: string; terms: string; submission: string; access: string; accessCode: string; accessCodeExpiresAt: string; accessCodeMaxUses: string; publicPreviewEnabled: boolean;
  participantQuestions?: string; participantAcknowledgements?: string;
  approvalRequired: boolean; eligibleCountries: string; minimumAge: string; maxParticipants: string; waitlistEnabled: boolean; hideParticipantList: boolean;
  submissionTypes: string[]; startsAt: string; registrationDeadline: string; submissionDeadline: string; votingDeadline: string; endsAt: string;
  timeZone: string;
  coverImageUrl: string; coverImagePath: string; promoImageUrl: string; promoImagePath: string; galleryImageUrl: string; galleryImagePath: string; trailerVideoUrl: string; trailerVideoPath: string; documentOneUrl: string; documentOnePath: string; documentTwoUrl: string; documentTwoPath: string;
  paidEntryEnabled: boolean; entryFeeAmount: string; entryCurrency: string; sponsorReady: boolean; prizePoolEnabled: boolean; paidVotesEnabled: boolean;
  creatorPrizeFundingRequiredCents: number; confirmedCreatorPrizeFundingCents: number; creatorPrizeFundingStatus: string;
  sponsorshipGoal: string; preferredSponsorCategory: string; sponsorNote: string; sponsorPlacementPreferences: string[];
};

const publicSteps = ["Basics", "Participation", "Entry & Submission", "Competition", "Rewards", "Schedule", "Review"];
const privateSteps = ["Overview", "Access", "Eligibility", "Monetization", "Media", "Schedule", "Entry & Submission", "Review", "Publish"];
const privateStepGuides: BuilderGuideContent[] = [
  { title: "Overview", description: "Set the private challenge identity and brief.", points: ["Use a specific title.", "Explain the outcome clearly.", "Keep rules relevant to the competition."] },
  { title: "Access", description: "Configure the forwardable link and protected access code together.", points: ["The code is verified by the server.", "The link alone never grants entry.", "Access still respects eligibility and capacity."] },
  { title: "Eligibility", description: "Define who can participate and what they must confirm.", points: ["Access and eligibility are separate checks.", "Collect only necessary information.", "Use the waitlist only with fixed capacity."] },
  { title: "Monetization", description: "Configure reviewed money and sponsor requests.", points: ["Provider confirmation remains authoritative.", "Sponsor funding stays separately accounted.", "Submitting does not release money."] },
  { title: "Media", description: "Upload storage-confirmed challenge media.", points: ["The first image is primary.", "Wait for uploads to complete.", "Use media you can publish."] },
  { title: "Schedule", description: "Set the Join, Submit, Vote, and Results lifecycle.", points: ["All times use the selected timezone.", "Exact deadlines are closed.", "Results remain admin-gated."] },
  { title: "Entry & Submission", description: "Describe the accepted entry and submission requirements.", points: ["Choose only supported media types.", "Give precise instructions.", "Fix and Resubmit remains moderation-gated."] },
  { title: "Review", description: "Review every secured and participant-facing setting.", points: ["Resolve blocking issues.", "Confirm access and money settings.", "Private access does not bypass review."] },
  { title: "Publish", description: "Submit the private challenge for admin review.", points: ["This does not publish immediately.", "Editing pauses during review.", "The access code remains protected."] }
];
const publicStepSubtitles = [
  "Set the basic details for your challenge.",
  "Tell participants who can join and what to follow.",
  "Define how people enter and what they submit.",
  "Set your dates, voting window, and winner timing.",
  "Choose entry fees, prizes, and sponsor readiness.",
  "Add visuals that make your challenge stand out.",
  "Check the challenge before submitting it for review."
];
const publicStepGuides = [
  ["Start With A Clear Challenge", "Make the goal easy to understand.", "Tell competitors what they are joining.", "Keep the title short and specific."],
  ["Set Fair Rules", "Explain who can join.", "Keep participation rules clear.", "Make eligibility easy to review."],
  ["Guide Strong Submissions", "Describe what participants should submit.", "Choose only the formats you can review.", "Keep entry instructions concise."],
  ["Keep Timing Clear", "Give participants enough time.", "Check every deadline in the selected timezone.", "Leave time for winner review."],
  ["Plan Rewards Clearly", "Paid entry and sponsor-ready requests can be reviewed after submission.", "Use valid amounts and winner settings.", "Funding release remains review-dependent."],
  ["Make It Look Ready", "Use a clear primary image.", "Keep optional media focused.", "Wait for uploads to finish before submitting."],
  ["Submit With Confidence", "Review each section before submitting.", "Check every readiness issue before submitting.", "Your challenge will be reviewed before it goes public."]
];
const categories = ["Fitness", "Creative", "Photography", "Food", "Gaming", "Education", "Business", "Other"];

function dateInput(days: number) {
  return challengeDateTimeInputValue(new Date(Date.now() + days * 24 * 60 * 60 * 1000), DEFAULT_CHALLENGE_TIME_ZONE);
}

function initialForm(): FormState {
  return { title: "", category: "", description: "", shortDescription: "", rules: "", terms: "", submission: "", access: "", accessCode: generatePrivateChallengeAccessCode(), accessCodeExpiresAt: "", accessCodeMaxUses: "", publicPreviewEnabled: false, approvalRequired: false, eligibleCountries: "", minimumAge: "", maxParticipants: "", waitlistEnabled: false, hideParticipantList: false, submissionTypes: ["image"], startsAt: dateInput(8), registrationDeadline: dateInput(4), submissionDeadline: dateInput(9), votingDeadline: dateInput(10), endsAt: dateInput(11), timeZone: DEFAULT_CHALLENGE_TIME_ZONE, coverImageUrl: "", coverImagePath: "", promoImageUrl: "", promoImagePath: "", galleryImageUrl: "", galleryImagePath: "", trailerVideoUrl: "", trailerVideoPath: "", documentOneUrl: "", documentOnePath: "", documentTwoUrl: "", documentTwoPath: "", paidEntryEnabled: false, entryFeeAmount: "", entryCurrency: "USD", sponsorReady: false, prizePoolEnabled: false, paidVotesEnabled: false, creatorPrizeFundingRequiredCents: 0, confirmedCreatorPrizeFundingCents: 0, creatorPrizeFundingStatus: "not_requested", sponsorshipGoal: "", preferredSponsorCategory: "", sponsorNote: "", sponsorPlacementPreferences: ["challenge_detail", "voting_page"] };
}

function formFromChallenge(challenge: Record<string, unknown>): FormState {
  const monetization = typeof challenge.monetization === "object" && challenge.monetization !== null ? challenge.monetization as Record<string, unknown> : {};
  const docs = Array.isArray(challenge.documentUrls) ? challenge.documentUrls.map(String) : [];
  const docPaths = Array.isArray(challenge.documentPaths) ? challenge.documentPaths.map(String) : [];
  const description = String(challenge.description ?? "");
  const timeZone = resolveChallengeTimeZone(challenge);
  return {
    ...initialForm(),
    title: String(challenge.title ?? ""),
    category: String(challenge.category ?? ""),
    description,
    shortDescription: String(challenge.shortDescription ?? ""),
    rules: String(challenge.standardRules ?? ""),
    terms: String(challenge.policyTerms ?? ""),
    submission: String(challenge.challengeGuidelines ?? ""),
    access: String(challenge.privateAccessInstructions ?? ""),
    accessCode: String(challenge.privateAccessCode ?? generatePrivateChallengeAccessCode()),
    accessCodeExpiresAt: challengeDateTimeInputValue(challenge.privateAccessCodeExpiresAt ?? "", timeZone),
    accessCodeMaxUses: String(challenge.privateAccessCodeMaxUses ?? ""),
    publicPreviewEnabled: Boolean(challenge.publicPreviewEnabled),
    participantQuestions: Array.isArray(challenge.privateParticipantQuestions) ? challenge.privateParticipantQuestions.map(String).join("\n") : "",
    participantAcknowledgements: Array.isArray(challenge.privateParticipantAcknowledgements) ? challenge.privateParticipantAcknowledgements.map(String).join("\n") : "I confirm that my submission is original and follows the challenge rules.",
    approvalRequired: challenge.requiresParticipantApproval === true || challenge.participantApprovalMode === "manual",
    eligibleCountries: Array.isArray(challenge.eligibleCountries) ? challenge.eligibleCountries.join(", ") : "",
    minimumAge: String(challenge.minimumAge ?? ""),
    maxParticipants: Number(challenge.maxParticipants ?? 0) > 0 ? String(challenge.maxParticipants) : "",
    waitlistEnabled: Boolean(challenge.waitlistEnabled),
    hideParticipantList: Boolean(challenge.hideParticipantList),
    submissionTypes: Array.isArray(challenge.acceptedSubmissionTypes) && challenge.acceptedSubmissionTypes.length ? challenge.acceptedSubmissionTypes.map(String) : ["image"],
    startsAt: challengeDateTimeInputValue(challenge.submissionStartAt ?? challenge.startsAt ?? dateInput(8), timeZone),
    registrationDeadline: challengeDateTimeInputValue(challenge.registrationDeadline ?? dateInput(4), timeZone),
    submissionDeadline: challengeDateTimeInputValue(challenge.submissionDeadline ?? dateInput(9), timeZone),
    votingDeadline: challengeDateTimeInputValue(challenge.votingDeadline ?? challenge.votingEndsAt ?? dateInput(10), timeZone),
    endsAt: challengeDateTimeInputValue(challenge.winnerAnnouncementAt ?? challenge.endsAt ?? dateInput(11), timeZone),
    timeZone,
    coverImageUrl: String(challenge.coverImageUrl ?? ""),
    coverImagePath: String(challenge.coverImagePath ?? ""),
    promoImageUrl: String(challenge.promoImageUrl ?? ""),
    promoImagePath: String(challenge.promoImagePath ?? ""),
    trailerVideoUrl: String(challenge.trailerVideoUrl ?? challenge.promoVideoUrl ?? ""),
    trailerVideoPath: String(challenge.trailerVideoPath ?? challenge.promoVideoPath ?? ""),
    documentOneUrl: docs[0] ?? "",
    documentOnePath: docPaths[0] ?? "",
    documentTwoUrl: docs[1] ?? "",
    documentTwoPath: docPaths[1] ?? "",
    paidEntryEnabled: Boolean(monetization.paidEntryRequested ?? challenge.paidEntryEnabled),
    entryFeeAmount: String(Number(monetization.entryFeeAmountCents ?? challenge.entryFeeAmountCents ?? challenge.entryFeeCents ?? 0) / 100 || ""),
    entryCurrency: "USD",
    sponsorReady: Boolean(monetization.sponsorReady ?? challenge.sponsorEnabled),
    prizePoolEnabled: Boolean(monetization.prizePoolRequested ?? challenge.prizePoolEnabled),
    paidVotesEnabled: Boolean(monetization.paidVotesRequested ?? challenge.paidVotesEnabled),
    creatorPrizeFundingRequiredCents: Math.max(0, Number(monetization.creatorPrizeFundingRequiredCents ?? 0)),
    confirmedCreatorPrizeFundingCents: Math.max(0, Number(challenge.confirmedCreatorPrizeFundingCents ?? monetization.confirmedCreatorPrizeFundingCents ?? 0)),
    creatorPrizeFundingStatus: String(monetization.creatorPrizeFundingStatus ?? "not_requested"),
    sponsorshipGoal: String(monetization.sponsorshipGoal ?? ""),
    preferredSponsorCategory: String(monetization.preferredSponsorCategory ?? ""),
    sponsorNote: String(monetization.sponsorNote ?? ""),
    sponsorPlacementPreferences: Array.isArray(monetization.placements) && monetization.placements.length ? monetization.placements.map(String) : ["challenge_detail", "voting_page"]
  };
}

export function ChallengeBuilder({ mode, draftId, enterpriseOwnership }: { mode: Mode; draftId?: string; enterpriseOwnership?: "official" }) {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const enterpriseContext = enterpriseOwnership === "official";
  const planProfile = enterpriseContext
    ? { planId: "enterprise", planStatus: "active", accountType: "user" }
    : { planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType };
  const planAccess = getUserPlanAccess(planProfile);
  const planExperience = getPlanExperience(planProfile);
  const enterpriseApproved = enterpriseContext && Boolean(user?.availableWorkspaces?.includes("enterprise"));
  const monetizationEligible = planAccess.isCreator || planAccess.isHost || enterpriseApproved;
  const isFreePublic = mode === "public" && planExperience.planId === "free" && (user?.selectedAccountType ?? user?.role ?? user?.accountType) !== "sponsor";
  const privateLocked = mode === "private" && !planAccess.canCreatePrivateChallenges;
  const steps = mode === "private" ? privateSteps : publicSteps;
  const [step, setStep] = useState(0);
  const [unlockedStep, setUnlockedStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [freeUsage, setFreeUsage] = useState({ used: 0, limit: 3, remaining: 3, loaded: false });
  const [media, setMedia] = useState<Record<string, MediaUploadStage>>({});
  const [serverValidation, setServerValidation] = useState<ChallengeValidationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [createdDraftId, setCreatedDraftId] = useState("");
  const [draftStatus, setDraftStatus] = useState("draft");
  const [draftLoaded, setDraftLoaded] = useState(!draftId);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "failed" | "offline">("idle");
  const [mobileGuideOpen, setMobileGuideOpen] = useState(false);
  const hydratedDraftRef = useRef(false);
  const autosaveVersionRef = useRef(0);
  const activeDraftId = draftId || createdDraftId;
  const recoveryKey = activeDraftId ? `challenge-draft-recovery:${activeDraftId}` : "challenge-draft-recovery:new";
  const mediaUploadDisabled = firebaseClientConfigStatus.mediaUploadsDisabled;
  const imageLessPublishingAllowed = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ALLOW_IMAGELESS_CHALLENGE_PUBLISHING === "true";
  const mediaPublicationBlocked = mediaUploadDisabled && !imageLessPublishingAllowed;
  const mediaUploadDisabledReason = imageLessPublishingAllowed
    ? "Media uploads are temporarily unavailable. You can continue without media."
    : "Media uploads are temporarily unavailable. Please try again later.";
  const uploadInProgress = Object.values(media).some((status) => ["preparing", "uploading", "processing"].includes(status));
  const uploadFailed = Object.values(media).some((status) => status === "failed");
  const freeLimitReached = isFreePublic && freeUsage.loaded && freeUsage.remaining <= 0;
  const requiredImageMissing = (!mediaUploadDisabled || mediaPublicationBlocked) && (!form.coverImageUrl || !form.coverImagePath);
  const entryFeeCents = Math.max(0, Math.round(Number(form.entryFeeAmount || 0) * 100));
  const monetizedIntent = form.paidEntryEnabled || form.sponsorReady || form.prizePoolEnabled || form.paidVotesEnabled;
  const monetizationProblem = !monetizationEligible && monetizedIntent
    ? "Monetized challenges are available to Creator, Host, and approved Enterprise accounts."
    : form.paidEntryEnabled && entryFeeCents < 500
      ? "Entry fee must be at least $5."
      : "";

  useEffect(() => {
    if (!loading && isFreePublic) {
      fetchChallengeUsage().then((result) => result.ok && result.data ? setFreeUsage({ ...result.data.freeBasic, loaded: true }) : setFreeUsage((current) => ({ ...current, loaded: true })));
    }
  }, [isFreePublic, loading]);

  useEffect(() => {
    if (!draftId || hydratedDraftRef.current) return;
    hydratedDraftRef.current = true;
    setDraftLoaded(false);
    void fetchChallengeDraft(draftId).then((result) => {
      if (result.ok && result.data?.challenge) {
        const serverDraft = result.data.challenge;
        setDraftStatus(String(serverDraft.status ?? serverDraft.lifecycleStatus ?? "draft"));
        const serverForm = formFromChallenge(serverDraft);
        let nextForm = serverForm;
        const calculatorKey = `challenge-calculator-prefill:${draftId}`;
        try {
          const rawRecovery = window.localStorage.getItem(recoveryKey);
          if (rawRecovery) {
            const recovery = JSON.parse(rawRecovery) as { savedAt?: string; form?: FormState; step?: number };
            const localSaved = Date.parse(String(recovery.savedAt ?? ""));
            const serverSaved = Date.parse(String(serverDraft.lastAutosavedAt ?? serverDraft.updatedAt ?? ""));
            if (recovery.form && Number.isFinite(localSaved) && (!Number.isFinite(serverSaved) || localSaved > serverSaved)) {
              nextForm = { ...recovery.form, creatorPrizeFundingRequiredCents: serverForm.creatorPrizeFundingRequiredCents, confirmedCreatorPrizeFundingCents: serverForm.confirmedCreatorPrizeFundingCents, creatorPrizeFundingStatus: serverForm.creatorPrizeFundingStatus };
              if (typeof recovery.step === "number") setStep(Math.max(0, Math.min(recovery.step, steps.length - 1)));
              setNotice("Recovered unsynced local changes.");
            }
          } else {
            const rawCalculator = window.sessionStorage.getItem(calculatorKey);
            if (rawCalculator) {
              const calculator = JSON.parse(rawCalculator) as Record<string, unknown>;
              const type = String(calculator.type ?? "");
              nextForm = {
                ...nextForm,
                paidEntryEnabled: type === "paid",
                entryFeeAmount: type === "paid" ? String(Math.max(0, Number(calculator.entryFee ?? 0))) : nextForm.entryFeeAmount,
                sponsorReady: type === "sponsored",
                prizePoolEnabled: Math.max(0, Number(calculator.creatorContribution ?? 0) + Number(calculator.sponsorContribution ?? 0) + Number(calculator.adminContribution ?? 0)) > 0
              };
              window.sessionStorage.removeItem(calculatorKey);
              setNotice("Calculator inputs were carried into this draft.");
            }
          }
        } catch {
          window.localStorage.removeItem(recoveryKey);
          window.sessionStorage.removeItem(calculatorKey);
        }
        setForm(nextForm);
        const draftStep = Number(serverDraft.creationStep ?? 0);
        if (Number.isFinite(draftStep)) {
          const restored = Math.max(0, Math.min(draftStep, steps.length - 1));
          setStep(restored);
          setUnlockedStep(restored);
        }
      } else {
        setError(result.message || "Draft could not be loaded.");
      }
      setDraftLoaded(true);
    });
  }, [draftId, recoveryKey, steps.length]);

  useEffect(() => {
    if (!activeDraftId || !draftLoaded || createdId || !["draft", "requires_changes", "changes_requested"].includes(draftStatus)) return;
    try {
      window.localStorage.setItem(recoveryKey, JSON.stringify({ form, step, savedAt: new Date().toISOString() }));
    } catch {
      setAutosaveState("offline");
    }
    const timer = window.setTimeout(() => {
      const requestVersion = ++autosaveVersionRef.current;
      setAutosaveState("saving");
      void updateChallengeDraft(activeDraftId, { ...payload(false), creationStep: step }).then((result) => {
        if (requestVersion !== autosaveVersionRef.current) return;
        if (result.ok) {
          window.localStorage.removeItem(recoveryKey);
          setAutosaveState("saved");
          return;
        }
        setAutosaveState("failed");
      }).catch(() => { if (requestVersion === autosaveVersionRef.current) setAutosaveState("offline"); });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [activeDraftId, draftLoaded, form, step, createdId, draftStatus]);

  function update(field: keyof FormState, value: FormState[keyof FormState]) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setNotice("");
    setServerValidation(null);
  }

  function updateMedia(urlField: keyof FormState, pathField: keyof FormState, url: string, metadata?: { path: string }) {
    setForm((current) => ({ ...current, [urlField]: url, [pathField]: metadata?.path ?? "" }));
    setServerValidation(null);
  }

  function track(field: string) {
    return (status: MediaUploadStage) => setMedia((current) => ({ ...current, [field]: status }));
  }

  function toggleType(type: string) {
    update("submissionTypes", form.submissionTypes.includes(type) ? form.submissionTypes.filter((item) => item !== type) : [...form.submissionTypes, type]);
  }

  function togglePlacement(surface: string) {
    update("sponsorPlacementPreferences", form.sponsorPlacementPreferences.includes(surface) ? form.sponsorPlacementPreferences.filter((item) => item !== surface) : [...form.sponsorPlacementPreferences, surface]);
  }

  function payload(publish: boolean) {
    const privateMode = mode === "private";
    const safeSponsorReady = Boolean(monetizationEligible && form.sponsorReady);
    const safePaidEntryRequested = Boolean(monetizationEligible && form.paidEntryEnabled);
    const safePrizePoolRequested = Boolean(monetizationEligible && form.prizePoolEnabled);
    const safePaidVotesRequested = Boolean(monetizationEligible && form.paidVotesEnabled);
    const registrationCloseAt = challengeDateTimeForStorage(form.registrationDeadline, form.timeZone);
    const challengeSubmissionStartAt = challengeDateTimeForStorage(form.startsAt, form.timeZone);
    const submissionDeadline = challengeDateTimeForStorage(form.submissionDeadline, form.timeZone);
    const votingReviewCloseAt = challengeDateTimeForStorage(form.votingDeadline, form.timeZone);
    const winnerAnnouncementAt = challengeDateTimeForStorage(form.endsAt, form.timeZone);
    return {
      title: form.title.trim(),
      description: (form.shortDescription.trim() ? form.shortDescription.trim() + "\n\n" : "") + form.description.trim(),
      category: form.category,
      type: privateMode ? "Private Challenge" : "Public Challenge",
      officialChallenge: enterpriseOwnership === "official",
      ownershipType: enterpriseOwnership === "official" ? "challenge_suite_official" : "creator_personal",
      visibility: privateMode ? "private" : "public",
      acceptedSubmissionTypes: form.submissionTypes,
      competitionFormat: privateMode ? "Invite-only Entry Competition" : "Entry Competition",
      bestOf: "1 Rounder",
      prizeType: "bragging_rights",
      prizeValue: 0,
      numberOfWinners: 1,
      winnerSelection: "highest_votes",
      paidEntryEnabled: false,
      entryFee: 0,
      prizePoolEnabled: false,
      prizePool: 0,
      cashPayoutsEnabled: false,
      submissionDeadline,
      submissionStartAt: challengeSubmissionStartAt,
      registrationDeadline: registrationCloseAt,
      startsAt: challengeSubmissionStartAt,
      endsAt: winnerAnnouncementAt,
      winnerAnnouncementAt,
      votingDeadline: votingReviewCloseAt,
      votingEndsAt: votingReviewCloseAt,
      votingStartsAt: challengeSubmissionStartAt,
      timeZone: form.timeZone,
      coverImageUrl: mediaUploadDisabled ? "" : form.coverImageUrl,
      coverImagePath: mediaUploadDisabled ? "" : form.coverImagePath,
      promoImageUrl: form.promoImageUrl,
      promoImagePath: form.promoImagePath,
      trailerVideoUrl: form.trailerVideoUrl,
      trailerVideoPath: form.trailerVideoPath,
      documentUrls: [form.documentOneUrl, form.documentTwoUrl].filter(Boolean),
      documentPaths: [form.documentOnePath, form.documentTwoPath].filter(Boolean),
      mediaUploadStatus: mediaUploadDisabled ? imageLessPublishingAllowed ? "storage_disabled" : "required" : form.coverImagePath ? "uploaded" : "required",
      mediaStatus: mediaUploadDisabled ? imageLessPublishingAllowed ? "skipped_storage_not_configured" : "required" : form.coverImagePath ? "uploaded" : "required",
      usesPlaceholderMedia: mediaUploadDisabled && imageLessPublishingAllowed,
      mediaFallbackType: mediaUploadDisabled && imageLessPublishingAllowed ? "challenge_suite_placeholder" : "",
      standardRules: form.rules,
      policyTerms: form.terms,
      challengeGuidelines: form.submission,
      privateAccessInstructions: privateMode ? form.access : "",
      privateAccessMethod: privateMode ? "link_and_code" : "",
      privateAccessCode: privateMode ? form.accessCode : "",
      privateAccessCodeExpiresAt: privateMode && form.accessCodeExpiresAt ? challengeDateTimeForStorage(form.accessCodeExpiresAt, form.timeZone) : null,
      privateAccessCodeMaxUses: privateMode && form.accessCodeMaxUses ? Math.max(1, Number(form.accessCodeMaxUses)) : null,
      publicPreviewEnabled: false,
      requiresParticipantApproval: privateMode && form.approvalRequired,
      participantApprovalMode: privateMode && form.approvalRequired ? "manual" : "automatic",
      locationEligibility: privateMode && form.eligibleCountries.trim() ? "selected_countries" : "worldwide",
      eligibleCountries: privateMode ? form.eligibleCountries.split(",").map((value) => value.trim()).filter(Boolean) : [],
      ageRestrictionMode: privateMode && form.minimumAge ? "minimum_age" : "none",
      minimumAge: privateMode && form.minimumAge ? Math.max(0, Number(form.minimumAge)) : 0,
      capacityMode: privateMode && form.maxParticipants ? "limited" : "unlimited",
      maxParticipants: privateMode && form.maxParticipants ? Math.max(0, Number(form.maxParticipants)) : 0,
      waitlistEnabled: privateMode && form.waitlistEnabled,
      hideParticipantList: privateMode && form.hideParticipantList,
      privateParticipantQuestions: privateMode ? (form.participantQuestions ?? "").split("\n").map((value) => value.trim()).filter(Boolean) : [],
      privateParticipantAcknowledgements: privateMode ? (form.participantAcknowledgements ?? "I confirm that my submission is original and follows the challenge rules.").split("\n").map((value) => value.trim()).filter(Boolean) : [],
      requiresSubmissionApproval: privateMode,
      sponsorEnabled: safeSponsorReady,
      sponsorSlots: safeSponsorReady ? 4 : 0,
      minimumSponsorshipAmount: 0,
      sponsorPlacementOptions: safeSponsorReady ? form.sponsorPlacementPreferences : [],
      sponsorPackages: [],
      monetization: {
        enabled: Boolean(safePaidEntryRequested || safeSponsorReady || safePrizePoolRequested || safePaidVotesRequested),
        paidEntryRequested: safePaidEntryRequested,
        entryFeeAmountCents: safePaidEntryRequested ? entryFeeCents : 0,
        currency: "USD",
        sponsorReady: safeSponsorReady,
        prizePoolRequested: safePrizePoolRequested,
        paidVotesRequested: safePaidVotesRequested,
        sponsorshipGoal: safeSponsorReady ? form.sponsorshipGoal.trim() : "",
        preferredSponsorCategory: safeSponsorReady ? form.preferredSponsorCategory.trim() : "",
        sponsorNote: safeSponsorReady ? form.sponsorNote.trim() : "",
        placements: safeSponsorReady ? form.sponsorPlacementPreferences : [],
        status: safePaidEntryRequested || safeSponsorReady || safePrizePoolRequested || safePaidVotesRequested ? "setup_required" : "not_requested",
        paymentActive: false,
        checkoutActive: false,
        ledgerCreationEnabled: false,
        prizeReleaseActive: false,
        payoutReleaseActive: false
      },
      isLiveEvent: false,
      tournamentType: "none",
      votingSettings: { allowFreeVotes: true, allowPaidVotes: true, weightedVotes: false },
      publish
    };
  }

  const localValidation = useMemo(() => validateChallengeForPublish(payload(true) as Record<string, unknown>, { mode: "publish", userId: user?.uid }), [form, mode, user?.uid]);
  const validation = serverValidation ?? localValidation;
  const publishBlocker = getChallengePublishBlocker({
    authenticated: Boolean(user?.uid),
    ownsChallenge: true,
    status: draftStatus,
    planAllowsChallenge: !privateLocked && !freeLimitReached && (!monetizedIntent || monetizationEligible),
    validation,
    mediaMissing: mediaPublicationBlocked || requiredImageMissing,
    mediaProcessing: uploadInProgress,
    mediaFailed: uploadFailed,
    paidEntryRequested: form.paidEntryEnabled,
    entryFeeValid: !form.paidEntryEnabled || entryFeeCents >= 500
  });
  const publishBlocked = Boolean(publishBlocker);
  const publishLabel = "Submit for Review";

  function validateStep() {
    if (step === 0 && (!form.title.trim() || !form.category || form.description.trim().length < 20)) return "Add title, category, and a clear description.";
    if (mode === "private" && step === 1 && (!/^[A-HJ-NP-Z2-9]{5}$/.test(form.accessCode) || !form.access.trim())) return "Generate an access code and add access instructions.";
    if (step === (mode === "private" ? 2 : 1) && (!form.rules.trim() || !form.terms.trim())) return "Rules and eligibility terms are required.";
    if (mode === "private" && step === 2 && ((form.minimumAge && Number(form.minimumAge) < 13) || (form.maxParticipants && Number(form.maxParticipants) < 2))) return "Set a valid minimum age and participant capacity.";
    if (mode === "private" && step === 2 && !(form.participantAcknowledgements ?? "I confirm that my submission is original and follows the challenge rules.").trim()) return "Add at least one participant acknowledgment.";
    if (step === (mode === "private" ? 6 : 2) && (!form.submissionTypes.length || !form.submission.trim())) return "Submission type and instructions are required.";
    if (step === (mode === "private" ? 3 : 4) && monetizationProblem) return monetizationProblem;
    if (step === (mode === "private" ? 4 : 5) && requiredImageMissing) return "Add at least one challenge image to continue.";
    return "";
  }

  async function next() {
    const problem = validateStep();
    if (problem) return setError(problem);
    if (mode === "private" && step === 0 && !activeDraftId) {
      const saved = await saveDraft();
      if (!saved) return;
    }
    setStep((value) => {
      const nextStep = Math.min(value + 1, steps.length - 1);
      setUnlockedStep((current) => Math.max(current, nextStep));
      return nextStep;
    });
  }

  async function saveDraft() {
    if (privateLocked) return setError("Private challenge drafts require Creator Plan.");
    setSaving(true);
    const response = activeDraftId ? await updateChallengeDraft(activeDraftId, { ...payload(false), creationStep: step }) : await createChallenge(payload(false));
    setSaving(false);
    if (!response.ok) {
      setError(response.message || "Draft could not be saved.");
      return false;
    }
    const savedChallenge = response.data?.challenge as { id?: string } | undefined;
    if (!activeDraftId && savedChallenge?.id) setCreatedDraftId(savedChallenge.id);
    setAutosaveState("saved");
    try { window.localStorage.removeItem(recoveryKey); } catch {}
    setNotice("Draft saved.");
    return true;
  }

  async function publish() {
    if (publishBlocker) return setError(publishBlocker.message);
    autosaveVersionRef.current += 1;
    setSaving(true);
    if (activeDraftId) {
      const saveResponse = await updateChallengeDraft(activeDraftId, { ...payload(false), creationStep: step });
      if (!saveResponse.ok) {
        setSaving(false);
        return setError("Your latest changes could not be saved. Please try again.");
      }
    }
    const response = activeDraftId ? await publishChallengeDraft(activeDraftId, { ...payload(true), creationStep: step }) : await createChallenge(payload(true));
    setSaving(false);
    if (!response.ok) {
      const nextValidation = (response as { details?: { publishValidation?: ChallengeValidationResult } }).details?.publishValidation;
      if (nextValidation) setServerValidation(nextValidation);
      return setError(challengePublishError(response));
    }
    const challenge = response.data?.challenge as { id?: string } | undefined;
    try { window.localStorage.removeItem(recoveryKey); } catch {}
    setCreatedId(challenge?.id ?? activeDraftId ?? "");
    setDraftStatus("pending_review");
    setError("");
    setAutosaveState("idle");
  }

  if (loading || !draftLoaded) return <AppShell><Card className="mx-auto max-w-5xl p-8"><PageTitle title="Challenge Builder" subtitle="Loading builder..." /></Card></AppShell>;
  if (user?.accountType === "sponsor") return <Locked title="Use Brand Command Center" body="Sponsor accounts create and manage campaigns from the dedicated sponsor experience." primaryHref="/sponsor/dashboard" primaryLabel="Open Brand Command Center" />;
  if (privateLocked) return <Locked title="Private challenges are available on Creator Plan" body="Upgrade to create invite-only challenges and manage private competition access." primaryHref="/subscriptions" primaryLabel="View Plans" secondaryHref="/creator/private-challenges" secondaryLabel="Back to Private Challenges" />;
  if (createdId) return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><h1 className="mt-6 text-3xl font-black">Challenge submitted for review.</h1><p className="mt-3 text-slate-300">We'll notify you when it's approved.</p><div className="mt-8 grid gap-3 sm:flex sm:justify-center"><LinkButton href={"/challenges/" + createdId}>View Challenge</LinkButton><LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton><LinkButton href="/challenges/create" variant="secondary">Create Another Challenge</LinkButton></div></Card></AppShell>;

  if (mode === "private") {
    const guide = privateStepGuides[step] ?? privateStepGuides[0];
    return <AppShell><main className="mx-auto w-full max-w-[1560px] px-4 py-7 sm:px-6 lg:px-8" data-private-builder-canonical-shell><PageTitle title="Create Challenge" subtitle="Build your Private Challenge one step at a time." /><ChallengeBuilderFrame steps={privateSteps} currentStep={step} unlockedStep={unlockedStep} guide={guide} guideOpen={mobileGuideOpen} setGuideOpen={setMobileGuideOpen} onStepChange={setStep}><BuilderSurface><BuilderContent><StepContent mode={mode} step={step} form={form} update={update} toggleType={toggleType} togglePlacement={togglePlacement} updateMedia={updateMedia} track={track} userId={user?.uid ?? "anonymous"} planAccess={planAccess} planName={planExperience.badgeLabel} monetizationEligible={monetizationEligible} entryFeeCents={entryFeeCents} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} draftId={activeDraftId} />{error ? <div className="mt-7"><ApiErrorPanel title="Check this step" message={error} onRetry={() => setError("")} /></div> : null}</BuilderContent><BuilderFooter backDisabled={step === 0} busy={saving} finishLater={activeDraftId ? () => void saveDraft() : undefined} onBack={() => setStep((value) => Math.max(0, value - 1))} onContinue={() => step < privateSteps.length - 1 ? void next() : void publish()} final={step === privateSteps.length - 1} finalDisabled={step === privateSteps.length - 1 && publishBlocked} /></BuilderSurface></ChallengeBuilderFrame></main></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1440px]" data-mobile-creator-builder>
        <PageTitle title={steps[step]} subtitle={mode === "public" ? publicStepSubtitles[step] : `Complete the ${steps[step].toLowerCase()} details for this private challenge.`} />
        <div className="mt-7 grid gap-7 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:h-fit"><Stepper steps={steps} current={step} onSelect={setStep} /></aside>
          <div className="min-w-0">
            {isFreePublic ? <Card className="mb-6 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-4 text-sm text-slate-300"><b className="text-white">Free Basic builder.</b> Public, non-monetized challenges are available up to three lifetime publishes. Used: {freeUsage.loaded ? freeUsage.used : "..."} of {freeUsage.limit}.</Card> : null}
            <div className="grid gap-7 2xl:grid-cols-[minmax(0,1fr)_280px]"><Card className="p-4 sm:p-6 lg:p-8"><StepContent mode={mode} step={step} form={form} update={update} toggleType={toggleType} togglePlacement={togglePlacement} updateMedia={updateMedia} track={track} userId={user?.uid ?? "anonymous"} planAccess={planAccess} planName={planExperience.badgeLabel} monetizationEligible={monetizationEligible} entryFeeCents={entryFeeCents} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} draftId={draftId} /></Card><Helper mode={mode} step={step} /></div>
          </div>
        </div>
        {error ? <ApiErrorPanel title="Challenge could not be submitted" message={error} onRetry={() => setError("")} /> : null}{notice ? <p className="mt-5 rounded-[8px] bg-emerald-950/40 p-4 text-emerald-200">{notice}</p> : null}{step === steps.length - 1 ? <Checklist readiness={validation} blocker={publishBlocker} mediaUploadDisabled={mediaUploadDisabled && imageLessPublishingAllowed} className="mt-5" /> : <Card className="mt-5 flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm font-black text-white">Step {step + 1} of {steps.length}</span><span className="text-sm text-slate-400">{validation.missingCount} requirement{validation.missingCount === 1 ? "" : "s"} remaining</span></Card>}
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-white/10 pt-6"><Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(value - 1, 0))}>Back</Button>{step < steps.length - 1 ? <Button onClick={next}>Continue</Button> : <Button onClick={publish} disabled={saving || publishBlocked}>{saving ? "Submitting..." : publishLabel}</Button>}</div>
      </div>
    </AppShell>
  );
}

function Locked({ title, body, primaryHref, primaryLabel, secondaryHref, secondaryLabel }: { title: string; body: string; primaryHref: string; primaryLabel: string; secondaryHref?: string; secondaryLabel?: string }) {
  return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><LockKeyhole className="mx-auto h-14 w-14 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black">{title}</h1><p className="mt-3 text-slate-300">{body}</p><div className="mt-7 grid gap-3 sm:flex sm:justify-center"><LinkButton href={primaryHref}>{primaryLabel}</LinkButton>{secondaryHref && secondaryLabel ? <LinkButton href={secondaryHref} variant="secondary">{secondaryLabel}</LinkButton> : null}</div></Card></AppShell>;
}

function Stepper({ steps, current, onSelect }: { steps: string[]; current: number; onSelect: (step: number) => void }) {
  const stepButtons = <div className="grid gap-2">{steps.map((label, index) => <button key={label} type="button" onClick={() => onSelect(index)} className={(index === current ? "border-[var(--gold)] bg-[var(--gold)] text-black" : index < current ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-[#171717] text-slate-400") + " flex min-h-14 w-full items-center gap-3 rounded-[8px] border px-4 py-3 text-left text-sm font-black"}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/20">{index < current ? "Done" : index + 1}</span><span className="min-w-0 break-words">{label}</span></button>)}</div>;
  return <><details className="rounded-[8px] border border-white/10 bg-[#111] p-3 lg:hidden" data-mobile-builder-stepper><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-black"><span>Step {current + 1} of {steps.length}</span><span className="min-w-0 text-right text-sm text-[var(--gold)]">{steps[current]}</span></summary><div className="mt-3">{stepButtons}</div></details><Card className="hidden p-3 lg:block">{stepButtons}</Card></>;
}

function StepTitle({ title, body }: { title: string; body: string }) { return <BuilderStepHeading title={title} body={body} />; }

function StepContent({ mode, step, form, update, toggleType, togglePlacement, updateMedia, track, userId, planAccess, planName, monetizationEligible, entryFeeCents, mediaUploadDisabled, mediaUploadDisabledReason, draftId }: { mode: Mode; step: number; form: FormState; update: (field: keyof FormState, value: FormState[keyof FormState]) => void; toggleType: (type: string) => void; togglePlacement: (surface: string) => void; updateMedia: (urlField: keyof FormState, pathField: keyof FormState, url: string, metadata?: { path: string }) => void; track: (field: string) => (status: MediaUploadStage) => void; userId: string; planAccess: ReturnType<typeof getUserPlanAccess>; planName: string; monetizationEligible: boolean; entryFeeCents: number; mediaUploadDisabled: boolean; mediaUploadDisabledReason: string; draftId?: string }) {
  const privateOffset = mode === "private" ? 1 : 0;
  const contentStep = mode === "private" && step >= 3 ? step + 1 : step;
  if (mode === "private" && step === 2) return <PrivateEligibilityStep form={form} update={update} />;
  if (mode === "private" && step === 1) return <section><StepTitle title="Access" body="Private challenges use a forwardable link plus a server-verified code." /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Access method"><input className={inputClass} value="Link + Code" disabled /></Field><Field label="Generated access code"><div className="flex flex-col gap-3 sm:flex-row"><input className={inputClass} value={form.accessCode} readOnly aria-label="Generated private challenge access code" /><Button type="button" variant="secondary" onClick={() => update("accessCode", generatePrivateChallengeAccessCode())}><RefreshCw size={16} /> Regenerate</Button></div></Field><Field label="Code expires (optional)"><input className={inputClass} type="datetime-local" value={form.accessCodeExpiresAt} onChange={(event) => update("accessCodeExpiresAt", event.target.value)} /></Field><Field label="Invitation capacity (optional)"><input className={inputClass} type="number" min="1" value={form.accessCodeMaxUses} onChange={(event) => update("accessCodeMaxUses", event.target.value)} placeholder="No fixed invitation limit" /></Field></div><div className="mt-5"><Field label="Access instructions"><textarea className={textareaClass} value={form.access} onChange={(event) => update("access", event.target.value)} placeholder="Tell invited participants how to use the link and code." /></Field></div><Card className="mt-5 border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-300"><b className="text-white">Share link:</b> {draftId ? `/challenges/${draftId}/access` : "Save the draft to create a shareable access link."}<p className="mt-2 text-slate-400">Links may be forwarded. Every participant must still verify the code and satisfy eligibility rules.</p></Card></section>;
  if (mode === "private" && step === 2) return <section><StepTitle title="Eligibility" body="Access verification and participant eligibility are enforced separately." /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Join mode"><select className={inputClass} value={form.approvalRequired ? "approval" : "automatic"} onChange={(event) => update("approvalRequired", event.target.value === "approval")}><option value="automatic">Anyone eligible can join</option><option value="approval">Approval required</option></select></Field><Field label="Location eligibility"><select className={inputClass} value={form.eligibleCountries ? "selected" : "worldwide"} onChange={(event) => update("eligibleCountries", event.target.value === "selected" ? "US" : "")}><option value="worldwide">Worldwide</option><option value="selected">Selected countries</option></select></Field>{form.eligibleCountries ? <Field label="Eligible country codes"><input className={inputClass} value={form.eligibleCountries} onChange={(event) => update("eligibleCountries", event.target.value.toUpperCase())} placeholder="US, CA, GB" /></Field> : null}<Field label="Minimum age"><input className={inputClass} type="number" min="13" max="120" value={form.minimumAge} onChange={(event) => update("minimumAge", event.target.value)} placeholder="No minimum age" /></Field><Field label="Participant capacity"><input className={inputClass} type="number" min="2" value={form.maxParticipants} onChange={(event) => update("maxParticipants", event.target.value)} placeholder="Unlimited" /></Field><label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-white/10 px-4"><input type="checkbox" checked={form.waitlistEnabled} onChange={(event) => update("waitlistEnabled", event.target.checked)} /><span><b>Enable waitlist</b><small className="block text-slate-400">Available when a fixed capacity is reached.</small></span></label><label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-white/10 px-4"><input type="checkbox" checked={form.hideParticipantList} onChange={(event) => update("hideParticipantList", event.target.checked)} /><span><b>Hide participant list</b><small className="block text-slate-400">Participant identities remain private from other participants.</small></span></label></div><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Challenge rules"><textarea className={textareaClass} value={form.rules} onChange={(event) => update("rules", event.target.value)} /></Field><Field label="Eligibility terms"><textarea className={textareaClass} value={form.terms} onChange={(event) => update("terms", event.target.value)} /></Field></div></section>;
  if (mode === "private" && contentStep === 4) return <MonetizationStep form={form} update={update} togglePlacement={togglePlacement} planAccess={planAccess} planName={planName} monetizationEligible={monetizationEligible} entryFeeCents={entryFeeCents} draftId={draftId} />;
  if (mode === "private" && contentStep === 5) return <MediaBrandingStep form={form} userId={userId} updateMedia={updateMedia} track={track} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} />;
  if (mode === "private" && contentStep === 6) return <PrivateScheduleStep form={form} update={update} />;
  if (mode === "private" && contentStep === 7) return <PrivateSubmissionStep form={form} update={update} toggleType={toggleType} />;
  if (mode === "private" && contentStep === 8) return <PrivateReview form={form} planName={planName} mediaUploadDisabled={mediaUploadDisabled} entryFeeCents={entryFeeCents} monetizationEligible={monetizationEligible} />;
  if (mode === "private" && contentStep === 9) return <section><StepTitle title="Publish" body="Submit this private challenge for admin review. Private access does not bypass platform moderation." /><div className="mt-6 rounded-[8px] border border-[var(--gold)]/25 bg-[var(--gold)]/5 p-6"><h3 className="text-xl font-black">Ready to submit for review</h3><p className="mt-2 text-sm leading-6 text-slate-600">Your challenge remains unavailable to participants until it is approved. The access code is never included in public discovery data.</p></div></section>;
  if (step === 0) return <section><StepTitle title="Overview" body={mode === "private" ? "Set the private challenge brief and visibility." : "Set the public challenge brief and discovery details."} /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label={mode === "private" ? "Private challenge title" : "Challenge title"}><input className={inputClass} value={form.title} maxLength={120} onChange={(e) => update("title", e.target.value)} placeholder="Name the challenge" /></Field><Field label="Category"><select className={inputClass} value={form.category} onChange={(e) => update("category", e.target.value)}><option value="">Select category</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></Field></div><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Visibility"><input className={inputClass} value={mode === "private" ? "Private / invite-only" : "Public"} disabled /></Field><Field label="Short description"><input className={inputClass} value={form.shortDescription} maxLength={160} onChange={(e) => update("shortDescription", e.target.value)} /></Field></div><div className="mt-5"><Field label="Detailed description"><textarea className={textareaClass} value={form.description} maxLength={2000} onChange={(e) => update("description", e.target.value)} /></Field></div></section>;
  if (mode === "private" && step === 1) return <section><StepTitle title="Access Code" body="Challenge Suite generates the code. Share it only with people you want to admit." /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Generated access code"><div className="flex gap-3"><input className={inputClass} value={form.accessCode} readOnly aria-label="Generated private challenge access code" /><Button type="button" variant="secondary" onClick={() => update("accessCode", generatePrivateChallengeAccessCode())}><RefreshCw size={16} /> Regenerate</Button></div></Field><Field label="Code expires (optional)"><input className={inputClass} type="datetime-local" value={form.accessCodeExpiresAt} onChange={(e) => update("accessCodeExpiresAt", e.target.value)} /></Field><Field label="Maximum uses (optional)"><input className={inputClass} type="number" min="1" value={form.accessCodeMaxUses} onChange={(e) => update("accessCodeMaxUses", e.target.value)} /></Field><label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-white/10 px-4"><input type="checkbox" checked={form.publicPreviewEnabled} onChange={(e) => update("publicPreviewEnabled", e.target.checked)} /><span><b>Public preview</b><small className="block text-slate-400">Show safe challenge details on Explore without exposing the code.</small></span></label></div><div className="mt-5"><Field label="Access instructions"><textarea className={textareaClass} value={form.access} onChange={(e) => update("access", e.target.value)} /></Field></div></section>;
  if (step === 1 + privateOffset) return <section><StepTitle title="Rules & Eligibility" body="Define fair participation terms before entries open." /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Challenge rules"><textarea className={textareaClass} value={form.rules} onChange={(e) => update("rules", e.target.value)} /></Field><Field label="Eligibility terms"><textarea className={textareaClass} value={form.terms} onChange={(e) => update("terms", e.target.value)} /></Field></div></section>;
  if (step === 2 + privateOffset) return <section><StepTitle title="Entry & Submission" body="Tell participants exactly what to submit." /><div className="mt-6 grid gap-3 sm:grid-cols-2">{["image", "video"].map((type) => <label key={type} className="flex min-h-14 items-center gap-3 rounded-[8px] border border-white/10 bg-[#181818] px-4 py-4 font-bold"><input type="checkbox" checked={form.submissionTypes.includes(type)} onChange={() => toggleType(type)} /> {type === "image" ? "Image upload" : "Video upload"}</label>)}</div><div className="mt-5"><Field label="Submission instructions"><textarea className={textareaClass} value={form.submission} onChange={(e) => update("submission", e.target.value)} /></Field></div><Card className="mt-5 border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">Uploads are ready when the progress indicator shows complete.</Card></section>;
  if (step === 3 + privateOffset) return <section>
    <StepTitle title={mode === "private" ? "Timeline" : "Voting & Timeline"} body="Keep entry, voting, and announcement dates clear." />
    <div className="mt-6 max-w-xl">
      <Field label="Challenge timezone">
        <select className={inputClass} value={form.timeZone} onChange={(event) => update("timeZone", event.target.value)}>
          {CHALLENGE_TIME_ZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.value}</option>)}
        </select>
        <p className="mt-2 text-xs text-slate-400">All challenge times will be shown in the selected timezone.</p>
      </Field>
    </div>
    <div className="mt-6 grid gap-5 md:grid-cols-2">
      <Field label="Registration or invite close"><input className={inputClass} type="datetime-local" value={form.registrationDeadline} onChange={(e) => update("registrationDeadline", e.target.value)} /></Field>
      <Field label="Challenge/Submissions start"><input className={inputClass} type="datetime-local" value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} /></Field>
      <Field label="Submission deadline"><input className={inputClass} type="datetime-local" value={form.submissionDeadline} onChange={(e) => update("submissionDeadline", e.target.value)} /></Field>
      <Field label="Voting or review closes"><input className={inputClass} type="datetime-local" value={form.votingDeadline} onChange={(e) => update("votingDeadline", e.target.value)} /></Field>
      <Field label="Winner announcement"><input className={inputClass} type="datetime-local" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} /></Field>
    </div>
  </section>;
  if (mode === "private" && step === 5) return <section><StepTitle title="Voting / Judging" body="Choose only currently supported review rules. Access does not bypass voting eligibility." /><div className="mt-6 grid gap-4 md:grid-cols-2"><Card className="p-5"><b>Free voting</b><p className="mt-2 text-sm text-slate-400">One eligible free vote follows the existing challenge voting rules.</p></Card><Card className="p-5"><b>Submission approval</b><p className="mt-2 text-sm text-slate-400">Private submissions require approval before they can appear publicly.</p></Card></div></section>;
  if (step === (mode === "private" ? 6 : 4)) return <MonetizationStep form={form} update={update} togglePlacement={togglePlacement} planAccess={planAccess} planName={planName} monetizationEligible={monetizationEligible} entryFeeCents={entryFeeCents} draftId={draftId} />;
  if (mode === "private" && step === 7) return <MediaBrandingStep form={form} userId={userId} updateMedia={updateMedia} track={track} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} />;
  if (mode === "public" && step === 5) return <MediaBrandingStep form={form} userId={userId} updateMedia={updateMedia} track={track} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} />;
  const timelineSummary = {
    "Registration Close": formatChallengeLocalDateTime(form.registrationDeadline, form.timeZone) ?? "Not set",
    "Challenge/Submissions Start": formatChallengeLocalDateTime(form.startsAt, form.timeZone) ?? "Not set",
    "Submission Deadline": formatChallengeLocalDateTime(form.submissionDeadline, form.timeZone) ?? "Not set",
    "Voting/Review Close": formatChallengeLocalDateTime(form.votingDeadline, form.timeZone) ?? "Not set",
    "Winner Announcement": formatChallengeLocalDateTime(form.endsAt, form.timeZone) ?? "Not set"
  };
  const reviewLabels = challengeReviewMonetizationLabels({ monetizationAllowed: monetizationEligible, paidEntryRequested: form.paidEntryEnabled, entryFeeValid: !form.paidEntryEnabled || entryFeeCents >= 500, sponsorReady: form.sponsorReady, prizePoolRequested: form.prizePoolEnabled, confirmedPrizeFundingCents: form.confirmedCreatorPrizeFundingCents });
  return <section><StepTitle title={mode === "private" ? "Review & Submit" : "Review & Publish"} body="Check the challenge before submitting it for review." /><div className="mt-6 grid gap-4 md:grid-cols-2">{Object.entries({ Title: form.title || "Not set", Category: form.category || "Not set", Visibility: mode === "private" ? form.publicPreviewEnabled ? "Private with public preview" : "Private / hidden" : "Public", ...(mode === "private" ? { Access: "Link + Code configured" } : {}), "Submission Types": form.submissionTypes.join(", "), ...timelineSummary, Plan: mode === "private" ? "Creator Plan" : planName, Media: mediaUploadDisabled ? "Optional while uploads are unavailable" : form.coverImageUrl ? "Ready" : "Required", "Paid Entry": reviewLabels.paidEntry, "Sponsor Ready": reviewLabels.sponsorReady, "Prize Pool": reviewLabels.prizePool }).map(([label, value]) => <Card key={label} className="p-4"><div className="text-sm font-bold text-slate-400">{label}</div><div className="mt-1 break-words text-base font-black text-white">{String(value)}</div></Card>)}</div><Card className="mt-5 p-4 text-sm leading-6 text-slate-300"><b className="text-white">Review checklist:</b> Check the details below, then submit your challenge for review.</Card></section>;
}

function PrivateEligibilityStep({ form, update }: { form: FormState; update: (field: keyof FormState, value: FormState[keyof FormState]) => void }) {
  return <section><StepTitle title="Eligibility" body="Access verification and participant eligibility are enforced separately." /><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Join mode"><select className={inputClass} value={form.approvalRequired ? "approval" : "automatic"} onChange={(event) => update("approvalRequired", event.target.value === "approval")}><option value="automatic">Anyone eligible can join</option><option value="approval">Approval required</option></select></Field><Field label="Location eligibility"><select className={inputClass} value={form.eligibleCountries ? "selected" : "worldwide"} onChange={(event) => update("eligibleCountries", event.target.value === "selected" ? "US" : "")}><option value="worldwide">Worldwide</option><option value="selected">Selected countries</option></select></Field>{form.eligibleCountries ? <Field label="Eligible country codes"><input className={inputClass} value={form.eligibleCountries} onChange={(event) => update("eligibleCountries", event.target.value.toUpperCase())} placeholder="US, CA, GB" /></Field> : null}<Field label="Minimum age"><input className={inputClass} type="number" min="13" max="120" value={form.minimumAge} onChange={(event) => update("minimumAge", event.target.value)} placeholder="No minimum age" /></Field><Field label="Participant capacity"><input className={inputClass} type="number" min="2" value={form.maxParticipants} onChange={(event) => update("maxParticipants", event.target.value)} placeholder="Unlimited" /></Field><label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-black/10 px-4"><input type="checkbox" checked={form.waitlistEnabled} onChange={(event) => update("waitlistEnabled", event.target.checked)} /><span><b>Enable waitlist</b><small className="block text-slate-500">Available when a fixed capacity is reached.</small></span></label><label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-black/10 px-4"><input type="checkbox" checked={form.hideParticipantList} onChange={(event) => update("hideParticipantList", event.target.checked)} /><span><b>Hide participant list</b><small className="block text-slate-500">Participant identities remain private from other participants.</small></span></label></div><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Challenge rules"><textarea className={textareaClass} value={form.rules} onChange={(event) => update("rules", event.target.value)} /></Field><Field label="Eligibility terms"><textarea className={textareaClass} value={form.terms} onChange={(event) => update("terms", event.target.value)} /></Field><Field label="Application questions (optional, one per line)"><textarea className={textareaClass} value={form.participantQuestions ?? ""} onChange={(event) => update("participantQuestions", event.target.value)} /></Field><Field label="Required acknowledgments (one per line)"><textarea className={textareaClass} value={form.participantAcknowledgements ?? "I confirm that my submission is original and follows the challenge rules."} onChange={(event) => update("participantAcknowledgements", event.target.value)} /></Field></div><div className="mt-5 rounded-[8px] bg-slate-50 p-4 text-sm leading-6 text-slate-600">Responses are available only to authorized challenge managers and reviewers. Do not request unnecessary sensitive information.</div></section>;
}

function PrivateScheduleStep({ form, update }: { form: FormState; update: (field: keyof FormState, value: FormState[keyof FormState]) => void }) {
  return <section><StepTitle title="Schedule" body="Set the Join, Submit, Vote, and Results lifecycle in the selected timezone." /><div className="mt-6 max-w-xl"><Field label="Challenge timezone"><select className={inputClass} value={form.timeZone} onChange={(event) => update("timeZone", event.target.value)}>{CHALLENGE_TIME_ZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.value}</option>)}</select><p className="mt-2 text-xs text-slate-500">All challenge times will be shown in the selected timezone.</p></Field></div><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="Join closes"><input className={inputClass} type="datetime-local" value={form.registrationDeadline} onChange={(event) => update("registrationDeadline", event.target.value)} /></Field><Field label="Submissions open"><input className={inputClass} type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /></Field><Field label="Submissions close"><input className={inputClass} type="datetime-local" value={form.submissionDeadline} onChange={(event) => update("submissionDeadline", event.target.value)} /></Field><Field label="Voting closes"><input className={inputClass} type="datetime-local" value={form.votingDeadline} onChange={(event) => update("votingDeadline", event.target.value)} /></Field><Field label="Results"><input className={inputClass} type="datetime-local" value={form.endsAt} onChange={(event) => update("endsAt", event.target.value)} /></Field></div></section>;
}

function PrivateSubmissionStep({ form, update, toggleType }: { form: FormState; update: (field: keyof FormState, value: FormState[keyof FormState]) => void; toggleType: (type: string) => void }) {
  return <section><StepTitle title="Entry & Submission" body="Choose accepted media and give participants precise submission instructions." /><div className="mt-6 grid gap-3 sm:grid-cols-2">{["image", "video"].map((type) => <label key={type} className="flex min-h-14 items-center gap-3 rounded-[8px] border border-black/10 bg-slate-50 px-4 py-4 font-bold"><input type="checkbox" checked={form.submissionTypes.includes(type)} onChange={() => toggleType(type)} /> {type === "image" ? "Image" : "Video"}</label>)}</div><div className="mt-5"><Field label="Submission instructions"><textarea className={textareaClass} value={form.submission} onChange={(event) => update("submission", event.target.value)} /></Field></div><div className="mt-5 rounded-[8px] bg-slate-50 p-4 text-sm text-slate-600">Fix & Resubmit remains available through the canonical submission moderation workflow.</div></section>;
}

function PrivateReview({ form, planName, mediaUploadDisabled, entryFeeCents, monetizationEligible }: { form: FormState; planName: string; mediaUploadDisabled: boolean; entryFeeCents: number; monetizationEligible: boolean }) {
  const labels = challengeReviewMonetizationLabels({ monetizationAllowed: monetizationEligible, paidEntryRequested: form.paidEntryEnabled, entryFeeValid: !form.paidEntryEnabled || entryFeeCents >= 500, sponsorReady: form.sponsorReady, prizePoolRequested: form.prizePoolEnabled, confirmedPrizeFundingCents: form.confirmedCreatorPrizeFundingCents });
  const summary = {
    Overview: `${form.title || "Not set"} · ${form.category || "Category not set"}`,
    Access: `Link + Code · Code configured · ${form.accessCodeMaxUses ? `${form.accessCodeMaxUses} invitation uses` : "No fixed invitation capacity"}`,
    Eligibility: `${form.approvalRequired ? "Approval required" : "Automatic eligible entry"} · ${form.eligibleCountries || "Worldwide"} · ${form.maxParticipants ? `${form.maxParticipants} participant limit` : "Unlimited participants"}`,
    Monetization: `${labels.paidEntry} · ${labels.prizePool} · ${labels.sponsorReady}`,
    Media: mediaUploadDisabled ? "Optional while uploads are unavailable" : form.coverImageUrl ? "Primary media ready" : "Primary media required",
    Schedule: `${formatChallengeLocalDateTime(form.startsAt, form.timeZone) ?? "Start not set"} to ${formatChallengeLocalDateTime(form.endsAt, form.timeZone) ?? "results not set"}`,
    Submission: `${form.submissionTypes.join(" or ") || "Type not set"} · ${form.submission ? "Instructions ready" : "Instructions missing"}`,
    Plan: planName
  };
  return <section><StepTitle title="Review" body="Review every private challenge section before moving to final submission." /><div className="mt-6 grid gap-4 md:grid-cols-2">{Object.entries(summary).map(([label, value]) => <Card key={label} className="p-4"><p className="text-sm font-bold text-slate-400">{label}</p><p className="mt-2 break-words font-black text-white">{value}</p></Card>)}</div><Card className="mt-5 border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">The access code is intentionally masked in Review. Return to Access to view or regenerate it.</Card></section>;
}

function MonetizationStep({ form, update, togglePlacement, planAccess, planName, monetizationEligible, entryFeeCents, draftId }: { form: FormState; update: (field: keyof FormState, value: FormState[keyof FormState]) => void; togglePlacement: (surface: string) => void; planAccess: ReturnType<typeof getUserPlanAccess>; planName: string; monetizationEligible: boolean; entryFeeCents: number; draftId?: string }) {
  const entryFeeEstimate = form.paidEntryEnabled && entryFeeCents >= 500 ? {
    winnerPool: Math.floor(entryFeeCents * 0.65),
    creator: Math.floor(entryFeeCents * 0.2),
    platform: entryFeeCents - Math.floor(entryFeeCents * 0.65) - Math.floor(entryFeeCents * 0.2)
  } : null;
  return <section>
    <StepTitle title="Monetization & Prize Pool" body="Choose how this challenge can be funded. Paid features require payment setup, admin review, and payout rules before they can go live." />
    {!monetizationEligible ? <Card className="mt-6 border-yellow-500/25 bg-yellow-500/5 p-5 text-sm leading-6 text-yellow-50"><LockKeyhole className="mb-2 text-[var(--gold)]" size={18} /><b>Monetized challenges are available to Creator, Host, and approved Enterprise accounts.</b><br />Free Basic challenges remain public, non-prize, and non-monetized.</Card> : <Card className="mt-6 border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-slate-300"><b className="text-white">{planName} monetization options.</b><br />Paid entry, prizes, and sponsor-ready requests are reviewed before activation.</Card>}
    <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5">
        <MonetizationCard title="Enable Paid Entry" enabled={form.paidEntryEnabled} disabled={!monetizationEligible} onChange={(enabled) => update("paidEntryEnabled", enabled)} setupCopy="Paid entry can be submitted for review now and activates only after payment setup is approved.">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
            <Field label="Entry fee amount"><input className={inputClass} type="number" min="5" step="1" value={form.entryFeeAmount} disabled={!form.paidEntryEnabled || !monetizationEligible} onChange={(event) => update("entryFeeAmount", event.target.value)} placeholder="5" /></Field>
            <Field label="Currency"><input className={inputClass} value={form.entryCurrency} disabled /></Field>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-400">Minimum entry fee is $5. USD is used until multi-currency checkout is connected.</p>
          {form.paidEntryEnabled && entryFeeCents > 0 && entryFeeCents < 500 ? <p className="mt-2 rounded-[8px] bg-red-950/40 p-3 text-sm text-red-200">Entry fee must be at least $5.</p> : null}
        </MonetizationCard>
        <MonetizationCard title="Make this challenge Sponsor Ready" enabled={form.sponsorReady} disabled={!monetizationEligible} onChange={(enabled) => update("sponsorReady", enabled)} setupCopy="Sponsor-ready challenges can appear in Sponsor Discovery after publish. Confirmed sponsor funds remain separate from generated revenue and stay directed to their approved sponsor purpose.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Sponsorship goal"><input className={inputClass} value={form.sponsorshipGoal} disabled={!form.sponsorReady || !monetizationEligible} onChange={(event) => update("sponsorshipGoal", event.target.value)} placeholder="Increase the winner prize pool" /></Field>
            <Field label="Preferred sponsor category"><input className={inputClass} value={form.preferredSponsorCategory} disabled={!form.sponsorReady || !monetizationEligible} onChange={(event) => update("preferredSponsorCategory", event.target.value)} placeholder="Fitness, beauty, gaming..." /></Field>
          </div>
          <Field label="Sponsor note"><textarea className={textareaClass} value={form.sponsorNote} disabled={!form.sponsorReady || !monetizationEligible} onChange={(event) => update("sponsorNote", event.target.value)} placeholder="Tell sponsors what kind of brand fit makes sense." /></Field>
          <div><p className="text-sm font-bold text-slate-300">Sponsor visibility placements</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{SPONSOR_PLACEMENTS.map((surface) => <label key={surface} className="flex items-center gap-3 rounded-[8px] border border-white/10 bg-black/25 p-3 text-sm font-bold text-slate-300"><input type="checkbox" disabled={!form.sponsorReady || !monetizationEligible} checked={form.sponsorPlacementPreferences.includes(surface)} onChange={() => togglePlacement(surface)} /> {sponsorPlacementLabels[surface]}</label>)}</div></div>
        </MonetizationCard>
        <MonetizationCard title="Enable Prize Pool" enabled={form.prizePoolEnabled} disabled={!monetizationEligible} onChange={(enabled) => update("prizePoolEnabled", enabled)} setupCopy="Prize pools use creator funding, confirmed entry-fee allocations, confirmed sponsor contributions, or approved platform funding. Viewer contributions are not accepted.">
          <ul className="space-y-2 text-sm leading-6 text-slate-300">
            <li>- Approved sources: creator funding, confirmed entry-fee allocation, confirmed sponsor funding, or approved platform funding.</li><li>- Confirmed generated revenue is split 65% to winners, 20% to the creator, and 15% to Challenge Suite.</li><li>- Confirmed sponsor funding stays outside the split and remains 100% directed to its approved prize or operating purpose.</li><li>- Prize release requires approved winners and the 24-hour dispute hold.</li>
          </ul>
          {!form.paidEntryEnabled && !form.sponsorReady ? <div className="rounded-[8px] border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-300">
            {form.confirmedCreatorPrizeFundingCents > 0 ? <><p className="font-black text-emerald-200">Creator funding confirmed</p><p>{formatCents(form.confirmedCreatorPrizeFundingCents)} is reserved for the winner pool.</p></> : <><p className="font-black text-white">Prize funding review</p><p>You can submit the challenge for review now. Prize activation remains unavailable until a funding source is confirmed.</p>{draftId ? <LinkButton className="mt-3" href={"/challenges/" + draftId + "/prize-funding"}>Review Prize Funding</LinkButton> : <p className="mt-2 font-bold text-yellow-100">Save Draft to review funding options.</p>}</>}
          </div> : <p className="rounded-[8px] border border-white/10 bg-black/25 p-4 text-sm text-slate-300">This prize pool grows only from confirmed eligible revenue. Estimates do not create funds.</p>}
        </MonetizationCard>
        <MonetizationCard title="Enable Paid Votes" enabled={form.paidVotesEnabled} disabled={!monetizationEligible} onChange={(enabled) => update("paidVotesEnabled", enabled)} setupCopy="Paid votes unlock for Creator premium, Host premium, and approved Enterprise accounts, but checkout remains webhook-confirmed before credits are granted." />
      </div>
      <Card className="h-fit p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Monetization Preview</p>
        <h3 className="mt-2 text-xl font-black text-white">Rules, not actual earnings</h3>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
          <p><b className="text-white">Generated revenue:</b> confirmed revenue is split 65% to winners, 20% to the creator, and 15% to Challenge Suite.</p><p><b className="text-white">Sponsor contributions:</b> excluded from the 65/20/15 split and remain directed to their approved sponsor purpose.</p>
          <p><b className="text-white">Withdrawal rules:</b> admin approval, payout details, and the 24-hour hold remain required.</p>
          {entryFeeEstimate ? <div className="rounded-[8px] bg-black/30 p-3"><p className="font-bold text-white">Paid-entry estimate</p><p>Gross entry fee: {formatCents(entryFeeCents)}</p><p>Winner pool: {formatCents(entryFeeEstimate.winnerPool)}</p><p>Creator share: {formatCents(entryFeeEstimate.creator)}</p><p>Challenge Suite: {formatCents(entryFeeEstimate.platform)}</p></div> : null}
          <p className="text-xs text-slate-500">Estimates are not saved as revenue and do not create ledger entries.</p>
        </div>
      </Card>
    </div>
  </section>;
}

function MonetizationCard({ title, enabled, disabled, setupCopy, onChange, children }: { title: string; enabled: boolean; disabled: boolean; setupCopy: string; onChange: (enabled: boolean) => void; children?: React.ReactNode }) {
  return <Card className="border-white/10 bg-[#141414] p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-lg font-black text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{setupCopy}</p></div><label className={`flex min-w-28 items-center justify-between gap-3 rounded-[8px] border px-3 py-2 text-sm font-black ${disabled ? "border-white/10 text-slate-500" : "border-[var(--gold)]/30 text-white"}`}><span>{enabled ? "On" : disabled ? "Locked" : "Off"}</span><input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label></div>
    {children && enabled && !disabled ? <div className="mt-5 space-y-4">{children}</div> : null}
  </Card>;
}

function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}


function MediaBrandingStep({ form, userId, updateMedia, track, mediaUploadDisabled, mediaUploadDisabledReason }: { form: FormState; userId: string; updateMedia: (urlField: keyof FormState, pathField: keyof FormState, url: string, metadata?: { path: string }) => void; track: (field: string) => (status: MediaUploadStage) => void; mediaUploadDisabled: boolean; mediaUploadDisabledReason: string; draftId?: string }) {
  return <section>
    <StepTitle title="Media & Branding" body="Add clear, original media that helps participants understand your challenge." />
    <div className="mt-6 rounded-[8px] border border-[var(--gold)]/25 bg-[var(--gold)]/5 p-4 text-sm leading-6 text-yellow-50">
      <b className="text-white">Use media you own or have permission to publish.</b>
      <p className="mt-1 text-yellow-100/80">Choose sharp images with readable subjects. Wait for each upload to finish before submitting.</p>
    </div>
    {mediaUploadDisabled ? <div className="mt-4 rounded-[8px] border border-yellow-500/25 bg-yellow-500/5 p-4 text-sm leading-6 text-yellow-50"><b className="text-white">Media uploads are temporarily unavailable.</b><br />{mediaUploadDisabledReason}</div> : null}
    <UploadGallery form={form} userId={userId} updateMedia={updateMedia} track={track} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} className="mt-10" />
  </section>;
}

function UploadGallery({ form, userId, updateMedia, track, mediaUploadDisabled, mediaUploadDisabledReason, className = "" }: { form: FormState; userId: string; updateMedia: (urlField: keyof FormState, pathField: keyof FormState, url: string, metadata?: { path: string }) => void; track: (field: string) => (status: MediaUploadStage) => void; mediaUploadDisabled: boolean; mediaUploadDisabledReason: string; className?: string }) {
  return <div className={`${className} space-y-12`}>
    <section>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-xl font-black text-white">Images</h3><p className="mt-1 text-sm text-slate-400">{mediaUploadDisabled ? "Media skipped for now. Uploads can be restored after Firebase Storage is connected." : "Add up to 3 challenge images. At least one image is required."}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${mediaUploadDisabled ? "bg-white/10 text-slate-300" : "bg-[var(--gold)] text-black"}`}>{mediaUploadDisabled ? "Optional now" : "1 required"}</span></div>
      {mediaUploadDisabled ? <p className="mt-3 rounded-[8px] border border-yellow-500/25 bg-yellow-500/5 p-3 text-sm font-bold text-yellow-100">Publishing without media. No upload request will be attempted.</p> : !form.coverImageUrl || !form.coverImagePath ? <p className="mt-3 rounded-[8px] border border-yellow-500/25 bg-yellow-500/5 p-3 text-sm font-bold text-yellow-100">Add at least one challenge image to continue.</p> : null}
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <UploadPanel title="Image 1" required={!mediaUploadDisabled}><MediaUploadField label="Cover image" value={form.coverImageUrl} onChange={(url, metadata) => updateMedia("coverImageUrl", "coverImagePath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "banner")} kind="image" buttonLabel="Upload image" required={!mediaUploadDisabled} disabled={mediaUploadDisabled} disabledReason={mediaUploadDisabledReason} onStatusChange={track("coverImageUrl")} /></UploadPanel>
        <UploadPanel title="Image 2"><MediaUploadField label="Gallery image" value={form.promoImageUrl} onChange={(url, metadata) => updateMedia("promoImageUrl", "promoImagePath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "gallery")} kind="image" buttonLabel="Upload image" disabled={mediaUploadDisabled} disabledReason={mediaUploadDisabledReason} onStatusChange={track("promoImageUrl")} /></UploadPanel>
        <UploadPanel title="Image 3"><MediaUploadField label="Gallery image" value={form.galleryImageUrl} onChange={(url, metadata) => updateMedia("galleryImageUrl", "galleryImagePath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "gallery")} kind="image" buttonLabel="Upload image" disabled={mediaUploadDisabled} disabledReason={mediaUploadDisabledReason} onStatusChange={track("galleryImageUrl")} /></UploadPanel>
      </div>
    </section>
    <section className="border-t border-white/10 pt-10">
      <h3 className="text-xl font-black text-white">Video</h3>
      <p className="mt-1 text-sm text-slate-400">Optional intro video or trailer. You can continue without video.</p>
      <div className="mt-6 max-w-2xl"><UploadPanel title="Intro video / trailer"><MediaUploadField label="Trailer video" value={form.trailerVideoUrl} onChange={(url, metadata) => updateMedia("trailerVideoUrl", "trailerVideoPath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "video")} kind="video" buttonLabel="Upload video" disabled={mediaUploadDisabled} disabledReason={mediaUploadDisabledReason} onStatusChange={track("trailerVideoUrl")} /></UploadPanel></div>
    </section>
    <section className="border-t border-white/10 pt-10">
      <h3 className="text-xl font-black text-white">Documents</h3>
      <p className="mt-1 text-sm text-slate-400">Add up to 2 optional briefs, rules, or reference documents.</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <DocumentSlot title="Document 1" value={form.documentOneUrl} onChange={(url, metadata) => updateMedia("documentOneUrl", "documentOnePath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "documents")} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} onStatusChange={track("documentOneUrl")} />
        <DocumentSlot title="Document 2" value={form.documentTwoUrl} onChange={(url, metadata) => updateMedia("documentTwoUrl", "documentTwoPath", url, metadata)} storagePath={challengeDraftMediaPath(userId, "documents")} mediaUploadDisabled={mediaUploadDisabled} mediaUploadDisabledReason={mediaUploadDisabledReason} onStatusChange={track("documentTwoUrl")} />
      </div>
    </section>
  </div>;
}

function UploadPanel({ title, required = false, children }: { title: string; required?: boolean; children: React.ReactNode }) {
  return <div className="min-w-0">
    <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
      <h3 className="font-black text-white">{title}</h3>
      <span className={`rounded-full px-3 py-1 text-xs font-black ${required ? "bg-[var(--gold)] text-black" : "bg-white/10 text-slate-300"}`}>{required ? "Required" : "Optional"}</span>
    </div>
    {children}
  </div>;
}

function DocumentSlot({ title, value, onChange, storagePath, mediaUploadDisabled = false, mediaUploadDisabledReason, onStatusChange }: { title: string; value: string; onChange: (url: string, metadata?: { path: string }) => void; storagePath: string; mediaUploadDisabled?: boolean; mediaUploadDisabledReason: string; onStatusChange: (status: MediaUploadStage) => void }) {
  return <UploadPanel title={title}>
    <MediaUploadField label={title} value={value} onChange={onChange} storagePath={storagePath} kind="document" buttonLabel="Upload document" disabled={mediaUploadDisabled} disabledReason={mediaUploadDisabledReason} onStatusChange={onStatusChange} />
  </UploadPanel>;
}

function Helper({ mode, step }: { mode: Mode; step: number }) {
  const copy = mode === "public" ? publicStepGuides[step] : mode === "private" && step === 1 ? ["Control Who Can Enter", "Private challenges are invite-only.", "Share access only with intended participants.", "Use approval when entries need review."] : [stepsForPrivateGuide(step), "Keep this section clear and complete.", "Review participant-facing details.", "Preview your latest saved changes before submitting."];
  return <Card className="h-fit p-5 lg:sticky lg:top-24"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Builder Guide</p><h2 className="mt-3 text-xl font-black text-white">{copy[0]}</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">{copy.slice(1).map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]" /><span>{item}</span></li>)}</ul></Card>;
}

function stepsForPrivateGuide(step: number) {
  return ["Start With A Clear Challenge", "Control Who Can Enter", "Set Fair Rules", "Guide Strong Submissions", "Keep Timing Clear", "Choose Fair Judging", "Plan Rewards Clearly", "Make It Look Ready", "Submit With Confidence"][step] ?? "Build With Confidence";
}

function Checklist({ readiness, blocker, mediaUploadDisabled, className = "" }: { readiness: ChallengeValidationResult; blocker: ReturnType<typeof getChallengePublishBlocker>; mediaUploadDisabled: boolean; className?: string }) {
  const blocking = readiness.errors.filter((issue) => issue.severity === "error").map((issue) => {
    if (issue.code === "REQUIRED_BANNER" && mediaUploadDisabled) return null;
    return issue;
  }).filter((issue): issue is NonNullable<typeof issue> => Boolean(issue));
  if (!blocker) return <Card className={className + " border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100"}><p className="font-black">Ready to submit for review.</p><p className="mt-1">Your challenge will be reviewed before it goes public.</p></Card>;
  if (!blocking.length) return <Card className={className + " border-yellow-500/30 bg-yellow-500/5 p-4"}><p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--gold)]">Publish checklist</p><p className="mt-2 text-sm text-slate-200">{blocker.message}</p></Card>;
  return <Card className={className + " border-yellow-500/30 bg-yellow-500/5 p-4"}><p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--gold)]">Publish checklist</p><h3 className="mt-1 text-lg font-black text-white">Complete {readiness.missingCount} item{readiness.missingCount === 1 ? "" : "s"}</h3><ul className="mt-3 space-y-1 text-sm text-slate-300">{blocking.slice(0, 5).map((issue) => <li key={issue.code + issue.field}>- {issue.message}</li>)}</ul></Card>;
}

function ChallengeSuitePlaceholder({ className = "", label = "Challenge Suite" }: { className?: string; label?: string }) {
  return <div className={`flex items-center justify-center overflow-hidden border border-[var(--gold)]/20 bg-[radial-gradient(circle_at_top,rgba(246,198,75,.22),transparent_46%),linear-gradient(135deg,#161616,#050505)] px-4 text-center ${className}`}>
    <div>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--gold)]">Challenge Suite</p>
      <p className="mt-2 text-2xl font-black text-white">{label}</p>
    </div>
  </div>;
}
