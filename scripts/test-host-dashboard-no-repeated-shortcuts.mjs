import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/dashboard/host/page.tsx");
assert.equal((page.match(/Create Competition/g) ?? []).length, 1);
assert.equal((page.match(/Review Submissions/g) ?? []).length, 0);
assert.equal((page.match(/Voting Control/g) ?? []).length, 0);
assert.equal((page.match(/Reports/g) ?? []).length, 0);
console.log("host dashboard avoids repeated management shortcuts: ok");
