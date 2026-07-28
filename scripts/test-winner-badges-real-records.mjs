import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const dashboard = read("app/api/dashboard/route.ts");
const winners = read("app/api/winners/route.ts");
assert(dashboard.includes("db.collection(\"badges\")") || dashboard.includes("badgesSnap"), "badges must come from real badge records");
assert(winners.includes("db.collection(\"winners\")"), "winner records must drive winner surfaces");
assert(!winners.includes("fake") && !winners.includes("mock"), "winner API must not add fake winners");
console.log("winner badges real records checks passed");