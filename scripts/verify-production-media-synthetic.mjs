import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import nextEnv from '@next/env';
import sharp from 'sharp';

// Explicit opt-in is required. Uses no Auth/Firestore records or application publication.
if(!process.argv.includes('--approved-synthetic-storage-test'))throw Error('EXPLICIT_SYNTHETIC_TEST_APPROVAL_REQUIRED');
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
if((process.env.FIREBASE_PROJECT_ID||process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)!=='challenge-suite'||process.env.FIREBASE_STORAGE_EMULATOR_HOST)throw Error('WRONG_TARGET');
const {getAdminStorage}=await import('../lib/firebase/admin.ts');
const {verifyChallengeMedia,removeDownloadToken}=await import('../lib/server/media-verification.ts');
const bucket=getAdminStorage().bucket(), id='release-media-probe-20261020-'+randomUUID();
const sourcePrefix=`challenges/drafts/${id}/release-media-probe/`,canonicalPrefix=`verified-challenge-media/${id}/`;
const created=new Set();let assertions=0,cleanupFailures=0,observedCreated=0,deleted=0;
process.on('uncaughtException',error=>{console.error(JSON.stringify({syntheticTestFailed:true,code:String(error.code||'VERIFICATION_FAILED'),message:error instanceof assert.AssertionError?error.message:'See sanitized stage results; no credential data emitted.'}));process.exitCode=1;});
const check=(value,message)=>{assert.ok(value,message);assertions++;};
async function save(name,bytes,mime){if(created.size>=4)throw Error('FOUR_OBJECT_APPROVAL_LIMIT');const path=sourcePrefix+name;await bucket.file(path).save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:mime,metadata:{firebaseStorageDownloadTokens:randomUUID(),syntheticReleaseProbe:id}}});created.add(path);return path;}
async function denied(path,creator=id){await assert.rejects(()=>verifyChallengeMedia({},id,{coverImagePath:path},creator));assertions++;}
try{
 const bytes=await sharp({create:{width:91,height:137,channels:3,background:'#6a8355'}}).png().toBuffer();
 const expectedCanonical=canonicalPrefix+'images/'+createHash('sha256').update(sourcePrefix+'cover.png').update('\0').update(bytes).digest('hex').slice(0,20)+'.png';
 check(!(await bucket.file(expectedCanonical).exists())[0],'synthetic canonical target does not exist');
 const path=await save('cover.png',bytes,'image/png');
 created.add(expectedCanonical); // This exact absent-before-test path is the verifier's only possible copy.
 const [uploadedMetadata]=await bucket.file(path).getMetadata();
 const tokenUrl=new URL('https://firebasestorage.googleapis.com/v0/b/'+encodeURIComponent(bucket.name)+'/o/'+encodeURIComponent(path));tokenUrl.searchParams.set('alt','media');tokenUrl.searchParams.set('token',uploadedMetadata.metadata.firebaseStorageDownloadTokens);
 const before=await fetch(tokenUrl,{signal:AbortSignal.timeout(20000)});check(before.ok,'synthetic bearer URL works before revocation');await before.arrayBuffer();
 const [original]=await bucket.file(path).download();check(original.equals(bytes),'stored upload equals synthetic bytes');
 const first=await verifyChallengeMedia({},id,{coverImagePath:path},id);
 for(const asset of first.assets){check(asset.path.startsWith(canonicalPrefix),'canonical object stays scoped');created.add(asset.path);}
 check(first.status==='verified'&&first.assets[0].inspected.format==='png','real decoder and verifier succeeded');
 const [sourceMetadata]=await bucket.file(path).getMetadata();check(!sourceMetadata.metadata?.firebaseStorageDownloadTokens,'source token revoked');
 const after=await fetch(tokenUrl,{signal:AbortSignal.timeout(20000)});check(after.status===401||after.status===403,'old synthetic bearer URL rejected after revocation');await after.arrayBuffer();
 const canonical=bucket.file(first.assets[0].path);
 await canonical.setMetadata({metadata:{firebaseStorageDownloadTokens:randomUUID()}});
 await removeDownloadToken(canonical,'syntheticCanonical');
 const [canonicalMetadata]=await canonical.getMetadata();check(!canonicalMetadata.metadata?.firebaseStorageDownloadTokens,'canonical token revoked');
 const retry=await verifyChallengeMedia({},id,{coverImagePath:path},id);check(retry.assets[0].path===first.assets[0].path&&retry.assets[0].sha256===first.assets[0].sha256,'retry reuses exact canonical object');
 await denied(path,id+'-foreign');
 await denied(await save('corrupt.png',Buffer.from('synthetic corrupt image'),'image/png'));
 await denied(await save('mismatch.webp',bytes,'image/webp'));
 await denied(sourcePrefix+'absent.png');
 await assert.rejects(()=>verifyChallengeMedia({},id,{},id));assertions++;
 console.log(JSON.stringify({project:'challenge-suite',syntheticOnly:true,firestoreWrites:false,authWrites:false,assertions,verification:'passed',objectsCreated:created.size}));
}finally{
 for(const path of created){if(!path.startsWith(sourcePrefix)&&!path.startsWith(canonicalPrefix))throw Error('CLEANUP_SCOPE_VIOLATION');try{const file=bucket.file(path);const [existsBefore]=await file.exists();if(!existsBefore)continue;observedCreated++;const [metadata]=await file.getMetadata();await file.delete({ifGenerationMatch:metadata.generation});deleted++;const [exists]=await file.exists();if(exists)throw Error('CLEANUP_NOT_CONFIRMED');}catch{cleanupFailures++;}}
 console.log(JSON.stringify({syntheticCleanupComplete:cleanupFailures===0,objectsCreated:observedCreated,objectsDeleted:deleted,cleanupFailures,creatorObjectsTouched:false}));
 if(cleanupFailures)process.exitCode=1;
}
