import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import { freshNormalChallengeForm } from '../lib/normal-challenge-builder-model.ts';
import { normalFrontendPayload } from '../lib/normal-challenge-frontend.ts';
import { privateBuilderPayload, freshPrivateAccess } from '../lib/private-challenge-builder.ts';
import { withPublishingDefaults } from '../lib/publishing-policy.ts';
import { normalWinnerPercentages, calculateNormalWinnerAmountsCents } from '../lib/normal-challenge-prize-allocation.ts';
assert.match(process.env.GCLOUD_PROJECT ?? '', /^demo-/);
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) assert.match(process.env[key] ?? '', /^127\.0\.0\.1:\d+$/);
Object.assign(process.env, { FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT, NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT, FIREBASE_STORAGE_BUCKET: `${process.env.GCLOUD_PROJECT}.appspot.com`, CHALLENGE_SUITE_USE_FIREBASE_EMULATORS: 'true', PRIVATE_INVITE_ENCRYPTION_KEY: randomBytes(32).toString('base64') });
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT, storageBucket: process.env.FIREBASE_STORAGE_BUCKET }), db = getFirestore(app), bucket = getStorage(app).bucket();
const { POST: create } = await import('../app/api/challenges/drafts/route.ts');
const { POST: createLive } = await import('../app/api/challenges/route.ts');
const { POST: publish } = await import('../app/api/challenges/[id]/publish/route.ts');
const { PATCH: save, GET: restore } = await import('../app/api/challenges/drafts/[id]/route.ts');
const { GET: explore } = await import('../app/api/explore/challenges/route.ts');
const { GET: detail } = await import('../app/api/challenges/[id]/route.ts');
const { GET: publicEvent } = await import('../app/api/live-events/[id]/public/route.ts');
const { POST: createTournament, GET: tournaments } = await import('../app/api/tournaments/route.ts');
const { PATCH: saveTournament, GET: tournamentDetail } = await import('../app/api/tournaments/[id]/route.ts');
const { POST: publishTournament } = await import('../app/api/tournaments/[id]/publish/route.ts');
const { POST: joinTournament } = await import('../app/api/tournaments/[id]/join/route.ts');
const { GET: cases, PATCH: moderate } = await import('../app/api/admin/challenge-reviews/route.ts');
const { POST: report } = await import('../app/api/challenges/[id]/report/route.ts');
const { POST: appeal } = await import('../app/api/challenges/[id]/moderation-appeal/route.ts');
const { PATCH: editPublished } = await import('../app/api/challenges/[id]/published-details/route.ts');
const { PATCH: applicationReview } = await import('../app/api/admin/reviews/route.ts');
const { PATCH: adminOperations } = await import('../app/api/admin/operations/route.ts');
const { recoverPublishedTournamentRegistrations } = await import('../lib/server/tournament-publication.ts');
let assertions = 0;
const eq = (a,b,message) => { assert.deepEqual(a,b,message); assertions++; };
const ctx = id => ({ params: Promise.resolve({ id }) });
const req = (user, body = {}, method = 'POST', url = 'http://localhost/api/test') => new Request(url, { method, headers: { ...(user ? { authorization: `Bearer ${user.token}` } : {}), 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
async function call(handler,user,body,id,method='POST',url) { const response = await handler(req(user,body,method,url),ctx(id)); const json = await response.json(); eq(response.ok && json.ok,true,`${handler.name} HTTP ${response.status} ${json.code} ${json.message} ${JSON.stringify(json.details ?? '')}`); return json.data; }
async function account(label,planId='host',admin=false) { const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`,{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${label}-${randomUUID()}@example.test`,password:'LocalOnly123!',returnSecureToken:true}) });const data=await response.json();await db.collection('users').doc(data.localId).set({role:admin?'admin':'creator',isAdmin:admin,accountStatus:'active',emailVerified:true,planId,planStatus:'active'});return {uid:data.localId,token:data.idToken}; }
const owner=await account('owner'),outsider=await account('other'),admin=await account('admin','host',true);
const bytes=await sharp({create:{width:91,height:137,channels:3,background:'#bba455'}}).webp().toBuffer();
async function media(user=owner,namespace='challenges',options={}) { const path=`${namespace}/drafts/${user.uid}/${namespace==='tournaments'?'cover':'banner'}/${randomUUID()}.webp`;await bucket.file(path).save(options.bytes??bytes,{metadata:{contentType:options.mime??'image/webp'}});return {id:randomUUID(),path,url:`http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`,size:bytes.length,fileName:'cover.webp',contentType:'image/webp'}; }
async function normalPayload(user=owner,winners=1) {const asset=await media(user), form=freshNormalChallengeForm();Object.assign(form,{title:'A creator photography challenge',description:'A clear description of an ordinary creative competition.',category:'Photography',subcategory:'',numberOfWinners:winners,images:[asset],confirmations:{accurate:true,rights:true,review:false}});return {...normalFrontendPayload(form),winnerSplits:[],winnerPrizeAmountsCents:[],submissionInstructionsList:[],challengeGuidelines:'',publishConfirmations:{accurate:true,rights:true,review:false}};}
const at=hours=>new Date(Date.now()+hours*3600000).toISOString();
const published=[];
try {
  for (const winners of [1,2,3]) {
    const payload=await normalPayload(owner,winners), created=await call(create,owner,payload),id=created.challenge.id;
    await call(save,owner,payload,id,'PATCH');eq((await call(restore,owner,{},id,'GET')).challenge.title,payload.title,'draft survives restore');
    const results=await Promise.all([call(publish,owner,payload,id),call(publish,owner,payload,id)]);
    eq(results.every(row=>row.outcome==='published'),true,'duplicate clicks publish idempotently');
    const stored=(await db.collection('challenges').doc(id).get()).data();
    eq(stored.publicationOutcome,'published','publication outcome persisted');eq(stored.status,'scheduled','zero-prize challenge publishes immediately');eq(stored.adminReviewRequired,false,'no editorial dependency');
    eq(stored.winnerSplits,normalWinnerPercentages(winners),'server derives winner shares');eq(stored.winnerPrizeAmountsCents,calculateNormalWinnerAmountsCents(0,winners),'server derives zero amounts');
    eq((await db.collection('challengePublicationEvents').where('challengeId','==',id).get()).size,1,'one publication event');eq((await db.collection('challengeReviewRevisions').where('challengeId','==',id).get()).size,0,'no routine review request');
    eq((await call(explore,null,{},id,'GET','http://localhost/api/explore/challenges')).challenges.some(row=>row.id===id),true,'Explore immediately includes published challenge');
    eq((await detail(req(null,{},'GET'),ctx(id))).status,200,'public detail is accessible');
    eq((await db.collection('challenges').doc(id).get()).data().publishedAt,stored.publishedAt,'refresh preserves publication');published.push({id,payload,stored});
  }
  for (const method of ['invite_link','invitation_code']) {
    const payload={...await normalPayload(),...privateBuilderPayload({...freshPrivateAccess,privateAccessMethod:method,publicPreviewEnabled:true})};const {challenge}=await call(create,owner,payload),id=challenge.id;
    const result=await call(publish,owner,payload,id);eq(result.outcome,'published','Private publishes without approval');
    const vault=await db.collection('privateCredentialVault').doc(id).get();eq(vault.exists,true,'credentials automatically provisioned');eq(vault.data().method,method,'only chosen method provisioned');
    const preview=(await call(explore,null,{},id,'GET','http://localhost/api/explore/challenges?type=private')).challenges.find(row=>row.id===id);eq(Boolean(preview),true,'locked private Explore preview visible');eq(JSON.stringify(preview).includes('credentialCiphertext'),false,'preview never exposes credentials');eq((await detail(req(null,{},'GET'),ctx(id))).status>=400,true,'private full details remain protected');
  }
  const privateOnlyPayload={...await normalPayload(),...privateBuilderPayload({...freshPrivateAccess,privateAccessMethod:'invitation_code',publicPreviewEnabled:false})};
  const privateOnly=(await call(create,owner,privateOnlyPayload)).challenge;
  await call(publish,owner,privateOnlyPayload,privateOnly.id);
  await db.collection('privateChallengeAccess').doc(`${privateOnly.id}_${outsider.uid}`).set({status:'approved'});
  eq((await detail(req(outsider,{},'GET'),ctx(privateOnly.id))).status,200,'approved private participant retains full access without public preview');
  for (const kind of ['attendance_only','attendance_paid','physical_competition']) {
    const asset=await media(),payload={title:'A community live gathering',description:'A clear and welcoming in-person community event.',challengeType:'live_event',builderVersion:'live_event_v2',type:'Live Event',isLiveEvent:true,competitionFormat:'physical_event',category:'Fitness',startsAt:at(48),endsAt:at(52),timeZone:'Africa/Lagos',venueName:'Community hall',eventAddress:'Venue road',eventCity:'Lagos',eventCountry:'NG',eventCapacity:20,maxParticipants:20,capacityMode:'limited',coverImageUrl:asset.url,coverImagePath:asset.path,challengeImages:[asset],prizeType:'bragging_rights',prizeValue:0,hostOperations:{schemaVersion:2,eventFormat:kind==='physical_competition'?kind:'attendance_only',timezone:'Africa/Lagos',ticketPrice:kind==='attendance_paid'?10:0,competitorCapacity:kind==='physical_competition'?4:0,physicalJudgeCount:1,winnerCount:1,detailsConfirmed:true,mediaRightsConfirmed:true},publish:false};
    const {challenge}=await call(createLive,owner,payload);await call(save,owner,payload,challenge.id,'PATCH');const result=await call(publish,owner,payload,challenge.id);eq(result.outcome,'published',`${kind} published`);const page=await call(publicEvent,null,{},challenge.id,'GET');eq(page.event.paidCheckoutAvailable,false,'unavailable payment infrastructure stays disabled');eq((await call(explore,null,{},challenge.id,'GET','http://localhost/api/explore/challenges')).challenges.some(row=>row.id===challenge.id),true,'Live Event Explore visibility');
  }
  const liveRows=(await call(explore,null,{},null,'GET','http://localhost/api/explore/challenges?type=live_event')).challenges;
  for(const row of liveRows) {
    eq(row.cta.href,`/live-events/${row.id}`,'Live Explore CTA opens the canonical event information route');
    eq(['Buy Ticket','Register for Event'].includes(row.cta.label),false,'Explore does not imply unavailable booking is operational');
  }
  const tournamentIds=[];
  for(const participationMode of ['individual','team']) {
    const asset=await media(owner,'tournaments'),payload={title:'An open bracket competition',description:'A complete legitimate Tournament with optional media omitted.',category:'Gaming',format:'single_elimination',participationMode,participantCapacity:4,minimumTeamSize:2,maximumTeamSize:3,teamJoiningMode:'invite_and_requests',entryType:'free',basePrizeAmountMinor:0,submissionDurationHours:12,votingDurationHours:12,coverImageUrl:asset.url,coverImagePath:asset.path,status:'draft'};
    const {tournament}=await call(createTournament,owner,payload),id=tournament.id;await call(saveTournament,owner,{description:payload.description},id,'PATCH');eq((await call(tournamentDetail,owner,{},id,'GET',`http://localhost/api/tournaments/${id}?view=builder`)).tournament.title,payload.title,'Tournament restore');
    await Promise.all([call(publishTournament,owner,{},id),call(publishTournament,owner,{},id)]);const stored=(await db.collection('tournaments').doc(id).get()).data();eq(stored.status,'scheduled','scheduler unavailable does not block public publication');eq(stored.registrationAvailability,'temporarily_unavailable','registration remains disabled');eq((await call(tournaments,null,{},id,'GET','http://localhost/api/tournaments')).tournaments.some(row=>row.id===id),true,'public Tournament listing');eq((await tournamentDetail(req(null,{},'GET'),ctx(id))).status,200,'public Tournament detail');eq((await db.collection('tournamentReviewRequests').where('tournamentId','==',id).get()).size,0,'no editorial review request');eq((await joinTournament(req(outsider,{}),ctx(id))).status>=400,true,'registration fails closed');
    eq((await recoverPublishedTournamentRegistrations(db)).recovered,0,'missing scheduler readiness does not unlock registration');tournamentIds.push(id);
  }
  const project=process.env.GCLOUD_PROJECT, schedulerEnv={GOOGLE_CLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT_NUMBER:'123456789012',GOOGLE_WORKLOAD_IDENTITY_POOL_ID:'local-pool',GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'local-provider',CLOUD_TASKS_LOCATION:'us-central1',TOURNAMENT_CLOUD_TASKS_QUEUE:'local-fixture',TOURNAMENT_CLOUD_TASKS_WORKER_URL:'https://scheduler.example.test/worker',TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT:`enqueuer@${project}.iam.gserviceaccount.com`,TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT:`invoker@${project}.iam.gserviceaccount.com`,TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED:'true',TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED:'true',TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE:'https://scheduler.example.test/reconciler'};
  for (const id of tournamentIds) {
    const listing = await call(explore,null,{},id,'GET','http://localhost/api/explore/challenges?type=tournament&q=open');
    eq(listing.challenges.some(row=>row.id===id),true,'Tournament appears in unified Explore type/search');
  }
  const seen = new Set(); let cursor;
  for (let page=0;page<30;page++) {
    const listing=await call(explore,null,{},null,'GET',`http://localhost/api/explore/challenges?limit=2${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
    for(const row of listing.challenges){eq(seen.has(row.id),false,'federated pagination never duplicates records');seen.add(row.id);}
    cursor=listing.nextCursor;if(!cursor)break;
  }
  eq(tournamentIds.every(id=>seen.has(id)),true,'federated pagination reaches both Tournament sources');
  const previousEnv=Object.fromEntries(Object.keys(schedulerEnv).map(key=>[key,process.env[key]]));Object.assign(process.env,schedulerEnv);
  eq((await recoverPublishedTournamentRegistrations(db)).recovered,0,'configuration alone is not verified scheduling');
  await db.collection('operationalReadiness').doc('tournament_scheduler').set({status:'verified',verifiedAt:new Date().toISOString(),evidence:'isolated deterministic readiness fixture'});
  eq((await recoverPublishedTournamentRegistrations(db)).recovered>=2,true,'restored verified scheduler automatically opens both Tournament modes');eq((await recoverPublishedTournamentRegistrations(db)).recovered,0,'registration recovery is idempotent');
  for(const id of tournamentIds)eq((await db.collection('tournaments').doc(id).get()).data().status,'registration_open','authoritative registration reopened without Admin');
  await db.collection('operationalReadiness').doc('tournament_scheduler').update({verifiedAt:new Date(Date.now()-16*60_000).toISOString()});
  const staleView=await call(tournamentDetail,null,{},tournamentIds[0],'GET');
  eq(staleView.tournament.registrationAvailability,'temporarily_unavailable','stale scheduler health is accurately shown on public detail');
  eq((await joinTournament(req(outsider,{}),ctx(tournamentIds[0]))).status,503,'stale health cannot activate registration');
  await db.collection('operationalReadiness').doc('tournament_scheduler').update({verifiedAt:new Date().toISOString()});
  eq((await call(tournamentDetail,null,{},tournamentIds[0],'GET')).tournament.registrationAvailability,'open','fresh health restores accurate availability without editorial action');
  for(const[key,value]of Object.entries(previousEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  const missing=await normalPayload(),{challenge:funded}=await call(create,owner,{...missing,prizeValue:5,prizeType:'money'});let r=await publish(req(owner,{...missing,prizeValue:5}),ctx(funded.id));eq(r.status,409,'missing positive Base Prize funding blocked');
  await db.collection('creatorPrizeFundingPayments').doc(randomUUID()).set({challengeId:funded.id,userId:owner.uid,amountCents:500,currency:'USD',paymentPurpose:'prize_pool_funding',status:'confirmed',webhookConfirmed:true});
  eq((await call(publish,owner,{...missing,prizeValue:5},funded.id)).outcome,'published','confirmed ledger funding works with stale summary');
  const refundedPayload={...await normalPayload(),prizeType:'money',prizeValue:5}, refunded=(await call(create,owner,refundedPayload)).challenge;
  await db.collection('creatorPrizeFundingPayments').doc(randomUUID()).set({challengeId:refunded.id,userId:owner.uid,amountCents:500,currency:'USD',paymentPurpose:'prize_pool_funding',status:'confirmed',webhookConfirmed:true,refundStatus:'succeeded'});
  eq((await publish(req(owner,refundedPayload),ctx(refunded.id))).status>=400,true,'refunded provider-confirmed money cannot fund publication');
  eq((await db.collection('challenges').doc(refunded.id).get()).data().status,'draft','invalid financial commitment never persists publication');
  for(const invalid of [{asset:await media(outsider),label:'foreign ownership'},{asset:await media(owner,'challenges',{bytes:Buffer.from('corrupt'),mime:'image/webp'}),label:'corrupt decoding'},{asset:await media(owner,'challenges',{mime:'image/png'}),label:'MIME mismatch'}]) {const p=await normalPayload(),{challenge}=await call(create,owner,p);r=await publish(req(owner,{...p,coverImagePath:invalid.asset.path,coverImageUrl:invalid.asset.url,challengeImages:[invalid.asset]}),ctx(challenge.id));eq(r.status>=400,true,invalid.label);eq((await db.collection('challenges').doc(challenge.id).get()).data().status,'draft','failed media never publishes');}
  eq((await publish(req(null,{}),ctx(published[0].id))).status,401,'authentication required');eq((await publish(req(outsider,published[0].payload),ctx(published[0].id))).status,403,'foreign creator denied');
  const holdPayload=await normalPayload(),{challenge:held}=await call(create,owner,holdPayload);await db.collection('challenges').doc(held.id).update({safetyHold:true});eq((await call(publish,owner,holdPayload,held.id)).outcome,'held_for_moderation','only existing credible restriction holds');eq((await db.collection('challenges').doc(held.id).get()).data().publishedAt??null,null,'held draft remains unpublished');
  await db.collection('challenges').doc(held.id).update({fraudConfirmed:true});
  const heldCaseId=`challenges_${held.id}`, heldCase=(await db.collection('challengeModerationCases').doc(heldCaseId).get()).data();
  await call(moderate,admin,{caseId:heldCaseId,action:'release',reason:'Investigation resolved the content fraud concern.',confirmed:true,expectedUpdatedAt:heldCase.updatedAt},null,'PATCH');
  eq((await db.collection('challenges').doc(held.id).get()).data().fraudConfirmed,false,'explicit investigated release resolves the content flag without changing account restrictions');
  eq((await call(publish,owner,holdPayload,held.id)).outcome,'published','resolved unpublished draft can publish without recurring on its resolved flag');
  const target=published[0];await call(report,outsider,{reason:'A specific safety concern for human investigation.'},target.id);eq((await detail(req(null,{},'GET'),ctx(target.id))).status,200,'an unverified report does not remove ordinary content');
  const queue=await call(cases,admin,{},null,'GET','http://localhost/api/admin/challenge-reviews'),entry=queue.cases.find(row=>row.targetId===target.id);eq(Boolean(entry),true,'report enters exception queue');eq((await cases(req(owner,{},'GET'))).status,403,'creator cannot inspect private moderation cases');
  await call(moderate,admin,{caseId:entry.id,action:'hold',reason:'Credible evidence reviewed by the administrator.',confirmed:true,expectedUpdatedAt:entry.updatedAt},null,'PATCH');eq((await detail(req(null,{},'GET'),ctx(target.id))).status>=400,true,'moderation hold blocks public detail');await call(appeal,owner,{reason:'Please investigate this restriction and the supplied context.'},target.id);eq((await db.collection('appeals').where('targetId','==',target.id).get()).size,1,'creator appeal recorded');
  eq((await detail(req(outsider,{},'GET'),ctx(target.id))).status,404,'signed-in non-owner cannot bypass moderation hold');
  const freshCase=(await db.collection('challengeModerationCases').doc(entry.id).get()).data();await call(moderate,admin,{caseId:entry.id,action:'release',reason:'The investigation resolved the reported concern.',confirmed:true,expectedUpdatedAt:freshCase.updatedAt},null,'PATCH');eq((await detail(req(null,{},'GET'),ctx(target.id))).status,200,'resolved restriction restores verified publication');
  const current=(await db.collection('challenges').doc(target.id).get()).data();await call(editPublished,owner,{title:'An updated published title',description:'An updated harmless description for the published event.',expectedUpdatedAt:current.updatedAt,reason:'Clarify the description.'},target.id,'PATCH');eq((await db.collection('challenges').doc(target.id).get()).data().title,'An updated published title','harmless edit immediate');eq((await editPublished(req(owner,{prizeValue:500,expectedUpdatedAt:current.updatedAt},'PATCH'),ctx(target.id))).status>=400,true,'financial edit cannot use promotional route');
  const replacement=await media(), beforeReplacement=(await db.collection('challenges').doc(target.id).get()).data();
  await call(editPublished,owner,{coverImagePath:replacement.path,coverImageUrl:replacement.url,challengeImages:[replacement],expectedUpdatedAt:beforeReplacement.updatedAt},target.id,'PATCH');
  const replaced=(await db.collection('challenges').doc(target.id).get()).data();
  eq(replaced.coverImagePath!==beforeReplacement.coverImagePath,true,'replacement image is independently verified and persisted');
  const corrupt=await media(owner,'challenges',{bytes:Buffer.from('corrupt replacement')});
  eq((await editPublished(req(owner,{coverImagePath:corrupt.path,coverImageUrl:corrupt.url,challengeImages:[corrupt],expectedUpdatedAt:replaced.updatedAt},'PATCH'),ctx(target.id))).status,422,'invalid promotional media fails closed');
  eq((await db.collection('challenges').doc(target.id).get()).data().coverImagePath,replaced.coverImagePath,'invalid replacement preserves prior verified cover');
  eq((await moderate(req(admin,{id:target.id,action:'approve',confirmed:true},'PATCH'))).status,410,'obsolete editorial endpoint retired');
  const legacy=await normalPayload(),{challenge:pending}=await call(create,owner,legacy);await db.collection('challenges').doc(pending.id).update({status:'pending_review'});eq((await publish(req(owner,legacy),ctx(pending.id))).status,409,'historical pending records require dry-run remediation');
  eq(withPublishingDefaults({builderVersion:'normal_v3',numberOfWinners:2,prizeValue:10}).winnerPrizeAmountsCents,[700,300],'two-winner allocation exact');
  const free=await account('free','free'),freeDrafts=[];
  for(let index=0;index<3;index++){const payload=await normalPayload(free);freeDrafts.push({payload,id:(await call(create,free,payload)).challenge.id});}
  eq((await call(publish,free,freeDrafts[0].payload,freeDrafts[0].id)).outcome,'published','free zero-prize entitlement works');
  {const payload=await normalPayload(free);freeDrafts.push({payload,id:(await call(create,free,payload)).challenge.id});}
  for(const draft of freeDrafts.slice(1,3))eq((await call(publish,free,draft.payload,draft.id)).outcome,'published','free zero-prize entitlement works');
  eq((await publish(req(free,freeDrafts[3].payload),ctx(freeDrafts[3].id))).status,409,'fourth lifetime free publication refused');
  const sponsorApplicant=await account('sponsor-applicant');
  await db.collection('sponsorProfiles').doc(sponsorApplicant.uid).set({sponsorVerificationStatus:'pending_review'});
  await call(applicationReview,admin,{type:'sponsor',id:sponsorApplicant.uid,action:'approve',confirmed:true,reason:'Verified application evidence.'},null,'PATCH');
  eq((await db.collection('sponsorProfiles').doc(sponsorApplicant.uid).get()).data().sponsorVerificationStatus,'approved','Sponsor application approval remains operational');
  const enterpriseApplicant=await account('enterprise-applicant'), applicationId=randomUUID();
  await db.collection('enterpriseInquiries').doc(applicationId).set({applicationType:'enterprise_access_application',userId:enterpriseApplicant.uid,status:'pending',version:1,timeline:[]});
  await call(adminOperations,admin,{type:'enterprise',id:applicationId,action:'approve',expectedVersion:1,enterpriseRole:'operations',enterpriseScope:'assigned_only',confirmed:true,reason:'Verified Enterprise application evidence.'},null,'PATCH');
  eq((await db.collection('enterpriseInquiries').doc(applicationId).get()).data().status,'approved','Enterprise application approval remains operational');
  eq((await db.collection('users').doc(enterpriseApplicant.uid).get()).data().staffAccess.status,'active','approved Enterprise access is still provisioned');
  console.log(`PASS automatic publishing: ${assertions} actual handler/storage/Firestore assertions across Normal, Private, Tournament and both Live formats; funding, media, concurrency, discovery, moderation, appeals, editing and unchanged Sponsor/Enterprise application approvals.`);
} finally { await deleteApp(app); }
