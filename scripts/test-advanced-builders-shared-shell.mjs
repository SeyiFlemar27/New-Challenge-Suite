import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const frame = readFileSync("components/challenge-builder-frame.tsx", "utf8");
const privateBuilder = readFileSync("components/challenge-builder.tsx", "utf8");
const liveBuilder = readFileSync("components/host/host-competition-wizard.tsx", "utf8");
const tournamentBuilder = readFileSync("components/tournament-builder.tsx", "utf8");

for (const source of [privateBuilder, liveBuilder]) {
  assert(source.includes("ChallengeBuilderFrame"), "Each advanced builder must use the shared builder frame.");
  assert(source.includes("BuilderFooter"), "Each advanced builder must use the shared sticky footer.");
}
for (const token of ["270px", "Builder Guide", "Finish Later", "Submit for Review", "advanced-builder-mobile-step"]) assert(frame.includes(token), `Missing shared shell contract: ${token}`);
for (const token of ["lg:grid-cols-[270px_minmax(0,1fr)]", "tournament-mobile-step", "Builder Guide", "Finish Later", "Submit for Review"]) assert(tournamentBuilder.includes(token), `Tournament reference shell lost: ${token}`);
console.log("advanced builder shared shell contracts: ok");
