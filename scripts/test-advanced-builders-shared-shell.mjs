import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const frame = readFileSync("components/challenge-builder-frame.tsx", "utf8");
const normalBuilder = readFileSync("components/normal-challenge-builder.tsx", "utf8");
const privateBuilder = readFileSync("components/challenge-builder.tsx", "utf8");
const liveBuilder = readFileSync("components/host/host-competition-wizard.tsx", "utf8");
const tournamentBuilder = readFileSync("components/tournament-builder.tsx", "utf8");

for (const source of [normalBuilder, privateBuilder, liveBuilder, tournamentBuilder]) {
  assert(source.includes("ChallengeBuilderFrame"), "Each advanced builder must use the shared builder frame.");
  assert(source.includes("BuilderFooter"), "Each advanced builder must use the shared sticky footer.");
}
for (const token of ["270px", "Builder Guide", "Finish Later", "Submit for Review", "advanced-builder-mobile-step"]) assert(frame.includes(token), `Missing shared shell contract: ${token}`);
assert(!liveBuilder.includes("HostVerticalStepper"), "The obsolete standalone live-event shell must remain removed.");
assert(!liveBuilder.includes("function WizardStep"), "The obsolete generic competition path must remain removed.");
console.log("advanced builder shared shell contracts: ok");
