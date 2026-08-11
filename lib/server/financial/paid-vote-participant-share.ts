import { calculatePercentMinor, subtractMinorUnits } from "@/lib/server/financial/money";

export const PAID_VOTE_PLATFORM_FEE_PERCENT_FIRST = 15;
export const PAID_VOTE_PARTICIPANT_SHARE_PERCENT = 15;

export function calculatePaidVoteParticipantShare(input: {
  totalPaidVoteRevenueMinor: number;
  participantPaidVoteRevenueMinor: number;
  participantStatus: string;
  submissionStatus: string;
}) {
  const total = Math.max(0, Math.trunc(Number(input.totalPaidVoteRevenueMinor) || 0));
  const participantRevenue = Math.max(0, Math.trunc(Number(input.participantPaidVoteRevenueMinor) || 0));
  const platformFeeMinor = calculatePercentMinor(total, PAID_VOTE_PLATFORM_FEE_PERCENT_FIRST);
  const netAfterPlatformFeeMinor = Math.max(0, total - platformFeeMinor);
  const eligible = ["active", "approved"].includes(input.participantStatus) && ["approved", "winner", "active"].includes(input.submissionStatus);
  const participantShareMinor = eligible ? calculatePercentMinor(Math.min(participantRevenue, netAfterPlatformFeeMinor), PAID_VOTE_PARTICIPANT_SHARE_PERCENT) : 0;
  return {
    appliesOnlyToPaidVotes: true,
    freeVotesIncluded: false,
    platformFeePercentFirst: PAID_VOTE_PLATFORM_FEE_PERCENT_FIRST,
    participantSharePercent: PAID_VOTE_PARTICIPANT_SHARE_PERCENT,
    platformFeeMinor,
    participantShareMinor,
    remainingForChallengeRevenueSplitMinor: subtractMinorUnits(total, platformFeeMinor, participantShareMinor),
    eligibleParticipantRequired: true,
    status: eligible ? "pending_hold" : "ineligible",
    holdHours: 24,
    kycRequiredBeforeWithdrawal: false,
    payoutProviderCalled: false,
    fakeVoteRevenueAllowed: false
  };
}
