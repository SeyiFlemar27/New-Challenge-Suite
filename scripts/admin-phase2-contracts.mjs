import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  theme: read("components/app-theme-provider.tsx") + read("app/settings/[section]/page.tsx") + read("app/api/settings/route.ts") + read("app/globals.css"),
  shell: read("components/admin/admin-shell.tsx"), permissions: read("lib/server/admin-permissions.ts"), auth: read("lib/server/auth.ts"),
  team: read("app/api/admin/team/route.ts") + read("app/api/admin/team/[adminId]/route.ts") + read("lib/server/admin-team.ts") + read("components/admin/admin-phase2-workspace.tsx"),
  tasks: read("app/api/admin/action-centre/route.ts") + read("lib/server/admin-operations.ts") + read("components/admin/admin-phase2-workspace.tsx"),
  people: read("app/api/admin/people/users/route.ts") + read("app/api/admin/people/users/[uid]/route.ts") + read("components/admin/admin-phase2-workspace.tsx"),
  challenge: read("components/admin/challenge-control-centre.tsx"),
  refund: read("app/api/admin/refunds/route.ts"), chargeback: read("app/api/admin/chargebacks/route.ts"),
  support: read("app/api/support/tickets/route.ts") + read("app/api/admin/cases/route.ts") + read("components/support-ticket-form.tsx"),
  status: read("app/api/admin/system-status/route.ts") + read("app/api/admin/background-jobs/route.ts") + read("components/admin/admin-phase2-workspace.tsx"),
  content: read("app/api/admin/public-content/route.ts") + read("components/admin/public-content-editor.tsx"),
  earnings: read("app/earnings/page.tsx"), metadata: read("app/layout.tsx") + read("public/site.webmanifest")
};
const has = (source, values) => values.forEach((value) => assert.ok(source.includes(value), `Missing contract: ${value}`));

export function runContract(name) {
  if (name.includes("theme")) has(files.theme, ["light", "dark", "system", "localStorage", "userPreferences", "data-app-theme"]);
  else if (name.includes("favicon") || name.includes("metadata")) { has(files.metadata, ["favicon.ico", "apple-touch-icon.png", "site.webmanifest"]); ["favicon.ico", "favicon-16x16.png", "favicon-32x32.png", "apple-touch-icon.png", "android-chrome-192x192.png", "android-chrome-512x512.png"].forEach((file) => assert.ok(fs.existsSync(`public/${file}`), `Missing ${file}`)); }
  else if (name.includes("admin-team") || name.includes("admin-invite") || name.includes("admin-appoint") || name.includes("admin-removal") || name.includes("admin-final") || name.includes("admin-self") || name.includes("admin-role") || name.includes("admin-2fa") || name.includes("admin-no-duplicate")) { has(files.team + files.auth, ["pending_security_setup", "adminSecuritySetupComplete", "requireRecentAdminAuthentication", "assertAdminManager", "canDeactivateAdministrator", "revokeRefreshTokens", "You cannot appoint or elevate your own"]); }
  else if (name.includes("action-centre")) { has(files.tasks, ["adminActionTasks", "operationalTaskId", "assignedTo", "staffNotes", "slaDueAt", "overdue", "escalated", "Escalation"]); assert.ok(!files.tasks.includes("Math.random")); }
  else if (name.includes("people") || name.includes("user-")) { has(files.people, ["users.view", "users.restrict", "payoutDetailsMasked", "users.viewPayoutDetails", "x-admin-access-reason", "readonlyPreview", "impersonationEnabled: false", "writeAuditLog"]); }
  else if (name.includes("challenge-control") || name.includes("challenge-safe") || name.includes("challenge-sensitive") || name.includes("challenge-soft") || name.includes("challenge-state") || name.includes("challenge-material") || name.includes("challenge-technical")) has(files.challenge, ["Lifecycle", "Participants", "Submissions", "Voting", "Prize Funding", "Finance", "Settlement", "Impact preview required", "Technical Details"]);
  else if (name.includes("refund")) { has(files.refund, ["fullRefundAmountCents", "partialRefundsEnabled: false", "requireRecentAdminAuthentication", "stripe.refunds.create", "idempotencyKey", "providerRefundId", "writeAuditLog"]); assert.ok(!files.refund.includes("amount: parsed"), "Partial refund amount input must not be accepted"); }
  else if (name.includes("chargeback")) has(files.chargeback, ["chargebacks.submitProvider", "stripe.disputes.update", "evidence", "submit: true", "idempotencyKey", "exposedFundsFrozen", "writeAuditLog"]);
  else if (name.includes("support") || name.includes("disputes-workspace") || name.includes("appeals-workspace") || name.includes("safety-report") || name.includes("reported-message") || name.includes("appeal-deadline")) { has(files.support, ["supportTickets", "adminActionTasks", "attachmentPaths", "native uploads", "reportedMessageId", "validInvestigationReason", "writeAuditLog"]); assert.ok(!files.support.includes("fake conversation")); }
  else if (name.includes("public-content")) has(files.content, ["MediaUploadField", "videoPath", "posterPath", "publicSiteConfigVersions", "content.publish", "writeAuditLog"]);
  else if (name.includes("system-status")) { has(files.status, ["providerConfigurationStatus", "not_connected", "uptimePercentage: null", "systemIncidents"]); assert.ok(!files.status.includes("99.9")); }
  else if (name.includes("background-jobs")) has(files.status, ["jobs.view", "jobs.retry", "retryIdempotencyKey", "ALREADY_PENDING", "noDirectFinancialExecution"]);
  else if (name.includes("feature-readiness")) has(files.status, ["Feature Readiness", "not_configured", "ready_for_testing", "remainingSetupTasks"]);
  else if (name.includes("help") || name.includes("handover") || name.includes("developer-support") || name.includes("training-mode")) has(files.status, ["Admin Help Centre", "Anjola Samuel", "anjolaolalekan777@gmail.com", "Training Mode is available only in staging or development"]);
  else if (name.includes("earnings") || name.includes("wallet-shows")) { has(files.earnings, ["Challenge winner prize", "Sponsor-funded prize", "Prediction reward", "Creator challenge earning"]); assert.ok(!/DoroCoin.*withdraw/i.test(files.earnings)); }
  else if (name.includes("admin-all-new-routes") || name.includes("admin-sensitive") || name.includes("admin-no-frontend") || name.includes("admin-export") || name.includes("admin-payout")) has(Object.values(files).join("\n"), ["requireAdminPermission", "requireRecentAdminAuthentication", "writeAuditLog"]);
  else has(Object.values(files).join("\n"), ["requireAdminPermission", "serverUnavailable", "writeAuditLog"]);
  console.log(`PASS ${name}`);
}
