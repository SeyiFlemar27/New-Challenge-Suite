import { isRetiredHybridCompetition } from "@/lib/server/public-challenge";

export { isRetiredHybridCompetition };

export function retiredHybridCompetitionState(record: Record<string, unknown>) {
  if (!isRetiredHybridCompetition(record)) return null;
  return {
    retiredCompetition: true,
    archived: true,
    archiveReason: "format_discontinued",
    readOnly: true,
    preserveHistoricalRecords: true
  } as const;
}
