import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("components/admin/admin-control-center.tsx");
assert(source.includes("What happens next"));
assert(source.includes("server will verify your permission"));
assert(source.includes("does not execute an external payment, payout, or refund"));
assert(source.includes("Reason required"));
console.log("admin sensitive action impact preview: ok");
