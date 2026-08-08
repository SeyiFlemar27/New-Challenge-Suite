import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

export async function run(name) {
  const [page, rules, quote, checkout, packages, transferApi, transferServer, recipients, sidebar, success] = await Promise.all([
    read("app/dorocoins/page.tsx"), read("lib/server/economy-rules.ts"), read("lib/dorocoin-purchase.ts"),
    read("app/api/stripe/dorocoin-checkout/route.ts"), read("app/api/dorocoin/packages/route.ts"),
    read("app/api/dorocoin/transfer/route.ts"), read("lib/server/economy-dorocoin.ts"),
    read("app/api/dorocoin/recipients/route.ts"), read("components/sidebar.tsx"), read("app/checkout/dorocoins/success/page.tsx")
  ]);
  const source = [page, rules, quote, checkout, packages, transferApi, transferServer, recipients, sidebar, success].join("\n");
  const checks = {
    "page-tabs": () => ["overview", "earn", "buy", "transfer", "history"].forEach((tab) => assert.match(page, new RegExp(`\\"${tab}\\"`))),
    "overview-hero-balance": () => { assert.match(page, /Available DoroCoin balance/); assert.match(page, /text-5xl/); },
    "four-balances-secondary": () => ["Cash Wallet", "DoroCoins", "Challenge Credits", "Creator Growth Wallet"].forEach((label) => assert.match(page, new RegExp(label))),
    "pricing-consistency": () => { assert.match(rules, /coinsPerUsd: 100/); assert.match(quote, /DOROCOINS_PER_USD = 100/); assert.match(checkout, /economyRules\.doroCoin\.coinsPerUsd/); assert.match(packages, /pricingConsistent/); },
    "custom-purchase-only-buy-tab": () => { assert.match(page, /activeTab === "buy"/); assert.match(page, /function BuyTab/); },
    "packages-no-admin-wording": () => assert.doesNotMatch(page, /Admin configuration/i),
    "earn-tab-document-values": () => ["Daily login", "Watch a challenge video", "Invite a new user", "Complete profile verification"].forEach((label) => assert.match(page, new RegExp(label))),
    "earn-tab-caps-visible": () => { assert.match(page, /Up to 20 per day/); assert.match(page, /Up to 50 eligible likes per day/); },
    "ways-to-earn-and-use-separated": () => { assert.match(page, /Ways to Earn DoroCoins/); assert.match(page, /Ways to Use DoroCoins/); },
    "rewarded-ads-user-friendly-disabled-state": () => { assert.match(page, /Rewarded ads are not available yet/); assert.match(page, /Not Available Yet/); },
    "streak-next-milestone": () => { assert.match(page, /Next milestone/); assert.match(page, /Checked in today/); },
    "transfer-searchable-recipient": () => { assert.match(page, /Search username, email, or profile name/); assert.match(recipients, /requireRequestUser/); assert.doesNotMatch(recipients, /email, displayName/); },
    "transfer-confirmation-modal": () => { assert.match(page, /role="dialog"/); assert.match(page, /Confirm Transfer/); },
    "transfer-optional-note": () => { assert.match(page, /Note \(optional\)/); assert.match(transferApi, /note:/); },
    "transfer-limits-visible": () => { assert.match(page, /Daily limit/); assert.match(transferApi, /remainingToday/); },
    "history-filters": () => ["earned", "purchased", "spent", "transferred", "reversed", "expired", "pending"].forEach((filter) => assert.match(page, new RegExp(`\\"${filter}\\"`))),
    "history-status-badges": () => ["Confirmed", "Pending", "Reversed", "Expired", "Under review", "Failed"].forEach((status) => assert.match(page, new RegExp(status))),
    "history-human-readable-labels": () => { assert.match(page, /Daily login reward/); assert.match(page, /Transfer received/); },
    "no-demo-wording-production-ui": () => { assert.doesNotMatch(page, /Demo Member|Demo vote spend|Demo launch DoroCoin grant/); assert.match(page, /replace\(\/\\bdemo/); },
    "sidebar-mini-balance-simplified": () => { assert.match(sidebar, /Open DoroCoin wallet/); assert.match(sidebar, /bg-\[var\(--panel-2\)\]/); },
    "rewards-sidebar-separate": () => { assert.match(sidebar, /label: "DoroCoins"/); assert.match(sidebar, /label: "Rewards"/); },
    "profile-no-demo-member": () => assert.doesNotMatch(source, /Demo Member/),
    "light-gold-consumer-layout": () => { assert.match(page, /bg-yellow-50/); assert.match(page, /consumer|community features/); },
    "mobile-390-no-overflow": () => { assert.match(page, /overflow-x-auto/); assert.doesNotMatch(page, /min-w-\[[4-9][0-9][0-9]px\]/); },
    "not-withdrawable-after-polish": () => { assert.match(page, /cannot currently be withdrawn/); assert.match(rules, /withdrawable: false/); },
    "does-not-buy-votes-after-polish": () => { assert.match(page, /cannot buy votes/); assert.match(rules, /canBuyVotes: false/); },
    "challenge-coin-wording-not-primary-ui": () => assert.doesNotMatch(page, /Challenge Coin/i),
    "checkout-success-does-not-credit-after-polish": () => { assert.doesNotMatch(success, /applyDoroCoinTransaction|balance\s*[+]=|increment\(/); assert.match(checkout, /pending_payment/); },
    "ledger-history-not-deleted": () => { assert.match(page, /real ledger/); assert.doesNotMatch(source, /\.delete\(\).*doroCoinTransactions|recursiveDelete/); }
  };
  assert.ok(checks[name], `Unknown DoroCoin polish contract: ${name}`);
  checks[name]();
  console.log(`PASS test-dorocoin-${name}.mjs`);
}
