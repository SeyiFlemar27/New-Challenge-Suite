import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const challenges = read("app/challenges/page.tsx");
const privateChallenges = read("app/creator/private-challenges/page.tsx");
const live = read("app/host/live-events/page.tsx");
const tournaments = read("app/host/tournaments/page.tsx");
const createApi = read("app/api/challenges/route.ts");
assert(challenges.includes('accountType !== "sponsor"'));
assert(privateChallenges.includes("getUserPlanAccess") && privateChallenges.includes("canCreatePrivateChallenges"));
assert(live.includes('feature="host_control_center"'));
assert(tournaments.includes('feature="tournament_builder"'));
assert(createApi.includes("canCreateChallenge") && createApi.includes("getUserPlanAccess"));
assert(createApi.includes('isKycRequiredForAction("withdrawalRequest")'));
assert(!createApi.includes("KYC_REQUIRED"));
console.log("contextual creation preserves role, plan, usage, and sponsor gates while remaining KYC-free: ok");
