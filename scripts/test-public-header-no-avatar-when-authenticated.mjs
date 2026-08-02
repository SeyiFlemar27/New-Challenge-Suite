import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const shell=read("components/public-site/public-shell.tsx");
assert(!shell.includes('aria-label="Open profile"'));assert(!shell.includes('href="/profile"'));
assert(!shell.includes("user.initials"));
console.log("public marketing header never renders account avatar controls: ok");
