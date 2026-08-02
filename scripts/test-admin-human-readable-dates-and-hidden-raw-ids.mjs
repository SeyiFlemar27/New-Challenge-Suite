import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("components/admin/admin-control-center.tsx");
assert(source.includes("Intl.DateTimeFormat"));
assert(source.includes("Technical details"));
assert(source.includes("isTechnicalKey"));
assert(source.includes('/(?:Id|Ids|Reference)$/'));
console.log("admin dates and technical identifiers: ok");
