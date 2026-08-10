"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, ChevronDown, Coins, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, textareaClass } from "@/components/ui";
import { fetchChallengeDetails } from "@/lib/api/services";
import { apiRequest } from "@/lib/api/client";
import { PremiumBadge } from "@/components/brand";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { getChallengeLifecycleState, getChallengeTimelineDisplay, statusClassName } from "@/lib/challenge-status";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getPlanExperience } from "@/lib/plan-access";
import { ChallengeShare } from "@/components/challenge-share";
import { ChallengeMediaFrame } from "@/components/media-display";
import { DEFAULT_CHALLENGE_TIME_ZONE, formatChallengeDateTime } from "@/lib/challenge-date-time";
import { ChallengeParticipantCard, type PublicPredictionAccess, type PublicVotingAccess } from "@/components/challenge-participant-card";
import type { PublicChallengeParticipant } from "@/lib/server/challenge-participants";
import { DynamicTranslatedText } from "@/components/i18n/dynamic-translated-text";
import type { DynamicTranslations } from "@/lib/i18n/dynamic-content";

type ChallengeGuideSection = "overview" | "rules" | "submission" | "voting" | "prizes" | "leaderboard";

export default function ChallengeDetailPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const { user } = useCurrentUser();
  const [saved, setSaved] = useState(false);
  const [engagementMessage, setEngagementMessage] = useState("");
  const [comments, setComments] = useState<Array<{ id: string; displayName?: string; username?: string; avatarUrl?: string | null; body?: string; createdAt?: string; planId?: string; verified?: boolean }>>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [guideSection, setGuideSection] = useState<ChallengeGuideSection>("overview");
  const [entryCheckoutLoading, setEntryCheckoutLoading] = useState(false);
  const [entryCheckoutMessage, setEntryCheckoutMessage] = useState("");
  const [paymentReturnState, setPaymentReturnState] = useState<"" | "processing" | "canceled">("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["challenge-details", challengeId],
    queryFn: () => fetchChallengeDetails(challengeId),
    enabled: Boolean(challengeId),
    staleTime: 30_000
  });

  const details = data?.ok ? data.data : null;
  const challenge = useMemo(() => details?.challenge ? normalizeChallenge(details.challenge as ChallengeApiRecord) : null, [details?.challenge]);
  const challengeTranslations = ((details?.challenge as Record<string, unknown> | undefined)?.translations ?? {}) as { title?: DynamicTranslations; description?: DynamicTranslations };
  const challengeSubmissions = useMemo(() => {
    if (!challenge) return [];
    return (details?.submissions ?? []).map((item) => normalizeSubmission(item as SubmissionApiRecord, challenge)).filter((item) => item.id);
  }, [challenge, details?.submissions]);

  useEffect(() => {
    setSaved(Boolean(details?.userState?.saved));
  }, [details?.userState]);

  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get("payment");
    if (payment === "processing" || payment === "canceled") setPaymentReturnState(payment);
  }, []);

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
    const runtimeDetails = details as any;
    const journey = runtimeDetails?.userState?.participantJourney;
    const start = runtimeDetails?.phaseSummary?.submissionStartAt;
    if (journey?.step !== "entered_waiting_submission" || !start) return;
    const openAt = new Date(String(start)).getTime();
    if (!Number.isFinite(openAt)) return;
    const delay = openAt - Date.now();
    if (delay <= 0) {
      void refetch();
      return;
    }
    const timer = window.setTimeout(() => void refetch(), Math.min(delay + 500, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [(details as any)?.phaseSummary?.submissionStartAt, (details as any)?.userState?.participantJourney, refetch]);
  useEffect(() => {
    if (!challengeId) return;
    void apiRequest<{ comments: Array<{ id: string; displayName?: string; username?: string; avatarUrl?: string | null; body?: string; createdAt?: string; planId?: string; verified?: boolean }> }>(`/api/challenges/${challengeId}/comments`)
      .then((result) => setComments(result.ok ? result.data?.comments ?? [] : []));
  }, [challengeId]);

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
    if (action === "save_challenge") setSaved(enabled);
    setEngagementMessage(result.message);
  }

  async function addComment() {
    const result = await apiRequest<{ comment: { id: string; displayName?: string; username?: string; avatarUrl?: string | null; body?: string; createdAt?: string; planId?: string; verified?: boolean } }>(`/api/challenges/${challengeId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: commentBody })
    });
    setCommentMessage(result.message);
    if (result.ok && result.data?.comment) {
      setComments((current) => [...current, result.data!.comment]);
      setCommentBody("");
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
            <Card className="h-[280px] animate-pulse rounded-[16px] bg-[#171717] sm:h-[340px] md:h-[400px]" />
            <div className="mt-8 h-12 max-w-2xl animate-pulse rounded bg-[#171717]" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-28 animate-pulse bg-[#171717]" />)}</div>
          </div>
          <aside className="space-y-6 xl:pt-[432px]"><Card className="h-52 animate-pulse bg-[#171717]" /></aside>
        </div>
      </AppShell>
    );
  }

  if (data && !data.ok) {
    const notFound = data.message.toLowerCase().includes("not found");
    return (
      <AppShell>
        <Card className="max-w-3xl p-6 sm:p-8">
          <h1 className="text-2xl font-black text-[var(--gold-2)] sm:text-3xl">{notFound ? "Challenge not found" : "Challenge could not load"}</h1>
          <p className="mt-3 text-slate-300">{data.message}</p>
          <LinkButton href="/challenges" className="mt-6">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (!challenge) {
    return (
      <AppShell>
        <Card className="max-w-3xl p-6 sm:p-8">
          <h1 className="text-2xl font-black text-[var(--gold-2)] sm:text-3xl">Challenge not found</h1>
          <p className="mt-3 text-slate-300">This challenge does not exist or is not available.</p>
          <LinkButton href="/challenges" className="mt-6">Back to Challenges</LinkButton>
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
  const leaderboard = (details as { leaderboard?: { visible?: boolean; message?: string | null; status?: string; visibilityMode?: string; entries?: unknown[] } } | null)?.leaderboard;
  const totalVotes = Number(details?.voteCount ?? challengeSubmissions.reduce((sum, item) => sum + item.likes, 0));
  const prizePool = details?.prizePool;
  const prizeValue = Number(prizePool?.visibleJackpotCents ?? 0) > 0 ? `$${(Number(prizePool?.visibleJackpotCents) / 100).toLocaleString()}` : challenge.prizeType === "Bragging Rights (Leaderboard Ranking)" ? "Ranking" : "Not published";
  const planExperience = getPlanExperience({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType });
  const selectedAccountType = user?.selectedAccountType ?? user?.role ?? user?.accountType;
  const freeCompetitor = planExperience.planId === "free" && selectedAccountType !== "creator" && selectedAccountType !== "host";
  const ownerAccount = Boolean((userState as any)?.ownerAccount);
  const canBoost = Boolean(ownerAccount && (userState as any)?.boostAccess?.allowed);
  const sponsorAccount = user?.accountType === "sponsor" || user?.role === "sponsor" || selectedAccountType === "sponsor";
  const challengeKind = String((challenge as any).challengeType ?? (challenge as any).type ?? "").toLowerCase();
  const isLiveEvent = challengeKind.includes("live_event") || challengeKind.includes("live event");
  const creatorSuiteUrl = String((challenge as any).creatorSuiteUrl ?? (challenge as any).livestreamUrl ?? (challenge as any).livestreamEmbedUrl ?? "");
  const topParticipants = ((details as { topParticipants?: PublicChallengeParticipant[] } | null)?.topParticipants ?? []).slice(0, 5);
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
  const predictionAccess = (userState as any)?.predictionAccess as PublicPredictionAccess | undefined;
  const predictionPoolCents = Number(rawChallenge?.confirmedPredictionPoolCents ?? 0);
  const predictionCount = Number(rawChallenge?.confirmedPredictionCount ?? 0);
  const eligibleSubmissionCount = Number(votingAccess?.eligibleSubmissionCount ?? phaseSummary?.eligibleSubmissionCount ?? challengeSubmissions.length);
  const challengeTimeZone = String(timelineDisplay.timeZone ?? phaseSummary?.timeZone ?? (details?.challenge as any)?.timezone ?? (details?.challenge as any)?.timeZone ?? DEFAULT_CHALLENGE_TIME_ZONE);
  const nextImportantTime = timelineDisplay.nextLabel && timelineDisplay.nextAt ? `${timelineDisplay.nextLabel} ${formatChallengeDateTime(timelineDisplay.nextAt, challengeTimeZone)}` : null;
  const creatorDisplayName = String(rawChallenge?.creatorDisplayName ?? rawChallenge?.hostDisplayName ?? rawChallenge?.creatorName ?? "Challenge creator");
  const creatorUsername = String(rawChallenge?.creatorUsername ?? rawChallenge?.hostUsername ?? "");
  const mobileJourneyAction = String(participantJourney?.primaryAction ?? "");
  const mobileJourneyActionVisible = ["pay_entry_fee", "refresh_payment", "wait_for_submission", "submit_entry", "register", "enter_challenge", "request_entry", "view_voting", "view_entry", "manage_challenge", "sign_in"].includes(mobileJourneyAction);
  const leaderboardRelevant = Boolean(leaderboard?.visible && topParticipants.length > 0 && (votingOpen || ["voting_closed", "under_review", "winners_announced", "completed"].includes(phase)));
  const commentsClosed = ["completed", "winners_announced", "voting_closed"].includes(phase);
  const prizeStatusLabel = publicPrizeStatus(prizePool);
  const prizeAmountKind = ["confirmed", "funded", "active", "locked"].includes(String(prizePool?.status ?? "").toLowerCase()) ? "Prize amount" : "Estimated prize";
  const guideSections: Array<{ id: ChallengeGuideSection; label: string; body: string }> = [
    { id: "overview", label: "Overview", body: challenge.description },
    { id: "rules", label: "Rules & Eligibility", body: challenge.rules.length ? challenge.rules.map((rule) => rule.editableText).join(" ") : challenge.ageRestriction?.enabled ? `Minimum age: ${challenge.ageRestriction.minimumAge}.` : "Open to eligible platform users in supported regions." },
    { id: "submission", label: "Submission", body: `Accepted uploads: ${challenge.acceptedSubmissionTypes.join(", ")}. Entries must follow the published challenge rules and be submitted before the deadline.` },
    { id: "voting", label: "Voting & Judging", body: votingOpen ? "Voting is open for eligible submissions. One daily free vote and Challenge Credit additional votes remain separate actions." : phase === "voting_pending" ? "Voting becomes available when eligible submissions are approved." : "Voting follows the published challenge schedule and eligibility rules." },
    { id: "prizes", label: "Prizes", body: `${prizeStatusLabel}. ${Number(prizePool?.visibleJackpotCents ?? 0) > 0 ? `Published prize pool: ${prizeValue}.` : "No public prize amount is available."}` },
    { id: "leaderboard", label: "Leaderboard", body: leaderboardRelevant ? "The leaderboard is available below and contains eligible entries only." : "Leaderboard becomes available when voting opens." }
  ];
  const activeGuide = guideSections.find((section) => section.id === guideSection) ?? guideSections[0];

  return (
    <AppShell>
      <div className="grid max-w-[1240px] gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="min-w-0">
          <div data-mobile-challenge-meta className="mb-4 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em]">
            <span className="rounded-full bg-[var(--gold)]/10 px-3 py-2 text-[var(--gold)]">{challenge.category || challenge.type}</span>
          </div>
          <div className="relative overflow-hidden rounded-[16px]">
            <ChallengeMediaFrame src={challenge.imageUrl} alt={challenge.title} className="aspect-[16/10] h-auto border-0 sm:aspect-video" placeholder="Challenge Suite" />
            <span className="absolute right-3 top-3 max-w-[calc(100%-1.5rem)] rounded-full bg-[var(--gold)] px-3 py-2 text-xs font-black uppercase text-black sm:right-5 sm:top-5 sm:px-5 sm:py-3 sm:text-sm">{challenge.type}</span>
            <span data-status-badge className={`absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-full px-3 py-2 text-xs font-black sm:bottom-5 sm:left-5 sm:px-5 sm:py-3 sm:text-sm ${statusClassName(displayStatus as any)}`}>{displayStatus}</span>
          </div>
          <DynamicTranslatedText as="h1" className="mt-6 break-words text-3xl font-black sm:mt-8 md:text-5xl" text={challenge.title} translations={challengeTranslations.title} contentType="challenge_title" />
          <div data-mobile-creator-row className="mt-4 flex min-h-12 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-xs font-black text-black">{creatorDisplayName.slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0"><p className="text-xs font-bold text-slate-500">Created by</p>{creatorUsername ? <a href={`/profile/${creatorUsername}`} className="block truncate font-black hover:text-[var(--gold)]">{creatorDisplayName}</a> : <p className="truncate font-black">{creatorDisplayName}</p>}</div>
          </div>
          <div data-challenge-summary-strip className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-white/10 bg-white/10 lg:grid-cols-4">
            <SummaryItem value={challenge.participants.toLocaleString()} label="Participants" />
            <SummaryItem value={prizeValue} label="Prize" />
            <SummaryItem value={displayStatus} label="Current phase" support={nextImportantTime ?? undefined} />
            <SummaryItem value={votingOpen ? "Voting open" : eligibleSubmissionCount <= 0 ? "Voting unavailable" : "Voting not started"} label={`${totalVotes.toLocaleString()} verified votes`} />
          </div>
          <Card data-mobile-primary-action className="mt-5 p-5 sm:p-8">
            <ParticipantJourneyPanel
              journey={participantJourney}
              phaseLabel={displayStatus}
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
          {ownerAccount ? <Card className="mt-6 p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Owner Controls</p><div className="mt-4 grid gap-3 sm:flex sm:flex-wrap"><LinkButton href={`/challenges/${challenge.id}/manage`} className="w-full sm:w-auto">Manage Challenge</LinkButton>{canBoost ? <LinkButton href={`/challenges/${challenge.id}/boost`} className="w-full sm:w-auto" variant="secondary">Boost Challenge</LinkButton> : null}<LinkButton href={`/challenges/${challenge.id}/participants`} className="w-full sm:w-auto" variant="secondary">Manage Participants</LinkButton></div></Card> : null}
          <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
            <ChallengeShare className="w-full sm:w-auto" title={challenge.title} description={challenge.description} path={`/challenges/${challenge.id}`} />
            <Button className="w-full sm:w-auto" variant="secondary" onClick={() => void updateEngagement("save_challenge", !saved)}><Bookmark size={17} /> {saved ? "Saved" : "Save Challenge"}</Button>
          </div>
          {engagementMessage ? <p className="mt-3 text-sm text-slate-300">{engagementMessage}</p> : null}
          {paidEntryReturnedPending ? <Card className="mt-4 border-[var(--gold)]/30 bg-[var(--gold)]/10 p-4 text-sm text-yellow-50">Payment received. We are confirming your enrollment.</Card> : null}
          {paidEntryCanceled ? <Card className="mt-4 border-slate-600 bg-slate-900/60 p-4 text-sm text-slate-300">Payment canceled. You remain unenrolled.</Card> : null}
          {(details?.challenge as any)?.resultsConfirmed ? <Card className="mt-4 border-emerald-400/20 bg-emerald-950/20 p-4"><p className="font-black text-emerald-200">Results confirmed</p><p className="mt-1 text-sm text-slate-300">{(details?.challenge as any)?.settlementPrepared ? "Settlement prepared. Internal prize allocations remain subject to review." : "Winner results were approved."}</p></Card> : null}
          <DynamicTranslatedText as="p" className="mt-4 break-words text-base leading-7 text-slate-200 sm:text-xl" text={challenge.description} translations={challengeTranslations.description} contentType="challenge_description" showUnavailable />
          {challenge.trailerUrl ? <video className="mt-10 w-full rounded-[8px]" controls src={challenge.trailerUrl} /> : null}

          <Card className="mt-10 p-5 sm:p-7">
            <h2 className="text-2xl font-black">Challenge Guide</h2>
            <div role="tablist" aria-label="Challenge guide sections" className="mt-5 flex gap-2 overflow-x-auto pb-2">
              {guideSections.map((section) => <button key={section.id} type="button" role="tab" aria-selected={guideSection === section.id} onClick={() => setGuideSection(section.id)} className={`min-h-11 shrink-0 rounded-[8px] px-4 py-2 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] ${guideSection === section.id ? "bg-[var(--gold)] text-black" : "bg-white/[0.05] text-slate-300 hover:bg-white/10"}`}>{section.label}</button>)}
            </div>
            <div role="tabpanel" className="mt-4 rounded-[8px] border border-white/10 bg-black/30 p-5"><h3 className="font-black text-[var(--gold)]">{activeGuide.label}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{activeGuide.body}</p></div>
          </Card>
          <section className="mt-12">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black">Leading Participants</h2>
                <p className="mt-2 text-sm text-slate-400">Top eligible entries ranked by verified votes.</p>
              </div>
              <LinkButton href={`/challenges/${challenge.id}/participants`} variant="secondary">See all participants</LinkButton>
            </div>
            {leaderboardRelevant ? (
              <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {topParticipants.map((participant) => (
                  <ChallengeParticipantCard
                    key={participant.submissionId}
                    challengeId={challenge.id}
                    participant={participant}
                    votingAccess={(votingAccess ?? { authenticated: Boolean(user), canVote: false, reason: "voting_closed" }) as PublicVotingAccess}
                    predictionAccess={predictionAccess}
                    returnPath={`/challenges/${challenge.id}`}
                    onVoteRecorded={async () => { await refetch(); }}
                  />
                ))}
              </div>
            ) : <p className="mt-5 rounded-[8px] border border-dashed border-white/15 px-4 py-3 text-sm text-slate-400">Leaderboard becomes available when voting opens.</p>}
          </section>

          <section className="mt-12 border-t border-white/10 pt-10">
            <button type="button" aria-expanded={commentsOpen} onClick={() => setCommentsOpen((open) => !open)} className="flex min-h-12 w-full items-center justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">
              <span className="text-2xl font-black">Comments ({comments.length})</span><ChevronDown className={`shrink-0 transition-transform ${commentsOpen ? "rotate-180" : ""}`} />
            </button>
            {commentsOpen ? <Card className="mt-5 p-5 sm:p-6">
              {commentsClosed ? <p className="rounded-[8px] bg-white/[0.04] p-4 text-sm text-slate-300">Comments are closed for this completed challenge.</p> : <><textarea className={textareaClass} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Add to the conversation..." maxLength={1000} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">Comments include moderation status and may be reviewed.</p>
                <Button onClick={() => void addComment()} disabled={commentBody.trim().length < 2}>Post Comment</Button>
              </div>
              {commentMessage ? <p className="mt-3 text-sm text-slate-300">{commentMessage}</p> : null}</>}
              <div className="mt-6 space-y-3">
                {comments.length ? comments.map((comment) => { const profileHref = comment.username ? `/profile/${comment.username}` : "/profile"; const name = comment.displayName || "Challenge Suite member"; return <div key={comment.id} className="rounded-[8px] bg-[#191919] p-4"><div className="flex flex-wrap items-center gap-3"><a href={profileHref} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--gold)] text-xs font-black text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" aria-label={`View ${name} profile`}>{comment.avatarUrl ? <img src={comment.avatarUrl} alt="" className="h-full w-full object-cover" /> : name.slice(0, 2).toUpperCase()}</a><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 font-black text-[var(--gold)]"><a href={profileHref} className="break-words hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">{name}</a><PremiumBadge planId={comment.planId as any} compact />{comment.verified ? <span className="text-xs text-[var(--gold-2)]">Verified</span> : null}</div>{comment.username ? <p className="text-xs text-slate-500">@{comment.username}</p> : null}</div></div><p className="mt-3 whitespace-pre-wrap break-words text-slate-200">{comment.body}</p></div>; }) : <p className="rounded-[8px] bg-[#191919] p-4 text-slate-300">No comments yet. Start the conversation.</p>}
              </div>
            </Card> : null}
          </section>
          <section className="mt-12 border-t border-white/10 pt-8">
            <LinkButton href="/explore" variant="secondary" className="w-full sm:w-auto">Explore More Challenges</LinkButton>
          </section>
        </div>

        <aside className="space-y-5 xl:pt-[432px]">
          {sponsorAccount ? <Card className="border-yellow-500/30 bg-yellow-950/10 p-5 text-center sm:p-8">
            <h3 className="text-xl font-black text-[var(--gold)]">Sponsorship</h3>
            <p className="mt-3">Submit a sponsor contribution request. Sponsor contributions are confirmed before any public funding status updates. No investment return is promised.</p>
            <LinkButton href={`/challenges/${challenge.id}/sponsor`} className="mt-5 w-full sm:w-auto">Propose Sponsorship</LinkButton>
          </Card> : null}
          {!freeCompetitor && prizePool && (prizePool.visibleJackpotCents > 0 || prizePool.status !== "disabled") ? <Card className="border-[var(--gold)]/20 bg-[var(--gold)]/5 p-5 sm:p-7"><h2 className="text-2xl font-black">Prize Pool</h2><p className="mt-2 text-sm font-bold text-slate-300">{prizeStatusLabel}</p>{prizePool.visibleJackpotCents > 0 ? <><p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">{prizeAmountKind}</p><p className="mt-1 text-3xl font-black text-[var(--gold)]">{prizeValue}</p></> : null}{String(prizePool.status).includes("pending_funding") ? <p className="mt-3 text-sm text-slate-300">Funding verification is pending. Prize distribution will occur after confirmation.</p> : null}<div className="mt-5 grid gap-3 sm:grid-cols-3">{prizePool.winnerSplits.map((split) => <div key={split.position} className="rounded-[8px] bg-black/30 p-4 text-center"><p className="font-black">{split.position === 1 ? "1st place" : split.position === 2 ? "2nd place" : "3rd place"} - {split.percent}%</p><p className="mt-1 text-sm font-black text-[var(--gold)]">${(split.expectedAmountCents / 100).toLocaleString()}</p></div>)}</div></Card> : null}
          {predictionAccess?.visible || predictionAccess?.available ? <Card className="border-[var(--gold)]/30 bg-[var(--gold)]/5 p-5 sm:p-7">
            <div className="flex items-start gap-3"><Coins className="mt-1 text-[var(--gold)]" /><div><h3 className="text-xl font-black">Prediction Arena</h3><p className="mt-2 text-sm leading-6 text-slate-300">Predict who you think will win before voting opens.</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-slate-500">Total staked</p><p className="font-black">${(predictionPoolCents / 100).toLocaleString()}</p></div><div><p className="text-slate-500">Predictors</p><p className="font-black">{predictionCount.toLocaleString()}</p></div></div>
            {predictionAccess.closesAt ? <p className="mt-3 text-xs leading-5 text-slate-400">Closes {formatChallengeDateTime(predictionAccess.closesAt, challengeTimeZone)}</p> : null}
            {predictionAccess.windowOpen ? <LinkButton href={`/challenges/${challenge.id}/prediction`} className="mt-5 w-full">Enter Prediction Arena</LinkButton> : <Button className="mt-5 w-full" disabled>Locked</Button>}<p className="mt-3 text-xs leading-5 text-slate-500">{predictionAccess.windowOpen ? "Predictions close when voting opens." : "New stakes and participant changes are closed. Awaiting official results."}</p>
          </Card> : null}

          {isLiveEvent ? <Card className="border-[var(--gold)]/20 bg-[var(--gold)]/5 p-5 sm:p-7">
            <h3 className="text-xl font-black">Live Event Stream</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">This event will stream through Creator Suite.</p>
            {creatorSuiteUrl ? <a href={creatorSuiteUrl} className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-[8px] bg-[var(--gold)] px-5 py-3 text-sm font-black text-black" target="_blank" rel="noreferrer">Open Creator Suite</a> : <Button className="mt-5 w-full" disabled>Creator Suite link not available yet</Button>}
          </Card> : null}
          <Card id="vote" className="p-5 sm:p-8">
            <h3 className="text-xl font-black">Information & Rules</h3>
            {challenge.rules.length ? challenge.rules.map((rule) => <p key={rule.id} className="mt-3 text-slate-300">- {rule.editableText}</p>) : <p className="mt-3 text-slate-300">Rules have not been published for this challenge yet.</p>}
            <div className="mt-5">
              {votingOpen && eligibleSubmissionCount > 0 ? <LinkButton href={`/challenges/${challenge.id}/votes`} className="w-full"><Vote size={17} /> View Voting</LinkButton> : <Button className="w-full" disabled><Vote size={17} /> {eligibleSubmissionCount <= 0 ? "Voting Unavailable" : lifecycle.votingStatus === "voting_not_open" ? "Voting Not Open" : lifecycle.votingStatus === "voting_not_enabled" ? "Voting Unavailable" : "Voting Closed"}</Button>}
            </div>
            {votingOpen && eligibleSubmissionCount > 0 ? <div className="mt-4 rounded-[8px] border border-white/10 bg-white/[0.03] p-4"><p className="text-sm font-black text-[var(--gold)]">Additional Votes</p><p className="mt-2 text-xs leading-5 text-slate-400">Additional votes cost 10 Challenge Credits each and count only under this challenge&apos;s voting rules.</p><LinkButton href={`/challenges/${challenge.id}/bonus-votes`} className="mt-3 w-full" variant="secondary">Use Challenge Credits</LinkButton></div> : <p className="mt-4 text-sm text-slate-400">{eligibleSubmissionCount <= 0 ? "No eligible submissions are available for voting yet." : "Additional votes become available when voting opens."}</p>}
          </Card>
        </aside>
      </div>
      {mobileJourneyActionVisible ? <><div className="h-24 lg:hidden" aria-hidden="true" /><div data-mobile-sticky-cta className="mobile-sticky-action fixed inset-x-0 bottom-0 z-40 border-t border-[var(--gold)]/25 bg-[#090909]/96 px-4 pt-3 backdrop-blur lg:hidden [&>*]:mt-0">
        <JourneyAction action={mobileJourneyAction} href={participantJourney?.primaryHref} challengeId={challenge.id} entryFeeLabel={entryFeeLabel} loading={entryCheckoutLoading} onPay={() => void startPaidEntryCheckout()} onRefresh={() => void refetch()} waitLabel={participantJourney?.checklist?.submissionOpensAt ? `Submission opens at ${formatChallengeDateTime(participantJourney.checklist.submissionOpensAt, challengeTimeZone)}` : "Submission opens soon"} submissionOpensAt={participantJourney?.checklist?.submissionOpensAt} />
      </div></> : null}
    </AppShell>
  );
}


function ParticipantJourneyPanel({ journey, phaseLabel, challengeId, entryFeeLabel, paidEntryRequired, entryCheckoutLoading, entryCheckoutMessage, onPay, onRefresh, timeZone, registrationClosesAt }: { journey: any; phaseLabel: string; challengeId: string; entryFeeLabel: string; paidEntryRequired: boolean; entryCheckoutLoading: boolean; entryCheckoutMessage: string; onPay: () => void; onRefresh: () => void; timeZone: string; registrationClosesAt?: string | null }) {
  const action = String(journey?.primaryAction ?? "back_to_challenge");
  const label = String(journey?.label ?? "Challenge Entry");
  const message = String(journey?.message ?? "Open the entry page for the next step.");
  const checklist = journey?.checklist ?? {};
  const registered = Boolean(checklist.registered || checklist.entered);
  const waitLabel = checklist.submissionOpensAt ? `Submission opens at ${formatChallengeDateTime(checklist.submissionOpensAt, timeZone)}` : "Submission opens soon";
  const progressItems = [
    ["Registration", checklist.registered ? "Complete" : "Required"],
    ["Approval", checklist.approvalRequired ? checklist.approvalGranted ? "Approved" : "Pending" : "Not required"],
    ["Payment", checklist.paymentRequired ? checklist.paymentConfirmed ? "Confirmed" : action === "refresh_payment" ? "Processing" : "Required" : "Not required"],
    ["Submission", submissionChecklistLabel(checklist, timeZone)],
    ["Deadline", checklist.submissionDeadline ? formatChallengeDateTime(checklist.submissionDeadline, timeZone) : "Not published"],
    ["Entry", checklist.alreadySubmitted ? "Submitted" : "Not submitted"]
  ];
  return <div className="text-left"><div className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Current phase</p><p className="mt-1 text-lg font-black text-white">{phaseLabel}</p></div><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Entry fee</p><p className="mt-1 text-lg font-black text-[var(--gold)]">{paidEntryRequired ? entryFeeLabel : "Free"}</p></div><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{registered ? "Next action" : "Registration deadline"}</p><p className="mt-1 text-sm font-black leading-6 text-white">{registered ? label : registrationClosesAt ? formatChallengeDateTime(registrationClosesAt, timeZone) : "Not published"}</p></div></div><div className="mt-5 rounded-[8px] border border-white/10 bg-black/30 p-4"><h3 className="font-black text-white">{label}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{message}</p></div>{registered ? <div className="mt-5 grid gap-2 sm:grid-cols-2"><p className="col-span-full text-xs font-black uppercase tracking-[0.16em] text-slate-500">Participation progress</p>{progressItems.map(([name, value]) => <div key={name} className="flex min-w-0 items-center justify-between gap-3 rounded-[8px] bg-white/[0.04] px-3 py-2 text-sm"><span className="font-bold text-slate-300">{name}</span><span className="text-right font-black text-white">{value}</span></div>)}</div> : <div className="mt-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Eligibility</p><p className="mt-1 text-sm text-slate-300">{message}</p></div>}<JourneyAction action={action} blockerCode={journey?.blockerCode} href={journey?.primaryHref} challengeId={challengeId} entryFeeLabel={entryFeeLabel} registered={registered} loading={entryCheckoutLoading} onPay={onPay} onRefresh={onRefresh} waitLabel={waitLabel} submissionOpensAt={checklist.submissionOpensAt} />{entryCheckoutMessage ? <p className="mt-3 rounded-[8px] bg-red-950/40 p-3 text-sm text-red-200">{entryCheckoutMessage}</p> : null}</div>;
}
function JourneyAction({ action, blockerCode, href, challengeId, entryFeeLabel, registered = false, loading, onPay, onRefresh, waitLabel, submissionOpensAt }: { action: string; blockerCode?: string | null; href?: string | null; challengeId: string; entryFeeLabel: string; registered?: boolean; loading: boolean; onPay: () => void; onRefresh: () => void; waitLabel?: string; submissionOpensAt?: string | null }) {
  if (action === "pay_entry_fee") return <Button className="mt-5 w-full" onClick={onPay} disabled={loading}>{loading ? "Starting Checkout..." : registered ? "Retry Payment" : `Pay ${entryFeeLabel} & Join Challenge`}</Button>;
  if (action === "refresh_payment") return <Button className="mt-5 w-full" variant="secondary" onClick={onRefresh}>Refresh Status</Button>;
  if (action === "wait_for_submission") return <SubmissionCountdown opensAt={submissionOpensAt} formattedOpenAt={waitLabel} onOpen={onRefresh} />;
  if (action === "submit_entry") return <LinkButton href={`/challenges/${challengeId}/join`} className="mt-5 w-full">Submit Entry</LinkButton>;
  if (action === "register" || action === "enter_challenge" || action === "request_entry") return <LinkButton href={`/challenges/${challengeId}/join`} className="mt-5 w-full">{action === "register" ? "Join Challenge" : action === "enter_challenge" ? "Complete Entry Details" : "Request Entry"}</LinkButton>;
  if (action === "view_voting") return <LinkButton href={`/challenges/${challengeId}/votes`} className="mt-5 w-full" variant="secondary">Vote Now</LinkButton>;
  if (action === "view_winners") return <LinkButton href="/winners" className="mt-5 w-full">View Winners</LinkButton>;
  if (action === "view_results") return <LinkButton href="/winners" className="mt-5 w-full">View Results</LinkButton>;
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
  return <div className="mt-5"><p className="text-center text-sm font-black text-[var(--gold)]">Submissions open in {countdown}</p>{formattedOpenAt ? <p className="mt-1 text-center text-xs text-slate-400">{formattedOpenAt.replace(/^Submission opens at\s+/i, "")}</p> : null}<Button className="mt-3 w-full" variant="secondary" disabled>Submission opens soon</Button></div>;
}
function SummaryItem({ value, label, support }: { value: string; label: string; support?: string }) {
  return <div className="min-w-0 bg-[#111] px-4 py-4"><p className="whitespace-normal break-normal text-base font-black leading-6 text-white">{value}</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>{support ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{support}</p> : null}</div>;
}


function submissionChecklistLabel(checklist: any, timeZone: string) {
  if (checklist.timelineNeedsReview) return "Schedule pending";
  if (checklist.submissionOpen) return "Open";
  if (checklist.submissionDeadline && Date.now() > new Date(String(checklist.submissionDeadline)).getTime()) return "Closed";
  if (checklist.submissionOpensAt) return `Opens ${formatChallengeDateTime(checklist.submissionOpensAt, timeZone)}`;
  return "Not open yet";
}

function publicChallengePhaseLabel(value: string) {
  return value.toLowerCase().includes("timeline needs review") ? "Schedule pending" : value;
}

function publicPrizeStatus(prizePool: { visibleJackpotCents?: number; status?: string } | null | undefined) {
  const status = String(prizePool?.status ?? "").toLowerCase();
  if (Number(prizePool?.visibleJackpotCents ?? 0) > 0 && ["confirmed", "funded", "active", "locked"].includes(status)) return "Prize pool confirmed";
  if (status === "pending_funding" || (status.includes("sponsor") && ["pending", "proposed", "awaiting_confirmation"].some((value) => status.includes(value)))) return `Sponsor-funded prize pool: $${(Number(prizePool?.visibleJackpotCents ?? 0) / 100).toLocaleString()}`;
  if (["review", "verification", "pending_confirmation"].some((value) => status.includes(value))) return "Prize under verification";
  return "Prize breakdown not published";
}
function ChallengeMediaPlaceholder() {
  return <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(246,198,75,.24),transparent_45%),linear-gradient(135deg,#161616,#050505)] px-6 text-center">
    <div>
      <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--gold)]">Challenge Suite</p>
      <p className="mt-3 text-3xl font-black text-white sm:text-5xl">Live Challenge</p>
    </div>
  </div>;
}
