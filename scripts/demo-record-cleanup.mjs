import fs from "node:fs";

const PROTECTED_COLLECTIONS = new Set(["payments", "wallets", "walletTransactions", "ledger", "auditLogs", "settlements", "withdrawals", "kycMetadata", "stripeEvents"]);
const markerKeys = ["isDemo", "isTest", "isSeed", "qaRecord", "demoRecord"];
const input = process.argv.find((argument) => argument.startsWith("--input="))?.slice(8);
const execute = process.argv.includes("--execute");

if (execute) {
  throw new Error("Deletion is intentionally unavailable in this audit-only tool. Review the dry-run manifest through an authorized admin workflow.");
}
if (!input) {
  console.log("Dry run only. Pass --input=<review-export.json> to inventory explicitly marked demo records.");
  process.exit(0);
}

const records = JSON.parse(fs.readFileSync(input, "utf8"));
const candidates = records.filter((record) => !PROTECTED_COLLECTIONS.has(String(record.collection)) && markerKeys.some((key) => record.data?.[key] === true));
console.log(JSON.stringify({ mode: "dry-run", candidates: candidates.map((record) => ({ collection: record.collection, id: record.id, markers: markerKeys.filter((key) => record.data?.[key] === true) })), protectedCollections: [...PROTECTED_COLLECTIONS] }, null, 2));
