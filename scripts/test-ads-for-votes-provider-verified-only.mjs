import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const route = read("app/api/ad-votes/route.ts");
const page = read("app/challenges/[id]/bonus-votes/page.tsx");

assert(route.includes("providerVerificationRequired: true"));
assert(route.includes("providerCallbackRequired: true"));
assert(route.includes("clientGrantBlocked: true"));
assert(route.includes("voteGranted: false"));
assert(!route.includes("FieldValue.increment"));
assert(page.includes("Ads for votes are not available yet"));
console.log("Ads-for-votes provider verification checks passed.");
