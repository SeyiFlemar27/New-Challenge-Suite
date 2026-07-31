import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const server = read("lib/server/notifications.ts");
assert(server.includes("accountType"));
assert(server.includes("audience"));
assert(server.includes("type: safeText(input.type"));
assert(!server.includes("fakeNotification"));
console.log("notification records retain role-aware type and audience fields: ok");
