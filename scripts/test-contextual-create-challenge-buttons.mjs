import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

assert(read("app/challenges/page.tsx").includes('href="/challenges/create"'));
assert(read("app/creator/private-challenges/page.tsx").includes('href="/creator/private-challenges/create"'));
assert(read("app/host/live-events/page.tsx").includes('href="/host/live/create"'));
assert(read("app/host/tournaments/page.tsx").includes('href="/host/tournaments/create"'));
console.log("creation actions live in their matching management pages: ok");
