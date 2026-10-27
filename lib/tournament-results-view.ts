type Row = Record<string, unknown>;
/** A display-only projection: allocations are never inferred from an advertised pool. */
export function tournamentResultAllocation(settlement: Row | null, tournamentId: string, placement: number) {
  if (!settlement || settlement.challengeId !== tournamentId) return null;
  const rows = [settlement.winnerDistribution, settlement.sponsorPrizeDistribution].flatMap(value => Array.isArray(value) ? value as Row[] : []);
  const selected = rows.filter(row => Number(row.placement) === placement);
  if (!selected.length || selected.some(row => !Number.isSafeInteger(row.netAmountCents) || Number(row.netAmountCents) < 0)) return null;
  const amountCents = selected.reduce((sum, row) => sum + Number(row.netAmountCents), 0);
  if (!Number.isSafeInteger(amountCents) || settlement.currency !== "USD") return null;
  return { amountCents, currency: "USD" as const };
}
