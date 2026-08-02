import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const shell=read("components/public-site/public-shell.tsx");
const drawer=shell.slice(shell.indexOf('role="dialog"'),shell.indexOf("export function PublicFooter"));
assert(drawer.includes("<PublicLogo/>"));assert(!drawer.includes("backgroundImage"));
console.log("public mobile drawer uses shared approved logo: ok");
