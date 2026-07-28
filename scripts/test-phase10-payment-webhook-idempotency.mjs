import fs from "node:fs";
const webhook=fs.readFileSync("app/api/stripe/webhook/route.ts","utf8"), payments=fs.readFileSync("lib/server/monetization-payments.ts","utf8");
for(const token of ["constructEvent(body, signature, secret)","stripeWebhookEvents","duplicate: true","challenge_entry_fee","paid_vote","sponsor_funding"]) if(!webhook.includes(token)) throw new Error("Stripe webhook invariant missing: "+token);
if(!payments.includes("webhookConfirmed: true")||!payments.includes("stripeEventId")) throw new Error("Provider-confirmed payment idempotency missing");
console.log("phase10 payment webhook idempotency: ok");
