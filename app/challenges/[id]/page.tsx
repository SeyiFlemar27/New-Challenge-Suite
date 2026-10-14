"use client";
import { ContentImage } from "@/components/content-image";
import { ChallengeDescription } from "@/components/challenge-description";
import { NormalParticipationWithdrawal } from "@/components/normal-participation-withdrawal";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, ChevronDown, Coins, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, textareaClass } from "@/components/ui";
import { fetchChallengeDetails } from "@/lib/api/services";
import { apiRequest } from "@/lib/api/client";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { getChallengeLifecycleState, getChallengeTimelineDisplay } from "@/lib/challenge-status";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { ChallengeShare } from "@/components/challenge-share";
import { ChallengeMediaGallery } from "@/components/media-display";
import { DEFAULT_CHALLENGE_TIME_ZONE, formatChallengeDateTime } from "@/lib/challenge-date-time";
import type { PublicChallengeParticipant } from "@/lib/server/challenge-participants";
import { DynamicTranslatedText } from "@/components/i18n/dynamic-translated-text";
import { ChallengeMilestoneCountdown } from "@/components/challenge-milestone-countdown";
import { SponsorPlacement, type PublicSponsorPlacement } from "@/components/sponsor-placement";
import type { DynamicTranslations } from "@/lib/i18n/dynamic-content";

type ChallengeGuideSection = "overview" | "rules" | "entry" | "voting";
type ChallengeComment = { id: string; username: string | null; avatarUrl: string | null; body: string; createdAt: string | null; canDelete?: boolean };
type ChallengeCommentsPage = { comments: ChallengeComment[]; pagination: { total: number; hasMore: boolean; nextCursor: string | null } };

export default function ChallengeDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const challengeId = params.id;
  const { user } = useCurrentUser();
  const commentsIdentity = `${challengeId}:${user?.uid ?? "signed-out"}`;
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);
  const [engagementMessage, setEngagementMessage] = useState("");
  const [comments, setComments] = useState<ChallengeComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [commentsLoadingState, setCommentsLoading] = useState(false);
  const [commentsForIdentity, setCommentsForIdentity] = useState("");
  const [commentsError, setCommentsError] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [commentDeletingId, setCommentDeletingId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [guideSection, setGuideSection] = useState<ChallengeGuideSection>("overview");
  const [entryCheckoutLoading, setEntryCheckoutLoading] = useState(false);
  const [entryCheckoutMessage, setEntryCheckoutMessage] = useState("");
  const { data, isLoading, refetch, isError: requestThrew } = useQuery({
    queryKey: ["challenge-details", challengeId, user?.uid ?? "signed-out"],
    queryFn: () => fetchChallengeDetails(challengeId),
    enabled: Boolean(challengeId),
    staleTime: 30_000
  });

  const details = data?.ok ? data.data : null;
  const initialLeaderboard = details?.leaderboard as { visible?: boolean; status?: string; visibilityMode?: string; hasVerifiedVotes?: boolean; unavailable?: boolean } | undefined;
  const shouldRefreshLeaderboard = Boolean(details?.phaseSummary && (details.phaseSummary as { canVote?: boolean }).canVote
    && initialLeaderboard?.visible
    && initialLeaderboard.visibilityMode === "public_live"
    && initialLeaderboard.status === "live");
  const leaderboardQuery = useQuery({
    queryKey: ["challenge-leaderboard-preview", challengeId, user?.uid ?? "signed-out"],
    queryFn: () => apiRequest<{ entries: PublicChallengeParticipant[]; visible: boolean; status?: string; visibilityMode?: string; hasVerifiedVotes?: boolean; exactVoteCountVisible?: boolean; message?: string | null }>(`/api/leaderboards?type=challenge&challengeId=${encodeURIComponent(challengeId)}&page=1&pageSize=5`),
    enabled: Boolean(challengeId) && shouldRefreshLeaderboard,
    staleTime: 10_000,
    refetchInterval: shouldRefreshLeaderboard ? 15_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true
  });
  const challenge = useMemo(() => details?.challenge ? normalizeChallenge(details.challenge as ChallengeApiRecord) : null, [details]);
  const challengeTranslations = ((details?.challenge as Record<string, unknown> | undefined)?.translations ?? {}) as { title?: DynamicTranslations; description?: DynamicTranslations };
  const challengeSubmissions = useMemo(() => {
    if (!challenge) return [];
    return (details?.submissions ?? []).map((item) => normalizeSubmission(item as SubmissionApiRecord, challenge)).filter((item) => item.id);
  }, [challenge, details?.submissions]);

  const saved = savedOverride ?? Boolean(details?.userState?.saved);
  const paymentValue = searchParams.get("payment");
  const paymentReturnState = paymentValue === "processing" || paymentValue === "canceled" ? paymentValue : "";
  const waitingSubmissionStart = (details as any)?.phaseSummary?.submissionStartAt;
  const participantJourneyStep = (details as any)?.userState?.participantJourney?.step;

  useEffect(() => {
    if (paymentReturnState !== "processing") return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void refetch();
      if (attempts >= 12) window.clearInterval(timer);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [paymentReturnState, refetch]);

  useEffect(() => {
    if (participantJourneyStep !== "entered_waiting_submission" || !waitingSubmissionStart) return;
    const openAt = new Date(String(waitingSubmissionStart)).getTime();
    if (!Number.isFinite(openAt)) return;
    const delay = openAt - Date.now();
    if (delay <= 0) {
      void refetch();
      return;
    }
    const timer = window.setTimeout(() => void refetch(), Math.min(delay + 500, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [participantJourneyStep, refetch, waitingSubmissionStart]);
  useEffect(() => {
    if (!challengeId) return;
    let active = true;
    void apiRequest<ChallengeCommentsPage>(`/api/challenges/${challengeId}/comments?pageSize=20`)
      .then((result) => {
        if (!active) return;
        if (!result.ok || !result.data) {
          setComments([]);
          setCommentsTotal(0);
          setCommentsCursor(null);
          setCommentsForIdentity(commentsIdentity);
          setCommentsError(result.message || "Comments could not be loaded.");
          return;
        }
        setComments(result.data.comments ?? []);
        setCommentsTotal(result.data.pagination?.total ?? 0);
        setCommentsCursor(result.data.pagination?.nextCursor ?? null);
        setCommentsForIdentity(commentsIdentity);
        setCommentsError("");
      })
      .catch(() => {
        if (!active) return;
        setComments([]);
        setCommentsTotal(0);
        setCommentsCursor(null);
        setCommentsForIdentity(commentsIdentity);
        setCommentsError("Comments could not be loaded.");
      })
      .finally(() => { if (active) setCommentsLoading(false); });
    return () => { active = false; };
  }, [challengeId, commentsIdentity]);

  const commentsLoading = commentsLoadingState || commentsForIdentity !== commentsIdentity;
  const visibleCommentsError = commentsForIdentity === commentsIdentity ? commentsError : "";

  async function updateEngagement(action: "save_challenge", enabled: boolean) {
    setEngagementMessage("");
    const result = await apiRequest<{ reminderStatus?: string | null }>(`/api/challenges/${challengeId}/engagement`, {
      method: "POST",
      body: JSON.stringify({ action, enabled })
    });
    if (!result.ok) {
      setEngagementMessage(result.message);
      return;
    }
    if (action === "save_challenge") setSavedOverride(enabled);
    setEngagementMessage(result.message);
  }

  async function addComment() {
    if (commentPosting || commentBody.trim().length < 2) return;
    setCommentPosting(true);
    setCommentMessage("");
    try {
      const result = await apiRequest<{ comment: ChallengeComment }>(`/api/challenges/${challengeId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentBody })
      });
      setCommentMessage(result.message);
      if (result.ok && result.data?.comment) {
        setComments((current) => [result.data!.comment, ...current.filter((item) => item.id !== result.data!.comment.id)]);
        setCommentsTotal((total) => total + 1);
        setCommentsForIdentity(commentsIdentity);
        setCommentBody("");
      }
    } catch {
      setCommentMessage("Your comment could not be posted. Please try again.");
    } finally {
      setCommentPosting(false);
    }
  }

  async function loadMoreComments() {
    if (!commentsCursor || commentsLoading) return;
    setCommentsLoading(true);
    setCommentsError("");
    try {
      const result = await apiRequest<ChallengeCommentsPage>(`/api/challenges/${challengeId}/comments?pageSize=20&cursor=${encodeURIComponent(commentsCursor)}`);
      if (!result.ok || !result.data) {
        setCommentsError(result.message || "More comments could not be loaded.");
        return;
      }
      setComments((current) => [...current, ...(result.data?.comments ?? []).filter((item) => !current.some((existing) => existing.id === item.id))]);
      setCommentsTotal(result.data.pagination?.total ?? commentsTotal);
      setCommentsCursor(result.data.pagination?.nextCursor ?? null);
    } catch {
      setCommentsError("More comments could not be loaded. Please try again.");
    } finally {
      setCommentsLoading(false);
    }
  }

  async function deleteComment(commentId: string) {
    if (commentDeletingId || !window.confirm("Remove this comment? This action cannot be undone.")) return;
    setCommentDeletingId(commentId);
    setCommentsError("");
    try {
      const result = await apiRequest<{ commentId: string }>(`/api/challenges/${challengeId}/comments`, {
        method: "DELETE",
        body: JSON.stringify({ commentId })
      });
      if (!result.ok) {
        setCommentsError(result.message || "Comment could not be removed.");
        return;
      }
      setComments((current) => current.filter((comment) => comment.id !== commentId));
      setCommentsTotal((current) => Math.max(0, current - 1));
    } catch {
      setCommentsError("Comment could not be removed. Please try again.");
    } finally {
      setCommentDeletingId(null);
    }
  }

  async function startPaidEntryCheckout() {
    setEntryCheckoutLoading(true);
    setEntryCheckoutMessage("");
    const result = await apiRequest<{ url?: string }>(`/api/challenges/${challengeId}/entry-checkout`, {
      method: "POST",
      body: JSON.stringify({ entryAgreementAccepted: true })
    });
    setEntryCheckoutLoading(false);
    if (!result.ok || !result.data?.url) {
      setEntryCheckoutMessage(result.message);
      return;
    }
    window.location.href = result.data.url;
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="grid max-w-[1240px] gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1fr)_370px]">
          <div>
            <Card className="h-[220px] animate-pulse rounded-[16px] bg-slate-100 sm:h-[340px] md:h-[400px]" />
            <div className="mt-8 h-12 max-w-2xl animate-pulse rounded bg-slate-100" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-28 animate-pulse bg-slate-100" />)}</div>
          </div>
          <aside className="space-y-6"><Card className="h-52 animate-pulse bg-slate-100" /></aside>
        </div>
      </AppShell>
    );
  }

  if ((data && !data.ok) || requestThrew) {
    const failure = data && !data.ok ? data : null;
    const notFound = failure?.code === "NOT_FOUND" || failure?.status === 404;
    const needsSignIn = failure?.code === "SESSION_REQUIRED" || failure?.status === 401;
    const forbidden = failure?.status === 403 || failure?.code === "PERMISSION_DENIED" || failure?.code === "PRIVATE_INVITE_REQUIRED";
    return (
      <AppShell>
        <Card role="alert" className="max-w-3xl border-slate-200 p-6 text-slate-900 sm:p-8">
          <h1 className="text-2xl font-black sm:text-3xl">{notFound ? "Challenge not found" : forbidden ? "Challenge unavailable" : "Challenge could not load"}</h1>
          <p className="mt-3 text-slate-700">{notFound ? "This challenge does not exist or is no longer available." : forbidden ? "You do not have access to this challenge. If you have an invitation, open it while signed in." : "We couldn’t load this challenge right now. Please try again."}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {!forbidden && !notFound ? <Button variant="secondary" onClick={() => void refetch()}>Retry</Button> : null}
            {needsSignIn || forbidden ? <LinkButton href={`/auth/login?next=${encodeURIComponent(`/challenges/${challengeId}`)}`} variant="secondary">Sign in</LinkButton> : null}
            <LinkButton href="/explore">Explore Challenges</LinkButton>
          </div>
        </Card>
      </AppShell>
    );
  }

  if (!challenge) {
    return (
      <AppShell>
        <Card className="max-w-3xl p-6 sm:p-8">
          <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">Challenge not found</h1>
          <p className="mt-3 text-slate-700">This challenge does not exist or is not available.</p>
          <LinkButton href="/explore" className="mt-6">Explore Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  const lifecycle = getChallengeLifecycleState(challenge);
  const phaseSummary = (details as any)?.phaseSummary;
  const timelineDisplay = getChallengeTimelineDisplay((details?.challenge as Record<string, unknown> | undefined) ?? challenge);
  const displayStatus = publicChallengePhaseLabel(timelineDisplay.currentPhase || String(phaseSummary?.label ?? lifecycle.primaryLabel));
  const phase = String(phaseSummary?.phase ?? lifecycle.primaryStatus);
  const votingOpen = Boolean(phaseSummary?.canVote ?? lifecycle.canVote);
  const userState = details?.userState;
  const leaderboard = details?.leaderboard as { visible?: boolean; message?: string | null; status?: string; visibilityMode?: string; entries?: unknown[]; hasVerifiedVotes?: boolean; unavailable?: boolean } | undefined;
  const totalVotes = details?.voteCountVisible === false ? null : Number(details?.voteCount ?? challengeSubmissions.reduce((sum, item) => sum + item.likes, 0));
  const prizePool = details?.prizePool;
  const prizeCurrency = String(prizePool?.currency ?? "USD").toUpperCase();
  const prizeValue = Number(prizePool?.visibleJackpotCents ?? 0) > 0 ? new Intl.NumberFormat(undefined, { style: "currency", currency: prizeCurrency }).format(Number(prizePool?.visibleJackpotCents) / 100) : challenge.prizeType === "Bragging Rights (Leaderboard Ranking)" ? "Ranking" : "Not published";
  const selectedAccountType = user?.selectedAccountType ?? user?.role ?? user?.accountType;
  const ownerAccount = Boolean((userState as any)?.ownerAccount);
  const sponsorAccount = user?.accountType === "sponsor" || user?.role === "sponsor" || selectedAccountType === "sponsor";
  const challengeKind = String((challenge as any).challengeType ?? (challenge as any).type ?? "").toLowerCase();
  const isLiveEvent = challengeKind.includes("live_event") || challengeKind.includes("live event");
  const liveLeaderboardData = leaderboardQuery.data?.ok ? leaderboardQuery.data.data : null;
  const topParticipants = (liveLeaderboardData?.entries ?? (details as { topParticipants?: PublicChallengeParticipant[] } | null)?.topParticipants ?? []).slice(0, 5);
  const hasVerifiedLeaderboardVotes = liveLeaderboardData?.hasVerifiedVotes ?? leaderboard?.hasVerifiedVotes ?? false;
  const rawChallenge = details?.challenge as Record<string, any> | undefined;
  const monetization = rawChallenge?.monetization && typeof rawChallenge.monetization === "object" ? rawChallenge.monetization as Record<string, any> : {};
  const challengePaidEntry = rawChallenge?.paidEntry && typeof rawChallenge.paidEntry === "object" ? rawChallenge.paidEntry as Record<string, any> : {};
  const userPaidEntry = (userState as any)?.paidEntry && typeof (userState as any).paidEntry === "object" ? (userState as any).paidEntry as Record<string, any> : {};
  const entryFeeCents = Number(userPaidEntry.amountCents ?? challengePaidEntry.amountCents ?? monetization.entryFeeAmountCents ?? rawChallenge?.entryFeeAmountCents ?? rawChallenge?.entryFeeCents ?? 0);
  const paidEntryRequired = Boolean(userPaidEntry.required ?? challengePaidEntry.required ?? (monetization.paidEntryRequested || rawChallenge?.paidEntryEnabled || rawChallenge?.entryFeeRequired)) && entryFeeCents > 0;
  const entryFeeLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.max(0, entryFeeCents) / 100);
  const entryPaymentStatus = String(userPaidEntry.paymentStatus ?? (userState as any)?.entryPaymentStatus ?? "not_started");
  const paidEntryEnrolled = Boolean(userPaidEntry.canSubmit || (userState as any)?.paidEntryEnrolled || ["paid", "confirmed"].includes(entryPaymentStatus));
  const paidEntryReturnedPending = paymentReturnState === "processing" && paidEntryRequired && !paidEntryEnrolled;
  const paidEntryCanceled = paymentReturnState === "canceled" && paidEntryRequired && !paidEntryEnrolled;
  const participantJourney = (userState as any)?.participantJourney;
  const votingAccess = (userState as any)?.votingAccess;
  const predictionAccess = (userState as any)?.predictionAccess as { visible?: boolean; available?: boolean; closesAt?: string | null; windowOpen?: boolean } | undefined;
  const predictionPoolCents = Number(rawChallenge?.confirmedPredictionPoolCents ?? 0);
  const predictionCount = Number(rawChallenge?.confirmedPredictionCount ?? 0);
  const eligibleSubmissionCount = Number(votingAccess?.eligibleSubmissionCount ?? phaseSummary?.eligibleSubmissionCount ?? challengeSubmissions.length);
  const challengeTimeZone = String(timelineDisplay.timeZone ?? phaseSummary?.timeZone ?? (details?.challenge as any)?.timezone ?? (details?.challenge as any)?.timeZone ?? DEFAULT_CHALLENGE_TIME_ZONE);
  const nextImportantTime = timelineDisplay.nextLabel && timelineDisplay.nextAt ? `${timelineDisplay.nextLabel} ${formatChallengeDateTime(timelineDisplay.nextAt, challengeTimeZone)}` : null;
  const creatorDisplayName = String(rawChallenge?.creatorDisplayName ?? rawChallenge?.hostDisplayName ?? rawChallenge?.creatorName ?? "Challenge creator");
  const creatorUsername = String(rawChallenge?.creatorUsername ?? rawChallenge?.hostUsername ?? "");
  const mobileJourneyAction = String(participantJourney?.primaryAction ?? "");
  const mobileJourneyActionVisible = ["pay_entry_fee", "refresh_payment", "wait_for_submission", "submit_entry", "fix_and_resubmit", "register", "join_waitlist", "enter_challenge", "request_entry", "view_voting", "view_entry", "manage_challenge", "sign_in"].includes(mobileJourneyAction);
  const leaderboardRelevant = Boolean(leaderboard?.visible && (votingOpen || ["voting_closed", "under_review", "winners_announced", "completed"].includes(phase)));
  const commentsClosed = ["completed", "cancelled", "canceled", "paused", "postponed"].includes(phase.toLowerCase());
  const commentsTemporarilyPaused = ["paused", "postponed"].includes(phase.toLowerCase());
  const visibleComments = commentsForIdentity === commentsIdentity ? comments : [];
  const visibleCommentsTotal = commentsForIdentity === commentsIdentity ? commentsTotal : 0;
  const prizeStatusLabel = publicPrizeStatus(prizePool);
  const prizeAmountKind = Number(prizePool?.visibleJackpotCents ?? 0) > 0 ? "Confirmed prize pool" : "Estimated prize";
  const submissionInstructions = Array.isArray(rawChallenge?.submissionInstructionsList)
    ? rawChallenge.submissionInstructionsList.map((item: unknown) => String(item ?? "").trim()).filter(Boolean)
    : String(rawChallenge?.challengeGuidelines ?? "").split(/\r?\n/).map((item: string) => item.trim()).filter(Boolean);
  const votingSettings = rawChallenge?.votingSettings && typeof rawChallenge.votingSettings === "object" ? rawChallenge.votingSettings as Record<string, unknown> : {};
  const judging = String(rawChallenge?.winnerSelection ?? rawChallenge?.judgingMethod ?? rawChallenge?.scoringMode ?? "").replaceAll("_", " ").trim();
  const winnerSplits = Array.isArray(prizePool?.winnerSplits) ? prizePool.winnerSplits as Array<{ position?: number; percent?: number; expectedAmountCents?: number }> : [];
  const submissionMediaRequirements = Array.isArray(rawChallenge?.acceptedSubmissionTypes) ? rawChallenge.acceptedSubmissionTypes : challenge.acceptedSubmissionTypes;
  const entryFacts: Array<[string, string]> = [
    ["Eligibility", typeof rawChallenge?.participantRequirements === "string" ? rawChallenge.participantRequirements.trim() : ""],
    ["Entry", paidEntryRequired ? entryFeeLabel : "Free"],
    ["Registration deadline", formatChallengeDateTime(rawChallenge?.registrationDeadline ?? rawChallenge?.registrationEndAt ?? "", challengeTimeZone) ?? ""],
    ["Capacity", Number(rawChallenge?.maxParticipants ?? 0) > 0 ? Number(rawChallenge?.maxParticipants).toLocaleString() : ""],
    ["Accepted media", submissionMediaRequirements.length ? submissionMediaRequirements.join(", ") : ""],
    ["Submission deadline", formatChallengeDateTime(rawChallenge?.submissionDeadline ?? rawChallenge?.submissionEndAt ?? "", challengeTimeZone) ?? ""]
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;
  const votingFacts: Array<[string, string]> = [
    ["Winner selection", judging],
    ["Audience voting", votingSettings.enabled === false || votingSettings.allowFreeVotes === false ? "Not enabled" : "Enabled"],
    ["Free votes", votingSettings.allowFreeVotes === true ? "Enabled" : votingSettings.allowFreeVotes === false ? "Disabled" : "Not specified"],
    ["DoroCoin votes", votingSettings.allowPaidVotes === true ? "Enabled" : votingSettings.allowPaidVotes === false ? "Disabled" : "Not specified"],
    ["Voting deadline", formatChallengeDateTime(rawChallenge?.votingDeadline ?? rawChallenge?.votingEndsAt ?? "", challengeTimeZone) ?? ""]
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;
  const guideSections: Array<{ id: ChallengeGuideSection; label: string; body: string }> = [
    { id: "overview", label: "Overview", body: challenge.description },
    { id: "rules", label: "Rules", body: challenge.rules.length ? challenge.rules.map((rule) => rule.editableText).join("\n") : String(rawChallenge?.standardRules ?? rawChallenge?.challengeRules ?? rawChallenge?.policyTerms ?? "").trim() },
    { id: "entry", label: "How to Enter", body: "" },
    { id: "voting", label: "Voting & Results", body: "" }
  ];
  const activeGuide = guideSections.find((section) => section.id === guideSection) ?? guideSections[0];

  async function refetchComments() {
    if (commentsLoading) return;
    setCommentsLoading(true);
    setCommentsError("");
    try {
      const result = await apiRequest<ChallengeCommentsPage>(`/api/challenges/${challengeId}/comments?pageSize=20`);
      if (!result.ok || !result.data) {
        setCommentsError(result.message || "Comments could not be loaded.");
        return;
      }
      setComments(result.data.comments ?? []);
      setCommentsTotal(result.data.pagination?.total ?? 0);
      setCommentsCursor(result.data.pagination?.nextCursor ?? null);
      setCommentsForIdentity(commentsIdentity);
    } catch {
      setCommentsError("Comments could not be loaded. Please try again.");
    } finally {
      setCommentsLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="grid max-w-[1240px] gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="min-w-0">
          {rawChallenge?.normalOutcome === "no_winners" ? <div role="status" className="mb-4 rounded-xl border border-[var(--gold)]/30 p-4"><h2 className="font-bold">No Winners</h2><p className="mt-2 text-sm">This challenge completed without an eligible winner. No winner payout was created.</p></div> : null}
          {rawChallenge?.normalLifecyclePolicyVersion === 1 && userState?.joined && !rawChallenge.effectiveVotingStartsAt && !["completed", "cancelled", "winners_announced"].includes(String(rawChallenge.status)) ? <NormalParticipationWithdrawal challengeId={challengeId} onComplete={() => { void refetch(); }} /> : null}
          <div data-mobile-challenge-meta className="mb-4 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em]">
            <span className="rounded-full bg-[var(--gold)]/10 px-3 py-2 text-[var(--gold)]">{challenge.category || challenge.type}</span>
          </div>
          <div className="relative overflow-hidden rounded-[16px] border border-slate-200 bg-slate-50 p-2">
            <ChallengeMediaGallery title={challenge.title} videoUrl={challenge.trailerUrl ?? rawChallenge?.trailerVideoUrl ?? rawChallenge?.promoVideoUrl} images={[...(Array.isArray(rawChallenge?.challengeImages) ? rawChallenge.challengeImages.map((item: any) => typeof item === "string" ? item : item?.url) : []), challenge.imageUrl, rawChallenge?.promoImageUrl, rawChallenge?.galleryImageUrl]} />
          </div>
          <DynamicTranslatedText as="h1" className="mt-6 break-words text-3xl font-black sm:mt-8 md:text-5xl" text={challenge.title} translations={challengeTranslations.title} contentType="challenge_title" />
          <div data-mobile-creator-row className="mt-4 flex min-h-12 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-xs font-black text-slate-900">{rawChallenge?.creatorAvatarUrl ? <ContentImage src={String(rawChallenge.creatorAvatarUrl)} alt="" className="h-full w-full object-cover" /> : creatorDisplayName.slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0">{creatorUsername ? <a href={`/profile/${encodeURIComponent(creatorUsername)}`} className="block truncate font-black hover:text-[var(--gold)]">{creatorDisplayName}</a> : <p className="truncate font-black">{creatorDisplayName}</p>}</div>
          </div>
          <div data-challenge-summary-strip className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-slate-200 bg-slate-200 lg:grid-cols-4">
            <SummaryItem value={rawChallenge?.participantCountVisible === false ? "Hidden" : challenge.participants.toLocaleString()} label="Participants" />
            <SummaryItem value={prizeValue} label="Prize Pool" />
            <SummaryItem value={displayStatus} label="Current phase" visuallyHiddenLabel support={nextImportantTime ?? undefined} />
            <SummaryItem value={totalVotes?.toLocaleString() ?? "Hidden"} label="Verified votes" support={votingOpen ? "Voting is open" : eligibleSubmissionCount <= 0 ? "No eligible entries to vote on" : "Voting is not open"} />
          </div>
          <div className="mt-4"><ChallengeMilestoneCountdown challenge={rawChallenge ?? (challenge as unknown as Record<string, unknown>)} /></div>
          <Card data-mobile-primary-action className="mt-5 p-5 sm:p-8">
            <ParticipantJourneyPanel
              journey={participantJourney}
              challengeId={challenge.id}
              entryFeeLabel={entryFeeLabel}
              paidEntryRequired={paidEntryRequired}
              entryCheckoutLoading={entryCheckoutLoading}
              entryCheckoutMessage={entryCheckoutMessage}
              onPay={() => void startPaidEntryCheckout()}
              onRefresh={() => void refetch()}
              timeZone={challengeTimeZone}
              registrationClosesAt={phaseSummary?.registrationEndAt}
            />
          </Card>
          {ownerAccount ? <Card className="mt-6 p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Owner Controls</p><div className="mt-4 grid gap-3 sm:flex sm:flex-wrap"><LinkButton href={`/challenges/${challenge.id}/manage`} className="w-full sm:w-auto">Manage Challenge</LinkButton><LinkButton href={`/challenges/${challenge.id}/participants`} className="w-full sm:w-auto" variant="secondary">Manage Participants</LinkButton></div></Card> : null}
          <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
            <ChallengeShare className="w-full sm:w-auto" title={challenge.title} description={challenge.description} path={`/challenges/${challenge.id}`} />
            <Button className="w-full sm:w-auto" variant="secondary" onClick={() => void updateEngagement("save_challenge", !saved)}><Bookmark size={17} /> {saved ? "Saved" : "Save Challenge"}</Button>
          </div>
          {engagementMessage ? <p className="mt-3 text-sm text-slate-700">{engagementMessage}</p> : null}
          {paidEntryReturnedPending ? <Card role="status" className="mt-4 border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Payment received. We are confirming your enrollment.</Card> : null}
          {paidEntryCanceled ? <Card role="status" className="mt-4 border-slate-300 bg-slate-50 p-4 text-sm text-slate-800">Payment canceled. You remain unenrolled.</Card> : null}
          {(details?.challenge as any)?.resultsConfirmed ? <Card role="status" className="mt-4 border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><p className="font-black">Results confirmed</p><p className="mt-1 text-sm">{(details?.challenge as any)?.settlementPrepared ? "Settlement prepared. Internal prize allocations remain subject to review." : "Winner results were approved."}</p></Card> : null}
          <Card className="mt-10 p-5 sm:p-7">
            <h2 className="text-2xl font-black">Challenge Guide</h2>
            <div role="tablist" aria-label="Challenge guide sections" className="mt-5 flex gap-2 overflow-x-auto pb-2">
              {guideSections.map((section) => <button id={`challenge-guide-${section.id}`} key={section.id} type="button" role="tab" aria-controls="challenge-guide-panel" aria-selected={guideSection === section.id} tabIndex={guideSection === section.id ? 0 : -1} onClick={() => setGuideSection(section.id)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const direction = event.key === "ArrowRight" ? 1 : -1; const next = (guideSections.findIndex((item) => item.id === section.id) + direction + guideSections.length) % guideSections.length; setGuideSection(guideSections[next].id); document.getElementById(`challenge-guide-${guideSections[next].id}`)?.focus(); }} className={`min-h-11 shrink-0 rounded-[8px] px-4 py-2 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] ${guideSection === section.id ? "bg-amber-300 text-slate-950" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{section.label}</button>)}
            </div>
            <div id="challenge-guide-panel" role="tabpanel" aria-labelledby={`challenge-guide-${activeGuide.id}`} className="mt-4 rounded-[8px] border border-slate-200 bg-white p-5 text-slate-900">
              <h3 className="font-black text-amber-700">{activeGuide.label}</h3>
              {activeGuide.id === "overview" ? <div className="mt-3"><ChallengeDescription description={challenge.description} translations={challengeTranslations.description} /></div> : null}
              {activeGuide.id === "rules" ? activeGuide.body ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{activeGuide.body}</p> : <p className="mt-2 text-sm text-slate-600">No additional challenge-specific rules were published.</p> : null}
              {activeGuide.id === "entry" ? <GuideFacts facts={entryFacts} empty="Entry requirements have not been published." /> : null}
              {activeGuide.id === "entry" && submissionInstructions.length ? <><h4 className="mt-5 font-bold">Submission instructions</h4><ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">{submissionInstructions.map((instruction, index) => <li key={`${index}-${instruction.slice(0, 24)}`}>{instruction}</li>)}</ol></> : null}
              {activeGuide.id === "voting" ? <GuideFacts facts={votingFacts} empty="Voting and judging details have not been published." /> : null}
              {activeGuide.id === "voting" && details?.resultsUnavailable ? <p role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">Results Temporarily Unavailable. The announcement is being reviewed.</p> : null}
            </div>
          </Card>
            <section id="challenge-rankings" className="mt-12 scroll-mt-24">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black">Audience Rankings</h2>
                <p className="mt-2 text-sm text-slate-600">Eligible entries ranked by verified votes. Official results are shown separately.</p>
              </div>
              <LinkButton href={`/challenges/${challenge.id}/participants`} variant="secondary">See all participants</LinkButton>
            </div>
            {details?.officialWinners?.length ? <section aria-labelledby="official-winners-heading" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-slate-900"><div><h3 id="official-winners-heading" className="text-lg font-black">Official Winners</h3><p className="mt-1 text-sm text-slate-700">Confirmed results for this challenge.</p></div><ol className="mt-4 grid gap-3 sm:grid-cols-2">{details.officialWinners.map((winner) => <li key={winner.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-amber-200 bg-white p-3"><span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-sm font-black text-amber-950">{winner.avatarUrl ? <ContentImage src={winner.avatarUrl} alt="" className="size-full object-cover" /> : String(winner.publicDisplayName ?? "W").slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-amber-800">{ordinal(Number(winner.position))}</p><p className="truncate font-black">{winner.username ? `@${winner.username.replace(/^@/, "")}` : winner.publicDisplayName ?? "Winner"}</p>{winner.prizeAmountCents ? <p className="text-sm text-slate-700">{new Intl.NumberFormat(undefined, { style: "currency", currency: String(winner.currency ?? prizeCurrency).toUpperCase() }).format(Number(winner.prizeAmountCents) / 100)}</p> : null}</div>{winner.submissionId ? <LinkButton href={`/winners/${encodeURIComponent(winner.id)}`} variant="secondary">View</LinkButton> : null}</li>)}</ol></section> : null}
            {leaderboardRelevant && hasVerifiedLeaderboardVotes && topParticipants.length > 0 ? (
              <ol aria-label="Top five challenge entries" className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {topParticipants.map((participant, index) => <li key={participant.submissionId} className={`flex min-h-[76px] items-center gap-3 px-4 py-3 sm:gap-4 ${participant.rank === 1 ? "bg-amber-50" : ""}`}>
                  <span aria-label={`Rank ${participant.rank ?? index + 1}`} className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${participant.rank === 1 ? "bg-amber-300 text-amber-950" : "bg-slate-100 text-slate-700"}`}>{participant.rank ?? index + 1}</span>
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-black text-slate-800">{participant.avatarUrl ? <ContentImage src={participant.avatarUrl} alt="" className="size-full object-cover" /> : (participant.username || participant.displayName).slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-900">{participant.username ? `@${participant.username.replace(/^@/, "")}` : participant.displayName}</p><p className="text-xs text-slate-600">{participant.exactVoteCountVisible && participant.voteCount !== null ? `${participant.voteCount.toLocaleString()} verified votes` : "Vote totals hidden"}</p></div>
                  <LinkButton href={participant.submissionPath} variant="secondary" className="shrink-0">View entry</LinkButton>
                </li>)}
              </ol>
            ) : <p role="status" className="mt-5 rounded-[8px] border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600">{details?.resultsUnavailable ? "Results Temporarily Unavailable." : leaderboard?.unavailable ? "Audience rankings are temporarily unavailable. Challenge details remain available." : leaderboard?.visible === false && leaderboard.message ? leaderboard.message : leaderboardRelevant && !hasVerifiedLeaderboardVotes ? "No votes yet." : votingOpen && !hasVerifiedLeaderboardVotes ? "No votes yet." : "Audience rankings are not available yet."}</p>}
            {leaderboardRelevant && hasVerifiedLeaderboardVotes ? <LinkButton href={`/leaderboards?board=challenge&challengeId=${encodeURIComponent(challenge.id)}`} variant="secondary" className="mt-4">View Full Leaderboard</LinkButton> : null}
          </section>

          <section className="mt-12 border-t border-slate-200 pt-10">
            <button type="button" aria-expanded={commentsOpen} onClick={() => setCommentsOpen((open) => !open)} className="flex min-h-12 w-full items-center justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">
              <span id="challenge-comments-heading" className="text-2xl font-black">Comments ({visibleCommentsTotal.toLocaleString()})</span><ChevronDown className={`shrink-0 transition-transform ${commentsOpen ? "rotate-180" : ""}`} />
            </button>
            {commentsOpen ? <Card className="mt-5 p-5 sm:p-6">
              {commentsClosed ? <p className="rounded-[8px] bg-slate-100 p-4 text-sm text-slate-700">{commentsTemporarilyPaused ? "New comments are temporarily paused. Existing comments remain available below." : "New comments are closed for this challenge. Existing comments remain available below."}</p> : null}
              {!commentsClosed && user ? <><label htmlFor="challenge-comment" className="mb-2 block text-sm font-semibold text-slate-800">Add a comment</label><textarea id="challenge-comment" className={textareaClass} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Add to the conversation..." maxLength={1000} aria-describedby="challenge-comment-help" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p id="challenge-comment-help" className="text-xs text-slate-600">Comments may be reviewed under our moderation rules.</p>
                <Button onClick={() => void addComment()} disabled={commentBody.trim().length < 2 || commentPosting}>{commentPosting ? "Posting…" : "Post Comment"}</Button>
              </div>
              {commentMessage ? <p className="mt-3 text-sm text-slate-700">{commentMessage}</p> : null}</> : null}
              {!commentsClosed && !user ? <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-700"><LinkButton href={`/auth/login?next=${encodeURIComponent(`/challenges/${challenge.id}`)}`} variant="secondary">Sign in to comment</LinkButton></p> : null}
              {visibleCommentsError ? <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-900"><span>{visibleCommentsError}</span><Button variant="secondary" onClick={() => void refetchComments()}>Retry</Button></div> : null}
              {commentsLoading && visibleComments.length === 0 ? <p role="status" className="mt-5 text-sm text-slate-600">Loading comments…</p> : null}
              <div className="mt-6 space-y-3">
                {visibleComments.length ? visibleComments.map((comment) => { const username = comment.username?.replace(/^@/, ""); const name = username ? `@${username}` : "Challenge Suite member"; const profileHref = username ? `/profile/${encodeURIComponent(username)}` : null; const createdAt = comment.createdAt ? Date.parse(comment.createdAt) : Number.NaN; return <article key={comment.id} className="rounded-lg border border-slate-200 bg-white p-4 text-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-xs font-bold text-slate-900">{comment.avatarUrl ? <ContentImage src={comment.avatarUrl} alt="" className="size-full object-cover" /> : name.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><div className="font-bold">{profileHref ? <a href={profileHref} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">{name}</a> : <span>{name}</span>}</div><time className="text-xs text-slate-600" dateTime={comment.createdAt ?? undefined}>{Number.isFinite(createdAt) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(createdAt) : "Time unavailable"}</time></div></div>{comment.canDelete ? <Button variant="secondary" onClick={() => void deleteComment(comment.id)} disabled={commentDeletingId === comment.id}>{commentDeletingId === comment.id ? "Removing…" : "Delete"}</Button> : null}</div><p className="mt-3 whitespace-pre-wrap break-words text-slate-800">{comment.body}</p></article>; }) : !commentsLoading && !visibleCommentsError ? <p className="rounded-lg bg-slate-100 p-4 text-slate-700">No comments yet.</p> : null}
              </div>
              {commentsCursor ? <Button className="mt-4" variant="secondary" onClick={() => void loadMoreComments()} disabled={commentsLoading}>{commentsLoading ? "Loading…" : "Load more comments"}</Button> : null}
            </Card> : null}
          </section>
          <section className="mt-12 border-t border-slate-200 pt-8">
            <LinkButton href="/explore" variant="secondary" className="w-full sm:w-auto">Explore More Challenges</LinkButton>
          </section>
        </div>

        <aside className="space-y-5 xl:pt-0">
          {(Array.isArray(details?.sponsorships) ? details.sponsorships as PublicSponsorPlacement[] : []).map((item) => <SponsorPlacement key={String(item.id)} item={item} challengeId={challenge.id} />)}
          {sponsorAccount ? <Card className="border-yellow-500/30 bg-yellow-950/10 p-5 text-center sm:p-8">
            <h3 className="text-xl font-black text-[var(--gold)]">Sponsorship</h3>
            <p className="mt-3">Submit a sponsor contribution request. Sponsor contributions are confirmed before any public funding status updates. No investment return is promised.</p>
            <LinkButton href={`/challenges/${challenge.id}/sponsor`} className="mt-5 w-full sm:w-auto">Propose Sponsorship</LinkButton>
          </Card> : null}
          {prizePool && (prizePool.visibleJackpotCents > 0 || prizePool.status !== "disabled") ? <Card className="border-amber-200 bg-amber-50 p-5 text-slate-900 sm:p-7"><h2 className="text-2xl font-black">Prize Pool</h2><p className="mt-2 text-sm font-bold text-slate-700">{prizeStatusLabel}</p>{prizePool.visibleJackpotCents > 0 ? <><p className="mt-2 text-xs font-bold text-slate-600">{prizeAmountKind}</p><p className="mt-1 text-3xl font-black text-amber-800">{prizeValue}</p></> : null}{["funding_required", "partially_funded", "sponsor_funded_pending", "pending_review"].includes(String(prizePool.status)) ? <p className="mt-3 text-sm text-slate-700">Funding is not fully confirmed. Only confirmed funds are included in the displayed amount.</p> : null}{["distribution_pending", "processing_payouts", "distributed"].includes(String(prizePool.status)) ? <p className="mt-3 text-sm text-slate-700">{prizeStatusLabel}. Payout completion is subject to the authoritative settlement record.</p> : null}<div className={`mt-5 grid gap-3 ${winnerSplits.length === 1 ? "sm:grid-cols-1" : "sm:grid-cols-3"}`}>{winnerSplits.map((split) => <div key={split.position} className="rounded-lg bg-white p-4 text-center"><p className="font-black">{split.position === 1 ? "1st place" : split.position === 2 ? "2nd place" : `${split.position}th place`} · {split.percent}%</p><p className="mt-1 text-sm font-black text-amber-800">{new Intl.NumberFormat(undefined, { style: "currency", currency: prizeCurrency }).format(Number(split.expectedAmountCents ?? 0) / 100)}</p></div>)}</div></Card> : null}
          {predictionAccess?.visible || predictionAccess?.available ? <Card className="border-[var(--gold)]/30 bg-amber-50 p-5 text-slate-900 sm:p-7">
            <div className="flex items-start gap-3"><Coins className="mt-1 text-amber-700" /><div><h3 className="text-xl font-black">Prediction Arena</h3><p className="mt-2 text-sm leading-6 text-slate-700">Predict who you think will win before voting opens.</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-slate-600">Total staked</p><p className="font-black">${(predictionPoolCents / 100).toLocaleString()}</p></div><div><p className="text-slate-600">Predictors</p><p className="font-black">{predictionCount.toLocaleString()}</p></div></div>
            {predictionAccess.closesAt ? <p className="mt-3 text-xs leading-5 text-slate-600">Closes {formatChallengeDateTime(predictionAccess.closesAt, challengeTimeZone)}</p> : null}
            {predictionAccess.windowOpen ? <LinkButton href={`/challenges/${challenge.id}/prediction`} className="mt-5 w-full">Enter Prediction Arena</LinkButton> : <Button className="mt-5 w-full" variant="secondary" disabled>Locked</Button>}<p className="mt-3 text-xs leading-5 text-slate-600">{predictionAccess.windowOpen ? "Predictions close when voting opens." : "New stakes and participant changes are closed. Awaiting official results."}</p>
          </Card> : null}

          <Card id="vote" className="p-5 sm:p-8">
            <h3 className="text-xl font-black">Voting actions</h3>
            <div className="mt-5">
              {votingOpen && eligibleSubmissionCount > 0 ? <LinkButton href={`/challenges/${challenge.id}/votes`} className="w-full"><Vote size={17} /> View Voting</LinkButton> : <Button className="w-full" disabled><Vote size={17} /> {eligibleSubmissionCount <= 0 ? "Voting Unavailable" : lifecycle.votingStatus === "voting_not_open" ? "Voting Not Open" : lifecycle.votingStatus === "voting_not_enabled" ? "Voting Unavailable" : "Voting Closed"}</Button>}
            </div>
            {votingOpen && eligibleSubmissionCount > 0 ? <div className="mt-4 rounded-[8px] border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-black text-amber-800">Additional Votes</p><p className="mt-2 text-xs leading-5 text-slate-600">Additional votes cost 5 DoroCoins each and count only under this challenge&apos;s voting rules.</p><LinkButton href={`/challenges/${challenge.id}/bonus-votes`} className="mt-3 w-full" variant="secondary">Use DoroCoins</LinkButton></div> : <p className="mt-4 text-sm text-slate-600">{eligibleSubmissionCount <= 0 ? "No eligible submissions are available for voting yet." : "Additional votes become available when voting opens."}</p>}
          </Card>
        </aside>
      </div>
      {mobileJourneyActionVisible ? <><div className="h-24 lg:hidden" aria-hidden="true" /><div data-mobile-sticky-cta className="mobile-sticky-action fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden [&>*]:mt-0">
        <JourneyAction action={mobileJourneyAction} href={participantJourney?.primaryHref} challengeId={challenge.id} entryFeeLabel={entryFeeLabel} loading={entryCheckoutLoading} onPay={() => void startPaidEntryCheckout()} onRefresh={() => void refetch()} waitLabel={participantJourney?.checklist?.submissionOpensAt ? `Submission opens at ${formatChallengeDateTime(participantJourney.checklist.submissionOpensAt, challengeTimeZone)}` : "Submission opens soon"} submissionOpensAt={participantJourney?.checklist?.submissionOpensAt} />
      </div></> : null}
    </AppShell>
  );
}


function ParticipantJourneyPanel({ journey, challengeId, entryFeeLabel, paidEntryRequired, entryCheckoutLoading, entryCheckoutMessage, onPay, onRefresh, timeZone, registrationClosesAt }: { journey: any; challengeId: string; entryFeeLabel: string; paidEntryRequired: boolean; entryCheckoutLoading: boolean; entryCheckoutMessage: string; onPay: () => void; onRefresh: () => void; timeZone: string; registrationClosesAt?: string | null }) {
  const action = String(journey?.primaryAction ?? "back_to_challenge");
  const label = String(journey?.label ?? "Challenge Entry");
  const message = String(journey?.message ?? "Open the entry page for the next step.");
  const checklist = journey?.checklist ?? {};
  const registered = Boolean(checklist.registered || checklist.entered);
  const waitLabel = checklist.submissionOpensAt ? `Submission opens at ${formatChallengeDateTime(checklist.submissionOpensAt, timeZone)}` : "Submission opens soon";
  const relevantDeadline = ["submit_entry", "view_entry"].includes(action) ? checklist.submissionDeadline : registrationClosesAt;
  const deadlineLabel = relevantDeadline ? formatChallengeDateTime(relevantDeadline, timeZone) : null;
  return <div className="text-left"><div className="rounded-xl border border-slate-200 bg-white p-5 text-slate-900"><h3 className="text-lg font-black">{label}</h3><p className="mt-2 text-sm leading-6 text-slate-700">{message}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm"><span><span className="font-semibold text-slate-600">Entry:</span> <span className="font-bold">{paidEntryRequired ? entryFeeLabel : "Free"}</span></span>{deadlineLabel ? <span><span className="font-semibold text-slate-600">Deadline:</span> <time className="font-bold">{deadlineLabel}</time></span> : null}</div></div><JourneyAction action={action} blockerCode={journey?.blockerCode} href={journey?.primaryHref} challengeId={challengeId} entryFeeLabel={entryFeeLabel} registered={registered} loading={entryCheckoutLoading} onPay={onPay} onRefresh={onRefresh} waitLabel={waitLabel} submissionOpensAt={checklist.submissionOpensAt} />{entryCheckoutMessage ? <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">{entryCheckoutMessage}</p> : null}</div>;
}
function JourneyAction({ action, blockerCode, href, challengeId, entryFeeLabel, registered = false, loading, onPay, onRefresh, waitLabel, submissionOpensAt }: { action: string; blockerCode?: string | null; href?: string | null; challengeId: string; entryFeeLabel: string; registered?: boolean; loading: boolean; onPay: () => void; onRefresh: () => void; waitLabel?: string; submissionOpensAt?: string | null }) {
  if (action === "pay_entry_fee") return <LinkButton href={`/challenges/${challengeId}/join`} className="mt-5 w-full">{registered ? "Continue Payment" : `Pay ${entryFeeLabel} & Join Challenge`}</LinkButton>;
  if (action === "refresh_payment") return <Button className="mt-5 w-full" variant="secondary" onClick={onRefresh}>Refresh Status</Button>;
  if (action === "wait_for_submission") return <SubmissionCountdown opensAt={submissionOpensAt} formattedOpenAt={waitLabel} onOpen={onRefresh} />;
  if (action === "submit_entry") return <LinkButton href={`/challenges/${challengeId}/join`} className="mt-5 w-full">Submit Entry</LinkButton>;
  if (action === "fix_and_resubmit") return <LinkButton href={`/challenges/${challengeId}/join`} className="mt-5 w-full">Fix &amp; Resubmit</LinkButton>;
  if (["register", "join_waitlist", "enter_challenge", "request_entry"].includes(action)) return <LinkButton href={`/challenges/${challengeId}/join`} className="mt-5 w-full">{action === "request_entry" ? "Request to Join" : action === "join_waitlist" ? "Join Waitlist" : "Join Challenge"}</LinkButton>;
  if (action === "view_voting") return <LinkButton href={`/challenges/${challengeId}/votes`} className="mt-5 w-full" variant="secondary">Vote Now</LinkButton>;
  if (action === "view_winners") return <LinkButton href={href || `/challenges/${challengeId}#challenge-rankings`} className="mt-5 w-full">View Winners</LinkButton>;
  if (action === "view_results") return <LinkButton href={href || `/challenges/${challengeId}#challenge-rankings`} className="mt-5 w-full">View Results</LinkButton>;
  if (action === "view_entry" && href) return <LinkButton href={href} className="mt-5 w-full">View My Entry</LinkButton>;
  if (action === "manage_challenge") return <LinkButton href="/challenges" className="mt-5 w-full">Manage Challenge</LinkButton>;
  if (action === "sign_in") return <LinkButton href={`/auth/login?next=${encodeURIComponent(`/challenges/${challengeId}`)}`} className="mt-5 w-full">Sign In to Continue</LinkButton>;
  if (blockerCode === "registration_closed") return <Button className="mt-5 w-full" variant="secondary" disabled>Registration Closed</Button>;
  if (blockerCode === "challenge_full") return <Button className="mt-5 w-full" variant="secondary" disabled>Challenge Full</Button>;
  if (blockerCode === "request_pending") return <Button className="mt-5 w-full" variant="secondary" disabled>Approval Pending</Button>;
  if (blockerCode === "submission_closed") return <Button className="mt-5 w-full" variant="secondary" disabled>Submission Closed</Button>;
  if (blockerCode === "challenge_cancelled") return <Button className="mt-5 w-full" variant="secondary" disabled>Challenge Cancelled</Button>;
  return href ? <LinkButton href={href} className="mt-5 w-full" variant="secondary">View Challenge</LinkButton> : null;
}

function SubmissionCountdown({ opensAt, formattedOpenAt, onOpen }: { opensAt?: string | null; formattedOpenAt?: string; onOpen: () => void }) {
  const target = Date.parse(String(opensAt ?? ""));
  const [remaining, setRemaining] = useState(() => Number.isFinite(target) ? Math.max(0, target - Date.now()) : null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    let requested = false;
    const tick = () => {
      const next = Math.max(0, target - Date.now());
      setRemaining(next);
      if (next === 0 && !requested) {
        requested = true;
        setChecking(true);
        onOpen();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [target, onOpen]);
  if (checking) return <Button className="mt-5 w-full" variant="secondary" disabled>Checking submission access...</Button>;
  if (remaining === null) return <Button className="mt-5 w-full" variant="secondary" disabled>Submission opens soon</Button>;
  const totalSeconds = Math.ceil(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const countdown = days > 0 ? `${days}d ${hours}h ${minutes}m` : hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  return <div className="mt-5"><p className="text-center text-sm font-black text-amber-800">Submissions open in {countdown}</p>{formattedOpenAt ? <p className="mt-1 text-center text-xs text-slate-600">{formattedOpenAt.replace(/^Submission opens at\s+/i, "")}</p> : null}<Button className="mt-3 w-full" variant="secondary" disabled>Submission opens soon</Button></div>;
}
function SummaryItem({ value, label, support, visuallyHiddenLabel = false }: { value: string; label: string; support?: string; visuallyHiddenLabel?: boolean }) {
  return <div role="group" aria-label={visuallyHiddenLabel ? label : undefined} className="min-w-0 bg-white px-4 py-4">{visuallyHiddenLabel ? <span className="sr-only">{label}</span> : null}<p className="whitespace-normal break-normal text-base font-black leading-6 text-slate-950">{value}</p>{label && !visuallyHiddenLabel ? <p className="mt-1 text-xs font-bold text-slate-600">{label}</p> : null}{support ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{support}</p> : null}</div>;
}

function GuideFacts({ facts, empty }: { facts: Array<[string, string]>; empty: string }) {
  if (!facts.length) return <p className="mt-2 text-sm leading-6 text-slate-600">{empty}</p>;
  return <dl className="mt-3 grid gap-3 sm:grid-cols-2">{facts.map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}</dt><dd className="mt-1 whitespace-pre-line break-words text-sm font-semibold text-slate-900">{value}</dd></div>)}</dl>;
}

function ordinal(value: number) {
  if (!Number.isFinite(value) || value < 1) return "Winner";
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th";
  return `${value}${suffix}`;
}


function publicChallengePhaseLabel(value: string) {
  return value.toLowerCase().includes("timeline needs review") ? "Schedule pending" : value;
}

function publicPrizeStatus(prizePool: { visibleJackpotCents?: number; status?: string } | null | undefined) {
  const status = String(prizePool?.status ?? "").toLowerCase();
  const labels: Record<string, string> = {
    disabled: "No cash prize",
    not_funded: "Prize not funded",
    funding_required: "Funding required",
    partially_funded: "Partially funded",
    fully_funded: "Fully funded",
    growing_pool: "Prize pool is growing",
    locked: "Prize pool locked",
    distribution_pending: "Distribution pending",
    processing_payouts: "Payouts processing",
    distributed: "Prizes distributed",
    refunded: "Prize funds refunded",
    reversed: "Prize funds reversed",
    pending_review: "Sponsor funding under review",
    sponsor_funded_pending: "Sponsor funding pending confirmation"
  };
  return labels[status] ?? (status ? "Prize status under review" : "Prize breakdown not published");
}
