export function buildStoredVotingSettings(input: Record<string, unknown>) {
  const entries = Object.entries(input).filter(([key, value]) => key !== "allowDoroCoinVotes" && value !== undefined);
  const stored = Object.fromEntries(entries);
  const allowPaidVotes = input.allowPaidVotes ?? input.allowDoroCoinVotes;
  if (allowPaidVotes !== undefined) stored.allowPaidVotes = Boolean(allowPaidVotes);
  return stored;
}
