import Link from 'next/link';
import { ArrowRight, Crown } from 'lucide-react';
import type { CurrentUserProfile } from '@/lib/hooks/use-current-user';
import { getUserPlanAccess } from '@/lib/plan-access';

export function DashboardPromotion({user,enabled}:{user:CurrentUserProfile|null|undefined;enabled:boolean}) {
  if (!user||!enabled||user.accountType==='admin'||user.accountType==='sponsor'||user.activeWorkspace==='enterprise') return null;
  const plan=getUserPlanAccess({...user});
  if (plan.isHost||plan.isEnterprise||plan.isSponsor) return null;
  const target=plan.isCreator||plan.isPro?'Host':'Creator';
  return <div className="dashboard-promotion" data-dashboard-promotion><Crown size={23} className="mb-2 text-amber-600"/><b>Explore {target} Plan</b><p>{target==='Creator'?'Discover more ways to create and manage your challenges.':'Explore more tools for hosting competitions and live events.'}</p><Link href="/subscriptions">Explore {target} Plan<ArrowRight size={14}/></Link></div>;
}
