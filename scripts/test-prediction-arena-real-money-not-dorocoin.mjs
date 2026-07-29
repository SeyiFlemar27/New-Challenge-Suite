import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const api = read("app/api/predictions/route.ts");
const page = read("app/challenges/[id]/prediction/page.tsx");
const helper = read("lib/server/predictions.ts");
assert(api.includes('currency !== "usd"'));
assert(api.includes("DoroCoins cannot be used in Prediction Arena."));
assert(api.includes("dorocoinAmount") && api.includes('paymentMethod === "dorocoin"'));
assert(page.includes("Real money only. DoroCoins cannot be used."));
assert(helper.includes("dorocoinAllowed: false"));
console.log("prediction real-money-only checks passed");
