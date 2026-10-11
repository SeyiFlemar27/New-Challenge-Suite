import assert from "node:assert/strict";
import { privateSubmissionInstructionPayload, privateSubmissionInstructionsFromRecord } from "../lib/private-challenge-submission-instructions.ts";

let assertions = 0;
function equal(actual, expected, message) { assertions += 1; assert.deepEqual(actual, expected, message); }

equal(privateSubmissionInstructionsFromRecord({ submissionInstructionsList: ["First", "Second"], challengeGuidelines: "Legacy" }), ["First", "Second"], "draft restoration preserves the persisted ordered instruction list");
equal(privateSubmissionInstructionsFromRecord({ challengeGuidelines: "Use the published reference image.\nInclude the original file." }), ["Use the published reference image.\nInclude the original file."], "legacy freeform content is preserved as one authentic instruction");
equal(privateSubmissionInstructionsFromRecord({}), [""], "empty legacy content is not fabricated");
equal(privateSubmissionInstructionPayload([" First ", "", "Second"]), { submissionInstructionsList: ["First", "Second"], challengeGuidelines: "First\nSecond" }, "payload preserves order and projects it for legacy readers");
console.log(`PASS Private submission instruction compatibility: ${assertions} assertions.`);
