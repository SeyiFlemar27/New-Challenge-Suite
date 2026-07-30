import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const privatePage = read("app/host/private/page.tsx");
const livePage = read("app/host/live-events/page.tsx");
const tournamentPage = read("app/host/tournaments/page.tsx");
const hybridPage = read("app/host/hybrid/page.tsx");
const standardBuilder = read("components/challenge-builder.tsx");

assert(privatePage.includes("Create Private Challenge"));
assert(livePage.includes("Create Live Event"));
assert(tournamentPage.includes("Create Tournament Challenge"));
assert(hybridPage.includes("Create Hybrid Competition"));
assert(!standardBuilder.includes("Hybrid Competition"));
assert(!standardBuilder.includes("Create Tournament Challenge"));
console.log("Specialized creation CTA checks passed.");
