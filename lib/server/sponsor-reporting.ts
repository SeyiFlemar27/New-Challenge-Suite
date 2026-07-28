type SponsorRecord = Record<string, unknown> & { id?: string };

const ACTIVE_CAMPAIGN_STATUSES = new Set(["published", "inviting_creators", "proposal_open", "negotiating", "awaiting_contract", "awaiting_funding", "scheduled", "active", "paused"]);
const OPEN_PROPOSAL_STATUSES = new Set(["sent", "received", "under_review", "negotiating", "changes_requested"]);

function cents(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function contributionState(record: SponsorRecord) {
  const status = text(record.status).toLowerCase();
  if (status === "confirmed" && record.webhookConfirmed === true) return "confirmed";
  if (["pending", "created", "processing"].includes(status)) return "pending";
  return status || "unknown";
}

export function buildSponsorReportingSummary(input: {
  campaigns: SponsorRecord[];
  proposals: SponsorRecord[];
  contributions: SponsorRecord[];
  deliverables: SponsorRecord[];
  challenges?: Map<string, SponsorRecord>;
}) {
  const confirmed = input.contributions.filter((item) => contributionState(item) === "confirmed");
  const pending = input.contributions.filter((item) => contributionState(item) === "pending");
  const confirmedFundsCents = confirmed.reduce((total, item) => total + cents(item.amountCents ?? item.amount), 0);
  const pendingFundsCents = pending.reduce((total, item) => total + cents(item.amountCents ?? item.amount), 0);
  const approvedDeliverables = input.deliverables.filter((item) => ["approved", "completed"].includes(text(item.status).toLowerCase())).length;

  const fundedChallenges = confirmed.map((contribution) => {
    const challengeId = text(contribution.challengeId);
    const challenge = input.challenges?.get(challengeId) ?? {};
    const winnerAnnounced = Boolean(challenge.winnersAnnouncedAt || challenge.resultsPublishedAt || challenge.publicWinnersPublishedAt);
    const payoutStatus = text(challenge.payoutStatus ?? challenge.winnerPayoutStatus).toLowerCase();
    const payoutVerified = ["paid", "paid_out", "completed"].includes(payoutStatus);
    return {
      contributionId: contribution.id ?? null,
      challengeId,
      title: text(challenge.title) || "Sponsored challenge",
      amountCents: cents(contribution.amountCents ?? contribution.amount),
      currency: text(contribution.currency).toUpperCase() || "USD",
      contributionStatus: "confirmed",
      winnerAllocationStatus: winnerAnnounced ? "winner_announced" : "pending_winner_announcement",
      payoutVerificationStatus: payoutVerified ? "paid_out_verified" : "pending_payout_verification",
      confirmedAt: contribution.confirmedAt ?? null
    };
  });

  return {
    metrics: {
      activeCampaigns: input.campaigns.filter((item) => ACTIVE_CAMPAIGN_STATUSES.has(text(item.status).toLowerCase())).length,
      proposalsAwaitingReview: input.proposals.filter((item) => OPEN_PROPOSAL_STATUSES.has(text(item.status).toLowerCase())).length,
      confirmedSponsorFundsCents: confirmedFundsCents,
      pendingSponsorFundsCents: pendingFundsCents,
      approvedDeliverables,
      trackedParticipants: null,
      trackedReach: null,
      trackedImpressions: null,
      trackedClicks: null,
      trackedConversions: null,
      roi: null
    },
    fundedChallenges,
    dataQuality: {
      financial: confirmed.length ? "webhook_confirmed" : "not_tracked_yet",
      performance: "not_tracked_yet",
      roi: "not_tracked_yet"
    }
  };
}