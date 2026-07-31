import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
assert.equal((page.match(/statusClassName\(displayStatus/g) ?? []).length, 1, "only the cover may render the status badge");
assert.equal((page.match(/<ParticipantJourneyPanel/g) ?? []).length, 1, "only one participation card may render");
console.log("challenge detail repeated status checks passed");
