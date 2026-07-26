import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();

function read(path) {
  const full = join(root, path);
  assert(existsSync(full), `${path} must exist.`);
  return readFileSync(full, "utf8");
}

const dynamicPages = [
  "app/tournaments/page.tsx",
  "app/tournaments/[id]/page.tsx",
  "app/my-tournaments/page.tsx",
  "app/admin/tournaments/page.tsx",
  "app/admin/tournaments/[id]/page.tsx",
  "app/tournaments/[id]/lobby/page.tsx",
  "app/tournaments/[id]/me/page.tsx",
  "app/tournaments/[id]/manage/page.tsx",
  "app/tournaments/[id]/join/page.tsx",
  "app/tournaments/[id]/matches/[matchId]/page.tsx"
];

for (const page of dynamicPages) {
  const source = read(page);
  assert(source.includes('export const dynamic = "force-dynamic";'), `${page} must be runtime/dynamic safe.`);
  assert(source.includes("export const revalidate = 0;"), `${page} must not be statically revalidated.`);
}

const publicHelper = read("lib/server/tournament-public.ts");
assert(publicHelper.includes("isFirestoreMissingIndexError"), "Tournament helper must detect missing Firestore index errors.");
assert(publicHelper.includes("FAILED_PRECONDITION"), "Tournament helper must detect FAILED_PRECONDITION.");
assert(publicHelper.includes("Tournament data is not available yet. Please try again shortly."), "Normal UI must use a safe missing-index message.");
assert(!publicHelper.includes("console.firebase.google.com"), "Raw Firebase index creation URLs must not be exposed.");
assert(!/where\("privacy", "==", "public"\)\.orderBy\("createdAt"/.test(publicHelper), "Public listing must not require privacy + createdAt composite index.");
assert(!/where\("status", "==", "published"\)/.test(publicHelper), "Announcements should avoid status + tournamentId composite queries.");
assert(!/where\("publicDisplayApproved", "==", true\)/.test(publicHelper), "Sponsor display should avoid publicDisplayApproved + tournamentId composite queries.");

const tournamentApi = read("app/api/tournaments/route.ts");
assert(tournamentApi.includes("isFirestoreMissingIndexError"), "Tournament API must handle missing-index errors safely.");
assert(!/where\("status", "==", status\)/.test(tournamentApi), "Tournament API listing should not require status + createdAt composite index.");
assert(!/where\("category", "==", category\)/.test(tournamentApi), "Tournament API listing should not require category + createdAt composite index.");

const adminApi = read("app/api/admin/tournaments/route.ts");
assert(adminApi.includes("isFirestoreMissingIndexError"), "Admin tournament API must handle missing-index errors safely.");
assert(!/where\("status", "==", status\)/.test(adminApi), "Admin tournament API should avoid status + updatedAt composite index for this deploy.");
assert(adminApi.includes("Firestore index required for this query."), "Admin/dev surfaces may show concise index setup copy.");

const detailApi = read("app/api/tournaments/[id]/route.ts");
assert(detailApi.includes("getTournamentBundle"), "Tournament detail API should reuse the safe bundle helper.");
assert(!/orderBy\("roundNumber"/.test(detailApi), "Tournament detail API should not issue composite-prone ordered subqueries.");

const combinedUi = dynamicPages.map(read).join("\n");
assert(!/fake tournament cards|fake participants|fake brackets|fake winners|fake prize pools/i.test(combinedUi), "No fake tournament data should be added to make prerender pass.");

console.log("Tournament prerender safety checks passed.");
