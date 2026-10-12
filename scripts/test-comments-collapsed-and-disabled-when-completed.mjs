import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
const api = read("app/api/challenges/[id]/comments/route.ts");
const policy = read("lib/server/challenge-comments.ts");
assert(page.includes("useState(false)") && page.includes("Comments ({visibleCommentsTotal.toLocaleString()})"));
assert(page.includes("commentsClosed") && page.includes("Existing comments remain available below."));
assert(page.includes("visibleComments.map") && page.includes("!commentsClosed && user"), "completed challenge must keep history visible while disabling the composer");
assert(api.includes("canCreateChallengeComment(access.challenge)"), "comment API must use the shared comment lifecycle policy");
assert(policy.includes('"completed", "cancelled", "paused", "postponed"') && policy.includes('"completed", "cancelled", "canceled", "paused", "postponed"'), "comment policy must reject new comments for terminal states while preserving reads");
console.log("challenge comments collapsed and completed-state checks passed");
