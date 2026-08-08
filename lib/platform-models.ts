export type IsoTimestamp = string;
export type CurrencyCode = string;
export type PlatformTransactionCategory = "cash" | "dorocoin" | "vote" | "stake" | "payout" | "fee" | "refund";
export type ImmutableRecord = { readonly immutable: true; readonly idempotencyKey: string };

export type NotificationRecord = { id: string; userId: string; type: string; title: string; message: string; status: "unread" | "read" | "archived"; priority: "low" | "normal" | "high"; actionUrl: string | null; readAt: IsoTimestamp | null; createdAt: IsoTimestamp; updatedAt: IsoTimestamp };
export type ConversationRecord = { id: string; participantIds: string[]; status: "active" | "archived" | "deleted"; unreadUserIds: string[]; relatedChallengeId: string | null; createdAt: IsoTimestamp; updatedAt: IsoTimestamp };
export type MessageRecord = { id: string; conversationId: string; senderId: string; recipientId: string; body: string; status: "sent" | "read" | "removed"; readBy: string[]; createdAt: IsoTimestamp; updatedAt: IsoTimestamp };

export type EarningsTransactionRecord = ImmutableRecord & { id: string; userId: string; challengeId: string | null; category: "cash"; sourceType: string; direction: "credit" | "debit"; amountCents: number; currency: CurrencyCode; status: "pending" | "held" | "available" | "withdrawal_requested" | "paid" | "reversed"; createdAt: IsoTimestamp };
export type PayoutRecord = ImmutableRecord & { id: string; userId: string; category: "payout"; amountCents: number; currency: CurrencyCode; status: "pending_review" | "approved" | "processing" | "paid" | "failed" | "rejected" | "cancelled" | "reversed"; providerReference: string | null; payoutExecuted: boolean; createdAt: IsoTimestamp; updatedAt: IsoTimestamp };
export type PayoutMethodRecord = { id: string; userId: string; type: "bank_account" | "paypal" | "payoneer"; maskedAccount: string; verificationStatus: "not_started" | "pending" | "verified" | "restricted"; providerReference: string | null; rawCredentialsStored: false; createdAt: IsoTimestamp; updatedAt: IsoTimestamp };
export type DoroCoinTransactionRecord = ImmutableRecord & { id: string; userId: string; category: "dorocoin"; type: "purchase" | "admin_grant" | "vote_spend" | "boost_spend" | "reward" | "adjustment"; amount: number; balanceAfter: number; cashOutEnabled: false; createdAt: IsoTimestamp };
export type DoroCoinPurchasePackage = { id: string; baseCoins: number; bonusCoins: number; priceCents: number; currency: CurrencyCode; active: boolean; providerPriceReference: string | null };
export type AdRewardCycleRecord = ImmutableRecord & { id: string; userId: string; category: "dorocoin"; verifiedAdCount: number; awardedCoins: number; providerVerified: true; cooldownUntil: IsoTimestamp | null; createdAt: IsoTimestamp };

export type VoteRecord = ImmutableRecord & { id: string; category: "vote"; challengeId: string; submissionId: string; voterId: string; voteMode: "free" | "credits"; voteDate: string; timeZone: string; status: "counted" | "reversed" | "invalidated"; createdAt: IsoTimestamp };
export type DailyFreeVoteEligibilityRecord = { id: string; userId: string; challengeId: string; voteDate: string; timeZone: string; resetsAt: IsoTimestamp; consumedAt: IsoTimestamp };

export type PredictionMarketRecord = { id: string; challengeId: string; status: "open" | "locked" | "under_review" | "settled" | "refunded" | "disputed"; opensAt: IsoTimestamp | null; closesAt: IsoTimestamp; currency: CurrencyCode; platformFeeRate: 0.07; createdAt: IsoTimestamp; updatedAt: IsoTimestamp };
export type PredictionStakeRecord = ImmutableRecord & { id: string; category: "stake"; marketId: string; challengeId: string; predictorId: string; predictedSubmissionId: string; amountCents: number; currency: CurrencyCode; status: "pending_payment" | "active" | "won" | "lost" | "voided" | "refunded_review" | "settled"; paymentConfirmed: boolean; createdAt: IsoTimestamp; updatedAt: IsoTimestamp };
export type PredictionPoolTotalsRecord = { marketId: string; grossConfirmedStakeCents: number; platformFeeCents: number; netPoolCents: number; activePredictorCount: number; calculatedAt: IsoTimestamp };
export type SettlementRecord = ImmutableRecord & { id: string; challengeId: string; category: "fee"; status: "pending_review" | "settled" | "requires_admin_review" | "reversed"; grossAmountCents: number; feeAmountCents: number; netAmountCents: number; currency: CurrencyCode; approvedWinnerIds: string[]; createdAt: IsoTimestamp; settledAt: IsoTimestamp | null };
export type RefundRecord = ImmutableRecord & { id: string; userId: string; category: "refund"; sourceType: string; sourceId: string; amountCents: number; currency: CurrencyCode; status: "requested" | "pending_review" | "approved" | "rejected" | "cancelled" | "completed"; providerExecutionEnabled: false; createdAt: IsoTimestamp; updatedAt: IsoTimestamp };
export type DisputeRecord = { id: string; userId: string; targetType: string; targetId: string; status: "open" | "under_review" | "resolved" | "rejected" | "escalated" | "closed"; reason: string; fraudFlags: string[]; createdAt: IsoTimestamp; updatedAt: IsoTimestamp };

export type ChallengeLifecycleRecord = { challengeId: string; status: "draft" | "pending_review" | "scheduled" | "active" | "submission_open" | "voting_open" | "voting_closed" | "under_review" | "winners_announced" | "completed" | "cancelled" | "paused" | "archived"; submissionStartAt: IsoTimestamp | null; submissionDeadline: IsoTimestamp | null; votingStartAt: IsoTimestamp | null; votingEndAt: IsoTimestamp | null; winnerAnnouncementAt: IsoTimestamp | null; updatedAt: IsoTimestamp };
export type ChallengeCancellationRecord = ImmutableRecord & { id: string; challengeId: string; status: "requested" | "approved" | "rejected" | "completed"; reason: string; affectedParticipantIds: string[]; financialReviewRequired: boolean; createdAt: IsoTimestamp; updatedAt: IsoTimestamp };
export type CompletedResultsArchiveRecord = { id: string; challengeId: string; originalCompetitionType: string; winnerIds: string[]; participantRecordIds: string[]; submissionRecordIds: string[]; settlementRecordIds: string[]; auditLogIds: string[]; readOnly: true; archivedAt: IsoTimestamp };

export function assertNonNegativeMinorAmount(amount: number, field = "amountCents") {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`${field} must be a non-negative integer.`);
  return amount;
}
