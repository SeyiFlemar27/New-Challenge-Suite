import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/messages/[conversationId]/route.ts");
assert(route.includes("requireRequestUser"));
assert(route.includes("sendMessage"));
assert(route.includes('request.headers.get("idempotency-key")'));
console.log("message sending requires authenticated server access: ok");
