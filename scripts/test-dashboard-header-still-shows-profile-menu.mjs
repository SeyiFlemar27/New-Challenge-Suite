import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const topbar=read("components/authenticated-topbar.tsx"),shell=read("components/app-shell.tsx");
assert(shell.includes("<AuthenticatedTopbar />"));assert(topbar.includes('aria-label="Open account menu"'));
assert(topbar.includes('href="/profile"')&&topbar.includes("View Profile"));
console.log("dashboard authenticated profile menu remains intact: ok");
