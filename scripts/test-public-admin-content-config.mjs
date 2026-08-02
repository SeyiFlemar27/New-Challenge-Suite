import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const api = read("app/api/admin/public-content/route.ts");
const publicApi = read("app/api/public/home/route.ts");
const config = read("lib/public-site/config.ts");
const editor = read("components/admin/public-content-editor.tsx");
const nav = read("components/admin/admin-shell.tsx");

assert(api.includes("requireAdminUser"));
assert(api.includes('collection("publicSiteConfigVersions")'));
assert(api.includes("writeAuditLog"));
assert(editor.includes("Save draft") && editor.includes("Publish changes"));
assert(editor.includes("Logged-in state") && editor.includes("Roles/workspaces") && editor.includes("Plans (comma separated)"));
assert(config.includes("publicAnnouncementMatchesTarget"));
assert(publicApi.includes("getOptionalRequestUser") && publicApi.includes("publicAnnouncementMatchesTarget"));
assert(nav.includes("/admin/public-content"));
console.log("public admin content configuration: ok");
