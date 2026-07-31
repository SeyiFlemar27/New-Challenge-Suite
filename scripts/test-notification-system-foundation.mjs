import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const helper = read("lib/server/notifications.ts");
const route = read("app/api/notifications/route.ts");
const readRoute = read("app/api/notifications/[id]/read/route.ts");
const page = read("app/notifications/page.tsx");
const bell = read("components/notification-bell.tsx");
const topbar = read("components/authenticated-topbar.tsx");

assert(exists("app/notifications/page.tsx"), "notifications page must exist.");
assert(exists("components/notification-bell.tsx"), "notification bell component must exist.");
assert(helper.includes("delivery: { inApp: true, email: false, push: false }"), "notifications must be in-app only.");
assert(helper.includes("listUserNotifications") && helper.includes("markNotificationRead") && helper.includes("markAllNotificationsRead"), "notification helper must support list and read actions.");
assert(!helper.includes("orderBy(\"createdAt\""), "notification listing should avoid userId+orderBy composite index requirements.");
assert(route.includes("requireRequestUser") && route.includes("unreadCount"), "notification API must require auth and return unread counts.");
assert(readRoute.includes("requireRequestUser") && readRoute.includes("markNotificationRead"), "single notification read route must be auth-scoped.");
assert(page.includes("V1 notifications are in-app only") && page.includes("No notifications yet"), "notifications UI must show clear in-app and empty states.");
assert(bell.includes("/api/notifications") && bell.includes("unreadCount") && bell.includes("/notifications"), "topbar bell must use notification API and link to full inbox.");
assert(topbar.includes("NotificationBell") && !topbar.includes("Notification.requestPermission"), "topbar must use in-app notifications, not browser push permission.");
assert(!page.includes("fake") && !bell.includes("new Notification("), "notification UI must not fake notifications or trigger browser push.");

console.log("Notification system foundation checks passed.");
