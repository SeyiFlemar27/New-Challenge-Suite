import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/wallet/route.ts");
const wallet = read("lib/server/cash-wallet.ts");
assert(route.includes("normalizeCashWallet") && route.includes("cashTransactions"));
assert(wallet.includes("availableBalanceCents") && wallet.includes("pendingBalanceCents") && wallet.includes("underReviewBalanceCents"));
assert(!route.includes("fakeBalance"));
console.log("phase6 real wallet balance summary checks passed");