import type { Metadata } from "next";
import { ChallengeControlCentre } from "@/components/admin/challenge-control-centre";
export const metadata: Metadata = { title: "Challenge Control Centre" };
export default async function Page({ params }: { params: Promise<{ challengeId: string }> }) { return <ChallengeControlCentre challengeId={(await params).challengeId} />; }
