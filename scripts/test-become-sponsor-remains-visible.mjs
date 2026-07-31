import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
assert(sidebar.includes('href="/sponsor/onboarding"'));
assert(sidebar.includes('user?.accountType !== "sponsor"'));
console.log("Become a Sponsor remains available to eligible non-sponsor accounts: ok");
