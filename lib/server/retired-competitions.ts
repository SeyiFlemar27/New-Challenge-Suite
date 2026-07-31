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

export function retiredHybridArchiveManifest(record: Record<string, unknown>) {
  if (!isRetiredHybridCompetition(record)) return null;
  return {
    challengeId: String(record.id ?? ""),
    originalCompetitionType: String(record.competitionType ?? record.type ?? "Hybrid Competition"),
    readOnly: true,
    preserveFinancialHistory: true,
    preserveParticipantRecords: true,
    preserveSubmissions: true,
    preserveAuditLogs: true,
    preserveOriginalRoute: true,
    replacementCreationRoute: "/host/create",
    rollback: "Restore creation links only; never delete or rewrite archived historical records."
  } as const;
}
