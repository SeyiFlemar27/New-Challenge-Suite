import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const requiredFiles = [
  "app/api/stripe/dorocoin-checkout/route.ts",
  "app/api/challenge-credits/checkout/route.ts",
  "app/api/stripe/webhook/route.ts",
  "app/checkout/dorocoins/success/page.tsx",
  "app/challenge-credits/success/page.tsx"
];
const findings = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");

for (const path of requiredFiles) {
  findings.push({ check: `route:${path}`, status: existsSync(resolve(root, path)) ? "PASS" : "FAIL" });
}

if (findings.every((item) => item.status === "PASS")) {
  const webhook = read("app/api/stripe/webhook/route.ts");
  const doroCheckout = read("app/api/stripe/dorocoin-checkout/route.ts");
  const creditCheckout = read("app/api/challenge-credits/checkout/route.ts");
  const successPages = read("app/checkout/dorocoins/success/page.tsx") + read("app/challenge-credits/success/page.tsx");
  findings.push(
    { check: "webhook-idempotency", status: webhook.includes("stripeWebhookEvents") ? "PASS" : "FAIL" },
    { check: "provider-confirmed-crediting", status: webhook.includes("payment_status !== \"paid\"") && webhook.includes("balanceCredited: true") ? "PASS" : "FAIL" },
    { check: "pending-dorocoin-purchase", status: doroCheckout.includes("pending_payment") ? "PASS" : "FAIL" },
    { check: "pending-challenge-credit-purchase", status: creditCheckout.includes("pending_payment") ? "PASS" : "FAIL" },
    { check: "success-pages-do-not-credit", status: !/(applyDoroCoinTransaction|applyChallengeCreditTransaction|balanceCredited\s*:\s*true)/.test(successPages) ? "PASS" : "FAIL" },
    { check: "no-embedded-test-card-or-secret", status: !/(4242\s*4242\s*4242\s*4242|sk_(?:test|live)_|whsec_)/.test([webhook, doroCheckout, creditCheckout, successPages].join("\n")) ? "PASS" : "FAIL" }
  );
}

const failed = findings.filter((item) => item.status === "FAIL");
console.log(JSON.stringify({ status: failed.length ? "FAIL" : "PASS", providerSuccessSimulated: false, findings }, null, 2));
process.exitCode = failed.length ? 1 : 0;
