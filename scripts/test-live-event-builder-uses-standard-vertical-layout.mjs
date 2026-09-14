import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wizard = readFileSync("components/host/host-competition-wizard.tsx", "utf8");

assert(wizard.includes("data-live-event-canonical-builder"));
assert(wizard.includes("ChallengeBuilderFrame"));
assert(wizard.includes("BuilderSurface"));
assert(wizard.includes("BuilderFooter"));
assert(wizard.includes("LivePublishChecklist"));
assert(wizard.includes("finishLater"));
assert(wizard.includes("persistDraft(true)"));

assert(!wizard.includes("overflow-x-auto"), "Live Event must not use the horizontal tab strip.");
assert(!wizard.includes("HostCompetitionWizard"), "The obsolete generic builder export must remain removed.");

console.log("Live Event vertical builder layout checks passed.");
