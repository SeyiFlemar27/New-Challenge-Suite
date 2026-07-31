import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const server = read("lib/server/notifications.ts");
const bell = read("components/notification-bell.tsx");
assert(server.includes('path.startsWith("/") && !path.startsWith("//")'));
assert(server.includes("actionUrl: safeActionUrl"));
assert(bell.includes("notification.actionUrl"));
console.log("notification action links are same-origin and record-driven: ok");
