import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const details = read("app/api/challenges/[id]/route.ts");
const invite = read("app/api/private-exclusive/route.ts");
assert(details.includes("PRIVATE_INVITE_REQUIRED") && invite.includes("privateChallengeAccess"));
console.log("Phase 3B private invite access checks passed.");
