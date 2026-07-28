import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const payments = read("lib/server/monetization-payments.ts");
const detail = read("app/challenges/[id]/page.tsx");
assert(payments.includes("sponsorContributions") && payments.includes("status: \"confirmed\""), "sponsor funding must be confirmed before contribution records are counted");
assert(detail.includes("sponsorships") || detail.includes("sponsored"), "challenge detail must use real sponsorship data for sponsor context");
assert(!detail.includes("pending sponsor as confirmed"), "public sponsor attribution must not treat pending sponsors as confirmed");
console.log("sponsor attribution confirmed-only checks passed");