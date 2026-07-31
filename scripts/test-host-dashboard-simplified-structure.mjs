import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/dashboard/host/page.tsx");
for (const label of ["Host Control Center", "Active Competitions", "Total Participants", "Pending Reviews", "Upcoming Deadlines", "Needs Attention", "Your Competitions"]) assert(page.includes(label), label);
assert(page.includes('href="/challenges/create"') && page.includes("Create Competition"));
console.log("host dashboard uses the compact control-summary structure: ok");
