export function sponsorshipToWinnerFlowVisibility() {
  return {
    steps: [
      "challenge_creation",
      "sponsor_ready_setup",
      "sponsor_discussion",
      "webhook_confirmed_sponsor_funding",
      "participants_join_submit",
      "paid_votes_generate_confirmed_revenue",
      "participant_vote_share_pending_hold",
      "creator_host_proposes_winners",
      "admin_approves_winners",
      "ledger_credits_pending_hold",
      "winner_announcement",
      "kyc_hold_payout_provider_required_before_withdrawal"
    ],
    sponsorFundsGoToWinnersPercent: 100,
    paidVotePlatformFeeFirstPercent: 15,
    paidVoteParticipantSharePercent: 15,
    winnerAnnouncementCopy: "Winners are approved by admin. Earnings enter pending balance first. Sponsor-funded prizes go 100% to winners. Paid vote revenue includes platform fee first, then participant vote-share, then challenge revenue split. KYC and 24-hour hold are required before withdrawal.",
    noPayoutRelease: true,
    noFakeFunding: true
  };
}
