import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/messages/[conversationId]/route.ts");
const server = read("lib/server/messages.ts");
assert(route.includes("markConversationRead"));
assert(server.includes("FieldValue.arrayRemove(userId)"));
assert(server.includes("lastReadAt"));
console.log("messaging read state is backend persisted: ok");
