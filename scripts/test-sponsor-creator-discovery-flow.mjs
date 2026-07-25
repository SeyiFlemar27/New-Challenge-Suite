import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const page = read("app/sponsor/discover/creators/page.tsx");
const route = read("app/api/sponsor/discover/creators/route.ts");
const inviteRoute = read("app/api/sponsor/invitations/route.ts");
const compareRoute = read("app/api/sponsor/discover/creators/compare/route.ts");

assert(route.includes("profileComplete") && route.includes("sponsorReady"), "Creator discovery API should require completed sponsor-ready creator profiles.");
assert(route.includes("[\"creator\", \"host\"]"), "Creator discovery should limit to creator or creator-equivalent accounts.");
assert(route.includes("return null") && !route.includes("\"Challenge Suite Creator\""), "Creator discovery must not emit fallback fake creator profiles.");
assert(page.includes("Discover") && page.includes("Saved") && page.includes("Pending") && page.includes("Active"), "Creator discovery page should expose Discover/Saved/Pending/Active sections.");
assert(page.includes("saveCreator") && page.includes("/api/sponsor/saved/creators"), "Save flow should persist saved creators.");
assert(page.includes("Compare (") && compareRoute.includes("Not available yet"), "Compare flow should use real selected creators and unavailable metrics copy.");
assert(exists("app/api/sponsor/invitations/route.ts"), "Invite route should exist.");
assert(inviteRoute.includes("pending_creator_response") && inviteRoute.includes("fakeAcceptance: false"), "Invite should remain pending and never fake acceptance.");
assert(page.includes("Custom Challenge Request") && page.includes("Join Sponsor Campaign"), "Invite modal should support custom challenge and campaign invite types.");
assert(!/demo profile|fake profile|placeholder name|fakeAcceptance:\s*true|fake acceptance/i.test(page + route), "Creator discovery must not add fake profiles or fake acceptance.");
assert(!/fakeAcceptance:\s*true|fake acceptance/i.test(inviteRoute), "Creator invitations must not fake acceptance.");

console.log("Sponsor creator discovery flow checks passed.");
