import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
assert.equal((page.match(/<SummaryItem value=\{displayStatus\}/g) ?? []).length, 1, "the challenge status appears once in the summary strip");
assert.equal((page.match(/statusClassName\(displayStatus/g) ?? []).length, 0, "status is not duplicated in an additional badge");
assert.equal((page.match(/<ParticipantJourneyPanel/g) ?? []).length, 1, "only one participation card may render");
console.log("challenge detail repeated status checks passed");
