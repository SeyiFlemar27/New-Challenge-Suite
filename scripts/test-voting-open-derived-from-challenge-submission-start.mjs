import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const status = readFileSync("lib/challenge-status.ts", "utf8");
const builder = readFileSync("components/challenge-builder.tsx", "utf8");
const publish = readFileSync("app/api/challenges/[id]/publish/route.ts", "utf8");
assert(status.includes("specializedVotingTimeline ? configuredVotingOpensAt ?? submissionOpensAt : submissionOpensAt ?? configuredVotingOpensAt"));
assert(builder.includes("votingStartsAt: challengeSubmissionStartAt"));
assert(publish.includes("body.submissionStartAt || body.startsAt"));
console.log("simple challenge voting-open derivation checks passed");
