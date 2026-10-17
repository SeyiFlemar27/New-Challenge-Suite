/** New publications use automatic free-first voting; existing published terms stay versioned. */
export const AUTOMATIC_VOTING_POLICY_VERSION = 1;
export function supportsPublicVoting(challenge: Record<string, unknown>) {
  return challenge.eventMode !== "physical" && !(challenge.isLiveEvent === true && challenge.eventMode !== "online");
}
export function usesAutomaticVoting(challenge: Record<string, unknown>) {
  return supportsPublicVoting(challenge) && challenge.automaticVotingPolicyVersion === AUTOMATIC_VOTING_POLICY_VERSION;
}
export const AUTOMATIC_VOTING_SETTINGS = { allowFreeVotes: true, allowPaidVotes: true, weightedVotes: false } as const;
