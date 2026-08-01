import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync("app/api/challenges/[id]/boost/route.ts", "utf8");
const page = readFileSync("app/challenges/[id]/boost/page.tsx", "utf8");

assert(page.includes("if (!boostAccess?.allowed)"), "boost page must fail closed for unauthorized viewers");
assert(page.includes("Owner access required"), "boost page must explain its locked state");
assert(api.includes("getRequestIdempotencyKey"), "boost purchase must accept an idempotency key");
assert(api.includes("deterministicId(\"boost\""), "boost purchase must use deterministic transaction identifiers");
assert(api.includes("applyDoroCoinTransaction"), "boost activation must use the server DoroCoin ledger");
assert(api.indexOf("if (!boostAccess.allowed)") < api.indexOf("await applyDoroCoinTransaction"), "owner access must be checked before spend or activation");
assert(!page.includes("setActive(true)") || page.includes("onSuccess"), "client success may only follow a successful server mutation");
console.log("owner-only boost purchase flow checks passed");
