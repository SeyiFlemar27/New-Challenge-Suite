import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createNotification,markNotificationRead,pageUserNotifications,markAllNotificationsRead,recoverNotificationDeliveries} from '../lib/server/notifications.ts';
import {notificationEnabled,normalizedNotificationPreferences,notificationHistoryCutoff} from '../lib/notification-policy.ts';
assert.match(process.env.GCLOUD_PROJECT??'',/^demo-/);assert.match(process.env.FIRESTORE_EMULATOR_HOST??'',/^127\.0\.0\.1:\d+$/);
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT}),db=getFirestore(app),uid='inbox_'+randomUUID(),other=uid+'_other';
let assertions=0;const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);assertions++;};
try{
 eq(notificationEnabled('wallet_deposit_confirmed',{inApp:false,billingAlerts:false}),true,'legacy flags cannot suppress essential updates');
 eq(notificationEnabled('tournament_submission_reminder',{inApp:false,challengeReminders:false}),true,'essential reminders stay enabled');
 eq(notificationEnabled('promotion',{}),false,'promotions opt in');eq(notificationEnabled('voting_reminder',{}),false,'voting reminders opt in');eq(notificationEnabled('voter_results',{}),true,'voter results default enabled');
 eq(notificationEnabled('voter_results',{voterResults:false}),false,'saved voter result opt out');eq(notificationEnabled('unknown_future_event',{}),false,'unknown events are not silently essential');
 eq(normalizedNotificationPreferences({commentsReplies:true}).communityUpdates,true,'approved existing community preference preserved');
 const event={userId:uid,type:'wallet_deposit_confirmed',title:'Deposit credited',body:'Your verified deposit is available.',idempotencyKey:'same_event'};
 const first=await createNotification(db,event);await markNotificationRead(db,uid,first.id);
 const outcomes=await Promise.all([createNotification(db,event),createNotification(db,event)]);
 eq(outcomes.every(row=>row.deliveryStatus==='already_exists'),true,'duplicate delivery is visible once');
 eq((await db.collection('notifications').doc(first.id).get()).data().read,true,'retry never restores unread');
 const peer=await createNotification(db,{...event,userId:other});assert.notEqual(peer.id,first.id);assertions++;
 eq((await db.collection('notifications').doc(peer.id).get()).data().userId,other,'shared source identity keeps distinct recipients');
 eq(await markNotificationRead(db,other,first.id),null,'foreign read is denied');
 const skipped=await createNotification(db,{...event,type:'promotion',idempotencyKey:'optional'});eq(skipped.deliveryStatus,'skipped_optional_preference','optional delivery records its outcome');eq((await db.collection('notifications').doc(skipped.id).get()).exists,false,'disabled optional notice is not visible');
 const createdAt=new Date(Date.now()-60000).toISOString();
 const batch=db.batch();for(let index=0;index<325;index++)batch.create(db.collection('notifications').doc(uid+'_'+String(index).padStart(4,'0')),{userId:uid,type:'tournament_match_assigned',title:'Match '+index,message:'Your assigned match is ready.',createdAt,read:false,status:'unread',metadata:{privateFinancialPayload:'must-not-be-returned'}});
 batch.create(db.collection('notifications').doc(uid+'_old'),{userId:uid,title:'Archived history',read:false,status:'unread',createdAt:'2020-01-01T00:00:00.000Z'});await batch.commit();
 const page=await pageUserNotifications(db,uid,{limit:25});eq(page.unreadCount,325,'global unread count covers more than 100');eq(page.notifications.length,25,'bounded page');eq(JSON.stringify(page).includes('must-not-be-returned'),false,'no raw internal metadata');
 const all=[],seen=new Set();let cursor=null;do{const current=await pageUserNotifications(db,uid,{limit:50,cursor});for(const item of current.notifications){assert.ok(!seen.has(item.id),'stable tie ordering never duplicates');assertions++;seen.add(item.id);all.push(item);}cursor=current.nextCursor;}while(cursor);
 eq(all.length,326,'all retained notices are paginated');eq(all.some(row=>row.id===uid+'_old'),false,'older than twelve months is logically archived');eq((await db.collection('notifications').doc(uid+'_old').get()).exists,true,'retention does not erase historical source');
 await assert.rejects(pageUserNotifications(db,uid,{cursor:peer.id}),/INVALID_NOTIFICATION_CURSOR/);assertions++;
 let progress=await markAllNotificationsRead(db,uid),updated=progress.updated;
 const later=await createNotification(db,{...event,idempotencyKey:'after_mark_all_started'});
 while(progress.nextCursor){progress=await markAllNotificationsRead(db,uid,progress.nextCursor,progress.before);updated+=progress.updated;}
 eq(updated,326,'mark all processes the complete set including archived-age records, never just one page');
 eq((await db.collection('notifications').doc(later.id).get()).data().read,false,'new arrivals after snapshot remain unread');
 eq((await pageUserNotifications(db,uid)).unreadCount,1,'global unread count reflects complete mark all');
 eq((await db.collection('notifications').doc(peer.id).get()).data().read,false,'mark all never affects another user');
 eq(notificationHistoryCutoff(new Date('2026-10-27T12:00:00.000Z')),'2025-10-27T12:00:00.000Z','calendar retention boundary');
 const original=db.runTransaction.bind(db);let delayed;
 await db.collection('notificationBusinessFixtures').doc(uid).set({status:'confirmed',amountCents:500});
 try{db.runTransaction=async()=>{throw new Error('isolated delivery failure');};delayed=await createNotification(db,{...event,idempotencyKey:'recoverable_delivery'});}finally{db.runTransaction=original;}
 eq(delayed.deliveryStatus,'pending_recovery','delivery failure remains pending, never falsely delivered');eq((await db.collection('notificationDeliveryOutbox').doc(delayed.id).get()).data().status,'retry_pending','durable delivery state survives');
 eq((await db.collection('notificationBusinessFixtures').doc(uid).get()).data().status,'confirmed','notification failure never rewrites authoritative business state');
 eq((await recoverNotificationDeliveries(db)).pendingRecovery,0,'bounded recovery processes retained event');eq((await db.collection('notifications').doc(delayed.id).get()).exists,true,'event eventually enters existing inbox');
 console.log(`Notification inbox: ${assertions} actual Firestore, idempotency, preference, retention, privacy and pagination assertions passed.`);
}finally{await app.delete();}
