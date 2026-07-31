import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/explore/page.tsx");
assert(!page.includes("Real activity only"));
assert(page.includes('label === "Timeline Needs Review" ? "Schedule pending"'));
console.log("Explore removes internal activity and timeline-validation copy: ok");
