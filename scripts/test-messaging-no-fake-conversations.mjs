import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/messages/page.tsx");
const server = read("lib/server/messages.ts");
assert(!page.includes("sampleConversation"));
assert(!page.includes("fakeMessage"));
assert(server.includes('where("participantIds", "array-contains", userId)'));
console.log("messaging has no fake conversations: ok");
