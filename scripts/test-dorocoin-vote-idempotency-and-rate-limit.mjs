import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const voting = read("lib/server/voting.ts");
const route = read("app/api/votes/route.ts");
assert(voting.includes("IDEMPOTENCY_KEY_REQUIRED") && voting.includes("voteRequestSnap?.exists"));
assert(route.includes("consumeRateLimit") && route.includes("RATE_LIMITED"));
assert(voting.includes("LARGE_DOROCOIN_SPEND_CONFIRMATION_REQUIRED"));
console.log("DoroCoin idempotency and rate-limit checks passed");
