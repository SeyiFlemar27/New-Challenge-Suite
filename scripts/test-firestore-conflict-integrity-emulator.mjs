import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

assert.match(process.env.GCLOUD_PROJECT ?? '', /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^127\.0\.0\.1:\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
// Independent compatibility control based on firebase/firebase-tools#11241.
// No application services, financial writes, retries or SDK patches participate.
try {
  const parent = db.doc('conflictIntegrityParents/p1');
  const record = db.doc('conflictIntegrityRecords/r1');
  await parent.set({ granted: false });
  await record.set({ tags: { a: true } });
  let attempts = 0, outsideWrite, outsideCommitted = false;
  let outsideCommittedBeforeFirstCommit = false;
  await db.runTransaction(async tx => {
    attempts++;
    await tx.getAll(parent);
    const matches = await tx.get(db.collection('conflictIntegrityRecords').where('tags.a', '==', true).select('tags').limit(10));
    await tx.get(db.collectionGroup('conflictIntegrityOther').where('ids', 'array-contains', 'a'));
    if (attempts === 1) {
      outsideWrite = record.set({ tags: { a: true, b: true } }).then(() => { outsideCommitted = true; });
      await new Promise(resolve => setTimeout(resolve, 100));
      outsideCommittedBeforeFirstCommit = outsideCommitted;
    }
    tx.update(parent, { granted: true, matched: matches.size });
  });
  await outsideWrite;
  console.log(JSON.stringify({ attempts, outsideCommittedBeforeFirstCommit }));
  assert.ok(!outsideCommittedBeforeFirstCommit || attempts > 1,
    'A transaction must not commit its first attempt after an observed document changed before its commit was issued');
  console.log('Native conflict-integrity control passed.');
} finally { await app.delete(); }
