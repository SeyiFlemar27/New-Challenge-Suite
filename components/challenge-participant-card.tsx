"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Sparkles, Vote } from "lucide-react";
import { Button, Card, LinkButton } from "@/components/ui";
import { AvatarFrame, SubmissionMediaFrame } from "@/components/media-display";
import { voteForSubmission } from "@/lib/api/services";
import type { PublicChallengeParticipant } from "@/lib/server/challenge-participants";

export interface PublicVotingAccess {
  authenticated: boolean;
  canVote: boolean;
  reason: string | null;
  loginPath?: string;
}

export interface PublicPredictionAccess {
  available: boolean;
  windowOpen: boolean;
  authenticated: boolean;
  canPredict: boolean;
  reason: string | null;
  message: string;
  loginPath?: string;
}

function blockedVoteLabel(reason: string | null) {
  if (reason === "owner_blocked") return "Cannot Vote on Own Challenge";
  if (reason === "sponsor_blocked") return "Voting Unavailable";
  if (reason === "no_eligible_submissions") return "Voting Unavailable";
  return "Voting Closed";
}

function blockedVoteMessage(reason: string | null) {
  if (reason === "owner_blocked") return "You cannot vote on your own challenge.";
  if (reason === "sponsor_blocked") return "Sponsor accounts cannot vote in participant competitions.";
  if (reason === "no_eligible_submissions") return "No eligible submissions are available for voting.";
  return "Voting is closed for this challenge.";
}

export function ChallengeParticipantCard({
  challengeId,
  participant,
  votingAccess,
  predictionAccess,
  returnPath,
  onVoteRecorded
}: {
  challengeId: string;
  participant: PublicChallengeParticipant;
  votingAccess: PublicVotingAccess;
  predictionAccess?: PublicPredictionAccess;
  returnPath: string;
  onVoteRecorded?: () => void | Promise<void>;
}) {
  const voteMutation = useMutation({
    mutationFn: async () => {
      const result = await voteForSubmission({
        challengeId,
        submissionId: participant.submissionId,
        voteMode: "free",
        quantity: 1,
        idempotencyKey: crypto.randomUUID()
      });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: async () => {
      await onVoteRecorded?.();
    }
  });
  const loginPath = `/auth/login?next=${encodeURIComponent(returnPath)}`;

  return (
    <Card data-mobile-participant-card className="flex h-full flex-col overflow-hidden">
      <SubmissionMediaFrame
        src={participant.submissionMediaUrl}
        alt={participant.submissionTitle}
        className="aspect-[16/10] h-auto rounded-none border-0"
        placeholder="Challenge entry"
      />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <AvatarFrame
              src={participant.avatarUrl}
              alt={participant.displayName}
              className="h-11 w-11 shrink-0 border-0"
              placeholder={participant.displayName.slice(0, 2).toUpperCase()}
            />
            <div className="min-w-0">
              {participant.profilePath ? (
                <Link href={participant.profilePath} className="block truncate font-black hover:text-[var(--gold)]">
                  {participant.displayName}
                </Link>
              ) : <p className="truncate font-black">{participant.displayName}</p>}
              {participant.username ? <p className="truncate text-xs text-slate-400">@{participant.username}</p> : null}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--gold)] px-3 py-1 text-xs font-black text-black">#{participant.rank}</span>
        </div>

        <h3 className="mt-5 line-clamp-2 text-lg font-black">{participant.submissionTitle}</h3>
        <p className="mt-2 text-sm font-bold text-slate-400">
          {participant.exactVoteCountVisible && participant.voteCount !== null
            ? `${participant.voteCount.toLocaleString()} vote${participant.voteCount === 1 ? "" : "s"}`
            : "Rankings shown while results are in progress"}
        </p>

        <div className="mt-auto grid gap-3 pt-5 sm:grid-cols-2">
          <LinkButton href={participant.submissionPath} variant="secondary" className="w-full">
            <ExternalLink size={16} /> View Submission
          </LinkButton>
          {!votingAccess.authenticated ? (
            <LinkButton href={votingAccess.loginPath || loginPath} className="w-full"><Vote size={16} /> Log in to Vote</LinkButton>
          ) : votingAccess.canVote ? (
            <Button className="w-full" disabled={voteMutation.isPending} onClick={() => voteMutation.mutate()}>
              <Vote size={16} /> {voteMutation.isPending ? "Recording..." : "Vote"}
            </Button>
          ) : (
            <Button className="w-full" variant="secondary" disabled><Vote size={16} /> {blockedVoteLabel(votingAccess.reason)}</Button>
          )}
        </div>
        {predictionAccess?.available ? (
          <div className="mt-3">
            {!predictionAccess.authenticated ? (
              <LinkButton href={predictionAccess.loginPath || `/auth/login?next=${encodeURIComponent(`/challenges/${challengeId}/prediction`)}`} variant="secondary" className="w-full">
                <Sparkles size={16} /> Log in to Predict
              </LinkButton>
            ) : predictionAccess.canPredict ? (
              <LinkButton href={`/challenges/${challengeId}/prediction?submissionId=${encodeURIComponent(participant.submissionId)}`} variant="secondary" className="w-full">
                <Sparkles size={16} /> Predict Winner
              </LinkButton>
            ) : null}
          </div>
        ) : null}
        {votingAccess.authenticated && !votingAccess.canVote ? <p className="mt-3 text-sm text-slate-400">{blockedVoteMessage(votingAccess.reason)}</p> : null}
        {voteMutation.isSuccess ? <p className="mt-3 text-sm font-bold text-emerald-300">Vote recorded.</p> : null}
        {voteMutation.error ? <p className="mt-3 text-sm text-red-300">{voteMutation.error.message}</p> : null}
      </div>
    </Card>
  );
}
