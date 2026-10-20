import assert from 'node:assert/strict';
import { assessHistoricalPublication } from '../lib/historical-publication-remediation.ts';
const base = { id: 'synthetic-history', source: 'challenges', record: { status: 'pending_review', builderVersion: 'normal_v3', prizeType: 'money', prizeValue: 0 }, account: { accountStatus: 'active' } };
for (const restriction of [{ status: 'rejected' }, { flagged: true }, { suspiciousActivity: true }, { suspectedFraud: true }, { settlementRestricted: true }, { moderationStatus: 'held' }]) {
  const result = assessHistoricalPublication({ ...base, record: { ...base.record, ...restriction } });
  assert.equal(result.result, 'needs_attention');
  assert.equal(result.publishable, false);
  assert(result.reasons.length > 0);
}
const missing = assessHistoricalPublication(base);
assert(missing.reasons.includes('MANDATORY_MEDIA_VERIFICATION_MISSING'));
assert(!missing.reasons.includes('CREATOR_FUNDING_RECONCILIATION_REQUIRED'));
const positive = assessHistoricalPublication({ ...base, record: { ...base.record, prizeValue: 10 } });
assert(positive.reasons.includes('CREATOR_FUNDING_RECONCILIATION_REQUIRED'));
assert.equal(base.record.status, 'pending_review');
console.log('PASS historical dry-run: restrictions, missing verification, zero/positive funding, no mutation and no publication.');
