import { assert, approval, settlement } from "./settlement-test-utils.mjs";
assert(approval().includes("createInternalChallengeSettlement"), "admin approval must invoke settlement");
const source = settlement();
assert(source.includes('sourceType: "creator_challenge_earning"'), "creator credit source type must be explicit");
assert(source.includes("breakdown.creatorHostAmount > 0"), "creator credit must use confirmed challenge-generated share");
console.log("creator wallet credit after approval checks passed");
