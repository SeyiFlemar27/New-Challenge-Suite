import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const journey = read("lib/server/participant-journey.ts");
for (const copy of [
  "Registration ended",
  "Maximum participant capacity has been reached.",
  "Creators cannot participate in their own challenge.",
  "Your registration is incomplete until payment succeeds.",
  "The host is reviewing your registration.",
  "New submissions are no longer accepted.",
  "Participation is no longer available."
]) assert(journey.includes(copy), copy);
assert(journey.includes("participantCount: publicParticipantsSnap.size") === false, "API wiring belongs outside the helper");
console.log("challenge detail exact unavailability reason checks passed");
