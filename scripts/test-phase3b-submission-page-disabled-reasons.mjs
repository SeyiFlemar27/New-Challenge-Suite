import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/challenges/[id]/join/page.tsx");
for (const token of ["submitDisabledReason", "Accept the challenge rules", "Upload an accepted media file", "Retry or replace the failed upload"]) assert(page.includes(token));
console.log("Phase 3B submission disabled-reason checks passed.");
