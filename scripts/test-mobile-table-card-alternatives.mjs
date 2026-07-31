import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const css = read("app/globals.css");
const earnings = read("app/earnings/page.tsx");
assert(css.includes(".mobile-dashboard-table tr") && css.includes("border-radius: 8px"));
assert(css.includes(".admin-mobile-shell table") && css.includes(".sponsor-mobile-shell table"));
assert(earnings.includes("grid gap-2") && earnings.includes("data-mobile-wallet-source-lines"));
console.log("mobile table-card alternative checks passed");
