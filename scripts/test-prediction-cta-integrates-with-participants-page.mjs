import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const api = read("app/api/challenges/[id]/participants/route.ts");
const page = read("app/challenges/[id]/participants/page.tsx");
const card = read("components/challenge-participant-card.tsx");
const detail = read("app/challenges/[id]/page.tsx");
assert(api.includes("predictionAccessForViewer"));
assert(page.includes("predictionAccess={payload.predictionAccess}"));
assert(card.includes("predictionAccess?.available"));
assert(card.includes("Predict Winner"));
assert(card.includes(`/prediction?submissionId=`));
assert(card.includes("Vote"));
assert(detail.includes("predictionAccess?.available"));
assert(detail.includes("/prediction"));
console.log("prediction CTA integration checks passed");
