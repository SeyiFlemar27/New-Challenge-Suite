import fs from 'node:fs';
import nextEnv from '@next/env';
import { Filter, FieldPath } from 'firebase-admin/firestore';
if(!process.argv.includes('--production-index-analysis-only'))throw Error('Explicit read-only Production index analysis flag required.');
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {getAdminDb,getFirebaseAdminConfigStatus}=await import('../lib/firebase/admin.ts');
if(getFirebaseAdminConfigStatus().projectId!=='challenge-suite'||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Expected existing Production project and no emulator.');
const db=getAdminDb();if(!db)throw Error('Existing private read-only configuration unavailable.');
const cutoff='2025-10-28T00:00:00.000Z',base=db.collection('notifications').where('userId','==','notification-index-analysis-no-user').where('createdAt','>=',cutoff).orderBy('createdAt','desc');
const unread=Filter.or(Filter.where('status','==','unread'),Filter.where('read','==',false));
const queries={statusHistory:base.where('status','==','unread').limit(25),readHistory:base.where('read','==',false).limit(25),history:base.orderBy(FieldPath.documentId(),'desc').limit(25),unreadHistory:base.where(unread).orderBy(FieldPath.documentId(),'desc').limit(25),unreadCount:base.where(unread).count(),archivedUnreadCount:base.where('status','==','archived').where('read','==',false).count()};
Object.assign(queries, {
  markAllPage: db.collection("notifications").where("userId", "==", "notification-index-analysis-no-user").orderBy(FieldPath.documentId()).limit(200),
  inboxRecovery: db.collection("notificationDeliveryOutbox").where("status", "in", ["pending", "retry_pending"]).orderBy(FieldPath.documentId()).limit(50),
  audienceRecovery: db.collection("notificationAudienceProgress").where("status", "==", "pending").orderBy(FieldPath.documentId()).limit(25),
  normalRecovery: db.collection("normalNotificationOutbox").where("status", "==", "pending").orderBy(FieldPath.documentId()).limit(25),
  normalAudience: db.collection("normalNotificationOutbox").where("challengeId", "==", "notification-index-analysis-no-challenge").orderBy(FieldPath.documentId()).limit(25),
  voterChallengePage: db.collection("votes").where("challengeId", "==", "notification-index-analysis-no-challenge").orderBy(FieldPath.documentId()).limit(50),
  voterMatchPage: db.collection("tournamentVotes").where("matchId", "==", "notification-index-analysis-no-match").orderBy(FieldPath.documentId()).limit(50),
  personalParticipant: db.collection("challengeParticipants").where("challengeId", "==", "notification-index-analysis-no-challenge").where("userId", "==", "notification-index-analysis-no-user").orderBy(FieldPath.documentId()).limit(25),
  tournamentParticipant: db.collection("tournamentParticipants").where("tournamentId", "==", "notification-index-analysis-no-tournament").where("userId", "==", "notification-index-analysis-no-user").limit(1)
});
const results=[];
for(const [name,query]of Object.entries(queries)){
 if(typeof query.explain!=='function'){results.push({name,status:'UNVERIFIED',reason:'SDK_EXPLAIN_UNAVAILABLE'});continue;}
 try{const result=await query.explain({analyze:false});results.push({name,status:'PLANNED',indexesUsed:result.metrics.planSummary.indexesUsed});}
 catch(error){results.push({name,status:'BLOCKED',code:error.code??null,reason:String(error.details??error.message??'').replace(/https?:\/\/\S+/g,'[reference]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[redacted-email]').slice(0,350),missingIndex:/requires an index|index.*required|no matching index/i.test(error.message??'')});}
}
const report={checkedAt:new Date().toISOString(),project:'challenge-suite',readOnly:true,analyze:false,documentQueriesExecuted:0,productionWrites:0,results};
fs.writeFileSync('docs/notification-index-analysis-2026-10-28.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(results.some(row=>row.status!=='PLANNED'))process.exitCode=1;
