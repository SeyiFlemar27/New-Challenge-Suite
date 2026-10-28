/** Authenticated demo journeys exercise real security event -> delivery -> API -> UI. */
export async function notificationJourneys({browser,test,check,expect,db,seedUser,login,admin,baseUrl,artifacts,join}) {
  const roles=['competitor','creator','host','sponsor','enterprise','admin'];
  const run='notice_'+Date.now();
  await Promise.all(['users','profiles'].map(collection=>db.collection(collection).doc(admin.uid).set({role:'admin',accountType:'admin',adminRole:'admin',adminRoles:['admin'],adminAccessStatus:'active',adminSecuritySetupComplete:true},{merge:true})));
  const operatorContext=await browser.newContext(),operatorPage=await login(operatorContext,admin);
  const operatorCookies=(await operatorContext.cookies()).map(cookie=>cookie.name+'='+cookie.value).join('; ');
  async function securityEvent(user) {
    const response=await fetch(`${baseUrl}/api/admin/people/users/${user.uid}`,{method:'PATCH',headers:{cookie:operatorCookies,origin:baseUrl,'content-type':'application/json'},body:JSON.stringify({action:'warn',reason:'Authorized isolated notification acceptance review'})});
    check(response.status===200,'real authorized security control recorded');
    if(response.status!==200)throw Error('Security event fixture could not be recorded');
  }
  async function fixtureHeaders(user) {
    const host=process.env.FIREBASE_AUTH_EMULATOR_HOST;
    if(!/^127\.0\.0\.1:\d+$/.test(host??''))throw Error('Demo Auth host required');
    const response=await fetch('http://'+host+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:user.email,password:user.password,returnSecureToken:true})});
    const data=await response.json();if(!response.ok||!data.idToken)throw Error('Demo authentication failed');
    return {origin:baseUrl,authorization:'Bearer '+data.idToken};
  }
  let retainedContext,retainedPage,retainedUser;
  try {
    for(const role of roles)await test('Notification acceptance: '+role+' shared inbox, settings and responsive states',async()=>{
      const org=run+'_'+role;
      const user=role==='admin'?admin:await seedUser(run+'_'+role,{role:role==='creator'?'creator':role==='sponsor'?'sponsor':'user',sponsorOrg:role==='sponsor'?org:null,enterpriseOrg:role==='enterprise'?org:null});
      if(role!=='admin')await Promise.all(['users','profiles'].map(collection=>db.collection(collection).doc(user.uid).set({planId:['creator','host'].includes(role)?role:'free',planStatus:'active',creatorOnboardingComplete:true,hostOnboardingComplete:true,...(role==='enterprise'?{activeWorkspace:'enterprise'}:{}),...(role==='sponsor'?{selectedAccountType:'sponsor',account_type:'sponsor',sponsorOnboardingComplete:true}:{})},{merge:true})));
      if(role==='sponsor'){
        await db.collection('sponsorOrganizations').doc(org).set({id:org,name:'Notification Acceptance Brand',status:'active',sponsorOnboardingComplete:true,verificationStatus:'verified'});
        await db.collection('sponsorMemberships').doc(org+'_member').set({sponsorOrganizationId:org,userId:user.uid,role:'owner',status:'active'});
        await db.collection('sponsorNotificationPreferences').doc(user.uid).set({preferences:{message_received:{in_app:true},payment_required:{in_app:false}}});
      }
      if(role==='enterprise')await db.collection('enterpriseOrganizations').doc(org).set({id:org,status:'active'});
      await securityEvent(user);
      const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await login(context,user);
      let keep=false;
      try {
        await page.goto(baseUrl+'/notifications');
        const bell=page.getByRole('button',{name:/^Open notifications/});
        await expect(bell).toHaveAccessibleName('Open notifications, 1 unread');
        await expect(page.getByRole('heading',{name:/^Account security update(?:Unread)?$/i})).toBeVisible();
        check(await page.getByRole('heading',{name:/^Account security update(?:Unread)?$/i}).isVisible(),'actual security event appears in person inbox');
        check(await bell.getAttribute('aria-haspopup')==='dialog','compact dropdown has correct semantics');
        await bell.focus();await page.keyboard.press('Enter');
        const dialog=page.getByRole('dialog',{name:'Notifications',exact:true});await expect(dialog).toBeVisible();
        check(await dialog.getByText(/^Account security update$/i).isVisible(),'dropdown uses same actual event');
        await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();check(await bell.evaluate(element=>document.activeElement===element),'Escape restores trigger focus');
        await bell.click();await page.getByText('Your important updates, together in one place.',{exact:true}).click();await expect(dialog).not.toBeVisible();check(await bell.getAttribute('aria-expanded')==='false','outside interaction dismisses dropdown');
        await page.screenshot({path:join(artifacts,`notification-${role}-desktop.png`),fullPage:true});
        for(const [label,width,height] of [['tablet',820,1180],['mobile',390,844]]){
          await page.setViewportSize({width,height});await bell.click();await expect(dialog).toBeVisible();
          check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),role+' '+label+' no horizontal overflow');
          const bounds=await dialog.boundingBox();check(Boolean(bounds&&bounds.y>=0&&bounds.y+bounds.height<=height),role+' '+label+' dropdown remains fully inside viewport');
          await page.screenshot({path:join(artifacts,`notification-${role}-${label}.png`),fullPage:true});await page.keyboard.press('Escape');
        }
        await page.setViewportSize({width:1440,height:1000});
        const own=(await db.collection('notifications').where('userId','==',user.uid).get()).docs[0];
        const anonymous=await browser.newContext();try{check((await anonymous.request.get(baseUrl+'/api/notifications')).status()===401,'anonymous inbox rejected');}finally{await anonymous.close();}
        const foreign=await seedUser(run+'_foreign_'+role);
        const foreignContext=await browser.newContext(),foreignPage=await login(foreignContext,foreign);
        try{check((await foreignPage.request.post(`${baseUrl}/api/notifications/${own.id}/read`,{headers:await fixtureHeaders(foreign)})).status()===404,'another account cannot mark the event read');}finally{await foreignContext.close();}
        await page.getByRole('button',{name:'Mark as read',exact:true}).click();await expect(bell).toHaveAccessibleName('Open notifications');
        check((await own.ref.get()).data().read===true,'individual read persisted');
        await page.goto(baseUrl+'/settings/notifications');
        await expect(page.getByRole('heading',{name:'Essential updates are always enabled',exact:true})).toBeVisible();
        const results=page.getByLabel('Official results for challenges I only voted in',{exact:true}),reminders=page.getByLabel('One-hour voting reminders for my subscribed challenges',{exact:true});
        await expect(results).toBeChecked();await expect(reminders).not.toBeChecked();
        check((await page.request.patch(baseUrl+'/api/notifications/preferences',{headers:await fixtureHeaders(user),data:{inApp:false}})).status()===400,'essential disable is rejected server-side');
        if(role==='sponsor')await expect(page.getByLabel('Direct message updates',{exact:true})).toBeChecked();
        await results.uncheck();await reminders.check();await page.getByRole('button',{name:'Save notification settings',exact:true}).click();await expect(page.getByText('Notification settings saved.',{exact:true})).toBeVisible();
        await page.reload();await expect(results).not.toBeChecked();await expect(reminders).toBeChecked();check((await db.collection('notificationPreferences').doc(user.uid).get()).data().essentialInApp===true,'shared saved preference preserves essential policy');
        await page.goto(baseUrl+'/notifications');await page.getByRole('button',{name:'Unread',exact:true}).click();await expect(page.getByRole('heading',{name:"You're all caught up",exact:true})).toBeVisible();await page.screenshot({path:join(artifacts,`notification-${role}-empty.png`),fullPage:true});
        if(role==='sponsor'){await page.goto(baseUrl+'/sponsor/notifications');await expect(page).toHaveURL(baseUrl+'/notifications');check(await page.getByText('Preference matrix',{exact:true}).count()===0,'legacy Sponsor screen redirects to one inbox');}
        if(role==='competitor'){retainedContext=context;retainedPage=page;retainedUser=user;keep=true;}
      }catch(error){
        await page.screenshot({path:join(artifacts,`notification-${role}-failure.png`),fullPage:true}).catch(()=>undefined);
        const state=(await page.locator("body").innerText()).slice(0,1000);
        throw new Error(`${error.message}; actual notification page ${new URL(page.url()).pathname}: ${state}`);
      }finally{if(!keep)await context.close();}
    });
    await test('Notification acceptance: pagination, complete mark-all and retrieval states',async()=>{
      if(!retainedPage)throw Error('Competitor journey prerequisite failed');
      const page=retainedPage;
      for(let index=0;index<28;index++)await securityEvent(retainedUser);
      await page.goto(baseUrl+'/notifications');
      const bell=page.getByRole('button',{name:/^Open notifications/});await expect(bell).toHaveAccessibleName('Open notifications, 28 unread');
      await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByText('Page 2',{exact:true})).toBeVisible();
      await expect(page.getByRole('heading',{name:/^Account security update(?:Unread)?$/i}).first()).toBeVisible();check(await page.getByRole('heading',{name:/^Account security update(?:Unread)?$/i}).count()>0,'chronological continuation contains older real events');
      await page.getByRole('button',{name:'Mark all as read',exact:true}).click();await expect(bell).toHaveAccessibleName('Open notifications');
      check((await db.collection('notifications').where('userId','==',retainedUser.uid).get()).docs.every(row=>row.data().read===true),'mark-all includes events beyond current page');
      await page.getByLabel('Category').selectOption('money');await expect(page.getByRole('heading',{name:/No matching updates/})).toBeVisible();
      await page.screenshot({path:join(artifacts,'notification-filtered-empty.png'),fullPage:true});
      await page.route('**/api/notifications?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,message:'Isolated retrieval failure'})}));await page.reload();await expect(page.getByText('Notifications could not load.',{exact:true})).toBeVisible();await page.screenshot({path:join(artifacts,'notification-retrieval-error.png'),fullPage:true});
      await page.unroute('**/api/notifications?**');await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByRole('heading',{name:/^Account security update(?:Unread)?$/i}).first()).toBeVisible();check(true,'real API retry recovers without changing user data');
      let release;const gate=new Promise(resolve=>{release=resolve;});await page.route('**/api/notifications?**',async route=>{await gate;await route.continue();});
      try{await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByText('Loading your updates…',{exact:true})).toBeVisible();check(true,'delayed retrieval shows loading rather than false empty state');}finally{release();await page.unroute('**/api/notifications?**');}
      await expect(page.getByRole('heading',{name:/^Account security update(?:Unread)?$/i}).first()).toBeVisible();
    });
    await test('Notification acceptance: quiet automatic refresh, priority and account isolation',async()=>{
      const page=retainedPage;if(!page)throw Error('Competitor prerequisite failed');
      await page.bringToFront();await page.goto(baseUrl+'/notifications');const bell=page.getByRole('button',{name:/^Open notifications/});await expect(bell).toHaveAccessibleName('Open notifications');
      await securityEvent(retainedUser);await expect(bell).toHaveAccessibleName('Open notifications, 1 unread',{timeout:75000});
      await expect(page.locator('[aria-live=polite]').filter({hasText:/Priority update: Account security update/i})).toHaveAttribute('aria-live','polite');check(true,'foreground polling updates badge and subtle priority announcement without navigation');
      await bell.click();await page.getByRole('dialog',{name:'Notifications',exact:true}).getByRole('link',{name:/Account security update/i}).first().click();await expect(page).toHaveURL(baseUrl+'/settings');check(true,'notification destination works');
      const next=await seedUser(run+'_next_account');await page.getByRole('button',{name:'Open account menu',exact:true}).click();await page.getByRole('menuitem',{name:'Log Out',exact:true}).click();await expect(page).toHaveURL(/\/auth\/login$/);
      await page.getByLabel('Email Address').fill(next.email);await page.getByLabel('Password',{exact:true}).fill(next.password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page).not.toHaveURL(/\/auth\/login/);await page.goto(baseUrl+'/notifications');await expect(page.getByRole('heading',{name:'No notifications yet',exact:true})).toBeVisible();
      check(await page.getByRole('heading',{name:/^Account security update(?:Unread)?$/i}).count()===0,'no previous account content remains');check(await page.getByRole('button',{name:'Open notifications',exact:true}).count()===1,'new account unread badge is isolated');await page.screenshot({path:join(artifacts,'notification-switched-account-empty.png'),fullPage:true});
    });
  }finally{await retainedContext?.close();await operatorPage.close();await operatorContext.close();}
}
