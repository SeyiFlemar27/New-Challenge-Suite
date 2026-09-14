import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wizard = readFileSync("components/host/host-competition-wizard.tsx", "utf8");
const liveRoute = readFileSync("app/host/live/create/page.tsx", "utf8");

assert(liveRoute.includes("LiveEventBuilder"));
assert(!liveRoute.includes("HostCompetitionWizard"));
assert(wizard.includes('"paid_setup_required"'));
assert(wizard.includes("ticketCheckoutActive: false"));
assert(wizard.includes("ticketPaymentConfirmationRequired: true"));
assert(!wizard.includes("createTicketCheckout"));
assert(!wizard.includes("ticketPaymentStatus"));
assert(!wizard.includes("mockTicket"));
assert(!wizard.includes("fake ticket"));
assert(!wizard.includes("paymentSucceeded: true"));

console.log("Live Event no-fake-ticket-payment checks passed.");
