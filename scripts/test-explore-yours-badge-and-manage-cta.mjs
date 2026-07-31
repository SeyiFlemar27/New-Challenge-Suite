import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/explore/page.tsx");
const api = read("app/api/explore/challenges/route.ts");
assert(page.includes("isOwnedByViewer") && page.includes("Yours"));
assert(api.includes('label: "Manage Challenge"'));
assert(api.includes("ownedBy(input.challenge, input.userId)"));
console.log("owned Explore challenges show Yours and use Manage Challenge: ok");
