import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const selected = new Set(process.argv.slice(2));
const run = (name, check) => { if (!selected.size || selected.has(name)) check(); };

run("provisioning", () => {
  const admin = read("app/api/admin/operations/route.ts");
  const adminUi = read("components/admin/admin-control-center.tsx");
  const access = read("lib/enterprise-access.ts");
  assert.match(admin, /accountType: "enterprise"/);
  assert.match(admin, /staffAccess/);
  assert.match(admin, /enterprisePreviousAccountType/);
  assert.match(admin, /rolePermissions\(enterpriseRole/);
  assert.match(adminUi, /Enterprise role/);
  assert.match(adminUi, /Access scope/);
  assert.match(adminUi, /enterpriseRole, enterpriseScope, enterpriseDepartment/);
  assert.match(access, /assigned_only/);
  assert.match(access, /all_official/);
  assert.match(access, /read_all_edit_assigned/);
  assert.doesNotMatch(access, /accountType === "enterprise"[^]*allowEverything/);
});

run("studio", () => {
  const page = read("app/enterprise/page.tsx");
  const api = read("app/api/enterprise/workspace/route.ts");
  for (const label of ["Enterprise Studio", "Active Official Challenges", "Participants", "Submissions", "Needs Attention", "My Work", "Official Challenges"]) assert.ok(page.includes(label), `Missing ${label}`);
  assert.match(api, /requireEnterprisePermission\(request, "challenge\.view"\)/);
  assert.match(api, /enterpriseChallengeInScope/);
  assert.match(api, /limit\(200\)/);
});

run("ownership", () => {
  const create = read("app/api/challenges/route.ts");
  const builder = read("components/challenge-builder.tsx");
  assert.match(create, /ENTERPRISE_OFFICIAL_CREATE_DENIED/);
  assert.match(create, /organizationOwnerId: body\.officialChallenge \? "challenge_suite" : null/);
  assert.match(create, /enterpriseChallengeLeadId/);
  assert.match(builder, /enterpriseOwnership === "official"/);
});

run("navigation", () => {
  const sidebar = read("components/sidebar.tsx");
  assert.match(sidebar, /Enterprise Studio/);
  assert.match(sidebar, /enterpriseSections\(permissions/);
  assert.match(sidebar, /workspaceContext !== "enterprise"/);
  assert.doesNotMatch(sidebar, /context === "enterprise"[^]*adminSections/);
});

run("private_steps", () => {
  const builder = read("components/challenge-builder.tsx");
  const match = builder.match(/const privateSteps = \[([^\]]+)\]/);
  assert.ok(match);
  assert.equal((match[1].match(/"/g) ?? []).length / 2, 10);
  for (const step of ["Overview", "Private Access", "Eligibility", "Participant Requirements", "Monetization & Prize Pool", "Media & Branding", "Schedule", "Entry & Submission", "Review", "Publish"]) assert.ok(match[1].includes(`"${step}"`));
});

run("private_aliases", () => {
  const schema = read("lib/server/challenge-validation.ts");
  const route = read("app/api/challenges/route.ts");
  assert.match(schema, /"link_and_code"/);
  assert.match(schema, /selected_countries/);
  assert.match(schema, /minimum_age/);
  assert.match(route, /privateAccessMethod: body\.visibility === "private" \? "link_and_code"/);
});

run("private_requirements", () => {
  const builder = read("components/challenge-builder.tsx");
  const route = read("app/api/challenges/route.ts");
  const draft = read("app/api/challenges/drafts/[id]/route.ts");
  for (const field of ["privateParticipantQuestions", "privateParticipantAcknowledgements"]) { assert.ok(builder.includes(field)); assert.ok(route.includes(field)); assert.ok(draft.includes(field)); }
  assert.match(builder, /Do not request passwords, payment details, identity documents/);
});

run("live_steps", () => {
  const wizard = read("components/host/host-competition-wizard.tsx");
  const match = wizard.match(/const liveEventSteps = \[([^\]]+)\]/);
  assert.ok(match);
  assert.equal((match[1].match(/"/g) ?? []).length / 2, 10);
  assert.match(wizard, /manualCheckInEnabled: true/);
  assert.match(wizard, /qrCheckInRequiresServerToken: true/);
  assert.match(wizard, /judgeAccountIds/);
});

console.log(`Normalized Enterprise, Private, and Live Event contracts passed${selected.size ? `: ${[...selected].join(", ")}` : ""}.`);
