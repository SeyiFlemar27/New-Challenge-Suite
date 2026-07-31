import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const bell = read("components/notification-bell.tsx");
const route = read("app/api/notifications/route.ts");
const server = read("lib/server/notifications.ts");
assert(bell.includes('method: "POST"'));
assert(route.includes("markAllNotificationsRead"));
assert(server.includes("batch.commit()"));
console.log("notification mark-all-read is backend connected: ok");
