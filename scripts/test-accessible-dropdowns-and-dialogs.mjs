import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const sidebar = read("components/sidebar.tsx");
const sponsor = read("components/sponsor/sponsor-shell.tsx");
const admin = read("components/admin/admin-control-center.tsx");
assert(sidebar.includes('role="dialog"') && sidebar.includes('aria-modal="true"'));
assert(sponsor.includes('role="dialog"') && sponsor.includes('aria-label="Sponsor navigation"'));
assert(admin.includes('role="dialog"') && admin.includes('aria-modal="true"'));
console.log("accessible dialog checks passed");
