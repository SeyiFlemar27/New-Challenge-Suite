async function capture(page, options) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot(options); }
import { INDIVIDUAL_TOURNAMENT_POLICY } from '../../lib/individual-tournament-policy.ts';
// Actual application routes and isolated demo Firebase only; no production identities or payments.
export async function masterDetailJourneys({browser,test,check,expect,db,baseUrl,artifacts,join,login,creator,admin,publicChallengeId,privateChallengeId,tournamentId}) {
  const now=Date.now(),future=new Date(now+2*86400000).toISOString();
  await db.collection('challenges').doc(publicChallengeId).update({coverImageUrl:'/favicon-32x32.png'});
  const normalFixture=(await db.collection('challenges').doc(publicChallengeId).get()).data();
  await db.collection('challenges').doc(publicChallengeId+'_missing_cover').set({...normalFixture,id:publicChallengeId+'_missing_cover',title:'Unavailable Cover Fixture',coverImageUrl:'/missing-master-cover.png'});
  await db.collection('challenges').doc(publicChallengeId+'_no_cover').set({...normalFixture,id:publicChallengeId+'_no_cover',title:'No Cover Fixture',coverImageUrl:''});
  await db.collection('challenges').doc(privateChallengeId).update({privateAccessMethod:'invitation_code',description:'Creator-approved public preview.',privateAccessCode:'SECRET-NOT-PUBLIC',eligibility:{privateRequirement:'SECRET-ELIGIBILITY'}});
  const completed=tournamentId+'_completed';
  await db.collection('tournaments').doc(completed).set({...((await db.collection('tournaments').doc(tournamentId).get()).data()),id:completed,title:'Completed Master Tournament',status:'completed',configVersion:4,productPolicyVersion:INDIVIDUAL_TOURNAMENT_POLICY,createdAt:new Date(now-30*86400000).toISOString()});
  const events=[];
  const adminReviewId=tournamentId+'_admin_review';
  await db.collection('tournaments').doc(adminReviewId).set({id:adminReviewId,title:'Scoped Individual review',hostId:creator.uid,status:'active',configVersion:4,productPolicyVersion:INDIVIDUAL_TOURNAMENT_POLICY,participationMode:'individual',format:'double_elimination'});
  for(const side of ['a','b']){await db.collection('users').doc(adminReviewId+'_'+side).set({accountStatus:'active'});await db.collection('tournamentParticipants').doc(adminReviewId+'_'+side).set({tournamentId:adminReviewId,userId:adminReviewId+'_'+side,status:'active',lossCount:1});}
  await db.collection('tournamentMatches').doc(adminReviewId+'_match').set({tournamentId:adminReviewId,bracket:'winners',roundNumber:1,matchNumber:1,status:'double_forfeit_hold',participantAId:adminReviewId+'_a',participantBId:adminReviewId+'_b'});
  for(const kind of ['attendance_only','physical_competition']) {
    const id=tournamentId+'_'+kind;events.push({id,kind});
    await db.collection('liveEvents').doc(id).set({id,creatorId:creator.uid,title:'Master '+kind,description:'Published event description.\n\nArrival and access information.',visibility:'public',status:'scheduled',eventApprovalStatus:'approved',startsAt:future,endsAt:new Date(now+2*86400000+7200000).toISOString(),venueName:'Demo Community Hall',eventCity:'Lagos',eventCountry:'NG',capacity:20,hostOperations:{schemaVersion:2,eventFormat:kind,timezone:'Africa/Lagos',competitorCapacity:kind==='physical_competition'?8:0,physicalJudgeCount:2,winnerCount:2,admissionRefundPolicy:'standard',registrationOpensAt:new Date(now-10000).toISOString(),registrationClosesAt:future,eventRules:['Respect attendees.'],ticketInstructions:'Arrive before check-in.',competitionInstructions:['Arrive before check-in.']}});
  }
  await test('Master details: Explore canonical minimal cards and completed history',async()=>{
    const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage();
    try {
      await page.goto(baseUrl+'/explore');
      await expect(page.getByRole('heading',{name:'Explore Challenges',exact:true})).toBeVisible();
      await expect(page.locator('[data-mobile-explore-card]').first()).toBeVisible();
      const cards=page.locator('[data-mobile-explore-card]');
      check(await cards.count()>0,'actual Explore response renders cards');
      const brokenCard=cards.filter({has:page.getByRole('heading',{name:'Unavailable Cover Fixture',exact:true})});
      await expect(brokenCard.getByRole('img',{name:'Unavailable Cover Fixture cover unavailable'})).toBeVisible();
      check(await brokenCard.locator('img').count()===0,'failed cover becomes branded fallback without broken image');
      await expect(cards.filter({has:page.getByRole('heading',{name:'No Cover Fixture',exact:true})}).getByRole('img',{name:'No Cover Fixture cover unavailable'})).toBeVisible();
      check(await cards.getByRole('button',{name:/save challenge/i}).count()===0,'no extra save overlays');
      const preview=page.locator('[data-challenge-type="private"]').first();
      await expect(preview).toBeVisible();
      check(await preview.getByRole('link',{name:'Enter Invitation Code',exact:true}).count()===1,'single configured Private action');
      check((await preview.getByRole('link').first().getAttribute('href')).startsWith('/challenges/'),'canonical Private detail route');
      await expect(page.getByRole('heading',{name:'Completed Master Tournament',exact:true})).toBeVisible();
      check(!(await page.locator('main').innerText()).includes('SECRET-NOT-PUBLIC'),'no invite secret in Explore');
      for(const [name,width] of [['desktop',1600],['tablet',820],['mobile',390]]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Explore '+name+' no horizontal overflow');await capture(page, {path:join(artifacts,'master-explore-'+name+'.png'),fullPage:true});}
    }finally{await context.close();}
  });
  await test('Master details: Normal V2 guide and locked Private authorization',async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    try {
      await page.goto(baseUrl+'/challenges/'+publicChallengeId);
      await expect(page.getByRole('tab',{name:'Prizes',exact:true})).toBeVisible();
      await page.getByRole('tab',{name:'Prizes',exact:true}).click();
      check(await page.getByRole('tabpanel').isVisible(),'Normal Prizes guide is functional');
      for(const [name,width] of [['desktop',1440],['tablet',820],['mobile',390]]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Normal '+name+' no overflow');await capture(page, {path:join(artifacts,'master-normal-'+name+'.png'),fullPage:true});}
      await page.goto(baseUrl+'/challenges/'+privateChallengeId);
      await expect(page.getByRole('heading',{name:'Locked Art Opportunity',exact:true})).toBeVisible();
      await expect(page.getByText('This is a private challenge',{exact:true})).toBeVisible();
      check(await page.getByRole('link',{name:'Enter Invitation Code',exact:true}).count()===1,'locked detail uses only configured code mechanism');
      const payload=await (await page.request.get(baseUrl+'/api/private-challenges/'+privateChallengeId+'/preview')).text();
      check(!payload.includes('SECRET-NOT-PUBLIC')&&!payload.includes('SECRET-ELIGIBILITY'),'actual preview DTO excludes invitation and eligibility');
      for(const [name,width] of [['desktop',1440],['tablet',820],['mobile',390]]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Private '+name+' no overflow');await capture(page, {path:join(artifacts,'master-private-'+name+'.png'),fullPage:true});}
    }finally{await context.close();}
  });
  await test('Master details: Explore empty and recoverable failure states',async()=>{
    const context=await browser.newContext({viewport:{width:390,height:1000}}),page=await context.newPage();
    try {
      await page.goto(baseUrl+'/explore?q=no-result-fixture-unique');await expect(page.getByRole('heading',{name:'No challenges found',exact:true})).toBeVisible();await capture(page, {path:join(artifacts,'master-explore-empty.png'),fullPage:true});
      await page.route('**/api/explore/challenges?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,message:'Isolated transport failure fixture'})}));
      await page.goto(baseUrl+'/explore');await expect(page.getByText('Explore could not load',{exact:true})).toBeVisible();await capture(page, {path:join(artifacts,'master-explore-error.png'),fullPage:true});await page.unroute('**/api/explore/challenges?**');await page.getByRole('button',{name:'Retry',exact:true}).first().click();await expect(page.locator('[data-mobile-explore-card]').first()).toBeVisible();check(true,'Retry recovers from injected transport failure through actual demo-backed API');
    }finally{await context.close();}
  });
  await test('Master details: Private owner menu and authoritative access page',async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    try {
      const page=await login(context,creator);await page.goto(baseUrl+'/challenges/'+privateChallengeId);
      for(const[name,width]of[['desktop',1440],['tablet',820],['mobile',390]]){await page.setViewportSize({width,height:1000});await expect(page.getByRole('heading',{name:'Locked Art Opportunity',exact:true})).toBeVisible();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Unlocked Private '+name+' no overflow');await capture(page,{path:join(artifacts,'master-private-unlocked-'+name+'.png'),fullPage:true});}
      await page.setViewportSize({width:1440,height:1000});const trigger=page.getByRole('button',{name:'Private challenge actions',exact:true});await expect(trigger).toBeVisible();await trigger.click();await expect(page.getByRole('menuitem',{name:'Manage Access'})).toBeFocused();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();check(await page.getByRole('menu').count()===0,'Escape dismisses and restores focus');await trigger.click();await page.getByRole('menuitem',{name:'Manage Access'}).click();await expect(page.getByRole('heading',{name:'Private Challenge Access',exact:true})).toBeVisible();check(page.url().endsWith('/access'),'owner management route works');await expect(page.getByRole('heading',{name:'Access granted — separate from joining',exact:true})).toBeVisible();check(true,'grants and joining are distinct in owner management');
      for(const[name,width]of[['desktop',1440],['tablet',820],['mobile',390]]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Manage Access '+name+' no overflow');await capture(page,{path:join(artifacts,'master-private-manage-access-'+name+'.png'),fullPage:true});}
    }finally{await context.close();}
  });
  await test('Master Admin: evidence controls and locked structural review',async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    try {
      const page=await login(context,admin);await page.goto(baseUrl+'/admin/tournaments/'+adminReviewId);
      await expect(page.getByRole('heading',{name:'Individual Tournament evidence review',exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:'Recheck structural eligibility',exact:true})).toBeDisabled();
      await page.getByLabel('Affected match',{exact:true}).selectOption(adminReviewId+'_match');
      await page.getByLabel('Decision reason (required)',{exact:true}).fill('Verify the two legitimate first losses');
      await page.getByLabel('Evidence reference',{exact:true}).fill('demo-authorized-review');
      await page.getByLabel('Review reference (8–100 letters, numbers, hyphens or underscores)',{exact:true}).fill('browser-review-0001');
      await page.getByRole('checkbox',{name:'I have reviewed the relevant evidence and confirm this decision.',exact:true}).check();
      const response=page.waitForResponse(row=>new URL(row.url()).pathname==='/api/admin/tournaments/'+adminReviewId&&row.request().method()==='POST');
      await page.getByRole('button',{name:'Recheck structural eligibility',exact:true}).click();const result=await response;check(result.status()===200,'Admin structural request reaches the authorized server');const body=await result.json();check(body.data.status==='held_locked_policy_conflict','UI preserves the locked policy conflict rather than choosing an entrant');check((await db.collection('tournamentMatches').where('tournamentId','==',adminReviewId).get()).size===1,'Admin UI creates no play-in');
      // Presentation fixture only: backend correction/holds are exercised by the
      // separate actual-ledger emulator test, not inferred from this rendering.
      await db.collection('tournamentDisputes').doc(adminReviewId+'_policy_evidence').set({tournamentId:adminReviewId,matchId:adminReviewId+'_match',status:'open',competitivePolicyRequired:true,correctionProposal:{originalResult:{winnerParticipantId:'recorded-entrant',loserParticipantId:'other-entrant',resultStatus:'confirmed'},proposedResult:{winnerParticipantId:'other-entrant',loserParticipantId:'recorded-entrant'},reason:'UI-only held correction evidence',evidenceReference:'demo-policy-review',affectedMatches:[{id:'recorded-dependent',status:'confirmed',winnerParticipantId:'recorded-entrant',loserParticipantId:'dependent-opponent'}],participants:[{id:'recorded-entrant',status:'active',legitimateLossCount:1}],affectedPlacements:[],financialConsequences:[]}});
      await page.reload();await page.getByText('Unresolved upstream correction — '+adminReviewId+'_match',{exact:true}).click();
      await expect(page.getByRole('heading',{name:'Original recorded result',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Verified proposed correction — not applied',exact:true})).toBeVisible();check(true,'Admin sees original and proposed outcomes separately');
      await expect(page.getByRole('heading',{name:'Participants — legitimate losses unchanged',exact:true})).toBeVisible();check(true,'Admin sees preserved legitimate losses and unresolved policy boundary');
      await page.getByLabel('Affected match',{exact:true}).selectOption(adminReviewId+'_match');await page.getByLabel('Decision reason (required)',{exact:true}).fill('Review acknowledgment cannot resolve this hold');await page.getByLabel('Evidence reference',{exact:true}).fill('demo-policy-review');await page.getByLabel('Review reference (8–100 letters, numbers, hyphens or underscores)',{exact:true}).fill('browser-policy-0001');await page.getByRole('checkbox',{name:'I have reviewed the relevant evidence and confirm this decision.',exact:true}).check();await expect(page.getByRole('button',{name:'Confirm unchanged result and restore clocks',exact:true})).toBeDisabled();check(true,'Acknowledgment cannot release the policy-dependent case');
      for(const[name,width]of[['desktop',1440],['tablet',820],['mobile',390]]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin review '+name+' no overflow');await capture(page,{path:join(artifacts,'master-admin-review-'+name+'.png'),fullPage:true});}
    }finally{await context.close();}
  });
  await test('Master details: Tournament approved tabs and responsive context',async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    try {await page.goto(baseUrl+'/tournaments/'+tournamentId);await expect(page.getByRole('tab',{name:'Tournament Bracket',exact:true})).toBeVisible();check(await page.getByRole('tab').count()===5,'five approved Tournament tabs');await page.getByRole('tab',{name:'Rules',exact:true}).click();await expect(page.getByRole('heading',{name:'Tournament rules',exact:true})).toBeVisible();for(const [name,width]of [['desktop',1440],['tablet',820],['mobile',390]]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Tournament '+name+' no overflow');await capture(page, {path:join(artifacts,'master-tournament-'+name+'.png'),fullPage:true});}}finally{await context.close();}
  });
  for(const event of events) await test('Master details: Live Event '+event.kind+' actions and content',async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    try {await page.goto(baseUrl+'/live-events/'+event.id,{waitUntil:'domcontentloaded',timeout:120000});await expect(page.getByRole('heading',{name:'Master '+event.kind,exact:true})).toBeVisible({timeout:120000});await expect(page.getByRole('heading',{name:'Get Ticket',exact:true})).toBeVisible();check(await page.getByRole('heading',{name:'Join Entry',exact:true}).count()===(event.kind==='physical_competition'?1:0),'only Physical Competition has Join Entry');check(await page.locator('section[aria-label="Event booking"]').count()===1,'booking follows information tabs instead of sidebar');await page.getByRole('tab',{name:'Instructions',exact:true}).click();await expect(page.getByText('Arrive before check-in.',{exact:true})).toBeVisible();for(const [name,width]of [['desktop',1440],['tablet',820],['mobile',390]]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Live '+name+' no overflow');await capture(page, {path:join(artifacts,'master-'+event.kind+'-'+name+'.png'),fullPage:true});}}finally{await context.close();}
  });
  await test('Master details: Winners show only verified allocations and history',async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    try {await page.goto(baseUrl+'/tournaments/'+completed+'/results');await expect(page.getByRole('heading',{name:'Completed Master Tournament Winners',exact:true})).toBeVisible();check(await page.getByRole('heading',{name:'Awaiting verified placement',exact:true}).count()===3,'missing placements are not invented');check(await page.getByText('Prize amount awaiting verified allocation',{exact:true}).count()===3,'advertised pool is not treated as wallet credit');check(await page.getByRole('link',{name:'Bracket History',exact:true}).count()===1,'bracket history remains accessible');for(const percent of [50,30,20])check(await page.getByText(percent+'% of the applicable distributable prize pool',{exact:true}).count()===1,'new Individual published split '+percent);for(const[name,width]of[['desktop',1440],['tablet',820],['mobile',390]]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Winners '+name+' no overflow');await capture(page, {path:join(artifacts,'master-winners-'+name+'.png'),fullPage:true});}
      const settlementId=completed+'_settlement';
      await db.collection('tournaments').doc(completed).update({adminWinnerApprovalStatus:'approved',settlementId});
      await db.collection('tournamentPlacements').doc(completed+'_first').set({tournamentId:completed,placement:1,participantId:'public_entrant'});
      await db.collection('challengeSettlements').doc(settlementId).set({challengeId:completed,currency:'USD',winnerDistribution:[{placement:1,netAmountCents:500}],sponsorPrizeDistribution:[{placement:1,netAmountCents:90}],privateAuditSentinel:'DO-NOT-RENDER-SETTLEMENT-SECRET'});
      await page.setViewportSize({width:1440,height:1000});await page.reload();await expect(page.getByText('$5.90',{exact:true})).toBeVisible();check(!(await page.locator('main').innerText()).includes('DO-NOT-RENDER-SETTLEMENT-SECRET'),'settlement metadata not rendered');await capture(page, {path:join(artifacts,'master-winners-recorded-allocation-desktop.png'),fullPage:true});
      await db.collection('tournamentPlacements').doc(completed+'_first').update({sourceMatchId:completed+'_source',correctionReviewRestricted:true});await db.collection('tournamentDisputes').doc(completed+'_policy_hold').set({tournamentId:completed,status:'open',competitivePolicyRequired:true,affectedMatchIds:[completed+'_source']});await page.reload();await expect(page.getByRole('heading',{name:'Placement under review',exact:true})).toBeVisible();check(await page.getByText('$5.90',{exact:true}).count()===0,'affected upstream correction suppresses allocation without declaring the old placement authoritative');
      await db.collection('tournaments').doc(completed).update({financialHold:true});await page.reload();check(await page.getByText('$5.90',{exact:true}).count()===0,'financial hold suppresses previously recorded amount');
}finally{await context.close();}
  });

}
