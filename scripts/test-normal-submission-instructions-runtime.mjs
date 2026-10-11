import assert from "node:assert/strict";
import { normalChallengeFormFromRecord, normalChallengePayload } from "../lib/normal-challenge-builder-model.ts";
import { getNormalChallengeReadiness } from "../lib/normal-challenge-readiness.ts";

let assertions = 0;
function equal(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }
function includes(items, code) { assertions += 1; assert.ok(items.some((item) => item.code === code), `expected readiness to include ${code}`); }

const existing = normalChallengeFormFromRecord({ builderVersion: "normal_v3", submissionInstructionsList: ["Step one", "Step two"], challengeGuidelines: "Step one\nStep two" });
equal(existing.submissionInstructions.join("|"), "Step one|Step two", "draft restoration preserves instruction order");
const legacy = normalChallengeFormFromRecord({ builderVersion: "normal_v2", challengeGuidelines: "Use the original project notes exactly." });
equal(legacy.submissionInstructions.length, 1, "legacy freeform instructions stay a single authentic instruction");
equal(legacy.submissionInstructions[0], "Use the original project notes exactly.", "legacy instruction text is not fabricated or split");
const payload = normalChallengePayload({ ...existing, title: "Test", description: "A sufficiently detailed challenge description", category: "Fitness", subcategory: "Strength", images: [{ id: "cover", url: "https://storage.example.test/image", path: "challenges/drafts/user/gallery/a.jpg", fileName: "a.jpg", contentType: "image/jpeg", size: 100, moderationStatus: "approved" }], confirmations: { accurate: true, rights: true, review: true } });
equal(payload.submissionInstructionsList.join("|"), "Step one|Step two", "publishing payload persists ordered list");
equal(payload.challengeGuidelines, "Step one\nStep two", "legacy readers receive the ordered compatibility projection");
equal(payload.submissionRequirementsList.length, 0, "new payload removes the separate Additional Requirements field");
equal(payload.fixAndResubmitEnabled, false, "new payload does not enable Fix and Resubmit");
const emptyReadiness = getNormalChallengeReadiness({ builderVersion: "normal_v3", acceptedSubmissionTypes: ["image"], submissionInstructionsList: [], challengeGuidelines: "" });
includes(emptyReadiness.issues, "SUBMISSION_INSTRUCTIONS_REQUIRED");
const validReadiness = getNormalChallengeReadiness({ builderVersion: "normal_v3", acceptedSubmissionTypes: ["image"], submissionInstructionsList: ["One clear instruction."], challengeGuidelines: "One clear instruction." });
equal(validReadiness.issues.some((item) => item.code === "SUBMISSION_INSTRUCTIONS_REQUIRED"), false, "one non-empty ordered instruction satisfies the rule");
console.log(`PASS Normal submission-instruction runtime contracts: ${assertions} assertions.`);
