import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const privateBuilder = readFileSync("components/challenge-builder.tsx", "utf8");
const liveBuilder = readFileSync("components/host/host-competition-wizard.tsx", "utf8");
const tournamentBuilder = readFileSync("components/tournament-builder.tsx", "utf8");

assert(privateBuilder.includes("activeDraftId") && privateBuilder.includes("createdDraftId"), "A new Private draft must retain its server ID for autosave.");
assert(privateBuilder.includes("step === 0 && !activeDraftId") && privateBuilder.includes("await saveDraft()"), "Private persistence must begin after the first completed step.");
for (const source of [privateBuilder, liveBuilder, tournamentBuilder]) assert(source.includes("setTimeout"), "Advanced builders must debounce background persistence.");
assert(privateBuilder.includes("autosaveVersionRef") && liveBuilder.includes("autosaveVersion") && tournamentBuilder.includes("saveVersion"), "Advanced builders must invalidate stale autosave responses.");
assert(privateBuilder.includes('"draft", "requires_changes", "changes_requested"'), "Private autosave must remain lifecycle gated.");
assert(liveBuilder.includes("submittedId") && tournamentBuilder.includes("submitted") && tournamentBuilder.includes("if (!createdId || submitted || saving) return"), "Submitted builders must stop background edits.");
console.log("advanced builder autosave contracts: ok");
