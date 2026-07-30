import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const pages = [
  "app/challenges/[id]/page.tsx",
  "app/challenges/[id]/join/page.tsx",
  "app/challenges/[id]/participants/page.tsx",
  "app/challenges/[id]/prediction/page.tsx",
  "app/explore/page.tsx",
  "app/wallet/page.tsx",
  "app/admin/prize-approvals/[proposalId]/page.tsx",
  "app/sponsor/dashboard/page.tsx",
  "components/challenge-builder.tsx",
  "components/host/host-competition-wizard.tsx"
].map(read).join("\n");
assert(pages.includes("min-w-0"));
assert(pages.includes("break-words"));
assert(pages.includes("sm:grid-cols-"));
assert(pages.includes("xl:grid-cols-"));
assert(!pages.includes("w-[1600px]"));
console.log("Core mobile overflow safeguard checks passed.");
