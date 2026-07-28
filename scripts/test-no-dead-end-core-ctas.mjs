import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const join = read("app/challenges/[id]/join/page.tsx");
const detail = read("app/challenges/[id]/page.tsx");
const create = read("app/challenges/create/page.tsx");
assert(join.includes("Pay Entry Fee") && join.includes("Join Challenge") && join.includes("Refresh Status") && join.includes("Back to Challenge"), "blocked submission states must have clear next actions");
assert(detail.includes("Pay & Enroll") && detail.includes("Waiting for submissions") && detail.includes("Registration Closed"), "challenge detail must not dead-end payment/timeline states");
assert(create.includes("next=%2Fchallenges%2Fcreate") || create.includes("/auth/login"), "create challenge auth redirect must preserve continuation");
console.log("no dead-end core CTA checks passed");