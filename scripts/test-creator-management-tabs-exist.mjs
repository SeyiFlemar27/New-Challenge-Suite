import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/challenges/[id]/manage/page.tsx");
for (const tab of ["Overview", "Participants", "Entry Requests", "Submissions", "Voting", "Reports", "Winners", "Settlement", "Timeline", "Settings", "Audit Log"]) assert(page.includes(`"${tab}"`), `missing management tab ${tab}`);
console.log("creator management tab checks passed");
