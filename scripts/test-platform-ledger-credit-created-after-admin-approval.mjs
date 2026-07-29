import { assert, settlement } from "./settlement-test-utils.mjs";
const source = settlement();
assert(source.includes('sourceType: "platform_challenge_fee"'), "platform challenge fee ledger is required");
assert(source.includes('sourceType: "sponsor_prize_platform_fee"'), "sponsor prize fee ledger is required");
assert(source.includes('db.collection("platformLedger")'), "platform fees must be stored in platform ledger");
console.log("platform ledger credit after approval checks passed");
