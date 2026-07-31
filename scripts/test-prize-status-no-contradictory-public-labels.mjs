import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const detail = read("app/challenges/[id]/page.tsx");
assert(detail.includes("Sponsor-funded prize pool:"));
assert(detail.includes("Funding verification is pending. Prize distribution will occur after confirmation."));
assert(!detail.includes("visible jackpot") && !detail.includes("requires review"));
console.log("public prize status consistency checks passed");
