import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("components/mobile-footer.tsx");
assert(source.includes("data-mobile-footer"));
assert(source.includes("<details"));
assert(source.includes("<summary"));
for (const section of ["Explore", "Challenges", "Creators", "Sponsors", "Company", "Support", "Legal"]) assert(source.includes(section), section);
console.log("mobile footer accordion: ok");
