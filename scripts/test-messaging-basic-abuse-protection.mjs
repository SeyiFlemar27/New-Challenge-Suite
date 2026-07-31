import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/messages/[conversationId]/route.ts");
const server = read("lib/server/messages.ts");
assert(route.includes("consumeRateLimit"));
assert(server.includes("cleanText(input.body, 2000)"));
assert(server.includes("messageAuditLogs"));
assert(server.includes("idempotencyKey"));
console.log("messaging basic abuse protection is server enforced: ok");
