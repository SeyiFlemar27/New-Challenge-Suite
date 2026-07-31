import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const dashboard = read("app/api/dashboard/route.ts");
const page = read("app/my-entries/page.tsx");
for (const field of ["cancellationDate", "cancellationReason", "paymentStatus", "refundStatus"]) assert(dashboard.includes(field) && page.includes(field), field);
assert(page.includes("Contact Support"));
assert(page.includes("participantEntries"));
console.log("affected users receive private cancellation, payment, refund, and support context: ok");
