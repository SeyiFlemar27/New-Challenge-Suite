import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lifecycle = readFileSync("app/api/tournaments/[id]/lifecycle/route.ts", "utf8");
const lifecycleProcessor = readFileSync("lib/server/tournament-lifecycle-scheduler.ts", "utf8");
const waitlist = readFileSync("app/api/tournaments/[id]/waitlist/route.ts", "utf8");
const bracket = readFileSync("app/api/tournaments/[id]/bracket/route.ts", "utf8");

assert(lifecycleProcessor.includes("no_show") && lifecycleProcessor.includes("tournamentWaitlistOffers"), "Check-in close must release no-show places into real waitlist offers.");
assert(lifecycleProcessor.includes("process_waitlist_offers") && lifecycleProcessor.includes('status: "expired"'), "Expired offers must advance the server-managed queue.");
assert(waitlist.includes('action === "accept_offer"') && waitlist.includes("offerExpiresAt"), "Offer acceptance must be authenticated and time bounded.");
assert(bracket.includes("noShowResolutionStatus") && bracket.includes("TOURNAMENT_NO_SHOW_RESOLUTION_PENDING"), "Bracket generation must wait for no-show resolution.");
assert(lifecycleProcessor.includes("refundProviderCalled: false"), "No-show processing must not execute refunds.");
assert(lifecycle.includes("canPerformTournamentRole") && lifecycle.includes("processTournamentLifecycleAction"), "The extracted lifecycle processor remains behind the authenticated role boundary.");
console.log("tournament no-show waitlist contracts: ok");
