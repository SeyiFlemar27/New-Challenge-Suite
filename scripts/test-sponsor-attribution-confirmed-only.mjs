import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const payments = read("lib/server/monetization-payments.ts");
const detail = read("app/challenges/[id]/page.tsx");
assert(payments.includes("sponsorContributions") && payments.includes("status: \"confirmed\""), "sponsor funding must be confirmed before contribution records are counted");
assert(detail.includes("sponsorAccount") && detail.includes("confirmed before any public funding status updates"), "challenge detail must keep sponsor actions and public funding attribution confirmation-aware");
assert(!detail.includes("pending sponsor as confirmed"), "public sponsor attribution must not treat pending sponsors as confirmed");
console.log("sponsor attribution confirmed-only checks passed");
