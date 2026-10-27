async function capture(page, options) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot(options); }
import sharp from 'sharp';
import { INDIVIDUAL_TOURNAMENT_POLICY } from '../../lib/individual-tournament-policy.ts';
export async function masterParticipantJourneys({browser,test,check,expect,db,baseUrl,artifacts,join,login,creator,participant,tournamentId}) {
  const id=tournamentId+'_participant',own=id+'_'+participant.uid,other=id+'_opponent',round=id+'_round',match=id+'_own_match',unrelated=id+'_unrelated';
  const now=Date.now(),future=new Date(now+12*3600000).toISOString(),past=new Date(now-10000).toISOString();
  const base=(await db.collection('tournaments').doc(tournamentId).get()).data();
  await db.collection('tournaments').doc(id).set({...base,id,title:'Participant Scope Tournament',hostId:creator.uid,configVersion:4,productPolicyVersion:INDIVIDUAL_TOURNAMENT_POLICY,status:'round_active',resultMethod:'votes',submissionMediaTypes:['image'],submissionInstructions:['Share a fresh photo.'],submissionDurationHours:12,votingDurationHours:12});
  await Promise.all([
    db.collection('tournamentParticipants').doc(own).set({tournamentId:id,userId:participant.uid,status:'active'}),db.collection('tournamentParticipants').doc(other).set({tournamentId:id,userId:'other_demo_competitor',status:'active'}),
    db.collection('tournamentRounds').doc(round).set({tournamentId:id,roundNumber:1,status:'active',startsAt:past,endsAt:future}),
    db.collection('tournamentMatches').doc(unrelated).set({tournamentId:id,roundId:round,roundNumber:1,matchNumber:1,status:'submissions_open',participantAId:'someone_else',participantBId:'another_person',submissionsOpenedAt:past,submissionDeadlineAt:future}),
    db.collection('tournamentMatches').doc(match).set({tournamentId:id,roundId:round,roundNumber:1,matchNumber:2,status:'submissions_open',resultMethod:'votes',participantAId:own,participantBId:other,submissionsOpenedAt:past,submissionDeadlineAt:future})
  ]);
  await test('Master participant: scoped My Tournament and Tournaments tab',async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    try {const page=await login(context,participant);await page.goto(baseUrl+'/tournaments/'+id+'/me',{waitUntil:'domcontentloaded',timeout:120000});await expect(page.getByRole('link',{name:'Open Match',exact:true})).toBeVisible({timeout:120000});check((await page.getByRole('link',{name:'Open Match',exact:true}).getAttribute('href')).endsWith('/'+match),'My Tournament selects only viewer-assigned match');check(await page.locator('a[href$="/'+unrelated+'"]').count()===0,'unrelated match is not a personal next action');await page.goto(baseUrl+'/my-challenges?tab=tournaments',{waitUntil:'domcontentloaded',timeout:120000});await expect(page.getByRole('heading',{name:'Your Tournaments',exact:true})).toBeVisible({timeout:120000});await expect(page.getByRole('heading',{name:'Participant Scope Tournament',exact:true})).toBeVisible();check(page.url().includes('/challenges?tab=tournaments'),'legacy alias preserves selected Tournament tab');await expect(page.getByRole('link',{name:'Submit Entry',exact:true})).toBeVisible();for(const[name,width]of[['desktop',1440],['tablet',820],['mobile',390]]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'participant '+name+' no overflow');await capture(page, {path:join(artifacts,'master-participation-'+name+'.png'),fullPage:true});}}finally{await context.close();}
  });
  await test('Master participant: reason-free withdrawal and fail-closed rejoin gate',async()=>{
    const withdrawId=id+'_withdraw',entryId=withdrawId+'_'+participant.uid;
    await db.collection('tournaments').doc(withdrawId).set({...base,id:withdrawId,title:'Withdrawal acceptance',hostId:creator.uid,configVersion:4,productPolicyVersion:INDIVIDUAL_TOURNAMENT_POLICY,status:'registration_open',participationMode:'individual',entryType:'free',participantCount:1,participantCapacity:4,activationState:'not_full'});
    await db.collection('tournamentParticipants').doc(entryId).set({tournamentId:withdrawId,userId:participant.uid,status:'registered',lossCount:0});
    const context=await browser.newContext({viewport:{width:390,height:1000}});
    try{
      const page=await login(context,participant);
      await page.goto(baseUrl+'/tournaments/'+withdrawId+'/me');
      await expect(page.getByRole('button',{name:'Withdraw entry',exact:true})).toBeDisabled();
      await page.getByRole('checkbox',{name:'I want to withdraw this entry.',exact:true}).check();
      const response=page.waitForResponse(row=>row.url().endsWith('/api/tournaments/'+withdrawId+'/join')&&row.request().method()==='DELETE');
      await page.getByRole('button',{name:'Withdraw entry',exact:true}).click();check((await response).status()===200,'participant-owned DELETE succeeds without a reason');
      await expect(page.getByRole('link',{name:'Review rejoining',exact:true})).toBeVisible();
      check((await db.collection('tournaments').doc(withdrawId).get()).data().participantCount===0,'withdrawal releases exactly one place');
      await capture(page,{path:join(artifacts,'master-withdrawal-mobile.png'),fullPage:true});
      await page.getByRole('link',{name:'Review rejoining',exact:true}).click();
      await page.getByRole('checkbox',{name:'I accept the Tournament rules and registration terms.',exact:true}).check();
      const joined=page.waitForResponse(row=>row.url().endsWith('/api/tournaments/'+withdrawId+'/join')&&row.request().method()==='POST');
      await page.getByRole('button',{name:'Submit Tournament Registration',exact:true}).click();const reply=await joined;const body=await reply.json();check(reply.status()===503&&body.code==='TOURNAMENT_SCHEDULER_UNAVAILABLE','production-build registration remains fail-closed without authenticated scheduler readiness');
      check((await db.collection('tournamentParticipants').doc(entryId).get()).data().status==='withdrawn','blocked rejoin cannot change the participant');
      check((await db.collection('tournaments').doc(withdrawId).get()).data().participantCount===0,'blocked rejoin cannot reserve or activate a place');
    }finally{await context.close();}
  });
  await test('Master participant: uploaded match entry submits and replaces automatically',async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    try {
      const page=await login(context,participant);await page.goto(baseUrl+'/tournaments/'+id+'/matches/'+match,{waitUntil:'domcontentloaded',timeout:120000});await expect(page.getByLabel('Match image file',{exact:true})).toBeAttached({timeout:120000});
      check(await page.getByRole('button',{name:/Submit match entry|Submit replacement/}).count()===0,'no extra Submit step');
      for(const [index,color]of ['purple','teal'].entries()){
        const buffer=await sharp({create:{width:24,height:24,channels:3,background:color}}).png().toBuffer();
        const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/tournaments/'+id+'/submissions')&&response.request().method()==='POST',{timeout:120000});
        await page.getByLabel('Match image file',{exact:true}).setInputFiles({name:'fresh-'+index+'.png',mimeType:'image/png',buffer});
        const response=await responsePromise,body=await response.json();check(response.ok()&&body.ok,'upload automatically reaches actual submission handler: '+JSON.stringify({status:response.status(),code:body.code,message:body.message}));
        await expect(page.getByText('Your match entry is submitted. You can replace it before the deadline.',{exact:true})).toBeVisible();
        const saved=(await db.collection('tournamentSubmissions').doc(id+'_'+match+'_'+own).get()).data();check(saved.revision===index+1,'authoritative revision '+(index+1));check(Boolean(saved.mediaVerification?.sha256),'actual bytes verified before entry accepted');
      }
      check((await db.collection('tournamentSubmissionRevisions').doc(id+'_'+match+'_'+own+'_revision_1').get()).exists,'previous accepted entry preserved in immutable revision history');
      const anon=await browser.newContext();try{const ownMedia=(await db.collection('tournamentSubmissions').doc(id+'_'+match+'_'+own).get()).data().mediaUrl;check((await anon.request.get(baseUrl+ownMedia)).status()===404,'anonymous media bytes denied before voting');}finally{await anon.close();}
      await capture(page, {path:join(artifacts,'master-match-automatic-submission-desktop.png'),fullPage:true});
    }finally{await context.close();}
  });
  await test('Master participant: voting navigation never votes or spends',async()=>{
    const votingIds=[id+'_vote_one',id+'_vote_two'];
    await Promise.all(votingIds.map((key,index)=>db.collection('tournamentMatches').doc(key).set({tournamentId:id,roundId:round,roundNumber:2,matchNumber:index+1,status:'voting_open',resultMethod:'votes',participantAId:'eligible_a_'+index,participantBId:'eligible_b_'+index,votingClosesAt:future})));
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    try {const page=await login(context,participant);let writes=0;page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/votes'))writes++;});
      await page.goto(baseUrl+'/tournaments/'+id+'/matches/'+votingIds[0],{waitUntil:'domcontentloaded',timeout:120000});
      await expect(page.getByRole('heading',{name:'Vote Through Matches',exact:true})).toBeVisible({timeout:120000});
      check((await page.getByRole('link',{name:'Skip',exact:true}).getAttribute('href')).endsWith(votingIds[1]),'Skip points to another eligible open match');
      await page.getByRole('link',{name:'Skip',exact:true}).click();await expect(page.getByText('Match 2 of 2',{exact:false})).toBeVisible();
      check(page.url().endsWith(votingIds[1]),'Skip navigates to next open match');
      check(await page.getByRole('link',{name:'Previous',exact:true}).count()===1,'Previous available on second match');
      check(await page.getByRole('link',{name:'Next Match',exact:true}).count()===0,'no invented next match after final open match');
      check(writes===0,'navigation casts no vote and initiates no debit');
      await db.collection('tournamentParticipants').doc(own).update({status:'disqualified'});
      await db.collection('tournamentMatches').doc(match).update({status:'voting_open',votingClosesAt:future});
      await page.goto(baseUrl+'/tournaments/'+id+'/matches/'+match,{waitUntil:'domcontentloaded',timeout:120000});
      await expect(page.getByText('Voting in Progress. You cannot vote in your own match.',{exact:true})).toBeVisible();
      check(await page.getByRole('heading',{name:'Vote in this match',exact:true}).count()===0,'disqualified competitor still cannot vote in their historical match');

      await capture(page, {path:join(artifacts,'master-match-voting-navigation-desktop.png'),fullPage:true});
    }finally{await context.close();}
  });

  await test('Master participant: global priority beyond 256 registrations and local pagination',async()=>{
    for(let offset=0;offset<270;offset+=90){
      const batch=db.batch();
      for(let index=offset;index<Math.min(offset+90,270);index++){
        const key=id+'_history_'+String(index).padStart(3,'0');
        batch.set(db.collection('tournaments').doc(key),{title:'Historical Tournament '+index,status:'completed'});
        batch.set(db.collection('tournamentParticipants').doc(key+'_'+participant.uid),{userId:participant.uid,tournamentId:key,status:'registered'});
      }
      await batch.commit();
    }
    const urgent=id+'_zz_urgent',registration=urgent+'_'+participant.uid;
    await db.collection('tournaments').doc(urgent).set({...base,title:'Urgent final history batch',status:'round_active'});
    await db.collection('tournamentParticipants').doc(registration).set({userId:participant.uid,tournamentId:urgent,status:'active'});
    await db.collection('tournamentMatches').doc(urgent+'_match').set({tournamentId:urgent,participantAId:registration,participantBId:'other',status:'submissions_open',submissionDeadlineAt:new Date(Date.now()+3600000).toISOString()});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    try{
      const page=await login(context,participant);let scans=0;
      page.on('request',request=>{if(request.url().includes('/api/me/tournaments'))scans++;});
      await page.goto(baseUrl+'/challenges?tab=tournaments');
      await expect(page.getByRole('heading',{name:'Urgent final history batch',exact:true})).toBeVisible({timeout:120000});
      check(await page.locator('section[aria-labelledby="my-tournaments-heading"] h3').first().textContent()==='Urgent final history batch','urgent final-batch registration is first account-specific card');
      const before=scans;
      await page.getByRole('button',{name:'Next',exact:true}).click();
      await expect(page.getByText('Page 2',{exact:true})).toBeVisible();
      check(scans===before,'display pagination reuses the complete identity-scoped history');
      check(await page.getByRole('heading',{name:'Urgent final history batch',exact:true}).count()===0,'first-page entry does not repeat on second page');
      await page.getByRole('button',{name:'Previous',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Urgent final history batch',exact:true})).toBeVisible();
      await capture(page,{path:join(artifacts,'master-global-priority-desktop.png'),fullPage:true});
    }finally{await context.close();}
  });

}
