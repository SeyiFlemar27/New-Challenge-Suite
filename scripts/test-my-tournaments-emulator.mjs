import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
assert.match(process.env.GCLOUD_PROJECT??'',/^demo-/);
for(const name of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST'])assert.match(process.env[name]??'',/^127\.0\.0\.1:\d+$/);
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT}),db=getFirestore(app);
const {GET}=await import('../app/api/me/tournaments/route.ts');
const {orderTournamentParticipation}=await import('../lib/tournament-smart-priority.ts');
const seed='my_tournaments_'+randomUUID();let assertions=0;const equal=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:seed+'@example.test',password:'DemoOnly123!',returnSecureToken:true})});const user=await response.json();assert.ok(user.idToken);
const headers={authorization:'Bearer '+user.idToken};
const request=(query='')=>new Request('http://localhost/api/me/tournaments'+query,{headers});
async function history(){const items=[];let cursor='',batches=0;do{const result=await GET(request('?cursor='+encodeURIComponent(cursor)));equal(result.status,200,'history batch authorized');const body=await result.json();items.push(...body.data.tournaments);batches++;if(!body.data.hasMoreScans)break;cursor=body.data.nextScanCursor;assert.ok(batches<20,'scan advances');}while(true);return {data:{tournaments:orderTournamentParticipation(items)},batches};}
try{
  equal((await GET(new Request('http://localhost/api/me/tournaments'))).status,401,'anonymous denied');
  await db.collection('users').doc(user.localId).set({accountStatus:'active',role:'user',emailVerified:true});
  for(const [index,kind]of ['waiting','urgent','later','completed'].entries()){
    const id=seed+'_'+index,participant=id+'_'+user.localId;
    await db.collection('tournaments').doc(id).set({title:kind,status:kind==='completed'?'completed':kind==='waiting'?'registration_open':'round_active',financeLedger:'SECRET-FINANCE'});
    await db.collection('tournamentParticipants').doc(participant).set({userId:user.localId,tournamentId:id,status:'active'});
    if(['urgent','later'].includes(kind))await db.collection('tournamentMatches').doc(id+'_match').set({tournamentId:id,participantAId:participant,participantBId:'other',status:'submissions_open',submissionDeadlineAt:new Date(Date.now()+(kind==='urgent'?3600000:7200000)).toISOString()});
  }
  const outsiderId=seed+'_outsider';await db.collection('tournamentParticipants').doc(outsiderId).set({userId:'outsider',tournamentId:'confidential'});
  const result=await GET(request()),body=await result.json();equal(result.status,200,'authenticated own list');equal(body.data.tournaments.length,4,'only own registrations');equal(body.data.tournaments[0].title,'urgent','urgent own submission first');equal(body.data.tournaments[1].title,'later','next own deadline second');equal(body.data.tournaments[2].stateLabel,'Awaiting Next Opponent','honest waiting');equal(body.data.tournaments[3].title,'completed','completed last');equal(JSON.stringify(body).includes('SECRET-FINANCE'),false,'no financial internals');equal(JSON.stringify(body).includes('outsider'),false,'no unrelated identity');equal(result.headers.get('cache-control'),'private, no-store','identity-private uncached');
  equal((await GET(request('?cursor='+outsiderId))).status,400,'foreign cursor denied');
  const urgent=body.data.tournaments[0];await db.collection('tournamentSubmissions').doc(`${urgent.id}_${urgent.id}_match_${urgent.id}_${user.localId}`).set({status:'approved'});
  const accepted=await history();equal(accepted.data.tournaments.find(item=>item.id===urgent.id).actionable,false,'valid entry stops submit prompt');
  for(let index=0;index<350;index++){const id=seed+'_extra_'+String(index).padStart(3,'0');await db.collection('tournaments').doc(id).set({title:'Extra '+index,status:'completed'});await db.collection('tournamentParticipants').doc(id+'_'+user.localId).set({userId:user.localId,tournamentId:id,status:'registered'});}
  const lastId=seed+'_zz_urgent',lastRegistration=lastId+'_'+user.localId;
  await db.collection('tournaments').doc(lastId).set({title:'Globally urgent',status:'round_active'});await db.collection('tournamentParticipants').doc(lastRegistration).set({userId:user.localId,tournamentId:lastId,status:'active'});await db.collection('tournamentMatches').doc(lastId+'_match').set({tournamentId:lastId,participantAId:lastRegistration,participantBId:'other',status:'submissions_open',submissionDeadlineAt:new Date(Date.now()+10000).toISOString()});
  const global=await history();equal(global.data.tournaments[0].title,'Globally urgent','urgent registration in final batch ranks globally first');equal(global.data.tournaments.length,355,'history beyond 256 is complete');equal(global.batches,4,'bounded scans cover individuals and legacy teams');
  equal(new Set(global.data.tournaments.map(row=>row.registrationId)).size,355,'all displayed pages are unique');
  equal((await GET(request('?cursor=individual:'+outsiderId))).status,400,'well-formed foreign cursor denied');
  const teamId=seed+'_team',teamTournament=seed+'_legacy';await db.collection('tournaments').doc(teamTournament).set({title:'Legacy Team',status:'round_active',participationMode:'team'});await db.collection('tournamentTeams').doc(teamId).set({tournamentId:teamTournament,status:'ready',captainUserId:user.localId});await db.collection('tournamentTeamMemberships').doc(teamTournament+'_'+user.localId).set({userId:user.localId,teamId,tournamentId:teamTournament,status:'active'});await db.collection('tournamentMatches').doc(teamTournament+'_match').set({tournamentId:teamTournament,participantAId:teamId,participantBId:'other',status:'submissions_open',submissionDeadlineAt:new Date(Date.now()+1800000).toISOString()});
  const member=await history();equal(member.data.tournaments.find(row=>row.id===teamTournament)?.actionable,false,'legacy member cannot receive captain submission action');
  await db.collection('tournamentTeamMemberships').doc(teamTournament+'_'+user.localId).update({role:'captain'});
  const legacy=await history();equal(legacy.data.tournaments.find(row=>row.id===teamTournament)?.actionable,true,'authorized legacy captain is retained');
  await db.collection('users').doc(user.localId).update({accountStatus:'suspended'});const restricted=await history();equal(restricted.data.tournaments.some(item=>item.actionable),false,'restricted account has no submission action');
  console.log(`My Tournaments: ${assertions} actual-handler isolation/priority assertions passed.`);
}finally{await app.delete();}
