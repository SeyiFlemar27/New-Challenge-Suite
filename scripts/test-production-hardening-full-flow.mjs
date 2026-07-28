import assert from "node:assert/strict";
import { exists, read } from "./production-flow-test-utils.mjs";
for (const file of ["app/challenges/create/page.tsx", "app/challenges/[id]/page.tsx", "app/challenges/[id]/join/page.tsx", "app/wallet/withdraw/page.tsx", "app/admin/finance/page.tsx", "app/my-entries/page.tsx", "app/winners/page.tsx"]) assert(exists(file), `${file} must exist`);
assert(read("app/challenges/[id]/join/page.tsx").includes("SubmissionAccessCard"), "submission flow must avoid dead-end submit blocker");
assert(read("app/api/challenges/[id]/entry-checkout/route.ts").includes("?payment=processing"), "paid-entry checkout must return to challenge detail processing state");
console.log("production hardening full flow checks passed");