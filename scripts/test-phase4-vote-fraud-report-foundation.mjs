import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const voting = read("lib/server/voting.ts");
const route = read("app/api/votes/route.ts");
assert(route.includes("suspiciousVoteSignals") && route.includes("voteSignalHashes"));
assert(voting.includes("vote.suspicious_activity") && voting.includes("writeAuditLog"));
assert(voting.includes("ipHash") && voting.includes("userAgentHash"));
console.log("phase4 vote fraud and audit foundation checks passed");