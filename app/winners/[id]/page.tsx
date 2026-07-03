"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Share2, Trophy, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PremiumBadge } from "@/components/brand";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchWinnerDetails } from "@/lib/api/services";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import type { UserPlanId } from "@/lib/types";

export default function WinnerDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["winner-detail", params.id],
    queryFn: () => fetchWinnerDetails(params.id),
    enabled: Boolean(params.id),
    staleTime: 60_000
  });

  const challenge = useMemo(() => data?.ok && data.data?.challenge ? normalizeChallenge(data.data.challenge as ChallengeApiRecord) : null, [data]);
  const winner = useMemo(() => {
    if (!data?.ok || !data.data?.winner) return null;
    return normalizeSubmission({ ...(data.data.winner as SubmissionApiRecord), isWinner: true }, challenge ?? undefined);
  }, [data, challenge]);
  const profile = (data?.ok ? data.data?.profile : null) as Record<string, any> | null;
  const leaderboard = (data?.ok ? data.data?.leaderboard : []) as Record<string, any>[];
  const errorMessage = !isLoading && data && !data.ok ? data.message : null;
  const winnerMeta = (data?.ok ? data.data?.winner : null) as Record<string, any> | null;
  const resultMessage = data?.ok ? data.data?.resultMessage : null;
  const payoutStatus = data?.ok ? data.data?.payoutStatus : null;
  const sponsored = Boolean((challenge as any)?.sponsorEnabled || (challenge as any)?.sponsored || (challenge as any)?.sponsorshipEnabled || winnerMeta?.sponsored);

  return (
    <AppShell>
      {isLoading ? <Card className="h-[420px] animate-pulse bg-[#151515] sm:h-[620px]" /> : errorMessage || !winner ? (
        <Card><EmptyState icon={<Trophy />} title="Winner unavailable" body={errorMessage ?? "This winner could not be found."} action={<LinkButton href="/winners">Back to Winners</LinkButton>} /></Card>
      ) : (
        <div className="grid gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
          <Card className="overflow-hidden">
            {winner.mediaUrl ? <img src={winner.mediaUrl} alt={winner.title} className="h-[280px] w-full object-cover sm:h-[360px] lg:h-[420px]" /> : <div className="flex h-[280px] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(245,217,10,.18),transparent_45%),#111] px-6 text-center text-xl font-black text-[var(--gold)] sm:h-[360px] sm:text-2xl lg:h-[420px]">Challenge Suite Winner</div>}
            <div className="p-5 sm:p-7">
              <PageTitle title={winner.title} subtitle={String(winnerMeta?.caption ?? winner.description ?? "Winning submission")} icon={<Trophy className="text-[var(--gold)]" />} />
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Votes" value={winner.likes.toLocaleString()} />
                <Stat label="Rank" value={`#${Number(winnerMeta?.rank ?? 1)}`} />
                <Stat label="Result" value={String(winnerMeta?.status ?? "announced").replaceAll("_", " ")} />
                <Stat label="Category" value={challenge?.category ?? "Challenge"} />
              </div>
              {resultMessage ? <Card className="mt-6 border-yellow-500/30 bg-yellow-950/10 p-4 text-[var(--gold)]">{resultMessage}</Card> : null}
              {sponsored ? <Card className="mt-4 border-[var(--gold)]/20 bg-[var(--gold)]/5 p-4 text-[var(--gold-2)]">Sponsored challenge results may require review before final announcement.</Card> : null}
            </div>
          </Card>
          <div className="space-y-6">
            <Card className="p-5 sm:p-6">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-base font-black text-black sm:h-16 sm:w-16 sm:text-lg">{profile?.initials ?? winner.userInitials}</div>
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-black sm:text-2xl">{profile?.displayName ?? winner.userName}</h2>
                  <PremiumBadge planId={profile?.planId as UserPlanId | undefined} badgeStyleId={profile?.customization?.profileBadgeId} compact />
                </div>
              </div>
              <p className="mt-5 text-slate-300">{profile?.customization?.profileTagline ?? "Champion entry recognized by Challenge Suite voters."}</p>
              <div className="mt-5 rounded-[8px] border border-white/10 bg-black/30 p-4 text-sm text-slate-300"><b className="text-white">Payout review:</b> {String(payoutStatus ?? "not_applicable").replaceAll("_", " ")}<p className="mt-2 text-xs text-slate-400">Winner claim review is foundation-only. No payout provider is connected, payout review does not mean payment will be sent, and KYC processing is not active yet.</p></div>
              <div className="mt-6 grid gap-3">
                {challenge ? <LinkButton href={`/challenges/${challenge.id}`}>View Challenge</LinkButton> : null}
                <Button variant="secondary"><Share2 size={16} /> Share Winner</Button>
                <Button variant="ghost"><UserPlus size={16} /> Follow Creator</Button>
              </div>
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="text-xl font-black">Leaderboard Snapshot</h2>
              <div className="mt-4 space-y-3">
                {leaderboard.length ? leaderboard.map((row) => <div key={String(row.id)} className="grid gap-2 rounded-[8px] bg-[#181818] p-4 sm:flex sm:items-center sm:justify-between"><span className="min-w-0 break-words font-black">#{row.rank} {row.userName ?? row.title ?? "Submission"}</span><span className="shrink-0 text-[var(--gold)]">{Number(row.weightedVoteCount ?? row.voteCount ?? 0).toLocaleString()} votes</span></div>) : <p className="text-slate-300">Leaderboard snapshot is not available yet.</p>}
              </div>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] border border-white/10 bg-black/30 p-4"><div className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">{label}</div><div className="mt-2 break-words text-lg font-black text-white sm:text-xl">{value}</div></div>;
}


