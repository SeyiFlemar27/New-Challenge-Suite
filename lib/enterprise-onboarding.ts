import type { EnterpriseAccessRecord, EnterprisePermission } from "@/lib/enterprise-access";

export const ENTERPRISE_ONBOARDING_DEFINITION_VERSION = 2;
export type EnterpriseOnboardingTask = { id: string; title: string; description: string; permission: EnterprisePermission | null; required: boolean; completionMode?: "acknowledgement" | "audited_action"; sourceActions?: string[] };
export type EnterpriseOnboardingModule = { id: string; title: string; description: string; tasks: EnterpriseOnboardingTask[] };

const modules: EnterpriseOnboardingModule[] = [
  { id: "workspace", title: "Enterprise workspace", description: "Understand how official Challenge Suite work stays separate from your Personal workspace.", tasks: [
    { id: "workspace_context", title: "Review workspace boundaries", description: "Enterprise access does not change your Personal plan, wallet, rewards, or account identity.", permission: null, required: true },
    { id: "assignment_context", title: "Review assignment behavior", description: "Assignments appear when work is delegated to you. Having no assignment does not block onboarding.", permission: null, required: true }
  ] },
  { id: "challenges", title: "Official challenge operations", description: "Use only the official challenges and actions within your authorized scope.", tasks: [
    { id: "challenge_scope", title: "Review challenge scope", description: "Category, region, and assignment scope control which official challenges you can access.", permission: "challenge.view", required: true },
    { id: "challenge_changes", title: "Review change controls", description: "Operational changes remain permission checked and audit logged.", permission: "challenge.edit", required: true },
    { id: "official_challenge_action", title: "Complete an official challenge action", description: "This completes automatically after your first audited official challenge action.", permission: "challenge.edit", required: false, completionMode: "audited_action", sourceActions: ["enterprise_official_challenge_created", "enterprise_note_added"] }
  ] },
  { id: "reviews", title: "Review responsibilities", description: "Apply review decisions consistently without bypassing moderation or lifecycle controls.", tasks: [
    { id: "review_decisions", title: "Review decision standards", description: "Consequential decisions are recorded and attributable to the acting staff member.", permission: "reviews.decide", required: true },
    { id: "submission_review", title: "Review submission access", description: "Submission access is limited to authorized official challenge work.", permission: "submissions.review", required: true }
  ] },
  { id: "finance", title: "Finance controls", description: "Financial access is permission scoped and does not execute external payouts by itself.", tasks: [
    { id: "finance_boundaries", title: "Review finance boundaries", description: "Preparation and review do not bypass confirmed payments, settlement controls, or payout review.", permission: "finance.view", required: true }
  ] },
  { id: "partnerships", title: "Sponsor operations", description: "Sponsor records and proposals remain private to authorized operations.", tasks: [
    { id: "sponsor_boundaries", title: "Review Sponsor data boundaries", description: "Use Sponsor information only for authorized platform partnership work.", permission: "sponsors.view", required: true }
  ] },
  { id: "team", title: "Team coordination", description: "Assignments and notes are operational records, not authorization shortcuts.", tasks: [
    { id: "team_controls", title: "Review team controls", description: "Assigning work does not grant permissions beyond the staff member's role.", permission: "team.view", required: true },
    { id: "first_staff_assignment", title: "Complete a staff assignment", description: "This completes automatically after your first audited assignment. It is optional when no assignment work is available.", permission: "team.manage", required: false, completionMode: "audited_action", sourceActions: ["enterprise_staff_assigned"] }
  ] },
  { id: "security", title: "Security and accountability", description: "Protect user data and use Enterprise only for authorized business purposes.", tasks: [
    { id: "security_acknowledgement", title: "Acknowledge security responsibilities", description: "Do not export, share, or use restricted information outside authorized Challenge Suite operations.", permission: null, required: true }
  ] }
];

export function enterpriseOnboardingModules(access: EnterpriseAccessRecord) {
  return modules.map((module) => ({ ...module, tasks: module.tasks.filter((task) => !task.permission || access.permissions.includes(task.permission)) })).filter((module) => module.tasks.length > 0);
}

export function enterpriseOnboardingTaskIds(access: EnterpriseAccessRecord) {
  return enterpriseOnboardingModules(access).flatMap((module) => module.tasks.map((task) => task.id));
}

export function enterpriseOnboardingRequiredTaskIds(access: EnterpriseAccessRecord) {
  return enterpriseOnboardingModules(access).flatMap((module) => module.tasks.filter((task) => task.required).map((task) => task.id));
}

export function enterpriseOnboardingPermissionFingerprint(access: EnterpriseAccessRecord) {
  return [...access.permissions].sort().join("|");
}
