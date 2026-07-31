import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/explore/page.tsx");
const comments = read("app/api/challenges/[id]/comments/route.ts");
const engagement = read("app/api/challenges/[id]/engagement/route.ts");
assert(page.includes("completedInteractionsDisabled"));
assert(page.includes("!interactionsDisabled ?"));
assert(comments.includes("CHALLENGE_INTERACTIONS_CLOSED"));
assert(engagement.includes("CHALLENGE_INTERACTIONS_CLOSED"));
console.log("completed challenges disable saving and comments while retaining results access: ok");
