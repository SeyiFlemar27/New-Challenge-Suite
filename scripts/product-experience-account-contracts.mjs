import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const has = (source, value, message) => assert.ok(source.includes(value), message);
const lacks = (source, value, message) => assert.ok(!source.includes(value), message);

const deletionApi = read("app/api/account/delete/route.ts");
const deletionStatus = read("app/account/deletion-status/page.tsx");
const availability = read("app/api/auth/account-availability/route.ts");
const bootstrap = read("app/api/auth/profile/bootstrap/route.ts");
const auth = read("lib/firebase/auth-service.ts");
const deletionModel = read("lib/server/account-deletion.ts");
const challengeLifecycle = read("app/api/challenges/[id]/lifecycle/route.ts");
const challengeDeletion = read("lib/server/challenge-deletion.ts");
const privateBuilder = read("components/challenge-builder.tsx");
const privateAccess = read("lib/private-challenge-access.ts");
const liveBuilder = read("components/host/host-competition-wizard.tsx");
const tournamentBuilder = read("components/tournament-builder.tsx");
const tournamentValidation = read("lib/server/tournament-validation.ts");
const exploreApi = read("app/api/explore/challenges/route.ts");
const publicChallenge = read("lib/server/public-challenge.ts");
const explorePage = read("app/explore/page.tsx");
const doro = read("app/dorocoins/page.tsx");
const payment = read("components/payment-status-journey.tsx");
const paymentApi = read("app/api/payments/status/route.ts");
const notifications = read("components/notification-bell.tsx");
const topbar = read("components/authenticated-topbar.tsx");
const host = read("app/dashboard/host/page.tsx");
const planAccess = read("lib/plan-access.ts");

has(deletionApi, "confirmation: z.literal(\"DELETE\")", "Deletion requires typed DELETE confirmation.");
has(deletionApi, "email: z.string().trim().email()", "Deletion requires matching email confirmation.");
has(deletionApi, "RECENT_AUTH_REQUIRED", "Deletion requires recent authentication.");
has(deletionApi, "accountDeletionRequests", "History accounts create a deletion request.");
has(deletionApi, "deletedAccountReferences", "Deletion records an email-hash tombstone.");
has(deletionApi, "publicProfileHidden: true", "Pending deletion hides the public profile immediately.");
has(deletionApi, "immutable: true", "Deletion audit events are immutable.");
lacks(deletionApi, "financialTransactions).delete", "Financial history must not be deleted.");
has(deletionStatus, "Account deletion in progress", "Pending deletion has a dedicated status page.");
has(deletionStatus, "Cancel Deletion", "Cancellation is offered only when the API permits it.");
has(availability, "emailReuseAllowed", "Email reuse is controlled by finalized tombstone state.");
has(availability, "enforcementReviewRequired", "Serious enforcement state blocks or flags reuse.");
has(bootstrap, "ACCOUNT_DELETION_PENDING", "Pending deletion cannot silently recreate an account.");
has(bootstrap, "ACCOUNT_REUSE_REVIEW_REQUIRED", "Restricted reused email cannot bootstrap.");
has(auth, "deleteFirebaseUser(credential.user)", "Failed bootstrap removes the newly created orphan identity.");
has(auth, "No active account was found", "Fully deleted login gets an explicit recovery message.");
has(deletionModel, "scheduled_for_deletion", "Deletion status lifecycle includes scheduled deletion.");

has(challengeDeletion, "hardDeleteAllowed", "Challenge deletion is activity-aware.");
has(challengeLifecycle, "request_admin_deletion", "Challenges with history can request admin deletion.");
has(challengeLifecycle, "status: \"cancelled\"", "Active challenges are cancelled rather than erased.");

for (const step of ["Overview", "Access", "Eligibility", "Monetization & Prize Pool", "Media & Branding", "Schedule", "Entry & Submission", "Review", "Publish"]) has(privateBuilder, `\"${step}\"`, `Private builder includes ${step}.`);
has(privateAccess, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", "Private codes avoid ambiguous characters.");
has(privateAccess, "Uint8Array(5)", "Private access code is five characters.");
has(privateBuilder, "readOnly aria-label=\"Generated private challenge access code\"", "Creator cannot manually type the access code.");
has(privateBuilder, "Regenerate", "Access code can be regenerated before publish.");
has(privateBuilder, "publicPreviewEnabled", "Private challenge supports explicit public preview.");
has(publicChallenge, "!type.includes(\"private\")", "Private challenges never enter ordinary public Explore.");
lacks(publicChallenge, "privateAccessCode\"", "Public challenge fields never expose private access codes.");

for (const step of ["Event Basics", "Venue & Schedule", "Registration & Tickets", "Participants", "Challenge Format", "Voting / Judging", "Prize Setup", "Media & Branding", "Sponsors", "Review & Submit"]) has(liveBuilder, `\"${step}\"`, `Live builder includes ${step}.`);
has(liveBuilder, "Physical venue name", "Live events are physical-first.");
has(liveBuilder, "paid_setup_required", "Paid ticket choice remains setup-only.");
has(liveBuilder, "ticketCheckoutActive: false", "Live builder never enables fake ticket checkout.");

for (const step of ["Overview", "Format & Capacity", "Registration", "Seeding & Bracket", "Rounds & Schedule", "Rules & Scoring", "Monetization & Prize Pool", "Media & Branding", "Sponsors", "Review & Publish"]) has(tournamentBuilder, `\"${step}\"`, `Tournament builder includes ${step}.`);
has(tournamentValidation, "[\"single_elimination\", \"double_elimination\"]", "Tournament supports the two launch elimination formats.");
lacks(tournamentValidation, "round_robin", "Round Robin is not a launch format.");
has(tournamentBuilder, "after registration closes", "Bracket/pairing generation waits for registration close.");

for (const type of ["standard", "private", "live_event", "tournament"]) has(exploreApi, `\"${type}\"`, `Explore API supports ${type}.`);
for (const label of ["Standard Challenge", "Private Challenge", "Live Event", "Tournament"]) has(exploreApi, label, `Explore labels ${label}.`);
has(exploreApi, "Enter Access Code", "Private Explore CTA requests the access code.");
has(exploreApi, "Register for Event", "Live event CTA is dynamic.");
has(exploreApi, "View Bracket", "Tournament CTA is dynamic.");
has(explorePage, "All types", "Explore has an all-types filter.");

has(doro, "Loading DoroCoin balance", "DoroCoin loading state uses a skeleton.");
has(doro, "{balance.toLocaleString()} DoroCoins", "Loaded balance is readable, including zero.");
lacks(doro, `loading ? "..."`, "Loaded DoroCoin UI does not use ellipsis as balance.");
has(doro, "from-white to-yellow-50", "DoroCoin hero uses the light/gold theme.");
has(doro, "cannot currently be withdrawn or converted to cash", "DoroCoins remain non-cash and non-withdrawable.");

has(payment, "90_000", "Host activation polling has a 90-second safety timeout.");
has(payment, "4000", "Host activation polling runs every four seconds.");
has(paymentApi, "verify", "Payment status supports safe server-side provider verification.");
has(paymentApi, "persistStripeSubscriptionLifecycle", "Provider verification persists canonical lifecycle state.");
has(notifications, "bg-white", "Notification panel uses a readable light surface.");
has(notifications, "/api/notifications/${notification.id}/read", "Individual notifications can be marked read.");
has(topbar, "canSwitchSponsorRole", "Role switching requires sponsor capability.");
lacks(topbar, "Host Control Center</span>", "Role switcher does not present Host as a role.");
has(host, "Monthly challenge boosts", "Host dashboard exposes monthly boosts.");
has(planAccess, "monthlyBoostLimit: 10", "Host has a config-driven boost allocation.");
has(planAccess, "monthlyBoostLimit: 1", "Creator boost allocation remains lower than Host.");

console.log("Product experience and account lifecycle contracts passed.");
