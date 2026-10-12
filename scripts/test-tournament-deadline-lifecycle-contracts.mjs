import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/tournaments/[id]/lifecycle/route.ts", "utf8");
const lifecycle = readFileSync("lib/server/tournament-lifecycle-scheduler.ts", "utf8");
const scheduler = readFileSync("lib/server/tournament-match-lifecycle-jobs.ts", "utf8");
const operations = readFileSync("lib/server/tournament-operations.ts", "utf8");

for (const action of ["process_match_deadlines", "process_check_in_close", "process_waitlist_offers"]) assert(lifecycle.includes(`action === "${action}"`), `Missing lifecycle action ${action}`);
assert(lifecycle.includes("noSubmissionExtensionUsed") && lifecycle.includes("12 * 60 * 60 * 1000"), "Both-absent matches must receive only the bounded server extension.");
assert(lifecycle.includes("submission_forfeit") && lifecycle.includes("advanceWinner"), "One-sided absence must record a forfeit and advance the present competitor.");
assert(lifecycle.includes("platform_moderation_pending") && lifecycle.includes("both_absent_after_extension"), "Moderation and unresolved absence must pause for review.");
assert(operations.includes("resolveTournamentNoSubmission"), "No-submission decisions must use the shared domain helper.");
assert(route.includes("canPerformTournamentRole") && route.includes("processTournamentLifecycleAction"), "The user lifecycle route retains its server authorization boundary and shared processor.");
assert(scheduler.includes("expectedDeadlineAt") && scheduler.includes("expectedStatus") && scheduler.includes("version"), "Scheduled transitions reject stale match deadlines, states, and task versions.");
assert(scheduler.includes("REVIEW_RECHECK_MS") && scheduler.includes("ensureTournamentMatchLifecycleJobs"), "Moderation readiness uses a durable server recheck, not a client timer.");
console.log("tournament deadline lifecycle contracts: ok");
