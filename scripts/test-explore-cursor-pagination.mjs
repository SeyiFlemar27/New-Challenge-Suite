import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/explore/challenges/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/explore/page.tsx", import.meta.url), "utf8");
const indexes = JSON.parse(await readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8"));

assert.match(route, /where\("visibility", "==", "public"\)/);
assert.match(route, /where\("status", "in", PUBLIC_CHALLENGE_STATUS_VALUES\)/);
assert.match(route, /orderBy\(sortField, sortDirection\)/);
assert.match(route, /startAfter\(cursorSnapshot\)/);
assert.match(route, /limit\(180\)\.get\(\)/);
assert.match(route, /nextCursor/);
assert.match(route, /5 \* 60 \* 1000/);
assert.doesNotMatch(route, /\.limit\(180\)\.get\(\)[\s\S]{0,80}\.slice\(start/);
assert.match(page, /cursorsByPage/);
assert.match(page, /nextCursor/);
assert.match(page, /aria-label="Explore result pages"/);

for (const orderField of ["createdAt", "participantCount", "submissionDeadline"]) {
  assert.ok(indexes.indexes.some((index) => index.collectionGroup === "challenges"
    && index.fields.some((field) => field.fieldPath === "visibility")
    && index.fields.some((field) => field.fieldPath === "status")
    && index.fields.some((field) => field.fieldPath === orderField)), `missing Explore cursor composite index for ${orderField}`);
}

console.log("PASS Explore server query, bounded document cursor, sort indexes, client next/previous cursors, and five-minute winner window contracts");
