import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const pages=read("app/prediction-arena/page.tsx")+read("app/challenges/[id]/prediction/page.tsx");
assert(pages.includes('Prediction Arena') && pages.includes('compliance') && pages.includes('KYC'));
assert(!/gambling|betting|casino|wager/i.test(pages));
console.log("Phase 9 Prediction Arena compliance copy checks passed.");