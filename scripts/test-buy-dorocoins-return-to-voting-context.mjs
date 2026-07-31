import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/bonus-votes/page.tsx");
assert(page.includes('/dorocoins?returnTo=${encodeURIComponent(`/challenges/${challengeId}/bonus-votes?submissionId=${submissionId}`)}'));
assert(page.includes('searchParams.get("submissionId")'));
console.log("DoroCoin voting return-context checks passed");
