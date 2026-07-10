"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Clock3, Coins, Rocket, Trophy, Users, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, textareaClass } from "@/components/ui";
import { fetchChallengeDetails } from "@/lib/api/services";
import { apiRequest } from "@/lib/api/client";
import { PremiumBadge } from "@/components/brand";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { canJoinChallenge, canVoteOnChallenge, getChallengeDisplayStatus, statusClassName } from "@/lib/challenge-status";
import type { Submission } from "@/lib/types";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getPlanExperience } from "@/lib/plan-access";
import { ChallengeShare } from "@/components/challenge-share";

type DetailSubmission = Submission & { userPlanId?: string };

export default function ChallengeDetailPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const { user } = useCurrentUser();
  const [watching, setWatching] = useState(false);
  const [saved, setSaved] = useState(false);
  const [watchLater, setWatchLater] = useState(false);
  const [engagementMessage, setEngagementMessage] = useState("");
  const [comments, setComments] = useState<Array<{ id: string; displayName?: string; username?: string; body?: string; createdAt?: string; planId?: string; verified?: boolean }>>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantLimit, setParticipantLimit] = useState(12);
  const { data, isLoading } = useQuery({
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
    setWatching(Boolean(details?.userState?.interested));
    setSaved(Boolean(details?.userState?.saved));
    setWatchLater(Boolean(details?.userState?.watchLater));
  }, [details?.userState]);

  useEffect(() => {
    if (!challengeId) return;
    void apiRequest<{ comments: Array<{ id: string; displayName?: string; username?: string; body?: string; createdAt?: string; planId?: string; verified?: boolean }> }>(`/api/challenges/${challengeId}/comments`)
      .then((result) => setComments(result.ok ? result.data?.comments ?? [] : []));
  }, [challengeId]);

  async function updateEngagement(action: "save_challenge" | "watch_later" | "interested", enabled: boolean) {
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
    if (action === "watch_later") setWatchLater(enabled);
    if (action === "interested") setWatching(enabled);
    setEngagementMessage(result.message);
  }

  async function addComment() {
    const result = await apiRequest<{ comment: { id: string; displayName?: string; username?: string; body?: string; createdAt?: string; planId?: string; verified?: boolean } }>(`/api/challenges/${challengeId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: commentBody })
    });
    setCommentMessage(result.message);
    if (result.ok && result.data?.comment) {
      setComments((current) => [...current, result.data!.comment]);
      setCommentBody("");
    }
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

  const displayStatus = getChallengeDisplayStatus(challenge);
  const joinOpen = canJoinChallenge(challenge);
  const votingOpen = canVoteOnChallenge(challenge);
  const userState = details?.userState;
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
  const sponsorAccount = user?.accountType === "sponsor";
  const participants = ((details as { participants?: Array<{ id: string; displayName: string; username?: string | null; avatarUrl?: string | null; participantStatus?: string; entryStatus?: string | null; profilePath?: string }> } | null)?.participants ?? []);
  const filteredParticipants = participants.filter((participant) => `${participant.displayName} ${participant.username ?? ""}`.toLowerCase().includes(participantSearch.toLowerCase()));
  const visibleParticipants = filteredParticipants.slice(0, participantLimit);

  return (
    <AppShell>
      <div className="grid max-w-[1240px] gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="min-w-0">
          <div className="relative h-[260px] overflow-hidden rounded-[16px] sm:h-[320px] md:h-[400px]">
            <img src={challenge.imageUrl} alt={challenge.title} className="h-full w-full object-cover" />
            <span className="absolute right-3 top-3 max-w-[calc(100%-1.5rem)] rounded-full bg-[var(--gold)] px-3 py-2 text-xs font-black uppercase text-black sm:right-5 sm:top-5 sm:px-5 sm:py-3 sm:text-sm">{challenge.type}</span>
            <span className={`absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-full px-3 py-2 text-xs font-black sm:bottom-5 sm:left-5 sm:px-5 sm:py-3 sm:text-sm ${statusClassName(displayStatus)}`}>{displayStatus}</span>
          </div>
          <h1 className="mt-6 break-words text-3xl font-black sm:mt-8 md:text-5xl">{challenge.title}</h1>
          <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
            {canBoost ? <LinkButton href={`/challenges/${challenge.id}/boost`} className="w-full sm:w-auto"><Rocket size={17} /> Boost Challenge</LinkButton> : null}
            <ChallengeShare className="w-full sm:w-auto" title={challenge.title} description={challenge.description} path={`/challenges/${challenge.id}`} />
            <Button className="w-full sm:w-auto" variant="secondary" onClick={() => void updateEngagement("save_challenge", !saved)}><Bookmark size={17} /> {saved ? "Saved" : "Save Challenge"}</Button>
            <Button className="w-full sm:w-auto" variant="secondary" onClick={() => void updateEngagement("watch_later", !watchLater)}><Clock3 size={17} /> {watchLater ? "In Watch Later" : "Watch Later"}</Button>
          </div>
          {engagementMessage ? <p className="mt-3 text-sm text-slate-300">{engagementMessage}</p> : null}
          <p className="mt-4 break-words text-base leading-7 text-slate-200 sm:text-xl">{challenge.description}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric value={challenge.participants.toString()} label="Participants" />
            <Metric value={prizeValue} label="Prize Details" />
            <Metric value={displayStatus} label="Status" />
            <Metric value={totalVotes.toLocaleString()} label="Votes" />
          </div>
          {challenge.trailerUrl ? <video className="mt-10 w-full rounded-[8px]" controls src={challenge.trailerUrl} /> : null}

          <Card className="mt-10 p-5 sm:p-7">
            <h2 className="text-2xl font-black">Challenge Guide</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Info title="Overview" body={challenge.description} />
              <Info title="How to participate" body="Join the challenge, accept the rules, upload an approved image or video, then submit before the deadline." />
              <Info title="Submission requirements" body={`Accepted uploads: ${challenge.acceptedSubmissionTypes.join(", ")}. Entries must follow community guidelines.`} />
              <Info title="Judging method" body="Rankings combine verified voting activity, rule compliance, and creator review when applicable." />
              <Info title="Voting rules" body={votingOpen ? "Voting is currently available. Free users get 1 vote per challenge/day. Additional votes can use DoroCoins, which are internal platform credits." : "Voting is closed for this challenge."} />
              <Info title="Timeline" body={`Registration closes ${challenge.registrationDeadline}. Challenge runs ${challenge.startsAt} to ${challenge.endsAt}.`} />
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
                {visibleParticipants.map((participant) => <a key={participant.id} href={participant.profilePath || "/profile"} className="rounded-[8px] border border-white/10 bg-[#151515] p-4 transition hover:border-[var(--gold)]/50"><div className="flex items-center gap-3"><div className="h-12 w-12 overflow-hidden rounded-full bg-black/50">{participant.avatarUrl ? <img src={participant.avatarUrl} alt={participant.displayName} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-sm font-black text-[var(--gold)]"><Users size={18} /></div>}</div><div className="min-w-0"><p className="truncate font-black">{participant.displayName}</p>{participant.username ? <p className="truncate text-xs text-slate-400">@{participant.username}</p> : null}</div></div><div className="mt-4 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.12em]"><span className="rounded-full bg-[var(--gold)]/10 px-3 py-1 text-[var(--gold)]">{String(participant.participantStatus ?? "active").replaceAll("_", " ")}</span>{participant.entryStatus ? <span className="rounded-full bg-white/10 px-3 py-1 text-slate-300">{participant.entryStatus.replaceAll("_", " ")}</span> : null}</div></a>)}
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
                {comments.length ? comments.map((comment) => <div key={comment.id} className="rounded-[8px] bg-[#191919] p-4"><div className="flex flex-wrap items-center gap-2 font-black text-[var(--gold)]">{comment.username ? <a href={`/profile/${comment.username}`}>{comment.displayName || "Challenge Suite member"}</a> : comment.displayName || "Challenge Suite member"}<PremiumBadge planId={comment.planId as any} compact />{comment.verified ? <span className="text-xs text-[var(--gold-2)]">Verified</span> : null}</div><p className="mt-2 whitespace-pre-wrap break-words text-slate-200">{comment.body}</p></div>) : <p className="rounded-[8px] bg-[#191919] p-4 text-slate-300">No comments yet. Start the conversation.</p>}
              </div>
            </Card>
          </section>
        </div>

        <aside className="space-y-5 xl:pt-[432px]">
          <Card className="p-5 text-center sm:p-8">
            <h3 className="text-xl font-black">Ready to join?</h3>
            <p className="mt-2 text-slate-300">Enroll first, then upload an accepted image or video submission.</p>
            {!joinOpen ? (
              <Card className="mt-6 border-slate-600 bg-slate-900/60 p-4 text-slate-300">Registration is closed. You can still preview submissions when voting is open.</Card>
            ) : userState?.joined ? (
              <LinkButton href={`/challenges/${challenge.id}/join`} className="mt-6 w-full">View Entry Flow</LinkButton>
            ) : (
              <LinkButton href={`/challenges/${challenge.id}/join`} className="mt-6 w-full">Join Challenge</LinkButton>
            )}
            <Button variant="secondary" className="mt-4 w-full" onClick={() => void updateEngagement("interested", !watching)}>{watching ? "Watching Interest Saved" : "Interested in Watching"}</Button>
            {watching ? <><p className="mt-3 text-xs text-slate-400">In-app reminders are saved for 1 hour, 30 minutes, 5 minutes, and start time. Push/email delivery begins when notification delivery is connected.</p><LinkButton href={`/challenges/${challenge.id}/watch`} variant="ghost" className="mt-4 w-full">View Watch Details</LinkButton></> : null}
          </Card>

          {sponsorAccount ? <Card className="border-yellow-500/30 bg-yellow-950/10 p-5 text-center sm:p-8">
            <h3 className="text-xl font-black text-[var(--gold)]">Sponsorship</h3>
            <p className="mt-3">Submit a sponsor contribution request. Money capture and release are not active, and no investment return is promised.</p>
            <LinkButton href={`/challenges/${challenge.id}/sponsor`} className="mt-5 w-full sm:w-auto">Propose Sponsorship</LinkButton>
          </Card> : null}
          {!freeCompetitor && prizePool && (prizePool.visibleJackpotCents > 0 || prizePool.status !== "disabled") ? <Card className="mt-6 border-[var(--gold)]/20 bg-[var(--gold)]/5 p-5 sm:p-7"><h2 className="text-2xl font-black">Prize Pool Foundation</h2><p className="mt-2 text-slate-300">Visible jackpot: <b className="text-[var(--gold)]">{prizeValue}</b> · Status: <b className="capitalize">{prizePool.status.replaceAll("_", " ")}</b>. Funding, release, and payout execution are not active.</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{prizePool.winnerSplits.map((split) => <div key={split.position} className="rounded-[8px] bg-black/30 p-4 text-center"><p className="font-black">{split.position === 1 ? "1st" : split.position === 2 ? "2nd" : "3rd"} · {split.percent}%</p><p className="mt-1 text-sm text-slate-400">${(split.expectedAmountCents / 100).toLocaleString()} expected</p></div>)}</div><p className="mt-4 text-xs text-slate-400">Public views intentionally omit the platform allocation breakdown.</p></Card> : null}


          <Card className="border-[var(--gold)]/30 bg-[var(--gold)]/5 p-5 sm:p-7">
            <div className="flex items-start gap-3"><Coins className="mt-1 text-[var(--gold)]" /><div><h3 className="text-xl font-black">Prediction Arena</h3><p className="mt-2 text-sm leading-6 text-slate-300">Use DoroCoins to predict the winner before the challenge begins. Platform fee is 7%, rewards are DoroCoin-only, and settlement waits for final result lock and admin review.</p></div></div>
            <LinkButton href={`/challenges/${challenge.id}/prediction`} className="mt-5 w-full">Enter Prediction Arena</LinkButton>
          </Card>

          <Card className="border-emerald-500/20 bg-emerald-500/5 p-5 sm:p-7">
            <h3 className="text-xl font-black">Revenue Share Review</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">Generated revenue uses the 65% winners, 15% host, 10% sponsor, 10% platform foundation. Initial prize money remains separate and 100% winner-directed after review. Challenger vote-revenue bonuses remain pending admin review.</p>
            <LinkButton href="/revenue-share" variant="secondary" className="mt-5 w-full">View Revenue Flow</LinkButton>
          </Card>
          <Card id="vote" className="p-5 sm:p-8">
            <h3 className="text-xl font-black">Information & Rules</h3>
            {challenge.rules.length ? challenge.rules.map((rule) => <p key={rule.id} className="mt-3 text-slate-300">- {rule.editableText}</p>) : <p className="mt-3 text-slate-300">Rules have not been published for this challenge yet.</p>}
            <div className="mt-5">
              {votingOpen ? <LinkButton href={`/challenges/${challenge.id}/votes`} className="w-full"><Vote size={17} /> Purchase Additional Votes{userState?.voteCount ? ` (${userState.voteCount})` : ""}</LinkButton> : <Button className="w-full" disabled><Vote size={17} /> Voting Closed</Button>}
            </div>
            <p className="mt-3 text-xs text-slate-400">Free users get 1 vote per challenge/day. Additional DoroCoin votes require voting policy acknowledgement. DoroCoins are not cash.</p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <Card className="p-4 text-center sm:p-6"><div className="break-words text-2xl font-black capitalize text-[var(--gold-2)] sm:text-3xl">{value}</div><div className="mt-3 text-sm text-slate-300">{label}</div></Card>;
}

function Info({ title, body }: { title: string; body: string }) {
  return <div className="rounded-[8px] border border-white/10 bg-black/30 p-4"><h3 className="font-black text-[var(--gold)]">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{body}</p></div>;
}

function SubmissionVoteCard({ submission, rank, votingOpen }: { submission: DetailSubmission; rank: number; votingOpen: boolean }) {
  return (
    <Card className="overflow-hidden bg-[#151515]">
      <div className="relative h-48">
        {submission.mediaUrl ? <img src={submission.mediaUrl} alt={submission.title} className="h-full w-full object-cover" /> : <div className="h-full w-full bg-[#202020]" />}
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






