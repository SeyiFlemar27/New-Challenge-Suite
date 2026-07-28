"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Coins, Rocket, Trophy, Users, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, textareaClass } from "@/components/ui";
import { fetchChallengeDetails } from "@/lib/api/services";
import { apiRequest } from "@/lib/api/client";
import { PremiumBadge } from "@/components/brand";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { getChallengeLifecycleState, statusClassName } from "@/lib/challenge-status";
import type { Submission } from "@/lib/types";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getPlanExperience } from "@/lib/plan-access";
import { ChallengeShare } from "@/components/challenge-share";
import { AvatarFrame, ChallengeMediaFrame, SubmissionMediaFrame } from "@/components/media-display";

type DetailSubmission = Submission & { userPlanId?: string };

export default function ChallengeDetailPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const { user } = useCurrentUser();
  const [saved, setSaved] = useState(false);
  const [engagementMessage, setEngagementMessage] = useState("");
  const [comments, setComments] = useState<Array<{ id: string; displayName?: string; username?: string; avatarUrl?: string | null; body?: string; createdAt?: string; planId?: string; verified?: boolean }>>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantLimit, setParticipantLimit] = useState(12);
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
  const displayStatus = String(phaseSummary?.label ?? lifecycle.primaryLabel);
  const phase = String(phaseSummary?.phase ?? lifecycle.primaryStatus);
  const joinOpen = Boolean(phaseSummary?.canJoin ?? lifecycle.canJoin);
  const submissionOpen = Boolean(phaseSummary?.canSubmit ?? lifecycle.canSubmit);
  const votingOpen = Boolean(phaseSummary?.canVote ?? lifecycle.canVote);
  const userState = details?.userState;
  const viewerState = (userState as any)?.viewerState;
  const viewerRelationship = String(viewerState?.relationship ?? "viewer");
  const leaderboard = (details as { leaderboard?: { visible?: boolean; message?: string | null; status?: string; visibilityMode?: string; entries?: unknown[] } } | null)?.leaderboard;
  const totalVotes = Number(details?.voteCount ?? challengeSubmissions.reduce((sum, item) => sum + item.likes, 0));
  const sponsorships = details?.sponsorships ?? [];
  const sponsored = sponsorships.length > 0;
  const prizePool = details?.prizePool;
  const prizeValue = Number(prizePool?.visibleJackpotCents ?? 0) > 0 ? `$${(Number(prizePool?.visibleJackpotCents) / 100).toLocaleString()}` : challenge.prizeType === "Bragging Rights (Leaderboard Ranking)" ? "Ranking" : "Pending review";
  const planExperience = getPlanExperience({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType });
  const selectedAccountType = user?.selectedAccountType ?? user?.role ?? user?.accountType;
  const freeCompetitor = planExperience.planId === "free" && selectedAccountType !== "creator" && selectedAccountType !== "host";
  const canBoost = planExperience.monthlyBoostLimit > 0 && (selectedAccountType === "creator" || selectedAccountType === "host");
  const sponsorAccount = user?.accountType === "sponsor" || user?.role === "sponsor" || selectedAccountType === "sponsor";
  const challengeKind = String((challenge as any).challengeType ?? (challenge as any).type ?? "").toLowerCase();
  const isLiveEvent = challengeKind.includes("live_event") || challengeKind.includes("live event");
  const predictionEnabled = Boolean((challenge as any).predictionEnabled || (challenge as any).predictionArenaEnabled);
  const creatorSuiteUrl = String((challenge as any).creatorSuiteUrl ?? (challenge as any).livestreamUrl ?? (challenge as any).livestreamEmbedUrl ?? "");
  const participants = ((details as { participants?: Array<{ id: string; displayName: string; username?: string | null; avatarUrl?: string | null; participantStatus?: string; entryStatus?: string | null; profilePath?: string }> } | null)?.participants ?? []);
  const filteredParticipants = participants.filter((participant) => `${participant.displayName} ${participant.username ?? ""}`.toLowerCase().includes(participantSearch.toLowerCase()));
  const visibleParticipants = filteredParticipants.slice(0, participantLimit);
  const rawChallenge = details?.challenge as Record<string, any> | undefined;
  const monetization = rawChallenge?.monetization && typeof rawChallenge.monetization === "object" ? rawChallenge.monetization as Record<string, any> : {};
  const challengePaidEntry = rawChallenge?.paidEntry && typeof rawChallenge.paidEntry === "object" ? rawChallenge.paidEntry as Record<string, any> : {};
  const userPaidEntry = (userState as any)?.paidEntry && typeof (userState as any).paidEntry === "object" ? (userState as any).paidEntry as Record<string, any> : {};
  const entryFeeCents = Number(userPaidEntry.amountCents ?? challengePaidEntry.amountCents ?? monetization.entryFeeAmountCents ?? rawChallenge?.entryFeeAmountCents ?? rawChallenge?.entryFeeCents ?? 0);
  const paidEntryRequired = Boolean(userPaidEntry.required ?? challengePaidEntry.required ?? (monetization.paidEntryRequested || rawChallenge?.paidEntryEnabled || rawChallenge?.entryFeeRequired)) && entryFeeCents > 0;
  const premiumOnlyChallenge = Boolean(rawChallenge?.premiumOnly || rawChallenge?.planRequired || rawChallenge?.hostPremiumOnly || rawChallenge?.creatorPremiumOnly);
  const freePremiumBlocked = Boolean(freeCompetitor && premiumOnlyChallenge);
  const entryFeeLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.max(0, entryFeeCents) / 100);
  const entryPaymentStatus = String(userPaidEntry.paymentStatus ?? (userState as any)?.entryPaymentStatus ?? "not_started");
  const paidEntryPending = Boolean((userState as any)?.entryPaymentPending || entryPaymentStatus === "pending");
  const paidEntryEnrolled = Boolean(userPaidEntry.canSubmit || (userState as any)?.paidEntryEnrolled || ["paid", "confirmed"].includes(entryPaymentStatus));
  const paidEntryReturnedPending = paymentReturnState === "processing" && paidEntryRequired && !paidEntryEnrolled;
  const paidEntryCanceled = paymentReturnState === "canceled" && paidEntryRequired && !paidEntryEnrolled;
  const alreadySubmitted = Boolean((userState as any)?.submitted);
  const submissionId = String((userState as any)?.submissionId ?? "");
  const paidEntryCtaLabel = paidEntryPending || paidEntryReturnedPending ? "Confirming Payment" : `Pay & Enter - ${entryFeeLabel}`;
  const participantJourney = (userState as any)?.participantJourney;

  return (
    <AppShell>
      <div className="grid max-w-[1240px] gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-[16px]">
            <ChallengeMediaFrame src={challenge.imageUrl} alt={challenge.title} className="border-0" placeholder="Challenge Suite" />
            <span className="absolute right-3 top-3 max-w-[calc(100%-1.5rem)] rounded-full bg-[var(--gold)] px-3 py-2 text-xs font-black uppercase text-black sm:right-5 sm:top-5 sm:px-5 sm:py-3 sm:text-sm">{challenge.type}</span>
            <span className={`absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-full px-3 py-2 text-xs font-black sm:bottom-5 sm:left-5 sm:px-5 sm:py-3 sm:text-sm ${statusClassName(displayStatus as any)}`}>{displayStatus}</span>
          </div>
          <h1 className="mt-6 break-words text-3xl font-black sm:mt-8 md:text-5xl">{challenge.title}</h1>
          <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
            {canBoost ? <LinkButton href={`/challenges/${challenge.id}/boost`} className="w-full sm:w-auto"><Rocket size={17} /> Boost Challenge</LinkButton> : null}
            <ChallengeShare className="w-full sm:w-auto" title={challenge.title} description={challenge.description} path={`/challenges/${challenge.id}`} />
            <Button className="w-full sm:w-auto" variant="secondary" onClick={() => void updateEngagement("save_challenge", !saved)}><Bookmark size={17} /> {saved ? "Saved" : "Save Challenge"}</Button>
          </div>
          {engagementMessage ? <p className="mt-3 text-sm text-slate-300">{engagementMessage}</p> : null}
          {paidEntryReturnedPending ? <Card className="mt-4 border-[var(--gold)]/30 bg-[var(--gold)]/10 p-4 text-sm text-yellow-50">Payment received. We are confirming your enrollment.</Card> : null}
          {paidEntryCanceled ? <Card className="mt-4 border-slate-600 bg-slate-900/60 p-4 text-sm text-slate-300">Payment canceled. You remain unenrolled.</Card> : null}
          <p className="mt-4 break-words text-base leading-7 text-slate-200 sm:text-xl">{challenge.description}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric value={challenge.participants.toString()} label="Participants" support="Registered" />
            <Metric value={prizeValue} label="Prize details" support="Requires review" />
            <Metric value={displayStatus} label="Current stage" support={phase === "voting_pending" ? "No eligible submissions yet" : lifecycle.actionLabel} />
            <Metric value={totalVotes.toLocaleString()} label="Votes" support={votingOpen ? "Voting open" : "Voting unavailable"} />
          </div>
          {challenge.trailerUrl ? <video className="mt-10 w-full rounded-[8px]" controls src={challenge.trailerUrl} /> : null}

          <Card className="mt-10 p-5 sm:p-7">
            <h2 className="text-2xl font-black">Challenge Guide</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Info title="Overview" body={challenge.description} />
              <Info title="How to participate" body="Join the challenge, accept the rules, upload an approved image or video, then submit before the deadline." />
              <Info title="Submission requirements" body={`Accepted uploads: ${challenge.acceptedSubmissionTypes.join(", ")}. Entries must follow community guidelines.`} />
              <Info title="Judging method" body="Rankings combine verified voting activity, rule compliance, and creator review when applicable." />
              <Info title="Voting rules" body={votingOpen ? "Voting is open. Free users get 1 vote per challenge/day. Additional votes can use DoroCoins, which are platform points." : phase === "voting_pending" ? "No eligible submissions are available for voting yet." : lifecycle.votingStatus === "voting_not_open" ? `Voting opens ${formatPhaseDate(phaseSummary?.votingStartAt) ?? "later"}.` : lifecycle.votingStatus === "voting_not_enabled" ? "Voting is not enabled for this challenge." : "Voting is closed for this challenge."} />
              <Info title="Prize and earnings" body="Winners are reviewed before earnings become available. Sponsor-funded prizes go 100% to approved winners. KYC and review checks are required before withdrawal." />
              <Info title="Timeline" body={`Registration closes ${formatPhaseDate(phaseSummary?.registrationEndAt) ?? challenge.registrationDeadline}. Submissions ${submissionOpen ? "are open" : `open ${formatPhaseDate(phaseSummary?.submissionStartAt) ?? "after registration"}`}.`} />
              <Info title="Eligibility" body={challenge.ageRestriction?.enabled ? `Minimum age: ${challenge.ageRestriction.minimumAge}` : "Open to eligible platform users in supported regions."} />
              {sponsored && !freeCompetitor ? <Info title="Sponsor information" body={`${sponsorships.length} sponsorship proposal${sponsorships.length === 1 ? "" : "s"} recorded for this challenge.`} /> : null}
            </div>
          </Card>
          <section className="mt-12">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black">Participants</h2>
                <p className="mt-2 text-sm text-slate-400">{participants.length.toLocaleString()} participating. Public views only show approved or active participant profile details.</p>
              </div>
              <input className="min-h-11 rounded-[8px] border border-white/10 bg-[#151515] px-4 text-sm font-bold text-white outline-none focus:border-[var(--gold)] sm:w-72" value={participantSearch} onChange={(event) => { setParticipantSearch(event.target.value); setParticipantLimit(12); }} placeholder="Search participants" />
            </div>
            {visibleParticipants.length ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleParticipants.map((participant) => <a key={participant.id} href={participant.profilePath || "/profile"} className="rounded-[8px] border border-white/10 bg-[#151515] p-4 transition hover:border-[var(--gold)]/50"><div className="flex items-center gap-3"><AvatarFrame src={participant.avatarUrl} alt={participant.displayName} className="h-12 w-12 shrink-0 border-0" placeholder={String(participant.displayName ?? "CS").slice(0, 2).toUpperCase()} /><div className="min-w-0"><p className="truncate font-black">{participant.displayName}</p>{participant.username ? <p className="truncate text-xs text-slate-400">@{participant.username}</p> : null}</div></div><div className="mt-4 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.12em]"><span className="rounded-full bg-[var(--gold)]/10 px-3 py-1 text-[var(--gold)]">{String(participant.participantStatus ?? "active").replaceAll("_", " ")}</span>{participant.entryStatus ? <span className="rounded-full bg-white/10 px-3 py-1 text-slate-300">{participant.entryStatus.replaceAll("_", " ")}</span> : null}</div></a>)}
              </div>
            ) : <Card className="mt-6 border-dashed p-6 text-center text-slate-400">No public participants match this view yet.</Card>}
            {filteredParticipants.length > visibleParticipants.length ? <Button variant="secondary" className="mt-5" onClick={() => setParticipantLimit((value) => value + 24)}>Load More Participants</Button> : null}
          </section>

          <section className="mt-12">
            <h2 className="text-2xl font-black">Community Submissions</h2>
            {leaderboard?.message ? <Card className="mt-6 border-yellow-500/30 bg-yellow-950/10 p-5 text-[var(--gold)]">{leaderboard.message}</Card> : null}
            {challengeSubmissions.length ? (
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                {challengeSubmissions.map((entry, index) => <SubmissionVoteCard key={entry.id} rank={index + 1} submission={entry} votingOpen={votingOpen} />)}
              </div>
            ) : (
              <p className="mt-6 text-slate-400">{leaderboard?.message ? "Rankings are not public right now." : "No eligible submissions yet. Join and upload an accepted media file to become the first entry."}</p>
            )}
          </section>

          <section className="mt-12 border-t border-white/10 pt-10">
            <h2 className="text-2xl font-black">Comments</h2>
            <Card className="mt-6 p-5 sm:p-6">
              <textarea className={textareaClass} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Add to the conversation..." maxLength={1000} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">Comments include moderation status and may be reviewed.</p>
                <Button onClick={() => void addComment()} disabled={commentBody.trim().length < 2}>Post Comment</Button>
              </div>
              {commentMessage ? <p className="mt-3 text-sm text-slate-300">{commentMessage}</p> : null}
              <div className="mt-6 space-y-3">
                {comments.length ? comments.map((comment) => { const profileHref = comment.username ? `/profile/${comment.username}` : "/profile"; const name = comment.displayName || "Challenge Suite member"; return <div key={comment.id} className="rounded-[8px] bg-[#191919] p-4"><div className="flex flex-wrap items-center gap-3"><a href={profileHref} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--gold)] text-xs font-black text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" aria-label={`View ${name} profile`}>{comment.avatarUrl ? <img src={comment.avatarUrl} alt="" className="h-full w-full object-cover" /> : name.slice(0, 2).toUpperCase()}</a><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 font-black text-[var(--gold)]"><a href={profileHref} className="break-words hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">{name}</a><PremiumBadge planId={comment.planId as any} compact />{comment.verified ? <span className="text-xs text-[var(--gold-2)]">Verified</span> : null}</div>{comment.username ? <p className="text-xs text-slate-500">@{comment.username}</p> : null}</div></div><p className="mt-3 whitespace-pre-wrap break-words text-slate-200">{comment.body}</p></div>; }) : <p className="rounded-[8px] bg-[#191919] p-4 text-slate-300">No comments yet. Start the conversation.</p>}
              </div>
            </Card>
          </section>
        </div>

        <aside className="space-y-5 xl:pt-[432px]">
          <Card className="p-5 sm:p-8">
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
            />
            {paidEntryRequired && !sponsorAccount ? <p className="mt-3 text-xs leading-5 text-slate-400">Payment confirmation is processed securely before enrollment updates.</p> : null}
          </Card>          {sponsorAccount ? <Card className="border-yellow-500/30 bg-yellow-950/10 p-5 text-center sm:p-8">
            <h3 className="text-xl font-black text-[var(--gold)]">Sponsorship</h3>
            <p className="mt-3">Submit a sponsor contribution request. Sponsor contributions are confirmed before any public funding status updates. No investment return is promised.</p>
            <LinkButton href={`/challenges/${challenge.id}/sponsor`} className="mt-5 w-full sm:w-auto">Propose Sponsorship</LinkButton>
          </Card> : null}
          {!freeCompetitor && prizePool && (prizePool.visibleJackpotCents > 0 || prizePool.status !== "disabled") ? <Card className="mt-6 border-[var(--gold)]/20 bg-[var(--gold)]/5 p-5 sm:p-7"><h2 className="text-2xl font-black">Prize Pool</h2><p className="mt-2 text-slate-300">Visible jackpot: <b className="text-[var(--gold)]">{prizeValue}</b> / Status: <b className="capitalize">{prizePool.status.replaceAll("_", " ")}</b>. Funding and prize status require review before public release.</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{prizePool.winnerSplits.map((split) => <div key={split.position} className="rounded-[8px] bg-black/30 p-4 text-center"><p className="font-black">{split.position === 1 ? "1st" : split.position === 2 ? "2nd" : "3rd"} / {split.percent}%</p><p className="mt-1 text-sm text-slate-400">${(split.expectedAmountCents / 100).toLocaleString()} expected</p></div>)}</div><p className="mt-4 text-xs text-slate-400">Prize details are shown when available for public viewing.</p></Card> : null}
          {predictionEnabled ? <Card className="border-[var(--gold)]/30 bg-[var(--gold)]/5 p-5 sm:p-7">
            <div className="flex items-start gap-3"><Coins className="mt-1 text-[var(--gold)]" /><div><h3 className="text-xl font-black">Prediction Arena</h3><p className="mt-2 text-sm leading-6 text-slate-300">Prediction Arena availability depends on verification, region, and provider approval.</p></div></div>
            <LinkButton href={`/challenges/${challenge.id}/prediction`} className="mt-5 w-full">Enter Prediction Arena</LinkButton><p className="mt-3 text-xs leading-5 text-slate-500">Availability depends on verification, region, and provider approval.</p>
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
              {votingOpen ? <LinkButton href={`/challenges/${challenge.id}/votes`} className="w-full"><Vote size={17} /> Purchase Additional Votes{userState?.voteCount ? ` (${userState.voteCount})` : ""}</LinkButton> : <Button className="w-full" disabled><Vote size={17} /> {lifecycle.votingStatus === "voting_not_open" ? "Voting Not Open" : lifecycle.votingStatus === "voting_not_enabled" ? "Voting Unavailable" : "Voting Closed"}</Button>}
            </div>
            <div className="mt-4 rounded-[8px] border border-white/10 bg-white/[0.03] p-4"><p className="text-sm font-black text-[var(--gold)]">Bonus Vote</p><p className="mt-2 text-xs leading-5 text-slate-400">Watch an eligible rewarded ad to earn a bonus vote when this feature is available.</p><Button className="mt-3 w-full" variant="secondary" disabled title="Bonus votes require verified ad completion">Ads are not available yet</Button><p className="mt-2 text-xs text-slate-500">Bonus votes require verified ad completion.</p></div><p className="mt-3 text-xs text-slate-400">Free users get 1 vote per challenge/day. Additional DoroCoin votes require voting policy acknowledgement. DoroCoins are not cash.</p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}


function ParticipantJourneyPanel({ journey, phaseLabel, challengeId, entryFeeLabel, paidEntryRequired, entryCheckoutLoading, entryCheckoutMessage, onPay, onRefresh }: { journey: any; phaseLabel: string; challengeId: string; entryFeeLabel: string; paidEntryRequired: boolean; entryCheckoutLoading: boolean; entryCheckoutMessage: string; onPay: () => void; onRefresh: () => void }) {
  const action = String(journey?.primaryAction ?? "back_to_challenge");
  const label = String(journey?.label ?? "Challenge Entry");
  const message = String(journey?.message ?? "Open the entry page for the next step.");
  const checklist = journey?.checklist ?? {};
  const items = [
    ["Register", checklist.registered ? "Done" : "Required"],
    ["Approval", checklist.approvalRequired ? checklist.approvalGranted ? "Approved" : "Pending" : "Not required"],
    ["Payment", checklist.paymentRequired ? checklist.paymentConfirmed ? "Confirmed" : action === "refresh_payment" ? "Processing" : "Required" : "Not required"],
    ["Entered", checklist.entered ? "Yes" : "No"],
    ["Submission", checklist.submissionOpen ? "Open" : "Closed"],
    ["Entry", checklist.alreadySubmitted ? "Submitted" : "Not submitted"]
  ];
  return <div className="text-left"><div className="text-center"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Current phase</p><h3 className="mt-2 text-xl font-black">{phaseLabel}</h3></div>{paidEntryRequired ? <div className="mt-5 rounded-[8px] border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Entry fee</p><p className="mt-1 text-2xl font-black text-[var(--gold)]">{entryFeeLabel}</p></div> : null}<div className="mt-5 rounded-[8px] border border-white/10 bg-black/30 p-4"><h4 className="font-black text-white">{label}</h4><p className="mt-2 text-sm leading-6 text-slate-300">{message}</p></div><div className="mt-5 space-y-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Entry Progress</p>{items.map(([name, value]) => <div key={name} className="flex items-center justify-between gap-3 rounded-[8px] bg-white/[0.04] px-3 py-2 text-sm"><span className="font-bold text-slate-300">{name}</span><span className="font-black text-white">{value}</span></div>)}</div><JourneyAction action={action} href={journey?.primaryHref} challengeId={challengeId} entryFeeLabel={entryFeeLabel} loading={entryCheckoutLoading} onPay={onPay} onRefresh={onRefresh} />{entryCheckoutMessage ? <p className="mt-3 rounded-[8px] bg-red-950/40 p-3 text-sm text-red-200">{entryCheckoutMessage}</p> : null}</div>;
}

function JourneyAction({ action, href, challengeId, entryFeeLabel, loading, onPay, onRefresh }: { action: string; href?: string | null; challengeId: string; entryFeeLabel: string; loading: boolean; onPay: () => void; onRefresh: () => void }) {
  if (action === "pay_entry_fee") return <Button className="mt-5 w-full" onClick={onPay} disabled={loading}>{loading ? "Starting Checkout..." : `Pay & Enter - ${entryFeeLabel}`}</Button>;
  if (action === "refresh_payment") return <Button className="mt-5 w-full" variant="secondary" onClick={onRefresh}>Refresh Status</Button>;
  if (action === "submit_entry") return <LinkButton href={`/challenges/${challengeId}/join`} className="mt-5 w-full">Submit Entry</LinkButton>;
  if (action === "register" || action === "enter_challenge" || action === "request_entry") return <LinkButton href={`/challenges/${challengeId}/join`} className="mt-5 w-full">{action === "register" ? "Register for Challenge" : action === "enter_challenge" ? "Enter Challenge" : "Request Entry"}</LinkButton>;
  if (action === "view_voting") return <LinkButton href={`/challenges/${challengeId}/votes`} className="mt-5 w-full" variant="secondary">View Voting</LinkButton>;
  if (action === "view_entry" && href) return <LinkButton href={href} className="mt-5 w-full">View My Entry</LinkButton>;
  if (action === "manage_challenge") return <LinkButton href="/challenges" className="mt-5 w-full">Manage Challenge</LinkButton>;
  if (action === "sign_in") return <LinkButton href={`/auth/login?next=${encodeURIComponent(`/challenges/${challengeId}`)}`} className="mt-5 w-full">Sign In to Continue</LinkButton>;
  return href ? <LinkButton href={href} className="mt-5 w-full" variant="secondary">View Challenge</LinkButton> : null;
}
function formatPhaseDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function Metric({ value, label, support }: { value: string; label: string; support?: string }) {
  return <Card className="flex min-h-32 flex-col justify-between p-4 sm:p-5"><div><div className="break-words text-xl font-black capitalize leading-tight text-[var(--gold-2)] sm:text-2xl">{value}</div><div className="mt-2 text-sm font-bold text-slate-200">{label}</div></div>{support ? <div className="mt-4 inline-flex w-fit rounded-full border border-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[.12em] text-slate-400">{support}</div> : null}</Card>;
}

function ChallengeMediaPlaceholder() {
  return <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(246,198,75,.24),transparent_45%),linear-gradient(135deg,#161616,#050505)] px-6 text-center">
    <div>
      <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--gold)]">Challenge Suite</p>
      <p className="mt-3 text-3xl font-black text-white sm:text-5xl">Live Challenge</p>
    </div>
  </div>;
}

function Info({ title, body }: { title: string; body: string }) {
  return <div className="rounded-[8px] border border-white/10 bg-black/30 p-4"><h3 className="font-black text-[var(--gold)]">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{body}</p></div>;
}

function SubmissionVoteCard({ submission, rank, votingOpen }: { submission: DetailSubmission; rank: number; votingOpen: boolean }) {
  return (
    <Card className="overflow-hidden bg-[#151515]">
      <div className="relative h-48">
        <SubmissionMediaFrame src={submission.mediaUrl} alt={submission.title} className="h-full rounded-none border-0" placeholder="Submission" />
        <span className="absolute left-3 top-3 rounded-[6px] bg-black/80 px-3 py-2 text-xs font-black">Rank #{rank}</span>
      </div>
      <div className="p-5">
        <h3 className="break-words text-lg font-black">{submission.title}</h3>
        <p className="mt-2 text-sm text-slate-300">by @{submission.userName}</p>
        <p className="mt-3 text-sm text-slate-300">{submission.description}</p>
        <div className="mt-5 grid gap-3 sm:flex sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 font-black text-[var(--gold)]"><Trophy size={16} /> {submission.likes} votes</span>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <LinkButton href={`/submissions/${submission.id}`} variant="secondary" className="w-full sm:w-auto">Preview</LinkButton>
            <LinkButton href={`/challenges/${submission.challengeId}/votes`} variant="ghost" className="w-full sm:w-auto">{votingOpen ? "Vote" : "Closed"}</LinkButton>
          </div>
        </div>
      </div>
    </Card>
  );
}
























