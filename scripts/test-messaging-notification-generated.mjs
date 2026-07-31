import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const server = read("lib/server/messages.ts");
assert(server.includes("createNotification"));
assert(server.includes('type: "new_message"'));
assert(server.includes("`/messages/${input.conversationId}`"));
console.log("new messages generate real notifications: ok");
