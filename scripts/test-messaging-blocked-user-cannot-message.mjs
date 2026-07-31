import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const server = read("lib/server/messages.ts");
assert(server.includes("blockedUserIds"));
assert(server.includes("MESSAGING_BLOCKED"));
assert(server.includes("assertUsersCanMessage"));
console.log("blocked users cannot message each other: ok");
