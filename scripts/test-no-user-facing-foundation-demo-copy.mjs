import assert from "node:assert/strict";
import { allFilesDoNotInclude } from "./production-flow-test-utils.mjs";
allFilesDoNotInclude(["app/admin/finance/page.tsx", "app/challenges/[id]/join/page.tsx", "app/wallet/withdraw/page.tsx", "app/my-entries/page.tsx"], ["Foundation-ready", "Cash wallet architecture", "Paid-entry prize pools are not available yet", "Review Withdrawal Setup"], "user-facing unfinished copy must be removed");
console.log("no user-facing foundation/demo copy checks passed");