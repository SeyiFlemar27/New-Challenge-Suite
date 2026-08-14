import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync("components/normal-challenge-builder.tsx", "utf8");
const submittedStateStart = builder.indexOf("function SubmittedChallengeState");
const submittedState = builder.slice(submittedStateStart);

assert.ok(submittedStateStart > 0, "pending-review challenges need a dedicated submitted state");
assert.match(builder, /editable = status === "draft" \|\| status === "requires_changes"/);
assert.match(builder, /if \(!id \|\| loadingDraft \|\| saving \|\| !editable\) return/);
assert.match(builder, /\[editable, id, loadingDraft, payload, saving, step\]/);
assert.match(builder, /async function persist\(next = step\)[\s\S]*if \(!id \|\| !editable\) return false/);
assert.match(builder, /version\.current \+= 1; setError\(""\); setSaving\(true\)/);
assert.match(builder, /version\.current \+= 1; setAutosaveFailed\(false\); setError\(""\); setStatus/);
assert.match(builder, /currentVersion !== version\.current/);
assert.match(builder, /result\.code === "CHALLENGE_NOT_EDITABLE"[\s\S]*fetchChallengeDraft\(id\)[\s\S]*setStatus\("pending_review"\)[\s\S]*setError\(""\)/);
assert.match(builder, /status === "pending_review" && id/);

for (const copy of ["Challenge submitted for review", "Challenge submitted for review. We'll notify you when it's approved.", "Your challenge is being reviewed before it goes public.", "You can edit this challenge if an admin requests changes.", "View Challenge", "Back to Dashboard", "Contact Support"]) assert.ok(submittedState.includes(copy), `missing submitted-state copy: ${copy}`);
for (const forbidden of ["Check this step", "Submit for Review", "Continuing...", "updateChallengeDraft(", "persist("]) assert.ok(!submittedState.includes(forbidden), `submitted state must not include editable wizard behavior: ${forbidden}`);

assert.match(submittedState, /href=\{`\/challenges\/\$\{challengeId\}`\}/);
assert.match(submittedState, /href="\/dashboard\/host"/);
assert.match(submittedState, /href="\/contact"/);
const submittedRender = builder.indexOf('status === "pending_review" && id');
const editableWizardRender = builder.indexOf('return <AppShell><main className="mx-auto max-w-[1280px]');
assert.ok(submittedRender > 0 && submittedRender < editableWizardRender, "submitted state must render before the editable wizard");

console.log("PASS submitted-challenge-builder-state-contracts.mjs");
