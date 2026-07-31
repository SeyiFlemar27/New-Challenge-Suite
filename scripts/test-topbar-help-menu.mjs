import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const topbar = read("components/authenticated-topbar.tsx");
for (const marker of ["Open help menu", "Contact Support", "Community Guidelines", "About Challenge Suite"]) assert(topbar.includes(marker), marker);
assert(topbar.includes('event.key === "Escape"'));
console.log("topbar help menu is accessible and connected: ok");
