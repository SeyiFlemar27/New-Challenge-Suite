"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Award, BadgeCheck, Heart, Share2, Trophy, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PremiumBadge } from "@/components/brand";
import { Button, Card, EmptyState, Field, LinkButton, PageTitle, inputClass } from "@/components/ui";
import { fetchWinnerDetails } from "@/lib/api/services";
import { apiRequest } from "@/lib/api/client";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import type { UserPlanId } from "@/lib/types";

export default function WinnerDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useCurrentUser();
  const [claimName, setClaimName] = useState("");
  const [claimEmail, setClaimEmail] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [submittingClaim, setSubmittingClaim] = useState(false);
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
  const winnerUserId = String(winnerMeta?.userId ?? winnerMeta?.ownerUid ?? "");
  const isWinnerOwner = Boolean(user?.uid && winnerUserId && user.uid === winnerUserId);
  const profileHref = profile?.username ? `/profile/${profile.username}` : "/profile";
  const winnerName = String(profile?.displayName ?? winner?.userName ?? "Winner");
  const announcedAt = String(winnerMeta?.announcedAt ?? winnerMeta?.updatedAt ?? winnerMeta?.createdAt ?? "Date not available");
  const rank = Number(winnerMeta?.rank ?? 1);
  const badges = [rank === 1 ? "1st Place Winner" : null, winner?.likes ? "Top Voted Entry" : null, winnerMeta?.status === "announced" ? "Challenge Champion" : null, profile?.verified ? "Verified Winner" : null].filter(Boolean) as string[];

  async function submitClaim() {
    if (!winner) return;
    setSubmittingClaim(true);
    setClaimMessage("");
    const result = await apiRequest("/api/winner-claims", { method: "POST", body: JSON.stringify({ claimId: winner.id, legalName: claimName, email: claimEmail, termsAccepted }) });
    setClaimMessage(result.ok ? "Prize claim submitted. Awaiting admin approval." : result.message || "Prize claim could not be submitted.");
    setSubmittingClaim(false);
  }

  return (
    <AppShell>
      {isLoading ? <Card className="h-[420px] animate-pulse bg-[#151515] sm:h-[620px]" /> : errorMessage || !winner ? (
        <Card><EmptyState icon={<Trophy />} title="Winner unavailable" body={errorMessage ?? "This winner could not be found."} action={<LinkButton href="/winners">Back to Winners</LinkButton>} /></Card>
      ) : (
        <div className="grid gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
          <div className="space-y-6">
            <Card className="overflow-hidden">
              {winner.mediaUrl ? <img src={winner.mediaUrl} alt={winner.title} className="h-[280px] w-full object-cover sm:h-[360px] lg:h-[420px]" /> : <div className="flex h-[280px] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(245,217,10,.18),transparent_45%),#111] px-6 text-center text-xl font-black text-[var(--gold)] sm:h-[360px] sm:text-2xl lg:h-[420px]">Challenge Suite Winner</div>}
              <div className="p-5 sm:p-7">
                <PageTitle title={winner.title} subtitle={String(winnerMeta?.caption ?? winner.description ?? "Winning submission")} icon={<Trophy className="text-[var(--gold)]" />} />
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Votes" value={winner.likes.toLocaleString()} />
                  <Stat label="Rank" value={`#${rank}`} />
                  <Stat label="Result" value={String(winnerMeta?.status ?? "announced").replaceAll("_", " ")} />
                  <Stat label="Category" value={challenge?.category ?? "Challenge"} />
                </div>
                {resultMessage ? <Card className="mt-6 border-yellow-500/30 bg-yellow-950/10 p-4 text-[var(--gold)]">{resultMessage}</Card> : null}
                {sponsored ? <Card className="mt-4 border-[var(--gold)]/20 bg-[var(--gold)]/5 p-4 text-[var(--gold-2)]">Sponsored challenge results may require review before final announcement.</Card> : null}
              </div>
            </Card>

            <Card className="p-5 sm:p-7">
              <h2 className="text-2xl font-black">Submission details</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Info label="Submitted by" value={winnerName} />
                <Info label="Submitted" value={String(winnerMeta?.createdAt ?? winner.createdAt ?? "Not available yet")} />
                <Info label="Entry status" value={String(winnerMeta?.status ?? "Winner announced").replaceAll("_", " ")} />
                <Info label="Challenge" value={challenge?.title ?? winner.challengeTitle} />
                <Info label="Votes received" value={winner.likes.toLocaleString()} />
                <Info label="Rank" value={`#${rank}`} />
              </div>
              {winner.description ? <p className="mt-5 leading-7 text-slate-300">{winner.description}</p> : null}
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-5 sm:p-6">
              <a href={profileHref} className="flex min-w-0 items-center gap-4 rounded-[8px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" aria-label={`View ${winnerName} profile`}>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--gold)] text-base font-black text-black sm:h-16 sm:w-16 sm:text-lg">{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile?.initials ?? winner.userInitials}</div>
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-black sm:text-2xl">{winnerName}</h2>
                  {profile?.username ? <p className="text-sm text-slate-400">@{profile.username}</p> : null}
                  <PremiumBadge planId={profile?.planId as UserPlanId | undefined} badgeStyleId={profile?.customization?.profileBadgeId} compact />
                </div>
              </a>
              <p className="mt-5 text-slate-300">{profile?.customization?.profileTagline ?? "Champion entry recognized by Challenge Suite voters."}</p>
              <div className="mt-5 flex flex-wrap gap-2">{badges.map((badge) => <span key={badge} className="inline-flex items-center gap-2 rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 text-xs font-black text-[var(--gold)]"><Award size={14} /> {badge}</span>)}</div>
              <div className="mt-6 grid gap-3">
                {challenge ? <LinkButton href={`/challenges/${challenge.id}`}>View Challenge</LinkButton> : null}
                <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(window.location.href)}><Share2 size={16} /> Share Winner</Button>
                <Button variant="ghost" disabled title="Follow will be available when public follow actions are connected"><UserPlus size={16} /> Follow will be available soon</Button>
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <h2 className="text-xl font-black">Prize status</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">Prize claim requires admin review. Current status: <b className="text-white">{String(payoutStatus ?? "not available yet").replaceAll("_", " ")}</b>.</p>
              {isWinnerOwner ? <div className="mt-5 grid gap-3"><Field label="Legal name"><input className={inputClass} value={claimName} onChange={(event) => setClaimName(event.target.value)} /></Field><Field label="Email"><input className={inputClass} value={claimEmail} onChange={(event) => setClaimEmail(event.target.value)} /></Field><label className="flex items-start gap-3 text-sm text-slate-300"><input className="mt-1" type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /> I understand prize claims require admin review and are not instant payouts.</label><Button disabled={submittingClaim || claimName.length < 2 || !claimEmail.includes("@") || !termsAccepted} onClick={() => void submitClaim()}>{submittingClaim ? "Submitting..." : "Submit Prize Claim"}</Button>{claimMessage ? <p className="text-sm text-slate-300">{claimMessage}</p> : null}</div> : <p className="mt-4 rounded-[8px] border border-white/10 bg-black/30 p-4 text-sm text-slate-400">Claim Prize is only available to the winning account.</p>}
            </Card>

            <Card className="p-5 sm:p-6">
              <h2 className="text-xl font-black">Leaderboard snapshot</h2>
              <div className="mt-4 space-y-3">
                {leaderboard.length ? leaderboard.map((row) => <div key={String(row.id)} className="grid gap-2 rounded-[8px] bg-[#181818] p-4 sm:flex sm:items-center sm:justify-between"><span className="min-w-0 break-words font-black">#{row.rank} {row.userName ?? row.title ?? "Submission"}</span><span className="shrink-0 text-[var(--gold)]">{Number(row.weightedVoteCount ?? row.voteCount ?? 0).toLocaleString()} votes</span></div>) : <p className="text-slate-300">Leaderboard snapshot will appear when available.</p>}
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

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] border border-white/10 bg-black/30 p-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">{label}</p><p className="mt-2 break-words font-black text-white">{value}</p></div>;
}
