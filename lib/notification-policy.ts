export const OPTIONAL_NOTIFICATION_DEFAULTS = {
  voterResults: true, votingReminders: false, recommendations: false,
  promotions: false, communityUpdates: false, directMessages: false, otherOptional: false,
};
export type OptionalNotificationCategory = keyof typeof OPTIONAL_NOTIFICATION_DEFAULTS;
const optionalTypes: Record<string, OptionalNotificationCategory> = {
  voter_results: "voterResults", voting_reminder: "votingReminders",
  challenge_recommendation: "recommendations", promotion: "promotions",
  live_event_announcement: "promotions", follower: "communityUpdates",
  new_follower: "communityUpdates", comment_reply: "communityUpdates", new_message: "directMessages",
};
const essentialTypes = new Set([
  "payment_confirmed", "challenge_moderation", "private_access_decision", "challenge_submitted", "challenge_published", "tournament_submitted", "tournament_published", "challenge_changes_requested", "enterprise_application_approved", "enterprise_application_needs_info", "enterprise_application_rejected",
  "tournament_individual_match_hold", "tournament_individual_match_confirm_existing_result",
  "challenge_results", "challenge_cancelled", "winner_proposal_changes_requested", "winner_proposal_rejected",
  "withdrawal_status", "financial_correction", "tournament_result_review", "tournament_cancel", "tournament_individual_entry_withdrawn", "tournament_individual_review_overdue", "tournament_individual_structural_review",
  "live_event_pass_upgraded",
  "challenge_joined", "challenge_waitlisted", "challenge_approved", "challenge_rejected",
  "challenge_joined", "challenge_waitlisted", "challenge_approved", "challenge_rejected",
  "tournament_competitor_disqualified",
  "tournament_individual_settlement_prepared",
  "tournament_match_assigned",
  "tournament_competitor_advanced",
  "tournament_competitor_eliminated",
  "tournament_paid_entry_slot_reserved",
  "tournament_tournament_entry_payment_review_required",
  "tournament_tournament_entry_payment_disputed",
  "tournament_tournament_entry_refunded_and_held",
  "tournament_participant_registered",
  "tournament_submitted_for_review",
  "tournament_tournament_approve",
  "tournament_tournament_reject",
  "tournament_team_slot_reserved",
  "tournament_submission_submitted",
  "tournament_submission_replaced",
  "tournament_submission_approved",
  "tournament_submission_rejected",
  "tournament_no_submission_extension",
  "tournament_double_forfeit_dependency_hold",
  "tournament_submission_forfeit",
  "tournament_match_voting_closed",
  "tournament_tournament_settlement_prepared",
  "tournament_team_entitlements_reconciled",
  "tournament_pause",
  "tournament_resume",
  "tournament_paid_tournament_entry_confirmed",
  "tournament_full_tournament_activated",
  "tournament_match_voting_opened",
  "tournament_result_confirmed",
  "tournament_team_member_payment_attempt_started",
  "tournament_team_member_payment_confirmed",
  "tournament_team_registration_confirmed",
  "tournament_team_registration_failed",
  "tournament_team_registration_expired",
  "tournament_team_entry_payment_review_required",
  "tournament_sponsor_payment_confirmed",
  "tournament_sponsor_payment_review_required",
  "tournament_sponsor_terms_accept",
  "tournament_sponsor_terms_reject",
  "challenge_boosted",
  "challenge_settlement_created",
  "creator_challenge_earning_created",
  "enterprise_assignment",
  "entry_request_approved",
  "entry_request_created",
  "entry_request_rejected",
  "event_check_in_confirmed",
  "event_registration",
  "growth_wallet_expired",
  "sponsor_deliverable_submitted",
  "sponsorship_auto_completion_warning",
  "sponsorship_completed",
  "sponsorship_completion_review_started",
  "submission_request_resubmission",
  "submission_uploaded",
  "tournament_entry_payment_failed",
  "tournament_entry_confirmed",
  "tournament_entry_payment_review",
  "tournament_entry_refunded",
  "tournament_submission_extension",
  "tournament_waitlist_offer",
  "winner_proposal_approved",
  "normal_voting_schedule",
  "normal_results_review",
  "normal_no_winners",
  "normal_submission_open",
  "normal_submission_received",
  "normal_submission_rejected",
  "normal_submission_closed",
  "normal_results_official",
  "normal_registration_confirmed",
  "normal_submission_reminder",
  "tournament_submission_reminder",
  "private_access_request",
  "private_access_invitation",
  "private_access_granted",
  "private_access_revoked",
  "live_event_cancelled",
  "live_event_material_change",
  "live_event_result",
  "live_event_ticket",
  "live_event_registration",
  "live_event_reminder",
  "live_event_staff_invitation",
  "wallet_deposit_confirmed",
  "payment_failed",
  "withdrawal_requested",
  "withdrawal_held",
  "payout_completed",
  "payout_failed",
  "refund_completed",
  "prize_credited",
  "prize_cleared",
  "account_restricted",
  "security_event",
  "admin_action_required"
]);
export function notificationPolicy(type: string) {
  const optional = optionalTypes[type];
  if (optional) return { essential: false, category: optional };
  // These are server event families. Promotional types must be explicitly
  // registered above; unknown event types never gain essential status.
  if (essentialTypes.has(type)) {
    return { essential: true, category: /payment|refund|wallet|withdrawal|payout|prize|settlement|funding/.test(type) ? "money" : /security|account_/.test(type) ? "account" : "participation" };
  }
  return { essential: false, category: "otherOptional" };
}
export function normalizedNotificationPreferences(value: Record<string, unknown> = {}) {
  const result = { ...OPTIONAL_NOTIFICATION_DEFAULTS };
  for (const key of Object.keys(result) as OptionalNotificationCategory[]) if (typeof value[key] === "boolean") result[key] = value[key] as boolean;
  if (value.communityUpdates === undefined && (value.commentsReplies === true || value.followerNotifications === true)) result.communityUpdates = true;
  return { ...value, ...result, inApp: true, essentialInApp: true, policyVersion: 2 };
}
export function notificationEnabled(type: string, preferences: Record<string, unknown>) {
  const policy = notificationPolicy(type);
  return policy.essential || normalizedNotificationPreferences(preferences)[policy.category as OptionalNotificationCategory] === true;
}
export function notificationHistoryCutoff(now = new Date()) {
  const cutoff = new Date(now); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1); return cutoff.toISOString();
}

/** Only saved optional Sponsor message preferences migrate; operational categories remain essential. */
export function reconciledNotificationPreferences(current: Record<string, unknown>, legacy: Record<string, unknown> = {}) {
  const result = { ...current };
  const message = legacy.message_received as { in_app?: unknown } | undefined;
  if (result.directMessages === undefined && typeof message?.in_app === "boolean") result.directMessages = message.in_app;
  return normalizedNotificationPreferences(result);
}
