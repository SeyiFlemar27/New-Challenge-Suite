import type { FinancialEnvironmentMode, SandboxKycStatus } from "@/lib/server/financial/financial-types";

export const FINANCIAL_ENVIRONMENT_MODES: FinancialEnvironmentMode[] = ["production", "staging", "development", "sandbox"];
export const SANDBOX_KYC_STATUSES: SandboxKycStatus[] = ["approved", "pending", "rejected", "requires_resubmission", "manual_review", "expired"];
export const SANDBOX_PROVIDER_OUTCOMES = ["successful_payout", "failed_payout", "requires_action", "reversed_payout"] as const;

export function getFinancialEnvironmentMode() {
  const raw = String(process.env.FINANCIAL_ENVIRONMENT_MODE ?? process.env.NODE_ENV ?? "production").toLowerCase();
  return FINANCIAL_ENVIRONMENT_MODES.includes(raw as FinancialEnvironmentMode) ? raw as FinancialEnvironmentMode : "production";
}

export function assertSandboxAllowed(mode: FinancialEnvironmentMode = getFinancialEnvironmentMode()) {
  return { allowed: mode !== "production", mode, productionControlsBlocked: mode === "production", frontendToggleCanActivateSandbox: false };
}

export function sandboxProviderFoundation() {
  return {
    provider: "sandbox",
    productionEnabled: false,
    requiresAdminFinanceRole: true,
    directSetBalanceAllowed: false,
    usesLedgerServiceFoundation: true,
    supportedActions: [
      "confirm_test_prize_funding",
      "fail_test_prize_funding",
      "advance_winner_settlement",
      "finalize_review_window",
      "approve_test_kyc",
      "reject_test_kyc",
      "require_test_kyc_resubmission",
      "confirm_test_payout",
      "fail_test_payout",
      "reverse_test_payout",
      "create_test_chargeback",
      "resolve_chargeback_won",
      "resolve_chargeback_lost",
      "place_test_financial_hold",
      "release_test_financial_hold",
      "approve_sponsorship_deliverables",
      "raise_sponsorship_dispute",
      "complete_test_refund",
      "fail_test_refund",
      "void_prediction_market",
      "settle_test_prediction_market"
    ]
  };
}
