import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
assert(sidebar.includes('return "user"'));
assert(sidebar.includes("return sectionsForTier(tierId, sponsor)"));
for (const label of ["Explore", "Saved", "Earnings", "DoroCoins", "Rewards", "My Entries", "Settings"]) {
  assert(sidebar.includes(`label: "${label}"`), label);
}
console.log("user dashboard uses user navigation: ok");
