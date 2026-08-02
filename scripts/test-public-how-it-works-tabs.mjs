import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const s=read("components/public-site/public-home.tsx");assert(s.includes("For Talent"));assert(s.includes("For Sponsors"));assert(s.includes('role="tablist"'));assert(s.includes('aria-selected={mode==="talent"}'));console.log("public how it works tabs: ok");
