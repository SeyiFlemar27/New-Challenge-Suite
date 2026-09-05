import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const studio = read("components/creator/creator-studio.tsx");
const dashboard = read("app/dashboard/page.tsx");
assert(dashboard.includes("<CreatorStudio"), "Creator dashboards must use Creator Studio");
for (const copy of ["Creator Studio", "Active Challenges", "Participants", "Submissions", "Available Earnings", "Today", "Your Challenges", "Performance", "Earnings"]) {
  assert(studio.includes(copy), `Creator Studio is missing ${copy}`);
}
assert(studio.includes("slice(0, 3)"), "Creator Studio attention and challenge previews must stay concise");
assert(studio.includes("ACTIVE_KPI_STATUSES") && studio.includes('new Set(["active", "submission_open", "voting_open", "voting_closed"])'), "Creator Studio KPIs must use the canonical active status set");

const sidebar = read("components/sidebar.tsx");
const creatorStart = sidebar.indexOf("function personalSections");
const sponsorStart = sidebar.indexOf("const sponsorSections");
const creatorNavigation = sidebar.slice(creatorStart, sponsorStart);
for (const required of ["Creator Studio", "Explore", "Saved", "My Challenges", "My Entries", "Submissions", "Analytics", "Leaderboards", "Winners", "Earnings", "DoroCoins", "Rewards", "Profile", "Settings"]) {
  assert(creatorNavigation.includes(required), `Creator/Host navigation is missing ${required}`);
}
for (const retired of ["Monthly Boosts", "Sponsor-Ready", "Creator Pro", "Vote multiplier"]) {
  assert(!creatorNavigation.includes(retired), `Creator/Host navigation must not permanently include ${retired}`);
}

const planAccess = read("lib/plan-access.ts");
for (const allowance of ["monthlyBoostLimit: 0", "monthlyBoostLimit: 2", "monthlyBoostLimit: 5"]) {
  assert(planAccess.includes(allowance), `Missing monthly boost allowance ${allowance}`);
}
const boostModel = read("lib/monthly-boost.ts");
assert(boostModel.includes("MONTHLY_BOOST_DURATION_HOURS = 72"), "Monthly Boost must last 72 hours");
assert(boostModel.includes("Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)"), "Monthly allowance must reset by server calendar month");
assert(boostModel.includes("parsed > now.getTime() ? parsed : now.getTime()"), "Active boosts must extend from their current end");
const boostRoute = read("app/api/challenges/[id]/boost/route.ts");
assert(boostRoute.includes("getChallengeBoostAccess") && boostRoute.includes("owner_required"), "Monthly Boost must remain owner-only on the server");
assert(boostRoute.includes("runTransaction"), "Monthly Boost redemption must be transactional");
assert(boostRoute.includes("monthlyBoostEntitlements") && boostRoute.includes("monthlyBoostRedemptions"), "Monthly Boost must persist entitlement and redemption records");
assert(!boostRoute.includes("DoroCoin") && !boostRoute.includes("dorocoin"), "Monthly Boost must not spend DoroCoins");
assert(boostRoute.includes("idempotency"), "Monthly Boost redemption must be idempotent");
const retiredPackages = read("app/api/boost-packages/route.ts");
assert(retiredPackages.includes("BOOST_PACKAGES_RETIRED") && !retiredPackages.includes('collection("boostPackages")'), "Legacy DoroCoin boost packages must be retired");
const status = read("lib/challenge-status.ts");
const boostStatuses = status.slice(status.indexOf("const boostEligibleStatuses"), status.indexOf("const publicChallengeStatuses"));
assert(boostStatuses.includes('"scheduled"') && boostStatuses.includes('"active"') && !boostStatuses.includes('"draft"'), "Only scheduled and active challenges may redeem Monthly Boost");

const management = read("app/challenges/[id]/manage/page.tsx");
assert(management.includes("MonthlyBoostControl"), "Monthly Boost must live in challenge management Overview");
const boostControl = read("components/challenge/monthly-boost-control.tsx");
assert(boostControl.includes("Use one Monthly Boost?") && boostControl.includes("Confirm"), "Monthly Boost redemption must require confirmation");
const publicChallenge = read("app/challenges/[id]/page.tsx");
assert(!publicChallenge.includes("Boost Challenge"), "Public challenge pages must not expose Monthly Boost");
const retiredBoostPage = read("app/challenges/[id]/boost/page.tsx");
assert(retiredBoostPage.includes("redirect") && retiredBoostPage.includes("tab=overview"), "Legacy boost pages must redirect into challenge management");

const exploreApi = read("app/api/explore/challenges/route.ts");
const discoveryApi = read("app/api/challenge-discovery/route.ts");
const dashboardApi = read("app/api/dashboard/route.ts");
for (const source of [exploreApi, discoveryApi, dashboardApi]) {
  assert(source.includes("monthlyBoostRankingWeight"), "Monthly Boost weight must feed discovery and recommendation ranking");
}
assert(exploreApi.includes("withoutRankingSignals"), "Public Explore responses must not expose internal boost ranking signals");

const pagination = read("lib/challenge-pagination.ts");
assert(pagination.includes("CHALLENGE_PAGE_SIZE = 36"), "Challenge pagination must use 36 items");
const paginator = read("components/challenge-pagination.tsx");
assert(paginator.includes("total <= 0") && paginator.includes("aria-current"), "Paginator must hide only for zero results and expose accessible current state");
for (const route of ["app/explore/page.tsx", "app/creator/challenges/page.tsx", "components/challenge-discovery-page.tsx", "components/public-site/category-experience.tsx"]) {
  const source = read(route);
  assert(source.includes("ChallengePagination"), `${route} must use the shared challenge paginator`);
}

const leaderboard = read("lib/server/leaderboard.ts");
assert(leaderboard.includes("points: winCount * 1000 + validVotes"), "Global leaderboard score must be wins x 1000 plus valid votes received");
assert(leaderboard.includes('competitionMode: "judges"') && leaderboard.includes('competitionMode: "tournament"') && leaderboard.includes('competitionMode: "public_voting"'), "Leaderboards must be competition-mode aware");
assert(leaderboard.includes("pageSize ?? 36"), "Leaderboard pagination must use 36 rows");
const leaderboardPage = read("app/leaderboards/page.tsx");
for (const board of ["Global", "Challenge", "Tournament"]) assert(leaderboardPage.includes(board), `Leaderboard is missing ${board}`);
assert(leaderboardPage.includes("row.rank === 2), podium.find((row) => row.rank === 1), podium.find((row) => row.rank === 3"), "Podium must display second, first, third");
assert(!leaderboardPage.includes("href={`/profile") && !leaderboardPage.includes("#{entry.rank}"), "Leaderboard rows must be non-clickable and omit rank hashes");

console.log("unified production experience contracts passed");
