import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/tournaments/[id]/lifecycle/route.ts", "utf8");
const operations = readFileSync("lib/server/tournament-operations.ts", "utf8");

for (const action of ["process_match_deadlines", "process_check_in_close", "process_waitlist_offers"]) assert(route.includes(`action === "${action}"`), `Missing lifecycle action ${action}`);
assert(route.includes("noSubmissionExtensionUsed") && route.includes("12 * 60 * 60 * 1000"), "Both-absent matches must receive only the bounded server extension.");
assert(route.includes("submission_forfeit") && route.includes("advanceWinner"), "One-sided absence must record a forfeit and advance the present competitor.");
assert(route.includes("platform_moderation_pending") && route.includes("both_absent_after_extension"), "Moderation and unresolved absence must pause for review.");
assert(operations.includes("resolveTournamentNoSubmission"), "No-submission decisions must use the shared domain helper.");
assert(!route.includes("setInterval"), "Tournament lifecycle must not depend on a client timer.");
console.log("tournament deadline lifecycle contracts: ok");
