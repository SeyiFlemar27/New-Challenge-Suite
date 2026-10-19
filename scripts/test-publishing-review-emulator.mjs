import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import { freshNormalChallengeForm } from '../lib/normal-challenge-builder-model.ts';
import { normalFrontendPayload } from '../lib/normal-challenge-frontend.ts';
import { privateBuilderPayload, freshPrivateAccess } from '../lib/private-challenge-builder.ts';
assert.match(process.env.GCLOUD_PROJECT??'',/^demo-/);
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'])assert.match(process.env[key]??'',/^127\.0\.0\.1:\d+$/);
Object.assign(process.env,{FIREBASE_PROJECT_ID:process.env.GCLOUD_PROJECT,NEXT_PUBLIC_FIREBASE_PROJECT_ID:process.env.GCLOUD_PROJECT,FIREBASE_STORAGE_BUCKET:`${process.env.GCLOUD_PROJECT}.appspot.com`,CHALLENGE_SUITE_USE_FIREBASE_EMULATORS:'true',PRIVATE_INVITE_ENCRYPTION_KEY:randomBytes(32).toString('base64')});
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT,storageBucket:process.env.FIREBASE_STORAGE_BUCKET}),db=getFirestore(app),bucket=getStorage(app).bucket();
const {POST:create}=await import('../app/api/challenges/drafts/route.ts');
const {POST:createLive}=await import('../app/api/challenges/route.ts');
const {POST:publish}=await import('../app/api/challenges/[id]/publish/route.ts');
const {PATCH:save,GET:restore}=await import('../app/api/challenges/drafts/[id]/route.ts');
const {GET:queue,PATCH:decision}=await import('../app/api/admin/challenge-reviews/route.ts');
const {POST:createTournament}=await import('../app/api/tournaments/route.ts');
const {PATCH:editTournament}=await import('../app/api/tournaments/[id]/route.ts');
const {GET:publicEvent}=await import('../app/api/live-events/[id]/public/route.ts');
const {GET:explore}=await import('../app/api/explore/challenges/route.ts');
const {GET:listTournaments}=await import('../app/api/tournaments/route.ts');
const {POST:joinTournament}=await import('../app/api/tournaments/[id]/join/route.ts');
const {isPublicChallenge}=await import('../lib/server/public-challenge.ts');
const {isPublicPrivatePreviewRecord}=await import('../lib/server/challenge-media-delivery.ts');
const {isPublishedTournament}=await import('../lib/server/tournament-public-policy.ts');
const {listChallengeReviews}=await import('../lib/server/challenge-admin-review.ts');
const {challengeReviewBuilderDestination,notificationDestination}=await import('../lib/notification-navigation.ts');
let assertions=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);assertions++;};
const ctx=id=>({params:Promise.resolve({id})});
const req=(user,body,method='POST',url='http://localhost/api/test')=>new Request(url,{method,headers:{...(user?{authorization:`Bearer ${user.token}`} :{}),'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
async function call(handler,user,body,id,method='POST',url){const r=await handler(req(user,body,method,url),ctx(id));const j=await r.json();eq(r.ok&&j.ok,true,`${handler.name} HTTP ${r.status}: ${j.code} ${j.message} ${JSON.stringify(j.details??'')}`);return j.data;}
async function createRetried(handler,body,field){const key=randomUUID();const invoke=async()=>{const request=req(owner,body);request.headers.set('x-challenge-creation-key',key);const response=await handler(request);const result=await response.json();eq(response.ok&&result.ok,true,`concurrent creation HTTP ${response.status} ${result.code??''}`);return result.data;};const pair=await Promise.all([invoke(),invoke()]);eq(pair[0][field].id,pair[1][field].id,'concurrent creation retries recover one record');return pair[0];}
async function account(label,admin=false){const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${label}-${randomUUID()}@example.test`,password:'LocalOnly123!',returnSecureToken:true})});const j=await r.json();await db.collection('users').doc(j.localId).set({role:admin?'admin':'creator',isAdmin:admin,accountStatus:'active',emailVerified:true,planId:'host',planStatus:'active'});return {uid:j.localId,token:j.idToken};}
const owner=await account('owner'),admin=await account('admin',true),outsider=await account('outsider');
const bytes=await sharp({create:{width:120,height:80,channels:3,background:'#bba455'}}).png().toBuffer();
async function media(namespace='challenges'){const path=namespace==='tournaments'?`tournaments/drafts/${owner.uid}/cover/${randomUUID()}.png`:`challenges/drafts/${owner.uid}/banner/${randomUUID()}.png`;await bucket.file(path).save(bytes,{metadata:{contentType:'image/png'}});return {id:randomUUID(),path,url:`http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`,size:bytes.length,fileName:'cover.png',contentType:'image/png'};}
try{
  eq((await queue(req(owner,{},'GET','http://localhost/api/admin/challenge-reviews'))).status,403,'creator cannot list reviews');
  for(const kind of ['normal','private','attendance_only','physical_competition'])for(const action of ['approve','reject','request_changes']){
    const asset=await media();const form=freshNormalChallengeForm();Object.assign(form,{title:`${kind} ${action} valid review`,description:'A legitimate isolated publishing and review regression fixture.',category:'Fitness',subcategory:'Strength',confirmations:{accurate:true,rights:true,review:true},images:[asset]});
    let payload={...normalFrontendPayload(form),...(kind==='private'?privateBuilderPayload({...freshPrivateAccess,privateAccessMethod:'invitation_code',publicPreviewEnabled:true}):{})};
    const live=['attendance_only','physical_competition'].includes(kind);
    if(live){const at=hours=>new Date(Date.now()+hours*3600000).toISOString();Object.assign(payload,{challengeType:'live_event',builderVersion:'live_event_v2',type:'Live Event',isLiveEvent:true,competitionFormat:'physical_event',startsAt:at(48),endsAt:at(52),submissionDeadline:'',votingDeadline:'',acceptedSubmissionTypes:[],venueName:'Local fixture hall',eventAddress:'Fixture road',eventCity:'Lagos',eventCountry:'NG',eventCapacity:20,maxParticipants:20,capacityMode:'limited',coverImageUrl:asset.url,coverImagePath:asset.path,challengeImages:[asset],prizeType:'bragging_rights',prizeValue:0,hostOperations:{schemaVersion:2,eventFormat:kind,timezone:'Africa/Lagos',eventRules:['Respect others'],registrationOpensAt:at(1),registrationClosesAt:at(47),checkInStartAt:at(47),checkInEndAt:at(50),ticketPrice:0,competitionEntryFee:0,competitorCapacity:kind==='physical_competition'?4:0,physicalJudgeCount:1,winnerCount:1,admissionRefundPolicy:'standard',detailsConfirmed:true,mediaRightsConfirmed:true}});}
    const created=live?await createRetried(createLive,payload,'challenge'):await call(create,owner,payload);const id=created.challenge.id;
    const replacement=await media();payload={...payload,challengeImages:[replacement],coverImageUrl:replacement.url,coverImagePath:replacement.path};
    await call(save,owner,payload,id,'PATCH');await call(restore,owner,{},id,'GET');
    if(kind==='normal'&&action==='approve'){
      const missingPath=`challenges/drafts/${owner.uid}/banner/${randomUUID()}.png`;
      const absent={...replacement,path:missingPath,url:`http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket.name}/o/${encodeURIComponent(missingPath)}?alt=media`};
      const foreignPath=`challenges/drafts/${outsider.uid}/banner/${randomUUID()}.png`;
      const foreign={...replacement,path:foreignPath,url:`http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket.name}/o/${encodeURIComponent(foreignPath)}?alt=media`};
      for(const invalid of [{...payload,challengeImages:[absent],coverImagePath:absent.path,coverImageUrl:absent.url},{...payload,challengeImages:[foreign],coverImagePath:foreign.path,coverImageUrl:foreign.url},{...payload,challengeImages:[],coverImagePath:'',coverImageUrl:''}]){
        const rejected=await publish(req(owner,invalid),ctx(id));eq(rejected.status>=400&&rejected.status<500,true,'invalid/missing/unowned media has a client-actionable rejection');eq((await db.collection('challenges').doc(id).get()).data().status,'draft','failed publication never creates a pending review state');
      }
      eq((await publish(req(outsider,payload),ctx(id))).status,403,'foreign creator cannot submit draft');
      eq((await publish(req(null,payload),ctx(id))).status,401,'expired or absent authentication cannot submit draft');
      await Promise.all([call(publish,owner,payload,id),call(publish,owner,payload,id)]);
      eq((await db.collection('challengeReviewRevisions').where('challengeId','==',id).get()).size,1,'concurrent submissions produce one review revision');
    }else await call(publish,owner,payload,id);
    const stored=(await db.collection('challenges').doc(id).get()).data();
    eq(stored.status,'pending_review',`${kind} durable pending state`);eq(isPublicChallenge(id,stored),false,'not discoverable before review');
    const discoveryUrl=`http://localhost/api/explore/challenges?type=${kind==='private'?'private':''}`;
    eq((await call(explore,null,{},id,'GET',discoveryUrl)).challenges.some(row=>row.id===id),false,'actual Explore endpoint excludes pending submission');
    if(live)eq((await publicEvent(req(null,{},'GET'),ctx(id))).status,404,'unapproved Live Event is not public');
    const page=await call(queue,admin,{},id,'GET',`http://localhost/api/admin/challenge-reviews?q=${id}`);eq(page.rows.some(r=>r.id===id),true,'exact submission appears in unified queue');
    const details=await call(queue,admin,{},id,'GET',`http://localhost/api/admin/challenge-reviews?id=${id}`);eq(details.kind,live?'live_event':kind,'review shows correct type');
    eq((await decision(req(owner,{id,action,reason:'Unauthorized creator request',confirmed:true},'PATCH'))).status,403,'creator cannot make review decision');
    if(action!=='approve')eq((await decision(req(admin,{id,action,reason:'',confirmed:true},'PATCH'))).status,422,'reason is required');
    if(kind==='normal'&&action==='approve')await db.collection('challengeMediaVerifications').doc(id).delete();
    eq((await decision(req(admin,{id,action,reason:'Confirmation missing'},'PATCH'))).status,422,'explicit review confirmation is mandatory');
    const input={id,action,reason:'Inspected complete isolated submission',confirmed:true,expectedUpdatedAt:stored.updatedAt};
    await call(decision,admin,input,id,'PATCH');await call(decision,admin,input,id,'PATCH');
    const after=(await db.collection('challenges').doc(id).get()).data();
    eq((await call(explore,null,{},id,'GET',discoveryUrl)).challenges.some(row=>row.id===id),action==='approve','actual Explore eligibility follows Admin decision');
    if(kind==='normal'&&action==='approve')eq((await db.collection('challengeMediaVerifications').doc(id).get()).data()?.status,'verified','legacy verification recovery reinspects stored media');
    eq((await db.collection('challengeReviewDecisions').where('challengeId','==',id).get()).size,1,'one durable decision after duplicate retry');
    const notices=await db.collection('notifications').where('targetId','==',id).get();eq(notices.size,2,'one submission and one decision notification');
    eq(notices.docs.some(doc=>doc.data().actionUrl===challengeReviewBuilderDestination(stored,id)),true,'submission notice links to the correct existing builder');
    eq(notices.docs.every(doc=>!String(doc.data().actionUrl).includes('/preview')),true,'feedback never links to a nonexistent preview route');
    if(action==='approve'){eq(after.adminApprovalStatus,'approved','approval persisted');eq(kind==='private'?isPublicPrivatePreviewRecord(after):isPublicChallenge(id,after),true,'approved eligible discovery');if(live)eq((await publicEvent(req(null,{},'GET'),ctx(id))).status,200,'approved public event endpoint works');}
    else{eq(isPublicChallenge(id,after),false,'non-approval stays private');
      // Preserve exact verified media on restore: this previously failed URL/path validation.
      payload={...payload,challengeImages:after.challengeImages,coverImageUrl:after.coverImageUrl,coverImagePath:after.coverImagePath};
      await call(save,owner,payload,id,'PATCH');await call(publish,owner,payload,id);
      eq((await db.collection('challenges').doc(id).get()).data().status,'pending_review','controlled resubmission');
    }
  }
  for(const action of ['approve','reject','request_changes']){
    const asset=await media('tournaments');const body={configVersion:3,title:`Tournament ${action} review`,description:'An actual Tournament draft created with a verified stored image and approved rules.',category:'Gaming',subcategory:'Console',tournamentRules:['Respect competitors'],participantCapacity:4,participationMode:'individual',format:'single_elimination',entryType:'free',basePrizeAmountMinor:0,submissionDurationHours:12,votingDurationHours:12,coverImagePath:asset.path,coverImageUrl:asset.url,status:'draft'};
    const created=await createRetried(createTournament,body,'tournament');const id=created.tournament.id;
    await call(editTournament,owner,{status:'pending_review'},id,'PATCH');
    await call(editTournament,owner,{status:'pending_review'},id,'PATCH');
    eq((await db.collection('tournamentReviewRequests').where('tournamentId','==',id).get()).size,2,'repeated submission keeps only canonical request and revision history');
    const stored=(await db.collection('tournaments').doc(id).get()).data();eq(stored.status,'pending_review','Tournament durable review state');eq(isPublishedTournament(stored),false,'unapproved Tournament hidden');
    eq((await call(listTournaments,null,{},id,'GET','http://localhost/api/tournaments')).tournaments.some(row=>row.id===id),false,'actual Tournament discovery excludes pending record');
    const page=await call(queue,admin,{},id,'GET',`http://localhost/api/admin/challenge-reviews?kind=tournament&q=${id}`);eq(page.rows.some(r=>r.id===id),true,'Tournament appears beside challenges');
    const reviewDetail=await call(queue,admin,{},id,'GET',`http://localhost/api/admin/challenge-reviews?source=tournaments&id=${id}`);
    eq(Array.isArray(reviewDetail.record.roundPlan),true,'Tournament review exposes its actual round plan');
    eq(reviewDetail.record.format,'single_elimination','Tournament review preserves competition format');
    const input={id,source:'tournaments',action,reason:'Inspected actual Tournament fixture',confirmed:true};await call(decision,admin,input,id,'PATCH');await call(decision,admin,input,id,'PATCH');
    const after=(await db.collection('tournaments').doc(id).get()).data();eq(after.reviewStatus,action==='approve'?'approved':action==='reject'?'rejected':'changes_requested','distinct Tournament decisions');eq(isPublishedTournament(after),action==='approve','Tournament discovery follows approval');
    const notices=await db.collection('notifications').where('targetId','==',id).get();eq(notices.docs.every(doc=>notificationDestination(doc.data())!=='/notifications/unavailable'),true,'Tournament review notices have usable destinations');
    eq((await call(listTournaments,null,{},id,'GET','http://localhost/api/tournaments')).tournaments.some(row=>row.id===id),action==='approve','actual Tournament discovery follows Admin decision');
    if(action!=='approve'){await call(editTournament,owner,{status:'pending_review'},id,'PATCH');eq((await db.collection('tournaments').doc(id).get()).data().status,'pending_review','Tournament resubmits without recreation');
      if(action==='request_changes'){
        const previousMode=process.env.NODE_ENV;process.env.NODE_ENV='production';
        try{const approval={id,source:'tournaments',action:'approve',confirmed:true,reason:'Editorial approval independent of scheduling'};
          await call(decision,admin,approval,id,'PATCH');await call(decision,admin,approval,id,'PATCH');
          const held=(await db.collection('tournaments').doc(id).get()).data();eq(held.reviewStatus,'approved','production-mode editorial approval persists');eq(held.status,'scheduled','unready approval cannot open registration');eq(held.publicationHoldReason,'scheduler_unavailable','hold is explicit');eq(isPublishedTournament(held),false,'held Tournament is not publicly discoverable');
          eq((await decision(req(admin,{...approval,openRegistration:true},'PATCH'))).status,503,'registration release requires actual scheduler configuration');
          eq((await joinTournament(req(outsider,{rulesAccepted:true}),ctx(id))).status,503,'unready registration endpoint remains fail closed');
          // Syntax-valid DEMO configuration fixture only. No task dispatch, IAM,
          // queue provisioning, or successful production worker execution is claimed.
          const project=process.env.GCLOUD_PROJECT;const fixture={GOOGLE_CLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT_NUMBER:'123456789012',CLOUD_TASKS_LOCATION:'us-central1',TOURNAMENT_CLOUD_TASKS_QUEUE:'fixture-only',TOURNAMENT_CLOUD_TASKS_WORKER_URL:'https://example.test/worker',GOOGLE_WORKLOAD_IDENTITY_POOL_ID:'fixture-pool',GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'fixture-provider',TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT:`enqueuer@${project}.iam.gserviceaccount.com`,TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT:`invoker@${project}.iam.gserviceaccount.com`,TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED:'true',TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED:'true',TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE:'https://example.test/recovery'};
          const saved=Object.fromEntries(Object.keys(fixture).map(key=>[key,process.env[key]]));
          try{Object.assign(process.env,fixture);await call(decision,admin,{...approval,openRegistration:true},id,'PATCH');await call(decision,admin,{...approval,openRegistration:true},id,'PATCH');const released=(await db.collection('tournaments').doc(id).get()).data();eq(released.status,'registration_open','explicit confirmed release uses configured readiness fixture');eq(released.publicationHoldReason,null,'release clears only its scheduling publication hold');eq((await db.collection('tournamentAuditEvents').where('tournamentId','==',id).where('action','==','tournament_registration_opened').get()).size,1,'registration release is independently audited exactly once');}finally{for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
        }finally{if(previousMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousMode;}
      }
    }
  }
  const marker=`pagination-${randomUUID()}`,batch=db.batch();
  const expectedIds=Array.from({length:60},(_,index)=>`${marker}-${String(index).padStart(3,'0')}`);
  for(const id of expectedIds)batch.create(db.collection('tournaments').doc(id),{id,title:marker,hostId:owner.uid,status:'pending_review',submittedAt:new Date().toISOString()});
  await batch.commit();let cursor=null;const seen=new Set();let pageCount=0;
  do{const params=new URLSearchParams({kind:'tournament',q:marker});if(cursor)params.set('cursor',cursor);const result=await call(queue,admin,{},undefined,'GET',`http://localhost/api/admin/challenge-reviews?${params}`);for(const row of result.rows){eq(seen.has(row.id),false,'pagination never duplicates a review record');seen.add(row.id);}cursor=result.nextCursor;if(++pageCount>10)throw new Error('Review pagination did not terminate');}while(cursor);
  eq([...seen].sort(),expectedIds.sort(),'all submissions remain reachable across cursor pages');eq(pageCount>1,true,'actual queue exercises multiple pages');
  const originalCollection=db.collection;
  try{db.collection=function(path){if(path==='challenges')throw Object.assign(new Error('Injected index/query failure'),{code:9});return originalCollection.call(this,path);};const unavailable=await queue(req(admin,{},'GET','http://localhost/api/admin/challenge-reviews'));eq(unavailable.status,503,'actual Admin API never reports a failed query as an empty queue');eq((await unavailable.json()).code,'REVIEW_QUERY_UNAVAILABLE','query failure has an actionable stable code');}finally{db.collection=originalCollection;}
  await assert.rejects(()=>listChallengeReviews({collection:()=>({orderBy:()=>({limit:()=>({get:async()=>{throw new Error('FAILED_PRECONDITION index required');}})})})},{}),/index required/);assertions++;
  const pending=await db.collection('challenges').where('status','==','pending_review').get();const target=pending.docs[0];const data=target.data();const concurrent=await Promise.all([decision(req(admin,{id:target.id,action:'approve',reason:'Concurrent review one',confirmed:true},'PATCH')),decision(req(admin,{id:target.id,action:'reject',reason:'Concurrent review two',confirmed:true},'PATCH'))]);eq(concurrent.filter(r=>r.status===200).length,1,'conflicting concurrent decisions have one winner');eq(concurrent.filter(r=>r.status===409).length,1,'other decision is stale');
  eq((await db.collection('challenges').doc(target.id).get()).exists,true,'no records deleted');
  console.log(`Publishing-to-Admin-review actual handlers: ${assertions} assertions passed across Normal, Private, Tournament, Attendance Only and Physical Competition. No live providers used.`);
}finally{await deleteApp(app);}
