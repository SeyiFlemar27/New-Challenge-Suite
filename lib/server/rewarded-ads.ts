export const REWARDED_AD_DOROCOINS = 5;
export const REWARDED_AD_CYCLE_LIMIT = 10;
export const REWARDED_AD_COOLDOWN_MS = 2 * 60 * 60 * 1000;

export type RewardedAdVerificationInput = {
  providerEventId: string;
  providerVerified: boolean;
  completionStatus: string;
  existingProviderEventIds: string[];
  cycleCount: number;
  cooldownUntil?: string | null;
  now?: Date;
};

export function evaluateRewardedAdVerification(input: RewardedAdVerificationInput) {
  const now = input.now ?? new Date();
  const cooldownAt = input.cooldownUntil ? Date.parse(input.cooldownUntil) : Number.NaN;
  if (Number.isFinite(cooldownAt) && now.getTime() < cooldownAt) {
    return { allowed: false, code: "REWARD_COOLDOWN_ACTIVE", rewardAmount: 0, cycleCount: input.cycleCount, cooldownUntil: input.cooldownUntil };
  }
  if (!input.providerVerified) return { allowed: false, code: "PROVIDER_VERIFICATION_REQUIRED", rewardAmount: 0, cycleCount: 0, cooldownUntil: null };
  if (input.completionStatus !== "completed") return { allowed: false, code: "AD_NOT_COMPLETED", rewardAmount: 0, cycleCount: 0, cooldownUntil: null };
  if (!input.providerEventId || input.existingProviderEventIds.includes(input.providerEventId)) {
    return { allowed: false, code: "DUPLICATE_PROVIDER_EVENT", rewardAmount: 0, cycleCount: 0, cooldownUntil: null };
  }
  const currentCount = Number.isFinite(cooldownAt) && now.getTime() >= cooldownAt ? 0 : Math.max(0, input.cycleCount);
  const cycleCount = currentCount + 1;
  const cooldownUntil = cycleCount >= REWARDED_AD_CYCLE_LIMIT ? new Date(now.getTime() + REWARDED_AD_COOLDOWN_MS).toISOString() : null;
  return { allowed: true, code: "REWARD_VERIFIED", rewardAmount: REWARDED_AD_DOROCOINS, cycleCount, cooldownUntil };
}
