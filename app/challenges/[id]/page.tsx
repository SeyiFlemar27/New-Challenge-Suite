"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Share2, Rocket, Trophy, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton } from "@/components/ui";
import { fetchChallengeDetails } from "@/lib/api/services";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { canJoinChallenge, canVoteOnChallenge, getChallengeDisplayStatus, statusClassName } from "@/lib/challenge-status";
import type { Submission } from "@/lib/types";

type DetailSubmission = Submission & { userPlanId?: string };

export default function ChallengeDetailPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const [watching, setWatching] = useState(false);
  const [shared, setShared] = useState(false);
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

  if (isLoading) {
    return (
      <AppShell>
        <div className="grid max-w-[1240px] gap-8 xl:grid-cols-[1fr_370px]">
          <div>
            <Card className="h-[400px] animate-pulse rounded-[16px] bg-[#171717]" />
            <div className="mt-8 h-12 max-w-2xl animate-pulse rounded bg-[#171717]" />
            <div className="mt-8 grid gap-5 md:grid-cols-4">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-28 animate-pulse bg-[#171717]" />)}</div>
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
        <Card className="max-w-3xl p-8">
          <h1 className="text-3xl font-black text-[var(--gold-2)]">{notFound ? "Challenge not found" : "Challenge could not load"}</h1>
          <p className="mt-3 text-slate-300">{data.message}</p>
          <LinkButton href="/challenges" className="mt-6">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (!challenge) {
    return (
      <AppShell>
        <Card className="max-w-3xl p-8">
          <h1 className="text-3xl font-black text-[var(--gold-2)]">Challenge not found</h1>
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
  const totalVotes = Number(details?.voteCount ?? challengeSubmissions.reduce((sum, item) => sum + item.likes, 0));
  const sponsorships = details?.sponsorships ?? [];
  const sponsored = sponsorships.length > 0;
  const prizeValue = challenge.prizeType === "Bragging Rights (Leaderboard Ranking)" ? "Ranking" : `$${challenge.prizePool.toLocaleString()}`;

  return (
    <AppShell>
      <div className="grid max-w-[1240px] gap-8 xl:grid-cols-[1fr_370px]">
        <div>
          <div className="relative h-[320px] overflow-hidden rounded-[16px] md:h-[400px]">
            <img src={challenge.imageUrl} alt={challenge.title} className="h-full w-full object-cover" />
            <span className="absolute right-5 top-5 rounded-full bg-[var(--gold)] px-5 py-3 text-sm font-black uppercase text-black">{challenge.type}</span>
            <span className={`absolute bottom-5 left-5 rounded-full px-5 py-3 text-sm font-black ${statusClassName(displayStatus)}`}>{displayStatus}</span>
          </div>
          <h1 className="mt-8 text-4xl font-black md:text-5xl">{challenge.title}</h1>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href={`/challenges/${challenge.id}/boost`}><Rocket size={17} /> Boost Challenge</LinkButton>
            <Button variant="secondary" onClick={() => setShared(true)}><Share2 size={17} /> {shared ? "Link Copied" : "Share"}</Button>
          </div>
          <p className="mt-4 text-xl text-slate-200">{challenge.description}</p>
          <div className="mt-8 grid gap-5 md:grid-cols-4">
            <Metric value={challenge.participants.toString()} label="Participants" />
            <Metric value={prizeValue} label="Prize Pool" />
            <Metric value={displayStatus} label="Status" />
            <Metric value={totalVotes.toLocaleString()} label="Votes" />
          </div>
          {challenge.trailerUrl ? <video className="mt-10 w-full rounded-[8px]" controls src={challenge.trailerUrl} /> : null}

          <Card className="mt-10 p-7">
            <h2 className="text-2xl font-black">Challenge Guide</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Info title="Overview" body={challenge.description} />
              <Info title="How to participate" body="Join the challenge, accept the rules, upload an approved image or video, then submit before the deadline." />
              <Info title="Submission requirements" body={`Accepted uploads: ${challenge.acceptedSubmissionTypes.join(", ")}. Entries must follow community guidelines.`} />
              <Info title="Judging method" body="Rankings combine verified voting activity, rule compliance, and creator review when applicable." />
              <Info title="Voting rules" body={votingOpen ? "Voting is currently available. Free users get 1 vote per challenge/day. Additional votes can be purchased with DoroCoins." : "Voting is closed for this challenge."} />
              <Info title="Timeline" body={`Registration closes ${challenge.registrationDeadline}. Challenge runs ${challenge.startsAt} to ${challenge.endsAt}.`} />
              <Info title="Eligibility" body={challenge.ageRestriction?.enabled ? `Minimum age: ${challenge.ageRestriction.minimumAge}` : "Open to eligible platform users in supported regions."} />
              <Info title="Sponsor information" body={sponsored ? `${sponsorships.length} sponsorship proposal${sponsorships.length === 1 ? "" : "s"} recorded for this challenge.` : "Sponsors may contribute to prize pool funding and receive pending-review status before activation."} />
            </div>
          </Card>

          <section className="mt-12">
            <h2 className="text-2xl font-black">Community Submissions</h2>
            {challengeSubmissions.length ? (
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {challengeSubmissions.map((entry, index) => <SubmissionVoteCard key={entry.id} rank={index + 1} submission={entry} votingOpen={votingOpen} />)}
              </div>
            ) : (
              <p className="mt-6 text-slate-400">No submissions yet. Join and upload an accepted media file to become the first entry.</p>
            )}
          </section>

          <section className="mt-12 border-t border-white/10 pt-10">
            <h2 className="text-2xl font-black">Comments</h2>
            <Card className="mt-6 p-6">
              <p className="rounded-[8px] bg-[#191919] p-4 text-slate-300">Comments are not available for this challenge yet.</p>
            </Card>
          </section>
        </div>

        <aside className="space-y-6 xl:pt-[432px]">
          <Card className="p-8 text-center">
            <h3 className="text-xl font-black">Ready to join?</h3>
            <p className="mt-2 text-slate-300">Enroll first, then upload an accepted image or video submission.</p>
            {!joinOpen ? (
              <Card className="mt-6 border-slate-600 bg-slate-900/60 p-4 text-slate-300">Registration is closed. You can still preview submissions when voting is open.</Card>
            ) : userState?.joined ? (
              <LinkButton href={`/challenges/${challenge.id}/join`} className="mt-6 w-full">View Entry Flow</LinkButton>
            ) : (
              <LinkButton href={`/challenges/${challenge.id}/join`} className="mt-6 w-full">Join Challenge</LinkButton>
            )}
            <Button variant="secondary" className="mt-4 w-full" onClick={() => setWatching(true)}>{watching ? "Watching Challenge" : "Interested in watching"}</Button>
          </Card>

          <Card className="border-yellow-500/30 bg-yellow-950/10 p-8 text-center">
            <h3 className="text-xl font-black text-[var(--gold)]">Sponsorship</h3>
            <p className="mt-3">Fund the prize pool and earn ROI. Allocation always totals 15%.</p>
            <LinkButton href={`/challenges/${challenge.id}/sponsor`} className="mt-5">Propose Sponsorship</LinkButton>
          </Card>

          <Card id="vote" className="p-8">
            <h3 className="text-xl font-black">Information & Rules</h3>
            {challenge.rules.length ? challenge.rules.map((rule) => <p key={rule.id} className="mt-3 text-slate-300">- {rule.editableText}</p>) : <p className="mt-3 text-slate-300">Rules have not been published for this challenge yet.</p>}
            <div className="mt-5">
              {votingOpen ? <LinkButton href={`/challenges/${challenge.id}/votes`}><Vote size={17} /> Purchase Additional Votes{userState?.voteCount ? ` (${userState.voteCount})` : ""}</LinkButton> : <Button disabled><Vote size={17} /> Voting Closed</Button>}
            </div>
            <p className="mt-3 text-xs text-slate-400">Free users get 1 vote per challenge/day. Additional votes require paid voting acknowledgement.</p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <Card className="p-6 text-center"><div className="text-3xl font-black capitalize text-[var(--gold-2)]">{value}</div><div className="mt-3 text-sm text-slate-300">{label}</div></Card>;
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
        <h3 className="text-lg font-black">{submission.title}</h3>
        <p className="mt-2 text-sm text-slate-300">by @{submission.userName}</p>
        <p className="mt-3 text-sm text-slate-300">{submission.description}</p>
        <div className="mt-5 flex items-center justify-between">
          <span className="flex items-center gap-2 font-black text-[var(--gold)]"><Trophy size={16} /> {submission.likes} votes</span>
          <LinkButton href={`/submissions/${submission.id}`} variant="secondary">Preview</LinkButton>
          <LinkButton href={`/challenges/${submission.challengeId}/votes`} variant="ghost">{votingOpen ? "Vote" : "Closed"}</LinkButton>
        </div>
      </div>
    </Card>
  );
}
