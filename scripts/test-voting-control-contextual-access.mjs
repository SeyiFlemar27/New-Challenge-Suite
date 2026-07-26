import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sidebar = readFileSync(join(process.cwd(), "components/sidebar.tsx"), "utf8");
const hostTool = readFileSync(join(process.cwd(), "app/host/[tool]/page.tsx"), "utf8");

assert(!sidebar.includes('href: "/host/voting"'), "global sidebar must not expose Voting Control as a standalone host nav item.");
assert(!sidebar.includes('label: "Voting Control"'), "global sidebar must not show Voting Control text.");
assert(sidebar.includes("/host/submissions") && sidebar.includes("/host/challenges"), "host navigation must keep contextual challenge management links.");
assert(hostTool.includes("voting:"), "Voting Control route foundation must remain available for contextual/direct access.");

console.log("Voting Control contextual access checks passed.");
