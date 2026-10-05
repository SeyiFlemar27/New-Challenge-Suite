import { SponsorCampaignBuilder } from "@/components/sponsor/sponsor-campaign-builder";

export default async function SponsorCampaignPage({ params }: { params: Promise<{ campaignId: string }> }) { const { campaignId } = await params; return <SponsorCampaignBuilder campaignId={campaignId} />; }
