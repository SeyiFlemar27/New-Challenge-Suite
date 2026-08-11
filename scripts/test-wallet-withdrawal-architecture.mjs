import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const walletArchitecture = read("lib/server/wallet-architecture.ts");
const cashWallet = read("lib/server/cash-wallet.ts");
const withdrawalsHelper = read("lib/server/withdrawals.ts");
const withdrawalsRoute = read("app/api/withdrawals/route.ts");
const walletRoute = read("app/api/wallet/route.ts");
const walletPage = read("app/earnings/page.tsx");
const withdrawPage = read("app/wallet/withdraw/page.tsx");
const revenueSharing = read("lib/server/revenue-sharing.ts");
const revenueSharePage = read("app/revenue-share/page.tsx");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");
const kyc = read("lib/server/kyc.ts");

assert(exists("lib/server/wallet-architecture.ts"), "central wallet architecture helper must exist.");
assert(walletArchitecture.includes("available") && walletArchitecture.includes("pending") && walletArchitecture.includes("hold") && walletArchitecture.includes("withdrawn"), "wallet architecture must define core cash buckets.");
assert(walletArchitecture.includes("CashLedgerEntryShape"), "ledger-first shape must be prepared.");
assert(walletArchitecture.includes("WithdrawalRequestShape"), "withdrawal request shape must be prepared.");
assert(walletArchitecture.includes("predictionArenaPlatformFeePercent: 7"), "Prediction Arena 7% platform fee must be preserved centrally.");
assert(walletArchitecture.includes("creatorChallengePlatformFeePercent: null"), "missing creator fee decisions should remain setup-safe.");
assert(walletArchitecture.includes("withdrawalsEnabled: true"), "reviewed withdrawal requests must remain enabled.");
assert(walletArchitecture.includes("payoutProviderConfigured: false"), "payout provider must remain unconfigured.");
assert(walletArchitecture.includes("payoutMethodCollectionEnabled: true"), "reviewed payout method collection must remain enabled.");
assert(walletArchitecture.includes('kycRequired: isKycRequiredForAction("withdrawalRequest")'), "KYC policy must be centralized.");
assert(walletArchitecture.includes("DoroCoins are internal platform credits. They cannot be withdrawn or converted to cash."), "DoroCoin must be separated from cash.");
assert(walletArchitecture.includes("Reward points are not cash and cannot be withdrawn."), "reward points must be separated from cash.");

assert(cashWallet.includes("availableBalanceCents"), "cash wallet must expose available balance bucket.");
assert(cashWallet.includes("pendingBalanceCents"), "cash wallet must expose pending balance bucket.");
assert(cashWallet.includes("underReviewBalanceCents"), "cash wallet must expose hold/review bucket.");
assert(cashWallet.includes("withdrawnBalanceCents"), "cash wallet must expose withdrawn total.");
assert(cashWallet.includes("lifetimeEarningsCents"), "cash wallet must expose lifetime earnings.");
assert(cashWallet.includes("withdrawalsEnabled: false"), "cash wallet must not enable withdrawals.");

assert(withdrawalsRoute.includes("requireRequestUser(request)"), "withdrawal route must require auth.");
assert(!withdrawalsRoute.includes("loadKycMetadata"), "withdrawal route must not load KYC metadata as a gate.");
assert(withdrawalsRoute.includes("withdrawalRequestCreationEnabled: true"), "withdrawal request creation must be enabled for review.");
assert(withdrawalsRoute.includes("createWithdrawalRequest("), "withdrawal POST must create an audited review request.");
assert(withdrawalsRoute.includes("runTransaction"), "withdrawal POST must reserve funds transactionally.");
assert(!withdrawalsRoute.includes("stripe.transfers.create"), "withdrawal API must not call Stripe Connect.");
assert(!withdrawalsRoute.includes("paystack.") && !withdrawalsRoute.includes("Paystack"), "withdrawal API must not call Paystack.");
assert(!withdrawalsRoute.includes("providerTransferId") || withdrawalsRoute.includes("providerTransferId: null"), "withdrawal route must not create provider transfers.");

assert(withdrawPage.includes("Submit Withdrawal Request"), "withdrawal UI must expose the reviewed request action.");
assert(withdrawPage.includes("Withdrawal requests are reviewed before payout processing"), "withdrawal UI must explain review state.");
assert(!/paid successfully|payout complete|withdrawal complete/i.test(withdrawPage + withdrawalsRoute), "withdrawal surfaces must not fake payout success.");
assert(!/fake withdrawable|fake withdrawal|demo withdrawal/i.test(withdrawPage + withdrawalsRoute), "withdrawal surfaces must not use fake withdrawal data.");

assert(walletRoute.includes("walletPolicy"), "wallet API must return policy copy.");
assert(walletRoute.includes("withdrawalArchitecture"), "wallet API must return withdrawal architecture state.");
assert(walletRoute.includes("platformFeeConfig"), "wallet API must return platform fee config.");
assert(walletPage.includes("Available funds") && walletPage.includes("pendingBalanceCents") && walletPage.includes("underReviewBalanceCents"), "earnings page must preserve cash buckets.");

assert(revenueSharing.includes("PLATFORM_FEE_CONFIG"), "revenue sharing should use central fee config.");
assert(revenueSharing.includes("revenueGrossToNetFoundation"), "gross-to-net foundation helper should exist.");
assert(revenueSharePage.includes("Business decision required"), "missing fee decisions should be visible as setup-required.");
assert(!revenueSharePage.includes("Example uses $10,000"), "revenue share page must not show fake revenue examples.");
assert(!revenueSharePage.includes("$200 vote revenue"), "revenue share page must not show fake vote revenue examples.");

assert(!stripeWebhook.includes("withdrawalRequests"), "Stripe webhook must not activate withdrawal processing.");
assert(kyc.includes("rawIdentityStored: false"), "KYC helper must not store raw identity documents.");
assert(withdrawalsHelper.includes("automaticPayoutsEnabled()") && withdrawalsHelper.includes("return false"), "automatic payouts must remain disabled.");

console.log("Wallet withdrawal architecture checks passed.");
