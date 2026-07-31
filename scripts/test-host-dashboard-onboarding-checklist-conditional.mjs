import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/dashboard/host/page.tsx");
assert(page.includes("remainingSetup.length ?"));
assert(page.includes("user?.hostOnboardingComplete"));
assert(page.includes("challenges.length > 0"));
assert(!page.includes("Host Setup Checklist"));
console.log("host setup guidance is conditional and compact: ok");
