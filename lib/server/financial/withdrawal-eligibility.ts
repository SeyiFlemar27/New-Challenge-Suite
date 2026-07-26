export function evaluateWithdrawalEligibility(input: {
  availableMinor: number;
  requestedMinor: number;
  kycStatus: string;
  payoutMethodStatus: string;
  activeHoldMinor?: number;
  negativeBalanceMinor?: number;
  riskFlags?: string[];
}) {
  const blockers: string[] = [];
  if (input.kycStatus !== "approved" && input.kycStatus !== "verified") blockers.push("kyc_required");
  if (input.payoutMethodStatus !== "verified") blockers.push("payout_method_required");
  if ((input.activeHoldMinor ?? 0) > 0) blockers.push("active_hold");
  if ((input.negativeBalanceMinor ?? 0) > 0) blockers.push("negative_balance");
  if (input.availableMinor < input.requestedMinor || input.requestedMinor <= 0) blockers.push("insufficient_balance");
  if (input.riskFlags?.length) blockers.push("risk_review_required");
  return { eligible: blockers.length === 0, blockers, payoutProviderCalled: false, withdrawalExecuted: false };
}
