import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const privateCreate = read("app/private/create/page.tsx");
const creatorPrivateCreate = read("app/creator/private-challenges/create/page.tsx");
const hostPrivateCreate = read("app/host/private/create/page.tsx");
const tournament = read("components/tournament-builder.tsx");

for (const source of [privateCreate, creatorPrivateCreate, hostPrivateCreate]) {
  assert(source.includes('ChallengeBuilder mode="private"'), "every Private creation route must use the canonical Private builder");
  assert(!source.includes("HostCompetitionWizard"), "the generic Host wizard must not remain a Private builder entry point");
}
assert(!tournament.includes('<option value="hybrid">'), "Hybrid must not be selectable before normalized scoring exists");
assert(tournament.includes('form.resultMethod === "hybrid"') && tournament.includes("legacy Hybrid configuration"), "legacy Hybrid drafts must receive a safe corrective state");
assert(tournament.includes('errors.push("Hybrid is unavailable until normalized scoring is configured.")'), "readiness must continue rejecting unsupported legacy Hybrid state");

console.log("Personal user panel builder correction contracts passed.");
