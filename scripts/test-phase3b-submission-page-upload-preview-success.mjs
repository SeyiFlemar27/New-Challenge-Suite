import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/challenges/[id]/join/page.tsx");
const upload = read("components/media-upload-field.tsx");
assert(page.includes("View My Entry") && page.includes("Submission received"));
for (const token of ["progressbar", "Replace", "Remove", "Retry Upload", "Upload complete"]) assert(upload.includes(token));
console.log("Phase 3B submission upload, preview, and success checks passed.");
