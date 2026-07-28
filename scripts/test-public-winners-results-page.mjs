import assert from "node:assert/strict";
import { read, exists } from "./production-flow-test-utils.mjs";
const winners = read("app/api/winners/route.ts");
const winnerDetail = read("app/api/winners/[id]/route.ts");
assert(exists("app/winners/page.tsx") && exists("app/winners/[id]/page.tsx"), "public winners pages must exist");
assert(winners.includes("db.collection(\"winners\")") && winners.includes("isWinner: true"), "winners API must load real winner records and mark real winners");
assert(winnerDetail.includes("payoutActive") || winnerDetail.includes("payoutStatus"), "winner detail must expose payout-safe status without marking paid");
console.log("public winners results page checks passed");