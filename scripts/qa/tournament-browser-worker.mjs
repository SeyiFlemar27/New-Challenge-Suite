import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { processTournamentLifecycleAction } from "../../lib/server/tournament-lifecycle-scheduler.ts";
import { ensureTournamentMatchLifecycleJobs, processTournamentMatchLifecycleJobs } from "../../lib/server/tournament-match-lifecycle-jobs.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const id = process.argv[2], phase = process.argv[3];
assert.match(id ?? "", /^e2e_match_[a-f0-9]+$/);
assert.ok(["open", "result"].includes(phase));
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT }), db = getFirestore(app);
try {
  const tournament = (await db.collection("tournaments").doc(id).get()).data();
  assert.ok(tournament);
  if (phase === "open") await processTournamentLifecycleAction({ db, id, tournament: { id, ...tournament }, action: "process_match_deadlines", actorId: "system_tournament_lifecycle" });
  else { await ensureTournamentMatchLifecycleJobs(db, id); await processTournamentMatchLifecycleJobs(db); }
} finally { await app.delete(); }
