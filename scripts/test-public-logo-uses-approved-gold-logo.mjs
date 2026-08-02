import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const config=read("lib/public-site/config.ts");
assert(config.includes("v1775267495/logo-gold_chstxw.jpg"));
assert(!config.includes("v1777874432/1663858817367_1_w7mmz0.avif"));
console.log("public logo uses approved gold asset: ok");
