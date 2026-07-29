import { assert, approval } from "./settlement-test-utils.mjs";
const source = approval();
assert(source.includes("requireAdminUser"), "winner approval must require an admin");
assert(source.includes("winnerProposalLifecycleReadiness"), "winner approval must check lifecycle readiness");
assert(source.includes("getWinnerCandidates"), "winner approval must validate eligible winner submissions");
assert(source.includes("createInternalChallengeSettlement"), "winner approval must create the internal settlement");
assert(source.includes("No external payout was executed"), "approval must remain non-paying");
console.log("admin winner approval internal split checks passed");
