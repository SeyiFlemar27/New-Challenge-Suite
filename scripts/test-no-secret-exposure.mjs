import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const publicFiles = [
  "app/layout.tsx",
  "app/challenges/[id]/layout.tsx",
  "app/challenges/[id]/page.tsx",
  "app/explore/page.tsx",
  "app/wallet/page.tsx"
].map(read).join("\n");
assert(!/BEGIN PRIVATE KEY|service[_ -]?account|private_key_id|client_email/i.test(publicFiles));
assert(!/process\.env\.(?:STRIPE_SECRET|FIREBASE_PRIVATE|SUMSUB_SECRET)/.test(publicFiles));
console.log("Public source secret-exposure checks passed.");
