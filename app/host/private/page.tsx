import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { ChallengeDiscoveryPage } from "@/components/challenge-discovery-page";
export default function HostPrivateChallengesPage() { return <PlanFeatureGate feature="host_control_center" requiredPlan="Host" title="Host tools are available on the Host Plan."><ChallengeDiscoveryPage kind="private" createHref="/creator/private-challenges/create" /></PlanFeatureGate>; }
