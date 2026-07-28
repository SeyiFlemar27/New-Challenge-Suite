import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const join = readFileSync("app/challenges/[id]/join/page.tsx", "utf8");
const api = readFileSync("app/api/submissions/route.ts", "utf8");

assert(join.includes("submissionAccess?.message"), "join page must display the backend submission blocker");
assert(join.includes("submissionAccess?.canSubmit === true"), "join page must use backend canSubmit");
assert(api.includes('fail(submittable.reason ?? "Challenge is not accepting submissions."'), "API must return canonical lifecycle blocker");
assert(api.includes("freshSubmittable.reason"), "transaction blocker must come from the same canonical helper");
assert(!join.includes('"Submissions are not open yet."'), "join page must not retain a contradictory hard-coded blocker");
console.log("final submit blocker consistency checks passed");
