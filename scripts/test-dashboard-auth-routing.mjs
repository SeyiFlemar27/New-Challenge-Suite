import assert from 'node:assert/strict';
import {getDefaultRouteForAccount,getAuthenticatedDestination,getAccountRouteRedirect,safeInternalDestination,isRestrictedAccount} from '../lib/account-routing.ts';
let assertions=0;const eq=(a,b,label)=>{assert.equal(a,b,label);assertions++;};
const ready={uid:'fixture-user',verified:true,accountType:'user',accountTypeSelectionComplete:true,accountIntroOnboardingStatus:'complete',planId:'free',planStatus:'active',activeWorkspace:'personal',availableWorkspaces:['personal']};
const host={...ready,planId:'host',selectedAccountType:'creator',creatorOnboardingComplete:true,hostOnboardingComplete:true};
for(const [name,p,route]of [
 ['Free',ready,'/dashboard'],['Creator',{...ready,planId:'creator',creatorOnboardingComplete:true},'/dashboard'],
 ['Creator setup',{...ready,planId:'creator',creatorOnboardingComplete:false},'/onboarding/creator'],
 ['Host',host,'/dashboard/host'],['Host setup',{...host,hostOnboardingComplete:false},'/onboarding/host'],
 ['Legacy Host',{...host,planId:'verified_host'},'/dashboard/host'],
 ['Host role is not a subscription',{...ready,role:'host'},'/dashboard'],
 ['Expired Host',{...host,planStatus:'expired'},'/dashboard'],
 ['Pending Host',{...host,planStatus:'incomplete'},'/onboarding/premium'],
 ['Admin',{...ready,isAdmin:true},'/admin'],['Untrusted Admin label',{...ready,accountType:'admin'},'/dashboard'],
 ['Sponsor',{...ready,selectedAccountType:'sponsor',sponsorOnboardingComplete:true},'/sponsor/dashboard'],
 ['Sponsor setup',{...ready,selectedAccountType:'sponsor',sponsorOnboardingComplete:false},'/sponsor/onboarding'],
 ['Authorized Enterprise',{...host,activeWorkspace:'enterprise',availableWorkspaces:['personal','enterprise']},'/enterprise'],
 ['Unapproved Enterprise',{...host,activeWorkspace:'enterprise'},'/dashboard/host'],
 ['Email verification',{...host,verified:false,emailVerified:false},'/auth/verify-email'],
 ['Account selection',{...ready,accountTypeSelectionComplete:false},'/onboarding/account-type'],
 ['Introduction',{...ready,accountIntroOnboardingStatus:'in_progress'},'/onboarding/welcome'],
 ['Deletion',{...host,accountStatus:'scheduled_for_deletion'},'/account/deletion-status']
])eq(getDefaultRouteForAccount(p),route,name);
eq(getAuthenticatedDestination(host,'/challenges/fixture?join=1'),'/challenges/fixture?join=1','safe action takes precedence over default hub');
eq(getAuthenticatedDestination({...host,creatorOnboardingComplete:false},'/explore?type=normal'),'/explore?type=normal','completed Host setup supersedes unrelated Creator setup when preserving intent');
eq(getAuthenticatedDestination(host,'/dashboard/host'),'/dashboard/host','Host requested workspace');
eq(getAuthenticatedDestination(ready,'/admin'),'/dashboard','non-Admin request denied');
eq(getAuthenticatedDestination(ready,'/enterprise/finance'),'/dashboard','unauthorized enterprise return denied');
eq(getAuthenticatedDestination(ready,'/dashboard/host'),'/dashboard','subscription role cannot be bypassed');
eq(getAuthenticatedDestination(ready,'/enterprise/status'),'/enterprise/status','application status is not staff access');
eq(getAuthenticatedDestination({...host,hostOnboardingComplete:false},'/private/invitation?code=fixture'),'/onboarding/host?returnTo=%2Fprivate%2Finvitation%3Fcode%3Dfixture','intent survives required setup');
eq(getAuthenticatedDestination({...host,verified:false},'/challenges/fixture'),'/auth/verify-email?returnUrl=%2Fchallenges%2Ffixture','intent survives verification');
for(const unsafe of ['https://example.test','//example.test','/\\example.test','/%5cexample.test','/%2fexample.test','/%252fexample.test','/auth/login?next=/dashboard','/api/account/delete','/\n/evil','/%0d/evil','/%','javascript:alert(1)'])eq(safeInternalDestination(unsafe),'','unsafe destination '+JSON.stringify(unsafe));
eq(getAccountRouteRedirect(host,'/dashboard'),'/dashboard/host','hub guarded before mounting');
eq(getAccountRouteRedirect(host,'/dashboard','view=creator'),'','Host may intentionally use Creator Studio');
eq(getAccountRouteRedirect(host,'/dashboard/host'),'','Host refresh remains on Host');
eq(getAccountRouteRedirect(host,'/onboarding/host'),'/dashboard/host','completed Host setup does not restart');
eq(getAccountRouteRedirect({...host,hostOnboardingComplete:false},'/dashboard/host'),'/onboarding/host','incomplete setup cannot render Host dashboard');
eq(getAccountRouteRedirect(ready,'/dashboard/host'),'/dashboard','Free cannot render Host dashboard');
eq(getAccountRouteRedirect({...host,hostOnboardingComplete:false},'/private/invitation','code=fixture'),'/onboarding/host?returnTo=%2Fprivate%2Finvitation%3Fcode%3Dfixture','direct action retains query through route setup gate');
eq(isRestrictedAccount({...ready,accountStatus:'suspended'}),true,'suspension not normalized away');
eq(isRestrictedAccount(ready),false,'active account unaffected');
console.log(JSON.stringify({suite:'authoritative account routing behavior',assertions,passed:true}));
