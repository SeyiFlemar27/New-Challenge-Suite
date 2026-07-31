import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const bell = read("components/notification-bell.tsx");
assert(bell.includes('fetch("/api/notifications"'));
assert(bell.includes("No new notifications"));
assert(bell.includes("You&apos;re all caught up."));
assert(!bell.includes("mockNotifications"));
console.log("notification dropdown uses real data and a complete empty state: ok");
