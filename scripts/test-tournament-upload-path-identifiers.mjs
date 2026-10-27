import assert from 'node:assert/strict';
import { tournamentSubmissionMediaPath } from '../lib/media-upload-paths.ts';
import { appendUploadFileName } from '../lib/media-upload.ts';
const tournament='t_'+('a'.repeat(90)),round=tournament+'_round',match=tournament+'_match',participant=tournament+'_user_'+('b'.repeat(28));let assertions=0;
const base=tournamentSubmissionMediaPath(tournament,round,match,participant,'images');
for(const id of [tournament,round,match,participant]){assert.ok(base.split('/').includes(id));assertions++;}
const uploaded=appendUploadFileName(base,'my photo.png',100);
assert.equal(uploaded.split('/')[7],participant);assertions++;
assert.ok(uploaded.endsWith('/100-my_photo.png'));assertions++;
for(const invalid of ['','..','.','bad/id','bad\\id','bad\u0000id','a'.repeat(1501)]){assert.throws(()=>tournamentSubmissionMediaPath(invalid,round,match,participant,'images'),/INVALID_STORAGE_RESOURCE_IDENTIFIER/);assertions++;}
assert.equal(appendUploadFileName('users/me/profile/avatar','photo.png',100),'users/me/profile/avatar/100-photo.png');assertions++;
console.log(`Tournament upload paths: ${assertions} exact-identifier and traversal assertions passed.`);
