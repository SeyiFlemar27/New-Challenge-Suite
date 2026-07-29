import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("components/challenge-participant-card.tsx");
const api = read("app/api/votes/route.ts");
assert(page.includes("Log in to Vote"));
assert(page.includes("/auth/login?next=") && page.includes("encodeURIComponent(returnPath)"));
assert(api.includes("requireRequestUser"));
console.log("guest login-to-vote checks passed");
