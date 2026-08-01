import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const boostAccess = readFileSync("lib/server/boosts.ts", "utf8");
const boostApi = readFileSync("app/api/challenges/[id]/boost/route.ts", "utf8");
const detailApi = readFileSync("app/api/challenges/[id]/route.ts", "utf8");
const detailPage = readFileSync("app/challenges/[id]/page.tsx", "utf8");

assert(boostAccess.includes("userOwnsChallenge(challenge, userId)"), "boost access must verify challenge ownership");
assert(boostAccess.includes('"owner_required"'), "boost access must expose an owner-required blocker");
assert(boostAccess.includes("isPublicChallengeStatus(status)"), "boost access must require a public lifecycle");
assert(boostAccess.includes("NON_PUBLIC_VISIBILITY"), "private and hidden challenges must fail closed");
assert(boostApi.includes("getChallengeBoostAccess"), "boost API must use the shared server authorization");
assert(boostApi.includes("Only the challenge owner can boost this challenge."), "boost API must explicitly reject non-owners");
assert(boostApi.indexOf("const boostAccess = getChallengeBoostAccess") < boostApi.indexOf("await applyDoroCoinTransaction"), "authorization must run before any DoroCoin transaction");
assert(detailApi.includes("boostAccess"), "challenge API must return server-derived boost access");
assert(detailPage.includes("ownerAccount && (userState as any)?.boostAccess?.allowed"), "detail UI must render boost only from server-derived owner access");
console.log("owner-only challenge boost checks passed");
