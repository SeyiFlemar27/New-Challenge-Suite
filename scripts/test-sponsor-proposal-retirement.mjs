import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const creationApi = read("app/api/sponsor/proposals/route.ts");
const proposalApi = read("app/api/sponsor/proposals/[proposalId]/route.ts");
const creatorProposalApi = read("app/api/creator/sponsorship-proposals/[proposalId]/route.ts");
const revisionsApi = read("app/api/sponsor/proposals/[proposalId]/revisions/route.ts");
const activityApi = read("app/api/sponsor/proposals/[proposalId]/activity/route.ts");
const challengeSponsorshipApi = read("app/api/challenges/[id]/sponsorships/route.ts");
const tournamentSponsorshipApi = read("app/api/tournaments/[id]/sponsor-proposals/route.ts");
const historicalFundingApi = read("app/api/sponsor/wallet/fund-campaign-foundation/route.ts");
const sponsorFinancePages = read("components/sponsor/sponsor-finance-pages.tsx");
const legacyBuilder = read("app/sponsor/proposals/new/page.tsx");
const historicalDetail = read("app/sponsor/proposals/[proposalId]/page.tsx");
const challengeForm = read("app/challenges/[id]/sponsor/page.tsx");
const sponsorNav = read("components/sponsor/sponsor-shell.tsx");

assert.match(creationApi, /export async function POST[\s\S]*?410[\s\S]*?SPONSOR_PROPOSAL_CREATION_RETIRED/);
assert.match(proposalApi, /export async function PATCH[\s\S]*?410[\s\S]*?SPONSOR_PROPOSAL_READ_ONLY/);
assert.match(creatorProposalApi, /export async function PATCH[\s\S]*?410[\s\S]*?SPONSOR_PROPOSAL_READ_ONLY/);
assert.match(revisionsApi, /export async function POST[\s\S]*?410[\s\S]*?SPONSOR_PROPOSAL_REVISION_RETIRED/);
assert.match(activityApi, /export async function POST[\s\S]*?410[\s\S]*?SPONSOR_PROPOSAL_ACTIVITY_WRITE_RETIRED/);
assert.match(challengeSponsorshipApi, /export async function POST[\s\S]*?410[\s\S]*?SPONSOR_PROPOSAL_CREATION_RETIRED/);
assert.match(tournamentSponsorshipApi, /export async function POST[\s\S]*?410/);
assert.match(historicalFundingApi, /410[\s\S]*?SPONSOR_PROPOSAL_FUNDING_RETIRED/);
assert.doesNotMatch(historicalFundingApi, /runTransaction|collection\("sponsorProposals"\)|collection\("sponsorships"\)/);
assert.doesNotMatch(sponsorFinancePages, /fund-campaign-foundation|Fund Sponsorship/);
assert.doesNotMatch(legacyBuilder, /use client|Proposal Builder|Create a sponsor proposal|apiRequest/);
assert.match(legacyBuilder, /redirect\("\/sponsor\/campaigns\/create"\)/);
assert.doesNotMatch(historicalDetail, /method:\s*"(?:PATCH|POST)"|takeAction|addRevision/);
assert.doesNotMatch(challengeForm, /Submit Proposal|Review Proposal|proposeSponsorship/);
assert.doesNotMatch(sponsorNav, /label: "Proposals"|sponsor\/proposals\/new/);

console.log("Sponsor proposal retirement contracts passed.");
