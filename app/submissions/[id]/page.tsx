"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Star, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton } from "@/components/ui";
import { ConsentDialog } from "@/components/consent-dialog";
import { PremiumBadge } from "@/components/brand";
import { fetchSubmissionDetails, voteForSubmission } from "@/lib/api/services";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { canVoteOnChallenge } from "@/lib/challenge-status";
import type { UserPlanId } from "@/lib/types";

type CreatorRecord = {
  displayName?: string;
  initials?: string;
  planId?: UserPlanId;
  premium?: boolean;
};

export default function SubmissionPage() {
  const params = useParams<{ id: string }>();
  const submissionId = params.id;
  const [saved, setSaved] = useState(false);
  const [voteMessage, setVoteMessage] = useState("");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["submission-details", submissionId],
    queryFn: () => fetchSubmissionDetails(submissionId),
    enabled: Boolean(submissionId),
    staleTime: 30_000
  });

  const details = data?.ok ? data.data : null;
  const challenge = useMemo(() => details?.challenge ? normalizeChallenge(details.challenge as ChallengeApiRecord) : null, [details?.challenge]);
  const submission = useMemo(() => {
    if (!details?.submission) return null;
    return normalizeSubmission(details.submission as SubmissionApiRecord, challenge ?? undefined);
  }, [challenge, details?.submission]);
  const creator = (details?.creator ?? {}) as CreatorRecord;
  const votingOpen = challenge ? canVoteOnChallenge(challenge) : false;
  const rank = details?.rank ?? null;

  const voteMutation = useMutation({
    mutationFn: async () => {
      if (!submission) throw new Error("Submission is unavailable.");
      const result = await voteForSubmission({ challengeId: submission.challengeId, submissionId: submission.id, voteMode: "free" });
      if (!result.ok) throw new Error(result.message);
    },
    onSuccess: async () => {
      setVoteMessage("Vote recorded.");
      await queryClient.invalidateQueries({ queryKey: ["submission-details", submissionId] });
    },
    onError: (caught) => setVoteMessage(caught instanceof Error ? caught.message : "Vote could not be recorded.")
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="grid max-w-[1320px] gap-12 xl:grid-cols-[1.4fr_1fr]">
          <Card className="h-[620px] animate-pulse bg-[#171717]" />
          <Card className="h-[620px] animate-pulse bg-[#171717]" />
        </div>
      </AppShell>
    );
  }

  if (data && !data.ok) {
    return (
      <AppShell>
        <Card className="max-w-3xl p-8">
          <h1 className="text-3xl font-black text-[var(--gold-2)]">{data.message.toLowerCase().includes("not found") ? "Submission not found" : "Submission unavailable"}</h1>
          <p className="mt-3 text-slate-300">{data.message}</p>
          <LinkButton href="/challenges" className="mt-6">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (!submission) {
    return (
      <AppShell>
        <Card className="max-w-3xl p-8">
          <h1 className="text-3xl font-black text-[var(--gold-2)]">Submission not found</h1>
          <p className="mt-3 text-slate-300">This submission does not exist or is not available.</p>
          <LinkButton href="/challenges" className="mt-6">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  const status = String((details?.submission as Record<string, unknown> | undefined)?.status ?? "approved");
  const unavailableStatus = ["pending_approval", "rejected", "removed", "private", "withdrawn"].includes(status);
  const creatorName = creator.displayName ?? submission.userName;
  const creatorInitials = creator.initials ?? submission.userInitials;
  const creatorPlan = creator.planId ?? submission.userPlanId;

  return (
    <AppShell>
      <div className="grid max-w-[1320px] gap-12 xl:grid-cols-[1.4fr_1fr]">
        <div className="relative">
          {submission.mediaType === "video" ? <video src={submission.mediaUrl} className="max-h-[620px] w-full rounded-[12px] object-cover" controls /> : <img src={submission.mediaUrl} alt={submission.title} className="max-h-[620px] w-full rounded-[12px] object-cover" />}
          {submission.isWinner ? <div className="absolute left-5 top-5 flex items-center gap-2 rounded-[8px] bg-[var(--gold)] px-5 py-3 font-black text-black"><Trophy size={18} /> WINNER</div> : null}
        </div>
        <aside>
          <h1 className="text-4xl font-black md:text-5xl">{submission.title}</h1>
          {unavailableStatus ? <p className="mt-4 rounded-[8px] border border-yellow-500/40 bg-yellow-500/10 p-4 text-lg font-bold text-[var(--gold)]">Status: {status.replace("_", " ")}</p> : null}
          {submission.isWinner ? <p className="mt-4 rounded-[8px] border border-yellow-500/40 bg-yellow-500/10 p-4 text-lg font-bold text-[var(--gold)]">Winner of {submission.challengeTitle}</p> : null}
          <div className="mt-6 inline-flex rounded-full bg-indigo-950/70 px-5 py-3 font-bold text-indigo-200">{submission.challengeTitle} - {submission.challengeCategory}</div>
          <div className="mt-4 rounded-[8px] border border-white/10 bg-black/30 p-4">
            <div className="font-black text-[var(--gold)]">Submission Preview</div>
            <p className="mt-2 text-sm text-slate-300">Current votes: {submission.likes.toLocaleString()} | Ranking position: #{rank || "N/A"}</p>
          </div>
          <p className="mt-10 text-xl">{submission.description}</p>
          <Card className="mt-8 p-7"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-600">{creatorInitials}</div><div><div className="flex items-center gap-2 text-xl font-black">@{creatorName}<PremiumBadge planId={creatorPlan} /></div><div className="text-slate-400">{submission.createdAt}</div></div></div></Card>
          <div className="mt-8 grid grid-cols-2 gap-5">
            {votingOpen && !unavailableStatus ? <ConsentDialog agreementType="paid_voting" targetId={submission.id} actionLabel={`Vote ${submission.likes}`} onAccepted={() => voteMutation.mutate()} /> : <Button disabled>Voting Closed</Button>}
            <Button variant="ghost" onClick={() => setSaved((value) => !value)}><Star size={18} /> {saved ? "Saved" : "Save"}</Button>
          </div>
          {voteMessage ? <p className="mt-4 rounded-[8px] bg-black/30 p-3 text-slate-300">{voteMessage}</p> : null}
          <Link href={`/challenges/${submission.challengeId}`} className="mt-5 inline-block font-bold text-[var(--gold)]">Back to submissions</Link>
          <Card className="mt-8 p-8">
            <h2 className="flex items-center gap-2 text-2xl font-black"><MessageCircle /> Comments (0)</h2>
            <textarea className="mt-6 h-24 w-full rounded-[8px] border border-white/10 bg-[#181818] p-4" placeholder="Comments are not available yet." disabled />
            <Button variant="purple" className="mt-5" disabled>Post Comment</Button>
            <div className="mt-8 rounded-[8px] bg-[#151515] p-5 text-slate-300">No comments yet.</div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
