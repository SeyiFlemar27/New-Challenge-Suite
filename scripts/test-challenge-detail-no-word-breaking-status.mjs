import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
assert(page.includes("whitespace-normal break-normal"));
assert(!page.includes('className="break-words text-xl font-black capitalize'));
console.log("challenge detail status word wrapping checks passed");
