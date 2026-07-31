import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const server = read("lib/server/messages.ts");
assert(server.includes('if (!stringList(conversation.participantIds).includes(userId))'));
assert(server.includes("CONVERSATION_FORBIDDEN"));
console.log("conversation reads are participant-only: ok");
