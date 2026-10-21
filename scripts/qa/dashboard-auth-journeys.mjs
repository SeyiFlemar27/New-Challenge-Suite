// Actual app, Firebase Auth and Firestore emulator journeys. No Production fixtures.
export async function dashboardAuthJourneys({browser,test,check,expect,db,authAdmin,seedUser,baseUrl,artifacts,join,pageErrors}) {
  async function update(user,fields){if(Object.keys(fields).length)await Promise.all(['users','profiles'].map(c=>db.collection(c).doc(user.uid).update(fields)));}
  async function start(user,{next='',mobile=false,delay=700}={}){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960}});
    const page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));
    let bootstrapIdentity=null;page.on('response',async response=>{if(new URL(response.url()).pathname==='/api/auth/profile/bootstrap'&&response.request().method()==='GET'){const body=await response.json().catch(()=>null);if(body?.data?.user)bootstrapIdentity={accountType:body.data.user.accountType,isAdmin:body.data.user.isAdmin};}});
    await page.addInitScript(()=>{window.__dashboardTrace={creator:false,host:false,upgrade:false,headings:[]};const record=()=>{const text=document.body?.innerText||'';const t=window.__dashboardTrace;t.creator ||= [...document.querySelectorAll('h1')].some(h=>h.textContent?.trim()==='Creator Studio');t.host ||= !!document.querySelector('[data-host-control-center]');t.upgrade ||= text.includes('Upgrade to Host');for(const h of document.querySelectorAll('h1')){const value=h.textContent?.trim();if(value&&!t.headings.includes(value))t.headings.push(value);}};new MutationObserver(record).observe(document,{childList:true,subtree:true,characterData:true});});
    await page.route('**/api/auth/profile/bootstrap',async route=>{if(route.request().method()==='GET'&&delay)await new Promise(r=>setTimeout(r,delay));await route.continue();});
    await page.goto(baseUrl+'/auth/login'+(next?'?next='+encodeURIComponent(next):''),{waitUntil:'domcontentloaded'});
    await page.getByLabel('Email Address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Sign In',exact:true}).click();
    return {context,page,bootstrapIdentity:()=>bootstrapIdentity};
  }
  const fixtures=[
    ['Free',{},'/dashboard','Dashboard'],
    ['Creator',{planId:'creator',planStatus:'active',creatorOnboardingComplete:true},'/dashboard','Creator Studio'],
    ['Host',{planId:'host',planStatus:'active',hostOnboardingComplete:true,creatorOnboardingComplete:true},'/dashboard/host','Host Control Center'],
    ['Host onboarding',{planId:'host',planStatus:'active',hostOnboardingComplete:false},'/onboarding/host','Welcome to Host Plan'],
    ['Restricted',{accountStatus:'suspended'},'/dashboard','Account access restricted'],
    ['Creator legacy Admin flag',{planId:'creator',planStatus:'active',creatorOnboardingComplete:true,isAdmin:true},'/dashboard','Creator Studio'],
    ['Host legacy Admin flag',{planId:'host',planStatus:'active',hostOnboardingComplete:true,isAdmin:true},'/dashboard/host','Host Control Center'],
  ];
  for(const [label,fields,path,heading]of fixtures)await test('Dashboard stability: '+label+' default login under delayed profile',async()=>{
    const user=await seedUser('route-'+label.toLowerCase().replaceAll(' ','-'));await update(user,fields);
    const {context,page,bootstrapIdentity}=await start(user,{mobile:label==='Host'});
    try{await expect(page).toHaveURL(new RegExp(path.replaceAll('/','\\/')+'$'));await expect(page.getByRole('heading',{name:heading,exact:true}).first()).toBeVisible();
    const trace=await page.evaluate(()=>window.__dashboardTrace);check(!trace.headings.includes('Host Control Center')||path==='/dashboard/host','only entitled Host heading appears');
    if(fields.isAdmin===true){await expect.poll(bootstrapIdentity).toEqual({accountType:'user',isAdmin:true});check(true,'server preserves legacy capability separately from personal account identity');await page.goto(baseUrl+'/auth/login?next=%2Fadmin');await expect(page).toHaveURL(new RegExp(path.replaceAll('/','\\/')+'$'));check(true,'stale Admin return link resolves to the personal dashboard');}
    if(path==='/dashboard/host'){check(!trace.creator,'Host never renders Creator Studio');check(!trace.upgrade,'Host never renders an upgrade prompt');await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'Host Control Center',exact:true})).toBeVisible();check(!(await page.evaluate(()=>window.__dashboardTrace.creator)),'Host refresh never renders Creator Studio');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile Host has no horizontal overflow');await page.screenshot({path:join(artifacts,'host-routing-mobile.png'),fullPage:true});}
    if(label==='Creator')check(!trace.headings.includes('Dashboard'),'Creator has no Free dashboard flash');
    }finally{await context.close();}
  });
  await test('Dashboard stability: Host logout and login again enters Host directly',async()=>{
    const user=await seedUser('host-relogin');await update(user,{planId:'verified_host',planStatus:'active',creatorOnboardingComplete:true,hostOnboardingComplete:true});
    const {context,page}=await start(user);try{await expect(page.getByRole('heading',{name:'Host Control Center',exact:true})).toBeVisible();await page.getByRole('button',{name:'Open account menu',exact:true}).click();await page.getByRole('menuitem',{name:'Log Out',exact:true}).click();await expect(page).toHaveURL(/\/auth\/login$/);await page.getByLabel('Email Address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page).toHaveURL(/\/dashboard\/host$/);await expect(page.getByRole('heading',{name:'Host Control Center',exact:true})).toBeVisible();check(!(await page.evaluate(()=>window.__dashboardTrace.creator)),'relogin has no Creator interface');await page.screenshot({path:join(artifacts,'host-routing-desktop.png'),fullPage:true});}finally{await context.close();}
  });
  await test('Dashboard stability: Creator upgrade refresh and membership pending recovery',async()=>{
    const user=await seedUser('upgrade-route');await update(user,{planId:'creator',planStatus:'active',creatorOnboardingComplete:true});
    const {context,page}=await start(user);try{await expect(page.getByRole('heading',{name:'Creator Studio',exact:true})).toBeVisible();await update(user,{planId:'host',planStatus:'active',hostOnboardingComplete:true});await page.evaluate(()=>{window.__dashboardTrace.creator=false;window.dispatchEvent(new Event('challenge-suite-profile-updated'));});await expect(page).toHaveURL(/\/dashboard\/host$/);await expect(page.getByRole('heading',{name:'Host Control Center',exact:true})).toBeVisible();check(!(await page.evaluate(()=>window.__dashboardTrace.creator)),'upgrade resolution hides old Creator dashboard');
    await update(user,{planStatus:'incomplete'});await page.evaluate(()=>window.dispatchEvent(new Event('challenge-suite-profile-updated')));await expect(page).toHaveURL(/\/onboarding\/premium$/);check(await page.getByText('Upgrade to Host',{exact:true}).count()===0,'pending activation is not a permanent downgrade');await update(user,{planStatus:'active'});await page.evaluate(()=>window.dispatchEvent(new Event('challenge-suite-profile-updated')));await page.goto(baseUrl+'/dashboard/host');await expect(page.getByRole('heading',{name:'Host Control Center',exact:true})).toBeVisible();}finally{await context.close();}
  });
  await test('Dashboard stability: profile failure retains retry and never falls back to Free',async()=>{
    const user=await seedUser('profile-retry');await update(user,{planId:'host',planStatus:'active',hostOnboardingComplete:true});const {context,page}=await start(user);try{await expect(page.getByRole('heading',{name:'Host Control Center',exact:true})).toBeVisible();await page.route('**/api/auth/profile/bootstrap',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,message:'Fixture profile temporarily unavailable'})}));await page.evaluate(()=>{window.__dashboardTrace.headings=[];window.dispatchEvent(new Event('challenge-suite-profile-updated'));});await expect(page.getByRole('heading',{name:'We couldn’t confirm your account',exact:true})).toBeVisible();check(await page.getByText('Become a Creator',{exact:true}).count()===0,'failure does not show Free upsell');await page.unroute('**/api/auth/profile/bootstrap');await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'Host Control Center',exact:true})).toBeVisible();check(!(await page.evaluate(()=>window.__dashboardTrace.headings.includes('Dashboard'))),'retry retains Host classification');}finally{await context.close();}
  });
  await test('Dashboard stability: requested action and unsafe redirects',async()=>{
    const user=await seedUser('safe-return');await update(user,{planId:'host',planStatus:'active',hostOnboardingComplete:true});const {context,page}=await start(user,{next:'/explore?type=normal'});try{await expect(page).toHaveURL(/\/explore\?type=normal(?:&page=1)?$/);check(!(await page.evaluate(()=>window.__dashboardTrace.creator)),'action login avoids default Creator hub');await page.goto(baseUrl+'/auth/login?next=%2F%5Cevil.example');await expect(page).toHaveURL(/\/dashboard\/host$/);check(new URL(page.url()).origin===baseUrl,'malformed destination cannot escape origin');}finally{await context.close();}
  });
  await test('Dashboard stability: verified email required before dashboard',async()=>{
    const user=await seedUser('unverified-route');await authAdmin.updateUser(user.uid,{emailVerified:false});await update(user,{verified:false,emailVerified:false,verificationStatus:'pending'});const {context,page}=await start(user);try{await expect(page).toHaveURL(/\/auth\/verify-email/);check(!(await page.evaluate(()=>window.__dashboardTrace.headings.includes('Dashboard'))),'unverified user has no dashboard flash');}finally{await context.close();}
  });
  await test('Dashboard stability: protected direct navigation preserves action query at login',async()=>{
    const user=await seedUser('protected-intent');const context=await browser.newContext();const page=await context.newPage();
    try{await page.goto(baseUrl+'/profile?tab=fixture');await page.getByRole('link',{name:'Sign In',exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('next')).toBe('/profile?tab=fixture');check(true,'protected login preserves the complete query');await page.getByLabel('Email Address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page).toHaveURL(/\/profile\?tab=fixture$/);check(true,'authenticated action returns to the intended query');}finally{await context.close();}
  });
  await test('Dashboard stability: Become a Sponsor starts setup without changing personal identity or privileges',async()=>{
    const anonymous=await browser.newContext();
    try { const denied=await anonymous.request.post(baseUrl+'/api/sponsor/start');check(denied.status()===401,'anonymous setup request is rejected'); }
    finally { await anonymous.close(); }
    const user=await seedUser('become-sponsor-host');
    await update(user,{planId:'host',planStatus:'active',hostOnboardingComplete:true});
    const {context,page}=await start(user);
    try {
      await expect(page.getByRole('heading',{name:'Host Control Center',exact:true})).toBeVisible();
      await page.evaluate(()=>{localStorage.setItem('challenge-suite-sponsor-onboarding-draft',JSON.stringify({brandName:'Another account legacy brand'}));});
      await page.getByRole('button',{name:'Open account menu',exact:true}).click();
      await page.getByRole('menuitem',{name:'Become a Sponsor',exact:true}).click();
      await expect(page).toHaveURL(/\/sponsor\/start$/);
      await page.getByRole('button',{name:'Start Sponsor Profile',exact:true}).click();
      await expect(page).toHaveURL(/\/sponsor\/onboarding$/);
      await expect(page.getByRole('heading',{name:'Build your brand profile',exact:true})).toBeVisible();
      check(!(await page.locator('input').evaluateAll(inputs=>inputs.some(input=>input.value==='Another account legacy brand'))),'unscoped legacy Sponsor draft cannot leak into this account');
      await page.route('**/api/sponsor/profile',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,message:'Fixture Sponsor profile unavailable'})}));
      await page.reload({waitUntil:'domcontentloaded'});
      await expect(page.getByRole('heading',{name:'Sponsor profile unavailable',exact:true})).toBeVisible();
      await page.unroute('**/api/sponsor/profile');
      await page.getByRole('button',{name:'Try again',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Build your brand profile',exact:true})).toBeVisible();
      check(true,'Sponsor profile load failure is visible and retry recovers');
      await page.getByRole('link',{name:'Return to Overview',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Welcome to Challenge Suite',exact:true})).toBeVisible();
      check(true,'new Sponsor setup has a stable overview without Host bounce');
      const stored=(await db.collection('users').doc(user.uid).get()).data();
      check(stored.sponsorOnboardingStatus==='not_started'&&stored.planId==='host','setup intent persists without replacing Host subscription');
      check(!stored.isSponsor&&!stored.sponsorOrganizationId&&!stored.sponsorVerificationStatus,'setup does not grant operational access or approval');
      await page.goto(baseUrl+'/sponsor/start');
      await page.getByRole('button',{name:'Start Sponsor Profile',exact:true}).click();
      await expect(page).toHaveURL(/\/sponsor\/onboarding$/);
      check((await db.collection('users').doc(user.uid).get()).data().planId==='host','repeat setup retains account identity');
      await update(user,{sponsorOnboardingStatus:'pending_review',sponsorOnboardingComplete:true});
      await page.goto(baseUrl+'/sponsor/start');
      await page.getByRole('button',{name:'Start Sponsor Profile',exact:true}).click();
      await expect(page).toHaveURL(/\/sponsor\/onboarding$/);
      check((await db.collection('users').doc(user.uid).get()).data().sponsorOnboardingStatus==='pending_review','repeat setup never resets a submitted review');
    } finally { await context.close(); }
  });
  await test('Dashboard stability: Sponsor panel entry for personal legacy Admin capability and pending organization',async()=>{
    const user=await seedUser('sponsor-personal-panel');
    await update(user,{planId:'host',planStatus:'active',hostOnboardingComplete:true,isAdmin:true,hasSponsorProfile:true,sponsorOnboardingComplete:true});
    const org='routing_pending_sponsor';
    await db.collection('sponsorOrganizations').doc(org).set({id:org,name:'Pending Sponsor Fixture',status:'pending_onboarding',sponsorOnboardingComplete:false});
    await db.collection('sponsorMemberships').doc('routing_pending_member').set({sponsorOrganizationId:org,userId:user.uid,role:'owner',status:'active'});
    const {context,page}=await start(user);
    try {
      await expect(page.getByRole('heading',{name:'Host Control Center',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Open account menu',exact:true}).click();
      await page.getByRole('menuitem',{name:'Sponsor Panel',exact:true}).click();
      await expect(page).toHaveURL(/\/sponsor\/dashboard$/);
      await expect(page.getByRole('heading',{name:'Sponsor Dashboard',exact:true})).toBeVisible();
      check(true,'personal legacy capability retains Sponsor menu and pending organization entry');
      await page.reload({waitUntil:'domcontentloaded'});
      await expect(page.getByRole('heading',{name:'Sponsor Dashboard',exact:true})).toBeVisible();
      check(true,'Sponsor panel survives refresh without personal dashboard bounce');
    } finally { await context.close(); }
  });
  await test('Dashboard stability: Sponsor Enterprise Admin and workspace switching',async()=>{
    const sponsor=await seedUser('routing-sponsor',{sponsorOrg:'routing_sponsor_fixture'});await db.collection('sponsorOrganizations').doc('routing_sponsor_fixture').set({id:'routing_sponsor_fixture',name:'Routing Sponsor',status:'active',sponsorOnboardingComplete:true,verificationStatus:'verified',primary:true});await db.collection('sponsorMemberships').doc('routing_sponsor_member').set({sponsorOrganizationId:'routing_sponsor_fixture',userId:sponsor.uid,role:'owner',status:'active'});await update(sponsor,{selectedAccountType:'sponsor',account_type:'sponsor'});
    const enterprise=await seedUser('routing-enterprise',{enterpriseOrg:'routing_enterprise_fixture'});await db.collection('enterpriseOrganizations').doc('routing_enterprise_fixture').set({id:'routing_enterprise_fixture',status:'active'});await update(enterprise,{activeWorkspace:'enterprise',planId:'host',planStatus:'active',hostOnboardingComplete:true});
    const admin=await seedUser('routing-admin',{admin:true});const roleAdmin=await seedUser('routing-explicit-admin');await update(roleAdmin,{role:'admin',isAdmin:true,planId:'host',planStatus:'active',hostOnboardingComplete:true});
    for(const [user,path]of [[sponsor,'/sponsor/dashboard'],[enterprise,'/enterprise'],[admin,'/admin'],[roleAdmin,'/admin']]){const {context,page}=await start(user);try{await expect(page).toHaveURL(new RegExp(path.replaceAll('/','\\/')+'$'));check(!(await page.evaluate(()=>window.__dashboardTrace.creator)),'authorized workspace never flashes Creator Studio');if(user===enterprise){await expect(page.locator('[data-enterprise-studio]')).toBeVisible();await page.getByRole('button',{name:'Open account menu',exact:true}).click();await page.getByRole('button',{name:new RegExp('Journey routing-enterprise')}).first().click();await page.getByRole('menuitemradio',{name:/Personal Workspace/}).click();await expect(page).toHaveURL(/\/dashboard\/host$/);await expect(page.getByRole('heading',{name:'Host Control Center',exact:true})).toBeVisible();check(!(await page.evaluate(()=>window.__dashboardTrace.creator)),'personal switch goes directly to Host');}}finally{await context.close();}}
  });
}
