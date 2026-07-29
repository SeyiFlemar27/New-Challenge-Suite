import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wizard = readFileSync("components/host/host-competition-wizard.tsx", "utf8");

assert(wizard.includes('if (form.competitionType === "Live Event")'));
assert(wizard.includes("HostVerticalStepper"));
assert(wizard.includes("lg:grid-cols-[240px_minmax(0,1fr)_280px]"));
assert(wizard.includes("LiveBuilderGuide"));
assert(wizard.includes("LivePublishChecklist"));
assert(wizard.includes(">Back</Button>"));
assert(wizard.includes("<Save size={17} /> Save Draft"));
assert(wizard.includes(">Continue</Button>"));

const liveBranch = wizard.slice(wizard.indexOf('if (form.competitionType === "Live Event")'), wizard.indexOf("return <AppShell><div className=\"mx-auto max-w-6xl\">"));
assert(!liveBranch.includes("overflow-x-auto"), "Live Event must not use the horizontal tab strip.");

console.log("Live Event vertical builder layout checks passed.");
