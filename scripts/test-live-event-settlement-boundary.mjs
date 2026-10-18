import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSettlementBreakdown} from '../lib/server/challenge-settlement.ts';
assert.throws(()=>buildSettlementBreakdown({challenge:{isLiveEvent:true,hostOperations:{schemaVersion:2}},winners:[{userId:'local-winner',placement:1,splitPercent:100}],confirmedEntryRevenueCents:10000,confirmedPaidVoteRevenueCents:0,confirmedSponsorPrizeCents:5000,confirmedCreatorPrizeCents:5000}),/LIVE_EVENT_SETTLEMENT_INTEGRATION_REQUIRED/,'the generic settlement must not duplicate already-recorded Live Event booking shares');
const source=readFileSync('lib/server/challenge-settlement.ts','utf8');
assert(source.includes('isLiveEventV2(challengeSnap.data()??{})'),'the transaction must recheck the stored entity, not trust a caller-provided classification');
console.log('Live Event generic-settlement boundary passed. The dedicated Admin approval adapter is tested separately; no payout was executed by this contract test.');
