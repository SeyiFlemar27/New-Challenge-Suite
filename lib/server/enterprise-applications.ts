export const ENTERPRISE_APPLICATION_COLLECTION = "enterpriseInquiries";
export const ENTERPRISE_APPLICATION_TYPE = "enterprise_access_application";
export const ENTERPRISE_APPLICATION_REVISION_COLLECTION = "enterpriseApplicationRevisions";

export const editableEnterpriseApplicationStatuses = new Set(["pending", "in_review", "needs_info", "requested_changes"]);
export const decidedEnterpriseApplicationStatuses = new Set(["approved", "rejected", "withdrawn", "revoked", "expired"]);
export const resubmittableEnterpriseApplicationStatuses = new Set(["rejected", "withdrawn", "needs_info", "requested_changes"]);

export type EnterpriseApplicationFields = {
  fullName: string;
  company: string;
  workEmail: string;
  website: string | null;
  roleTitle: string | null;
  expectedChallengeVolume: string | null;
  useCase: string;
  relationship: string | null;
  teamSize: string | null;
  budgetOrPlanInterest: string | null;
  contactDetails: string | null;
};

export function enterpriseApplicationStatus(record: Record<string, unknown>) {
  return String(record.status ?? record.approvalStatus ?? "pending").trim().toLowerCase();
}

export function isEnterpriseApplication(record: Record<string, unknown>) {
  return record.applicationType === ENTERPRISE_APPLICATION_TYPE;
}

export function canEditEnterpriseApplication(record: Record<string, unknown>) {
  return isEnterpriseApplication(record) && editableEnterpriseApplicationStatuses.has(enterpriseApplicationStatus(record));
}

export function canResubmitEnterpriseApplication(record: Record<string, unknown>, now = Date.now()) {
  if (!isEnterpriseApplication(record) || !resubmittableEnterpriseApplicationStatuses.has(enterpriseApplicationStatus(record))) return false;
  if (record.reapplyAllowed === false) return false;
  const reapplyAfter = typeof record.reapplyAfter === "string" ? Date.parse(record.reapplyAfter) : Number.NaN;
  return !Number.isFinite(reapplyAfter) || reapplyAfter <= now;
}

export function enterpriseApplicationVersion(record: Record<string, unknown>) {
  const version = Number(record.version ?? record.currentRevision ?? 1);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

export function enterpriseApplicationId(userId: string) {
  return `enterprise_${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function enterpriseApplicationRevisionId(applicationId: string, version: number) {
  return `${applicationId}_v${version}`;
}

export function enterpriseApplicationTimeline(record: Record<string, unknown>) {
  const events = Array.isArray(record.timeline) ? record.timeline : [];
  return events
    .filter((event): event is Record<string, unknown> => Boolean(event) && typeof event === "object" && !Array.isArray(event))
    .map((event) => ({
      type: String(event.type ?? "application_updated"),
      status: String(event.status ?? enterpriseApplicationStatus(record)),
      at: String(event.at ?? record.updatedAt ?? record.createdAt ?? ""),
      message: String(event.message ?? "Application updated.")
    }));
}

export function latestEnterpriseApplication(records: Array<Record<string, unknown> & { id: string }>) {
  return records
    .filter(isEnterpriseApplication)
    .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")))[0] ?? null;
}
