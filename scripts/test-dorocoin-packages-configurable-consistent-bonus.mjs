import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/dorocoin/packages/route.ts");
const page = read("app/dorocoins/page.tsx");
assert(route.includes('db.collection("doroCoinPackages")') && route.includes('where("status", "==", "active")'));
for (const field of ["baseCoins", "bonusCoins", "mostPopular"]) assert(route.includes(field) && page.includes(field));
assert(page.includes("Most Popular"));
console.log("configurable DoroCoin package checks passed");
