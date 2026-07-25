import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const wizard = read("components/host/host-competition-wizard.tsx");
const livePage = read("app/live/create/page.tsx");
const tournamentPage = read("app/tournaments/create/page.tsx");
const privatePage = read("app/private/create/page.tsx");
const challengeApi = read("app/api/challenges/route.ts");

assert(livePage.includes("Live Event") && tournamentPage.includes("Tournament") && privatePage.includes("Private Challenge"), "Specialized routes should use the correct creation modes.");
assert(wizard.includes("Live Event foundation") && wizard.includes("venue name") && wizard.includes("check-in method") && wizard.includes("RSVP/register mode"), "Live event creation should expose specialized foundation fields.");
assert(wizard.includes("Ticket checkout remains setup-safe") && wizard.includes("no ticket payment is created"), "Live event tickets must stay setup-safe without payment activation.");
assert(wizard.includes("Tournament foundation") && wizard.includes("manual bracket setup") && wizard.includes("auto-generated bracket after registration closes"), "Tournament creation should expose manual and auto bracket foundation.");
assert(wizard.includes("Brackets and participants are generated only from real registration data."), "Tournament flow must not invent brackets or participants.");
assert(wizard.includes("Private Challenge foundation") && wizard.includes("invite code") && wizard.includes("selected users/email invite"), "Private challenge flow should expose invite code/link/user invite foundation.");
assert(challengeApi.includes("Free Basic Challenges must be public"), "Free users should remain blocked from private challenge creation.");
assert(!/fake ticket|fake bracket|fake participants|full payment activation/i.test(wizard), "Specialized creation flows must avoid fake operational/payment states.");

console.log("Specialized creation flow checks passed.");
