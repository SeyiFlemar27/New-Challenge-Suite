import fs from 'node:fs';
import nextEnv from '@next/env';
import {cert,initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const project=process.env.FIREBASE_PROJECT_ID||process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if(project!=='challenge-suite'||process.env.FIRESTORE_EMULATOR_HOST)throw Error('WRONG_PRODUCTION_TARGET');
const app=initializeApp({projectId:project,credential:cert({projectId:project,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY.trim().replace(/\\n/g,'\n')})},'tournament-backlog-read-only');
try {
 const db=getFirestore(app),now=Date.now();
 const pending=await db.collection('tournamentJobs').where('status','==','pending').select('type','runAt','schedulerDispatchState').limit(501).get();
 const active=await db.collection('tournaments').where('status','in',['seeding','ready','active','round_active','round_review','final','under_review']).count().get();
 const recovery=await db.collection('tournaments').where('status','==','scheduled').where('publicationPolicyVersion','==',1).where('registrationHoldReason','==','scheduler_unavailable').count().get();
 const byType={},byDispatch={};let overdue=0;
 for(const doc of pending.docs.slice(0,500)){const row=doc.data();const type=String(row.type||'unknown'),state=String(row.schedulerDispatchState||'unknown');byType[type]=(byType[type]||0)+1;byDispatch[state]=(byDispatch[state]||0)+1;if(Date.parse(String(row.runAt))<now)overdue++;}
 const report={readOnly:true,productionMutations:0,project,completedAt:new Date().toISOString(),noCreatorContentOrIdsOutput:true,pendingJobsSampled:Math.min(pending.size,500),pendingInventoryComplete:pending.size<=500,pendingJobsByType:byType,pendingJobsByDispatchState:byDispatch,overduePendingJobsSampled:overdue,activeTournamentCount:active.data().count,publishedRegistrationRecoveryCandidateCount:recovery.data().count};
 fs.writeFileSync('docs/tournament-final-backlog-inspection-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
} finally {await deleteApp(app);}
