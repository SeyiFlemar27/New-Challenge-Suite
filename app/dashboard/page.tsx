"use client";
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { AppShell } from '@/components/app-shell';
import { AccountResolutionState } from '@/components/account-resolution-state';
import { fetchDashboard, fetchChallengeUsage } from '@/lib/api/services';
import { getUserPlanAccess } from '@/lib/plan-access';
import { CreatorStudio } from '@/components/creator/creator-studio';
import { FreeDashboard } from '@/components/dashboard/free-dashboard';
import type { DashboardRecord } from '@/lib/dashboard-presentation';

export default function DashboardPage() {
  const {user,revision}=useCurrentUser();
  const query=useQuery({queryKey:['dashboard',user?.uid,user?.activeWorkspace,revision],queryFn:fetchDashboard,staleTime:30000,enabled:Boolean(user)});
  const usage=useQuery({queryKey:['challenge-usage',user?.uid,revision],queryFn:fetchChallengeUsage,staleTime:30000,enabled:Boolean(user)});
  if(!user||query.isLoading)return <AccountResolutionState/>;
  const dashboard=query.data?.ok?query.data.data:null;
  if(!dashboard)return <AccountResolutionState error={query.data?.message||'Dashboard information could not be loaded.'} onRetry={()=>void query.refetch()}/>;
  const plan=getUserPlanAccess({...user});
  return <AppShell>{plan.isCreator||plan.isHost||plan.isPro?<CreatorStudio displayName={dashboard.user.displayName} challenges={(dashboard.hostedChallenges??[]) as DashboardRecord[]} availableEarningsCents={dashboard.cashWallet?.availableBalanceCents??0} pendingEarningsCents={dashboard.cashWallet?.pendingBalanceCents??0}/>:<FreeDashboard dashboard={dashboard} user={user} revision={revision} usage={usage.data?.ok?usage.data.data?.freeBasic:undefined}/>}</AppShell>;
}
