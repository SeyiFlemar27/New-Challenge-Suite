import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const api = read("app/api/enterprise-inquiries/route.ts");
const adminApi = read("app/api/admin/operations/route.ts");
const adminUi = read("components/admin/admin-control-center.tsx");
const adminShell = read("components/admin/admin-shell.tsx");
const adminRoute = read("app/admin/[section]/page.tsx");
const topbar = read("components/authenticated-topbar.tsx");
const statusPage = read("app/enterprise/status/page.tsx");
const applyPage = read("app/enterprise/apply/page.tsx");
const dashboard = read("app/enterprise/page.tsx") + read("app/enterprise/dashboard/page.tsx");
const guard = read("components/verification-guard.tsx");
const helper = read("lib/server/enterprise-applications.ts");
const previewPage = read("app/enterprise/application/page.tsx");

assert.match(helper, /ENTERPRISE_APPLICATION_COLLECTION = "enterpriseInquiries"/);
assert.match(api, /latestEnterpriseApplication/);
assert.match(api, /existing[\s\S]*doc\(existing\.id\)/);
assert.match(api, /ENTERPRISE_APPLICATION_LOCKED/);
assert.match(api, /application_submitted/);
assert.match(api, /application_updated/);
assert.match(api, /lastSubmittedAt/);
assert.match(api, /submittedFields/);

assert.match(adminApi, /enterpriseApplications = enterpriseRecords\.filter/);
assert.match(adminApi, /applicationType === ENTERPRISE_APPLICATION_TYPE/);
assert.match(adminApi, /enterpriseLeads = enterpriseRecords\.filter/);
assert.match(adminApi, /contactRequests = support/);
assert.match(adminApi, /pendingEnterpriseApplications/);
assert.match(adminApi, /runTransaction/);
assert.match(adminApi, /STALE_APPLICATION_VERSION/);
assert.match(adminApi, /expectedVersion/);
assert.match(adminApi, /enterpriseAccessStatus: status/);
assert.match(adminApi, /enterprise_application_\$\{action\}/);
assert.match(adminApi, /enterprise_access_granted/);
assert.match(adminApi, /enterprise_internal_note_added/);
assert.match(adminApi, /Enterprise access approved[\s\S]*Your Enterprise workspace is ready/);
assert.match(adminApi, /More information needed[\s\S]*Please update your Enterprise application/);

for (const section of ["enterprise-applications", "enterprise-leads", "contact-requests"]) assert.ok(adminRoute.includes(`"${section}"`));
assert.match(adminShell, /\/admin\/enterprise-applications", label: "Enterprise Applications"/);
assert.match(adminShell, /\/admin\/enterprise-leads", label: "Enterprise Leads"/);
assert.match(adminShell, /\/admin\/contact-requests", label: "Contact Requests"/);
assert.doesNotMatch(adminShell, /\/admin\/enterprise-leads", label: "Contact requests"/i);

assert.match(adminUi, /"enterprise-applications": \{ title: "Enterprise Applications"/);
assert.match(adminUi, /"enterprise-leads": \{ title: "Enterprise Leads"/);
assert.match(adminUi, /"contact-requests": \{ title: "Contact Requests"/);
assert.match(adminUi, /normalizedSection === "enterprise-applications"[\s\S]*data\.enterpriseApplications/);
assert.match(adminUi, /normalizedSection === "contact-requests"[\s\S]*data\.contactRequests/);
assert.match(adminUi, /No enterprise applications need review\./);
assert.doesNotMatch(adminUi, /live Firestore queue/);
for (const action of ["Approve", "Reject", "Request Info", "Add Internal Note", "View User"]) assert.ok(adminUi.includes(action), `missing admin action ${action}`);
for (const field of ["Applicant name", "Email", "Company / organization", "Role / title", "Current account type", "Current plan", "Use case", "Expected challenge volume", "Team size", "Budget / plan interest", "Contact details", "Submitted", "Last updated", "Internal notes", "Technical details"]) assert.ok(adminUi.includes(field), `missing detail field ${field}`);

assert.match(topbar, /WorkspaceSwitcher/);
assert.doesNotMatch(topbar, /canSwitchEnterpriseRole/);
assert.doesNotMatch(topbar, /label: "Host"/);
assert.match(dashboard, /enterpriseAccessStatus[\s\S]*approved/);
assert.match(dashboard, /Enterprise Studio/);

for (const copy of ["Enterprise application submitted", "Pending review", "We'll notify you when your application has been reviewed.", "You can continue using your normal account while this is being reviewed.", "More information needed", "Enterprise access approved", "Enterprise application not approved", "Contact Support"]) assert.ok(statusPage.includes(copy), `missing status copy ${copy}`);
assert.match(statusPage, /href="\/contact"/);
assert.match(applyPage, /"pending", "in_review", "needs_info", "requested_changes"/);
assert.match(helper, /ENTERPRISE_APPLICATION_REVISION_COLLECTION/);
assert.match(helper, /enterpriseApplicationRevisionId/);
assert.match(api, /transaction\.create\(db\.collection\(ENTERPRISE_APPLICATION_REVISION_COLLECTION\)/);
assert.match(api, /action === "withdraw"/);
assert.match(api, /STALE_APPLICATION_VERSION/);
assert.match(statusPage, /Withdraw Application/);
assert.match(statusPage, /Application timeline/);
assert.match(previewPage, /Review the application currently linked to your account/);
assert.match(adminApi, /existingWorkspaces\.add\("enterprise"\)/);
assert.doesNotMatch(adminApi, /workspaceTypes: \["personal", "enterprise"\]/);

assert.match(guard, /if \(loading\) return null/);
assert.doesNotMatch(guard, /LoadingGate|Restoring your session|Checking session|Rehydrating auth|Loading verified user record/);
assert.doesNotMatch(guard, /aria-label="Loading"/);

console.log(`PASS ${path.basename(process.argv[1])}`);
