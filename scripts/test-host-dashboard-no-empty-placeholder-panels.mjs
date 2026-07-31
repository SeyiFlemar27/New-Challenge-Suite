import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/dashboard/host/page.tsx");
for (const removed of ["No upcoming events yet.", "Recent Host Activity", "will appear here when real host activity is recorded", "Revenue safety"]) assert(!page.includes(removed), removed);
assert(page.includes("activity.length ?"));
assert(page.includes("attention.length ?"));
console.log("empty activity, attention, upcoming-event, and revenue-safety panels do not render permanently: ok");
