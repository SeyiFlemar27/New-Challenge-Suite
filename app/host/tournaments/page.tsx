import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { ChallengeDiscoveryPage } from "@/components/challenge-discovery-page";
export default function HostTournamentsPage() { return <PlanFeatureGate feature="tournament_builder" requiredPlan="Host" title="Tournament tools require Host Plan"><ChallengeDiscoveryPage kind="tournament" createHref="/host/tournaments/create" /></PlanFeatureGate>; }
