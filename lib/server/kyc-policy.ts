export const KYC_FREE_PRODUCT_POLICY = {
  mode: "kyc_free_for_now",
  backendIntegrationPreserved: true,
  historicalRecordsPreserved: true,
  requiredFor: {
    challengeCreation: false,
    paidChallengePublishing: false,
    privateChallengePublishing: false,
    liveEventPublishing: false,
    tournamentPublishing: false,
    joining: false,
    paidParticipation: false,
    submission: false,
    voting: false,
    prediction: false,
    hostTools: false,
    sponsorActions: false,
    walletAccess: false,
    withdrawalRequest: false,
    internalPrizeCredit: false,
    creatorEarningCredit: false,
    rewardFulfillment: false
  }
} as const;

export type KycPolicyAction = keyof typeof KYC_FREE_PRODUCT_POLICY.requiredFor;

export function isKycRequiredForAction(action: KycPolicyAction) {
  return KYC_FREE_PRODUCT_POLICY.requiredFor[action];
}

export function currentKycPolicyStatus() {
  return "not_required" as const;
}
