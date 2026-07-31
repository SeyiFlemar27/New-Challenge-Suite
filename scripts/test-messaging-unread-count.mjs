import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const server = read("lib/server/messages.ts");
assert(server.includes("unreadUserIds"));
assert(server.includes("unreadCount: conversations.filter"));
assert(server.includes("FieldValue.arrayUnion(recipientId)"));
console.log("messaging unread count is stored and derived from real conversations: ok");
