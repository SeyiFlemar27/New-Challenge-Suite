import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/dashboard/host/page.tsx");
for (const removed of ["Participant Management", "Submission Review", "Voting Control", "Tournament Builder", "Live Event Tools", "Reports & Export", "Team Members", "Revenue Overview", "Sponsor Requests", "Reports Ready", "Team Seats", "Revenue Review", "Total Votes"]) assert(!page.includes(removed), removed);
assert(!page.includes("const modules"));
console.log("host dashboard nine-card directory and permanent filler metrics are removed: ok");
