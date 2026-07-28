import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const page=read("app/challenges/[id]/prediction/page.tsx");
assert(page.includes('Choose a participant') && page.includes('avatarUrl') && page.includes('profilePath'));
console.log("Phase 9 participant profile preview checks passed.");