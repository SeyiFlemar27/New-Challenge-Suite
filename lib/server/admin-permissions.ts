export const ADMIN_PERMISSIONS = [
  "admin.dashboard.view", "admin.actionCentre.view", "admin.search.use",
  "users.view", "users.editBasicProfile", "users.warn", "users.restrict", "users.suspendWorkspace",
  "users.suspendAccount", "users.reinstate", "users.revokeSessions", "users.requireVerification", "users.export",
  "users.viewPayoutDetails",
  "challenges.view", "challenges.review", "challenges.editSafeFields", "challenges.extendDeadlines", "challenges.pause",
  "challenges.resume", "challenges.cancel", "challenges.archive", "challenges.delete", "challenges.overrideCreatorDecision",
  "submissions.view", "submissions.review", "submissions.override", "participants.review", "participants.disqualify",
  "winners.review", "winners.confirm", "winners.correct", "votes.investigate", "votes.adjust",
  "finance.view", "finance.export", "withdrawals.review", "withdrawals.approve", "withdrawals.secondApprove",
  "withdrawals.markPaid", "refunds.request", "refunds.approve", "refunds.execute", "chargebacks.review", "chargebacks.submitProvider", "wallet.adjust", "settlements.prepare",
  "settlements.approve", "promotionalFunding.create", "promotionalFunding.approve",
  "sponsors.view", "sponsors.review", "sponsors.approve", "sponsors.suspend", "sponsorCampaigns.review", "sponsorFunds.release",
  "tickets.view", "tickets.assign", "tickets.resolve", "disputes.review", "disputes.decide", "appeals.review",
  "safetyReports.review", "reportedMessages.view", "messaging.restrict",
  "content.edit", "content.preview", "content.schedule", "content.publish", "content.rollback",
  "settings.view", "settings.editGeneral", "settings.editFinancial", "settings.editVoting", "settings.editPlans",
  "settings.editIntegrations", "roles.manage", "developerTools.view", "featureControls.manage",
  "systemDiagnostics.view", "jobs.view", "jobs.retry", "auditLogs.viewRaw", "qaTools.use",
  "rewards.view", "rewards.configure", "rewards.publish", "rewards.adjustUser", "rewards.investigate", "rewards.emergencyControl"
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLES = [
  "platform_owner", "super_admin", "operations_admin", "finance_admin", "moderation_admin", "safety_admin",
  "support_admin", "sponsor_manager", "event_tournament_admin", "content_admin", "marketing_communications_admin",
  "analyst", "read_only_auditor", "technical_admin", "developer_support"
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

const viewPermissions: AdminPermission[] = [
  "admin.dashboard.view", "admin.actionCentre.view", "admin.search.use", "users.view", "challenges.view",
  "submissions.view", "finance.view", "sponsors.view", "tickets.view", "settings.view", "rewards.view"
];

const rolePermissions: Record<AdminRole, AdminPermission[]> = {
  platform_owner: [...ADMIN_PERMISSIONS],
  super_admin: [...ADMIN_PERMISSIONS],
  operations_admin: [...viewPermissions, "users.warn", "users.restrict", "users.suspendWorkspace", "users.reinstate", "challenges.review", "challenges.editSafeFields", "challenges.extendDeadlines", "challenges.pause", "challenges.resume", "challenges.cancel", "challenges.archive", "submissions.review", "participants.review", "participants.disqualify", "winners.review", "sponsors.review", "tickets.assign", "tickets.resolve", "disputes.review"],
  finance_admin: ["admin.dashboard.view", "admin.actionCentre.view", "admin.search.use", "users.view", "users.viewPayoutDetails", "challenges.view", "finance.view", "finance.export", "withdrawals.review", "withdrawals.approve", "withdrawals.secondApprove", "withdrawals.markPaid", "refunds.request", "refunds.approve", "refunds.execute", "chargebacks.review", "chargebacks.submitProvider", "settlements.prepare", "settlements.approve", "promotionalFunding.create", "promotionalFunding.approve", "sponsorFunds.release", "jobs.view", "auditLogs.viewRaw"],
  moderation_admin: ["admin.dashboard.view", "admin.actionCentre.view", "admin.search.use", "users.view", "challenges.view", "challenges.review", "submissions.view", "submissions.review", "submissions.override", "participants.review", "participants.disqualify", "winners.review", "votes.investigate", "safetyReports.review"],
  safety_admin: ["admin.dashboard.view", "admin.actionCentre.view", "admin.search.use", "users.view", "users.warn", "users.restrict", "users.suspendAccount", "users.reinstate", "submissions.view", "tickets.view", "disputes.review", "disputes.decide", "appeals.review", "safetyReports.review", "reportedMessages.view", "messaging.restrict"],
  support_admin: ["admin.dashboard.view", "admin.actionCentre.view", "admin.search.use", "users.view", "users.warn", "users.requireVerification", "tickets.view", "tickets.assign", "tickets.resolve", "disputes.review", "appeals.review"],
  sponsor_manager: ["admin.dashboard.view", "admin.actionCentre.view", "admin.search.use", "users.view", "challenges.view", "sponsors.view", "sponsors.review", "sponsors.approve", "sponsors.suspend", "sponsorCampaigns.review"],
  event_tournament_admin: ["admin.dashboard.view", "admin.actionCentre.view", "admin.search.use", "users.view", "challenges.view", "challenges.review", "submissions.view", "submissions.review", "participants.review", "winners.review"],
  content_admin: ["admin.dashboard.view", "admin.search.use", "content.edit", "content.preview", "content.schedule", "content.publish", "content.rollback"],
  marketing_communications_admin: ["admin.dashboard.view", "admin.search.use", "content.edit", "content.preview", "content.schedule", "content.publish"],
  analyst: ["admin.dashboard.view", "admin.search.use", "users.view", "challenges.view", "submissions.view", "finance.view", "sponsors.view", "finance.export"],
  read_only_auditor: [...viewPermissions, "submissions.view", "auditLogs.viewRaw"],
  technical_admin: ["admin.dashboard.view", "admin.actionCentre.view", "admin.search.use", "settings.view", "settings.editIntegrations", "developerTools.view", "featureControls.manage", "systemDiagnostics.view", "jobs.view", "jobs.retry", "auditLogs.viewRaw", "qaTools.use"],
  developer_support: ["admin.dashboard.view", "admin.actionCentre.view", "admin.search.use", "settings.view", "developerTools.view", "systemDiagnostics.view", "jobs.view", "auditLogs.viewRaw"]
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function resolveAdminPermissions(roles: readonly string[], explicitPermissions: readonly string[] = []) {
  const permissions = new Set<AdminPermission>();
  for (const role of roles) {
    if (!isAdminRole(role)) continue;
    for (const permission of rolePermissions[role]) permissions.add(permission);
  }
  for (const permission of explicitPermissions) {
    if ((ADMIN_PERMISSIONS as readonly string[]).includes(permission)) permissions.add(permission as AdminPermission);
  }
  return [...permissions];
}

export function hasAdminPermission(permissions: readonly string[] | undefined, permission: AdminPermission) {
  return Boolean(permissions?.includes(permission));
}

export function canDeactivateAdministrator(input: { actorId: string; targetId: string; activeSuperAdminCount: number; targetRoles: readonly string[] }) {
  if (input.actorId === input.targetId) return { allowed: false, reason: "You cannot deactivate your own administrator account." };
  if (input.targetRoles.some((role) => role === "platform_owner")) return { allowed: false, reason: "Platform ownership must be transferred through the protected ownership process." };
  if (input.targetRoles.some((role) => role === "super_admin") && input.activeSuperAdminCount <= 1) return { allowed: false, reason: "The final active Super Admin cannot be removed." };
  return { allowed: true, reason: null };
}

export function canManageAdministrators(roles: readonly string[] | undefined) {
  return Boolean(roles?.some((role) => role === "platform_owner" || role === "super_admin"));
}
