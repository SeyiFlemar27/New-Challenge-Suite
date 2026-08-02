import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const shell = read("components/admin/admin-shell.tsx");
const publicChallenge = read("lib/server/public-challenge.ts");
const retired = read("lib/server/retired-competitions.ts");
assert(!shell.includes("/admin/hybrid/create"));
assert(publicChallenge.includes("isRetiredHybridCompetition"));
assert(retired.includes("retiredHybridCompetitionState"));
console.log("active Hybrid Competition was not reintroduced: ok");
