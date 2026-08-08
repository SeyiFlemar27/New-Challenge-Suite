import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/bonus-votes/page.tsx");
assert(page.includes('/challenge-credits?returnTo=${encodeURIComponent(`/challenges/${challengeId}/bonus-votes?submissionId=${submissionId}`)}'));
assert(page.includes('searchParams.get("submissionId")'));
assert(!page.includes('/dorocoins?returnTo='));
console.log("Challenge Credit voting return-context checks passed");
