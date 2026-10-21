"use client";
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { getUserPlanAccess } from '@/lib/plan-access';
import { fetchDashboard } from '@/lib/api/services';
import { apiRequest } from '@/lib/api/client';
import { AppShell } from '@/components/app-shell';
import { PlanFeatureGate } from '@/components/plan-feature-gate';
import { AccountResolutionState } from '@/components/account-resolution-state';
import { Button, Card, LinkButton } from '@/components/ui';
import { HostOverview } from '@/components/dashboard/host-overview';

export default function HostControlCenterPage(){
  const {user,revision,refreshProfile}=useCurrentUser();
  const params=useSearchParams();const plan=getUserPlanAccess({...user});
  const pending=params.get('checkout')==='success'&&params.get('activation')==='pending'&&!plan.isHost;
  const [refreshing,setRefreshing]=useState(false);const [message,setMessage]=useState('Your Host membership is still being activated. Host operations are unavailable until confirmation.');
  const query=useQuery({queryKey:['dashboard','host',user?.uid,user?.activeWorkspace,revision],queryFn:fetchDashboard,staleTime:30000,enabled:Boolean(user)&&plan.isHost});
  async function refreshHostStatus(){setRefreshing(true);try{const search=new URLSearchParams({purpose:'subscription',resourceId:'host',verify:'1'});const reference=params.get('session_id');if(reference&&/^cs_[A-Za-z0-9_]+$/.test(reference))search.set('reference',reference);const result=await apiRequest<{state?:string}>('/api/payments/status?'+search,{cache:'no-store'});if(result.ok&&result.data?.state==='confirmed')await refreshProfile();else setMessage(result.message||'Membership activation is still pending.');}catch{setMessage('Membership status could not be refreshed. Please try again or contact support.');}finally{setRefreshing(false);}}
  if(pending)return <AppShell><Card className="mx-auto max-w-xl p-7"><h1 className="text-xl font-bold">Host activation pending</h1><p className="mt-3" role="status">{message}</p><Button className="mt-5" disabled={refreshing} onClick={()=>void refreshHostStatus()}>{refreshing?'Refreshing…':'Refresh Status'}</Button><LinkButton href="/contact" variant="ghost" className="ml-3">Contact Support</LinkButton></Card></AppShell>;
  const dashboard=query.data?.ok?query.data.data:null;
  return <PlanFeatureGate feature="host_control_center" requiredPlan="Host" title="Host tools are available on the Host Plan">{!user||query.isLoading?<AccountResolutionState/>:!dashboard?<AccountResolutionState error={query.data?.message||'Host dashboard could not be loaded.'} onRetry={()=>void query.refetch()}/>:<AppShell><HostOverview dashboard={dashboard} user={user}/></AppShell>}</PlanFeatureGate>;
}
