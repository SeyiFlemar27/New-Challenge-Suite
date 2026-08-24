import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wizard = readFileSync("components/host/host-competition-wizard.tsx", "utf8");

assert(wizard.includes('if (form.competitionType === "Live Event")'));
assert(wizard.includes("ChallengeBuilderFrame"));
assert(wizard.includes("BuilderSurface"));
assert(wizard.includes("BuilderFooter"));
assert(wizard.includes("LivePublishChecklist"));
assert(wizard.includes("finishLater"));
assert(wizard.includes("persistDraft(true)"));

const liveBranch = wizard.slice(wizard.indexOf('if (form.competitionType === "Live Event")'), wizard.indexOf("return <AppShell><div className=\"mx-auto max-w-6xl\">"));
assert(!liveBranch.includes("overflow-x-auto"), "Live Event must not use the horizontal tab strip.");

console.log("Live Event vertical builder layout checks passed.");
