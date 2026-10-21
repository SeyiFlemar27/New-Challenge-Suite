// Six real dashboard routes backed only by isolated demo Firebase fixtures.
export async function dashboardRedesignJourneys({browser,test,check,expect,db,seedUser,baseUrl,artifacts,join,pageErrors}) {
  const baseline=process.env.CHALLENGE_SUITE_DASHBOARD_VISUAL_PHASE==='before';
  // Cold dev compilation can exceed the application's real session timeout.
  // Warm only anonymous route handlers before measuring authenticated UI.
  const warm=await browser.newContext();
  try { await warm.request.get(baseUrl+'/api/auth/profile/bootstrap',{timeout:120000});await warm.request.post(baseUrl+'/api/auth/session',{data:{},timeout:120000}); }
  finally {await warm.close();}
  for (const kind of ['free','creator','host','enterprise','sponsor','admin']) await test('Dashboard redesign: '+kind,async()=>{
    const org='design_'+kind;
    const user=await seedUser('design-'+kind,{admin:kind==='admin',sponsorOrg:kind==='sponsor'?org:null,enterpriseOrg:kind==='enterprise'?org:null});
    const fields={planId:['creator','host'].includes(kind)?kind:'free',planStatus:'active',creatorOnboardingComplete:true,hostOnboardingComplete:true,avatarUrl:'/favicon-32x32.png',...(kind==='enterprise'?{activeWorkspace:'enterprise'}:{}),...(kind==='sponsor'?{selectedAccountType:'sponsor',account_type:'sponsor'}:{})};
    await Promise.all(['users','profiles'].map(c=>db.collection(c).doc(user.uid).update(fields)));
    if(kind==='enterprise')await db.collection('enterpriseOrganizations').doc(org).set({id:org,status:'active'});
    if(kind==='sponsor'){
      await db.collection('sponsorOrganizations').doc(org).set({id:org,name:'Northstar Brand',status:'active',sponsorOnboardingComplete:true,verificationStatus:'verified'});
      await db.collection('sponsorMemberships').doc(org+'_member').set({sponsorOrganizationId:org,userId:user.uid,role:'owner',status:'active'});
    }
    if(!baseline){
      for(let index=0;index<4;index++){
        const id='visual_'+kind+'_'+index,now=new Date().toISOString();
        await db.collection('challenges').doc(id).set({id,title:['Photography Open','Move Freestyle','Food Stories','Community Showcase'][index],creatorId:kind==='free'?'community_creator':user.uid,organizationOwnerId:kind==='enterprise'?org:null,ownershipType:kind==='enterprise'?'challenge_suite_official':'personal',officialChallenge:kind==='enterprise',visibility:'public',status:index===3?'draft':'active',participantCount:10+index,submissionCount:3+index,voteCount:20+index,createdAt:now,updatedAt:now});
        if(index===1||index===(kind==='enterprise'?3:0))await db.collection('challenges').doc(id).update(index===1?{coverImageUrl:'/dashboard-cover-unavailable.png'}:{coverImageUrl:'/favicon-32x32.png'});
        if(kind==='free'){
          await db.collection('challengeParticipants').doc(id+'_'+user.uid).set({challengeId:id,userId:user.uid,status:index===3?'pending':'joined'});
          if(index<2)await db.collection('submissions').doc(id+'_entry').set({challengeId:id,userId:user.uid,status:'approved'});
        }
        if(kind==='enterprise')await db.collection('challengeParticipants').doc(id+'_entrant').set({challengeId:id,userId:'entrant_'+index,status:index===3?'pending':'joined'});
        if(kind==='sponsor')await db.collection('sponsorships').doc(id).set({sponsorId:org,challengeTitle:'Partnership '+(index+1),status:'active',createdAt:now});
      }
      await db.collection('challenges').doc('outside_'+kind).set({title:'Outside Organization Confidential',organizationOwnerId:'different_organization',creatorId:'different_user',status:'active',visibility:'private',officialChallenge:true,coverImagePath:'challenges/outside_'+kind+'/banner/test.png'});
      if(kind==='sponsor'){
        await db.collection('sponsorAnalyticsSnapshots').doc('design_snapshot').set({sponsorId:org,validImpressions:250,uniqueCtaClicks:18,participantsReached:7,reconciledAt:new Date().toISOString()});
        await db.collection('sponsorWallets').doc(org).set({availableBalanceCents:7000});
        await db.collection('sponsorships').doc('other_brand').set({sponsorId:'different_organization',challengeTitle:'Other Brand Confidential',status:'active'});
      }
      if(kind==='admin')await db.collection('sponsorProfiles').doc('review_brand').set({brandName:'Review Brand',sponsorVerificationStatus:'pending_review',sponsorOnboardingStatus:'submitted'});
    }
    const path=kind==='host'?'/dashboard/host':kind==='enterprise'?'/enterprise':kind==='sponsor'?'/sponsor/dashboard':kind==='admin'?'/admin':'/dashboard';
    const context=await browser.newContext({viewport:{width:1536,height:1024}});const page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));
    try {
      await page.goto(baseUrl+'/auth/login?next='+encodeURIComponent(path));
      await page.getByLabel('Email Address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Sign In',exact:true}).click();
      await expect(page).toHaveURL(new RegExp(path.replaceAll('/','\\/')+'$'),{timeout:60000});
      const heading=kind==='creator'?'Creator Studio':kind==='host'?'Host Control Center':kind==='enterprise'?'Enterprise Studio':kind==='sponsor'?'Welcome back, Sponsor':kind==='admin'?'Admin Dashboard':'Competitor Dashboard';
      if(baseline)await expect(page.getByRole('heading',{name:kind==='sponsor'?/^Welcome back,/:heading,exact:kind!=='sponsor'}).first()).toBeVisible({timeout:60000});
      else await expect(page.locator('[data-dashboard-home="'+kind+'"]')).toBeVisible({timeout:60000});
      if(!baseline){
        const home=page.locator('[data-dashboard-home="'+kind+'"]');
        if(['free','creator','host','enterprise','sponsor'].includes(kind))await expect(home.locator('[data-dashboard-preview]')).toHaveCount(3);
        if(kind!=='admin')check(!(await home.innerText()).includes('Confidential'),kind+' does not show another organization records');
        if(['free','creator','host','enterprise'].includes(kind)){
          const covers=home.locator('[data-dashboard-preview] img');
          await expect(covers.first()).toBeVisible();
          await expect.poll(()=>covers.first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);check(true,'Valid challenge cover loads actual bytes');
          check(await covers.first().evaluate(img=>{const a=img.getBoundingClientRect(),b=img.parentElement.getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom+1&&a.left>=b.left&&a.right<=b.right+1;}),'Loaded cover remains inside its crop frame without overlapping card content');
          await expect(home.locator('[data-cover-fallback]')).toHaveCount(2);
          check(await home.locator('img').evaluateAll(images=>images.every(img=>!img.complete||img.naturalWidth>0)),'No broken cover icons after missing/unavailable fallbacks');
        }
        const avatar=page.getByRole('button',{name:'Open account menu',exact:true});
        check(await avatar.locator('img').count()===1&&await avatar.locator('svg').count()===0,kind+' uses a stored avatar without name or chevron');
        await avatar.click();if(kind==='sponsor'){await expect(page.getByRole('menuitem',{name:'Sponsor Plan & Billing',exact:true})).toBeVisible();await expect(page.getByRole('menuitem',{name:'DoroCoins',exact:true})).toHaveCount(0);}await page.keyboard.press('ArrowDown');check(await page.evaluate(()=>document.activeElement?.getAttribute('role')==='menuitem'),kind+' menu arrow-key navigation');await page.keyboard.press('Escape');await expect(avatar).toHaveAttribute('aria-expanded','false');await expect(avatar).toBeFocused();
        await avatar.click();await page.getByRole('heading').first().click();await expect(avatar).toHaveAttribute('aria-expanded','false');check(true,kind+' outside-click dismissal');
        check(await home.locator('a').evaluateAll(links=>links.every(link=>link.getAttribute('href')&&link.getAttribute('href')!=='#')),kind+' dashboard actions have real destinations');
        if(kind==='free'){
          await expect(home.getByText('Joined Challenges',{exact:true}).locator('..')).toContainText('3');
          await expect(home.getByText('Basic challenges · lifetime',{exact:true}).locator('..')).toContainText('0 of 3 used');
          check(true,'Free joining is distinct from lifetime creation usage');
        }
        if(['free','creator'].includes(kind))await expect(page.locator('[data-dashboard-promotion]')).toBeVisible();
        else await expect(page.locator('[data-dashboard-promotion]')).toHaveCount(0);
        if(kind==='enterprise'){
          await expect(home).toContainText('Participant Records');await expect(home.getByText('Participant Records',{exact:true}).locator('..')).toContainText('4');
          check(true,'Enterprise uses scoped canonical participant records');
        }
      }
      await page.screenshot({path:join(artifacts,kind+'-'+(baseline?'before':'after')+'-desktop.png'),fullPage:true});
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),kind+' desktop fits viewport');
      if(!baseline){
        for(const width of [1536,1100,834]){
          await page.setViewportSize({width,height:1024});
          const title=page.locator('[data-dashboard-sidebar] [data-workspace-title]');
          if(await title.isVisible())check(await title.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.scrollHeight<=el.clientHeight),kind+' full sidebar heading fits at '+width);
        }
        await page.setViewportSize({width:1536,height:1024});
        if(kind==='admin'){
          const section=page.locator('[data-dashboard-sidebar] summary').filter({hasText:'People'});
          await section.focus();await page.keyboard.press('Enter');
          await expect(section.locator('..')).toHaveAttribute('open','');
          check(await section.locator('svg').count()===1,'Admin expandable navigation has visible indicator and keyboard expansion');
          await page.keyboard.press('Enter');await expect(section.locator('..')).not.toHaveAttribute('open','');
        }
        const anonymous=await browser.newContext();try{const denied=await anonymous.request.get(baseUrl+'/api/challenge-media?path='+encodeURIComponent('challenges/outside_'+kind+'/banner/test.png'));check([401,403,404].includes(denied.status()),'Unauthorized private media remains inaccessible');}finally{await anonymous.close();}
      }
      if(!baseline)for(const [size,width]of [['tablet',834],['mobile',390]]){
        await page.setViewportSize({width,height:1000});await page.screenshot({path:join(artifacts,kind+'-after-'+size+'.png'),fullPage:true});
        check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),kind+' '+size+' fits viewport');
        if(kind==='admin'&&size==='mobile')check(await page.locator('[data-dashboard-home] table tbody tr').first().evaluate(row=>getComputedStyle(row).backgroundColor==='rgb(255, 255, 255)'),'Admin mobile challenge rows retain readable light surfaces');
      }
      if(!baseline){
        const opener=page.getByRole('button',{name:kind==='admin'?'Open admin navigation':kind==='sponsor'?'Open sponsor navigation':'Open navigation menu',exact:true});
        await opener.click();await page.keyboard.press('Escape');await expect(opener).toBeFocused();check(true,kind+' mobile drawer Escape returns focus');
        await page.setViewportSize({width:1536,height:1024});
        const endpoint=kind==='enterprise'?'/api/enterprise/workspace':kind==='sponsor'?'/api/sponsor/dashboard':kind==='admin'?'/api/admin/operations':'/api/dashboard';
        const tokenResponse=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:user.email,password:user.password,returnSecureToken:true})});
        const token=(await tokenResponse.json()).idToken;if(!token)throw Error('Isolated fixture token unavailable');
        const api=await context.request.get(baseUrl+endpoint,{headers:{authorization:'Bearer '+token}});const actual=await api.json();check(api.status()===200,kind+' actual dashboard handler permits authorized identity');
        if(kind==='free')for(const denied of ['/api/admin/operations','/api/sponsor/dashboard','/api/enterprise/workspace']){const response=await context.request.get(baseUrl+denied,{headers:{authorization:'Bearer '+token}});check(response.status()===403,'Free cannot access '+denied);}
        if(kind==='sponsor'){
          check(!JSON.stringify(actual.data.sponsorships).includes('Other Brand Confidential'),'Sponsor API organization isolation');
          await page.goto(baseUrl+'/sponsor/analytics');await expect(page.locator('[data-dashboard-sidebar]')).toBeVisible();
          await page.goto(baseUrl+'/sponsor/dashboard');await expect(page.locator('[data-dashboard-home="sponsor"]')).toBeVisible();
          await page.getByRole('button',{name:'Open account menu',exact:true}).click();await page.getByRole('menuitem',{name:'Log Out',exact:true}).click();
          await expect(page).toHaveURL(/\/auth\/login$/);await page.getByLabel('Email Address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Sign In',exact:true}).click();
          await expect(page.locator('[data-dashboard-home="sponsor"]')).toBeVisible();await expect(page).toHaveURL(/\/sponsor\/dashboard$/);check(true,'Existing Sponsor navigation logout and relogin retains organization dashboard');
        }
        if(kind==='enterprise')check(actual.data.metrics.participants===4&&!JSON.stringify(actual.data.official).includes('Outside Organization Confidential'),'Enterprise API canonical participant count and organization isolation');
        if(kind==='admin'){
          await page.goto(baseUrl+'/admin/sponsors');
          await page.getByRole('button',{name:'Reject',exact:true}).first().click();
          await expect(page.getByRole('dialog',{name:'Confirm admin action'})).toBeVisible();
          await page.getByRole('button',{name:'Confirm Reject',exact:true}).click();
          await expect(page.getByText('A reason is required for this action.',{exact:true})).toBeVisible();
          await page.getByRole('button',{name:'Cancel',exact:true}).click();
          check(true,'Admin sensitive action retains confirmation and mandatory reason');
          await page.goto(baseUrl+'/admin');await expect(page.locator('[data-dashboard-home="admin"]')).toBeVisible();
          const denied=await context.request.patch(baseUrl+'/api/admin/operations',{headers:{authorization:'Bearer '+token},data:{type:'sponsor',id:'review_brand',action:'reject'}});
          check([400,422].includes(denied.status()),'Admin server rejects sensitive action without reason');
          const noted=await context.request.patch(baseUrl+'/api/admin/operations',{headers:{authorization:'Bearer '+token},data:{type:'sponsor',id:'review_brand',action:'add_note',note:'Isolated dashboard audit verification'}});
          check(noted.status()===200,'Authorized Admin note uses existing handler');
          const audit=await db.collection('auditLogs').where('targetId','==','review_brand').get();
          check(audit.docs.some(doc=>doc.data().action==='sponsor.note_added'&&doc.data().actorId===user.uid),'Admin action writes actor-scoped audit history');
        }
        await page.route('**'+endpoint,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,message:'Isolated dashboard outage'})}));
        await page.reload();await expect(page.getByText("We couldn't complete this request right now. Please try again.",{exact:true}).first()).toBeVisible({timeout:30000});check(true,kind+' API failure is safely explained');await page.unroute('**'+endpoint);await page.reload();await expect(page.locator('[data-dashboard-home="'+kind+'"]')).toBeVisible({timeout:30000});
        const empty={...actual.data};for(const [key,value]of Object.entries(empty))if(Array.isArray(value))empty[key]=[];
        for(const field of ['metrics','stats'])if(empty[field])empty[field]=Object.fromEntries(Object.keys(empty[field]).map(key=>[key,0]));
        if(kind==='sponsor')empty.recommendations={challenges:[],creators:[]};
        await page.route('**'+endpoint,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:empty})}));await page.reload();await expect(page.locator('[data-dashboard-home="'+kind+'"]')).toBeVisible({timeout:30000});
        check(await page.locator('[data-dashboard-home="'+kind+'"] [data-dashboard-preview]').count()===0,kind+' empty state has no fabricated previews');
        await page.screenshot({path:join(artifacts,kind+'-after-empty.png'),fullPage:true});await page.unroute('**'+endpoint);
        if(kind==='sponsor'){
          for(const status of ['restricted','suspended','closed']){
            await page.route('**'+endpoint,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{...actual.data,sponsorProfile:{...actual.data.sponsorProfile,organizationStatus:status}}})}));
            await page.reload();
            if(status==='restricted'){await expect(page.getByText('Historical records only',{exact:true})).toBeVisible();await expect(page.locator('[data-dashboard-home] a').filter({hasText:'Find Opportunities'})).toHaveCount(0);}
            else {await expect(page.getByText(status==='closed'?'This Sponsor Organization is closed. Historical financial records, sponsorships and reports remain preserved.':'Sponsor operations are suspended. New commercial activity is unavailable while the account is under review.',{exact:true})).toBeVisible();await expect(page.locator('[data-dashboard-home]')).toHaveCount(0);}
            check(true,'Sponsor '+status+' cannot expose new commercial dashboard actions');await page.unroute('**'+endpoint);
          }
        }
      }
    } finally {await context.close();}
  });
}
