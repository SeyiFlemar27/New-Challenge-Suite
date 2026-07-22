import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const page = read("app/challenges/[id]/propose-winners/page.tsx");
const candidatesRoute = read("app/api/challenges/[id]/winner-candidates/route.ts");
const proposalRoute = read("app/api/challenges/[id]/winner-proposals/route.ts");
const helper = read("lib/server/prize-approvals.ts");
const myChallenges = read("app/my-challenges/page.tsx");
const creatorChallenges = read("app/creator/challenges/page.tsx");
const hostChallenges = read("app/host/challenges/page.tsx");
const publicChallenge = read("app/challenges/[id]/page.tsx");

assert(exists("app/challenges/[id]/propose-winners/page.tsx"), "winner proposal UI route must exist.");
assert(exists("app/api/challenges/[id]/winner-candidates/route.ts"), "winner candidates route must exist.");
assert(page.includes("Submit Winners for Admin Review"), "proposal UI must submit winners for admin review.");
assert(page.includes("One winner / 100%"), "one-winner mode must exist.");
assert(page.includes("Three winners / 70-20-10"), "three-winner mode must exist.");
assert(page.includes("1st") && page.includes("70") && page.includes("20") && page.includes("10"), "three-winner split must be visible.");
assert(page.includes("Each placement must use a different winner."), "UI must block duplicate selected winners.");
assert(page.includes("No eligible submissions yet."), "UI must show clean empty state when no real candidates exist.");
assert(page.includes("does not create ledger entries") || page.includes("does not create ledger"), "UI must not claim ledger finalization.");
assert(!page.includes("Winners paid") && !page.includes("Prize released") && !page.includes("Payout created"), "proposal UI must not claim payout completion.");

assert(candidatesRoute.includes("requireRequestUser"), "candidate route must require authenticated user.");
assert(candidatesRoute.includes("canProposeChallengeWinners"), "candidate route must enforce owner/operator/admin access.");
assert(candidatesRoute.includes("getWinnerCandidates"), "candidate route must use real candidate helper.");
assert(candidatesRoute.includes("No eligible submissions yet."), "candidate route must expose empty state copy.");
assert(helper.includes("getWinnerCandidates"), "candidate helper must exist.");
assert(helper.includes("db.collection(\"submissions\")"), "candidate helper must read real submissions.");
assert(!helper.includes("mockCandidates") && !helper.includes("sampleCandidates"), "candidate helper must not use mock candidates.");
assert(proposalRoute.includes("winnerProposalLifecycleReadiness"), "proposal route must enforce lifecycle readiness.");
assert(proposalRoute.includes("ACTIVE_WINNER_PROPOSAL_EXISTS"), "proposal route must block active duplicate proposals.");
assert(proposalRoute.includes("WINNER_CANDIDATE_INVALID"), "proposal route must validate selected winners are real candidates.");
assert(proposalRoute.includes("ledgerEntriesCreated: false"), "proposal submission must not create ledger entries.");
assert(proposalRoute.includes("payoutProviderCalled: false"), "proposal submission must not call payout provider.");

assert(myChallenges.includes("/propose-winners"), "My Challenges must link to proposal UI.");
assert(creatorChallenges.includes("/propose-winners"), "Creator challenge management must link to proposal UI.");
assert(hostChallenges.includes("/propose-winners"), "Host challenge management must link to proposal UI.");
assert(!publicChallenge.includes("/propose-winners"), "Public challenge page must not expose proposal CTA.");

console.log("Creator/Host winner proposal UI checks passed.");
