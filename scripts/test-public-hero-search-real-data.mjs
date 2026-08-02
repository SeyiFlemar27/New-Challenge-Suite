import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const s=read("components/public-site/public-home.tsx"),api=read("app/api/explore/challenges/route.ts");assert(s.includes('/api/explore/challenges?q='));assert(s.includes('role="combobox"'));assert(s.includes('role="listbox"'));assert(api.includes("isPublicChallenge"));assert(!s.includes("mockChallenges"));console.log("public hero search uses real public data: ok");
