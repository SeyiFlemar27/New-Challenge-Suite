export const ENTERPRISE_APPLICATION_COLLECTION = "enterpriseInquiries";
export const ENTERPRISE_APPLICATION_TYPE = "enterprise_access_application";

export const editableEnterpriseApplicationStatuses = new Set(["pending", "in_review", "needs_info", "requested_changes"]);
export const decidedEnterpriseApplicationStatuses = new Set(["approved", "rejected"]);

export function enterpriseApplicationStatus(record: Record<string, unknown>) {
  return String(record.status ?? record.approvalStatus ?? "pending").trim().toLowerCase();
}

export function isEnterpriseApplication(record: Record<string, unknown>) {
  return record.applicationType === ENTERPRISE_APPLICATION_TYPE;
}

export function canEditEnterpriseApplication(record: Record<string, unknown>) {
  return isEnterpriseApplication(record) && editableEnterpriseApplicationStatuses.has(enterpriseApplicationStatus(record));
}

export function latestEnterpriseApplication(records: Array<Record<string, unknown> & { id: string }>) {
  return records
    .filter(isEnterpriseApplication)
    .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")))[0] ?? null;
}
