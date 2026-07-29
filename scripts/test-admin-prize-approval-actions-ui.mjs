import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const detailPage = read("app/admin/prize-approvals/[proposalId]/page.tsx");
const queuePage = read("app/admin/prize-approvals/page.tsx");
const detailRoute = read("app/api/admin/prize-approvals/[proposalId]/route.ts");
const approveRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");
const rejectRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/reject/route.ts");
const changesRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/request-changes/route.ts");
const finalizeRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/finalize-ledger/route.ts");

assert(exists("app/admin/prize-approvals/[proposalId]/page.tsx"), "admin prize approval detail route must exist.");
assert(queuePage.includes("/admin/prize-approvals/${proposal.id}"), "queue rows must link to detail page.");
assert(detailRoute.includes("requireAdminUser"), "detail API route must require admin.");
assert(detailRoute.includes("getAdminPrizeApprovalDetail"), "detail API route must use safe detail helper.");

assert(detailPage.includes("Challenge Overview"), "detail page must show challenge overview.");
assert(detailPage.includes("Proposal Summary"), "detail page must show proposal summary.");
assert(detailPage.includes("Proposed winners"), "detail page must show proposed winners.");
assert(detailPage.includes("Settlement Preview"), "detail page must show settlement preview.");
assert(detailPage.includes("Readiness checklist"), "detail page must show readiness checklist.");
assert(detailPage.includes("Approve winners & create settlement"), "detail page must expose approval and settlement action.");
assert(detailPage.includes("Reject Proposal"), "detail page must expose reject action.");
assert(detailPage.includes("Request Changes"), "detail page must expose request changes action.");
assert(detailPage.includes("Retry Internal Settlement"), "detail page must expose an idempotent settlement retry action.");
assert(detailPage.includes("No provider-confirmed challenge or sponsor payments are available"), "detail page must show safe zero-revenue state.");
assert(detailPage.includes("Admin note is required"), "detail page must require admin note for reject/request changes.");
assert(detailPage.includes("no bank transfer or payout provider is called"), "detail page must not imply payout execution.");
assert(!detailPage.includes("Winners paid") && !detailPage.includes("Funds released") && !detailPage.includes("Payout sent"), "detail page must not claim payout completion.");

assert(approveRoute.includes("requireAdminUser"), "approve route must require admin.");
assert(rejectRoute.includes("requireAdminUser"), "reject route must require admin.");
assert(changesRoute.includes("requireAdminUser"), "request changes route must require admin.");
assert(finalizeRoute.includes("requireAdminUser"), "finalize route must require admin.");
assert(approveRoute.includes("payoutProviderCalled: false"), "approve route must not call payout provider.");
assert(rejectRoute.includes("ledgerEntriesCreated: false"), "reject route must not create ledger entries.");
assert(changesRoute.includes("ledgerEntriesCreated: false"), "request changes route must not create ledger entries.");
assert(finalizeRoute.includes("finalizeApprovedWinnerProposalLedger"), "finalize route must use server-side finalization helper.");
assert(finalizeRoute.includes("payoutProviderCalled: false"), "finalize route must not call payout provider.");

console.log("Admin prize approval action UI checks passed.");
