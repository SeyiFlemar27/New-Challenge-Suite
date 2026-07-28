import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const helper = readFileSync("lib/server/participant-journey.ts", "utf8");
assert(helper.includes("getParticipantJourneyState"), "participant journey helper must exist");
assert(helper.includes('"registered_not_entered"'), "registered-not-entered state required");
assert(helper.includes('"enter_challenge"'), "enter challenge action required");
assert(helper.includes('"payment_pending"'), "payment pending state required");
assert(helper.includes('"blocked_owner"') && helper.includes('"blocked_sponsor"'), "owner and sponsor blocks required");
console.log("participant journey state machine checks passed");