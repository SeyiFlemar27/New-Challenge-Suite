import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const topbar = read("components/authenticated-topbar.tsx");
for (const marker of ['href="/messages"', "<NotificationBell compact", "<HelpMenu", "<AccountMenu"]) assert(topbar.includes(marker), marker);
assert(!topbar.includes("Create Challenge"));
console.log("topbar utilities remain focused: ok");
