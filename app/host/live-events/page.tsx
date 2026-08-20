import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { ChallengeDiscoveryPage } from "@/components/challenge-discovery-page";
export default function HostLiveEventsPage() { return <PlanFeatureGate feature="host_control_center" requiredPlan="Host" title="Host tools are available on the Host Plan."><ChallengeDiscoveryPage kind="live" createHref="/host/live/create" /></PlanFeatureGate>; }
