import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("components/sidebar.tsx");
assert(source.includes('href: "/earnings", label: "Earnings"'));
assert(source.includes('href: "/dorocoins", label: "DoroCoins"'));
assert(!source.includes('href: "/wallet", label: "Wallet & Revenue"'));
console.log("sidebar earnings and DoroCoin separation checks passed");
