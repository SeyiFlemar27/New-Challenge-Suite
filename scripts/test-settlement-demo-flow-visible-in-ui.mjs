import { assert, read } from "./settlement-test-utils.mjs";
const approvalPage = read("app/admin/prize-approvals/[proposalId]/page.tsx");
const financePage = read("app/admin/finance/page.tsx");
const challengePage = read("app/challenges/[id]/page.tsx");
assert(approvalPage.includes("Settlement Preview") && approvalPage.includes("Approve winners & create settlement"), "admin must see preview and settlement action");
assert(approvalPage.includes("Settlement Created"), "admin must see created settlement breakdown");
assert(financePage.includes("Platform Fee (15%)") && financePage.includes("Sponsor Fee (15%)"), "finance UI must show both platform fees");
assert(challengePage.includes("Results confirmed") && challengePage.includes("Settlement prepared"), "public result must show safe settlement status");
console.log("settlement demo UI checks passed");
