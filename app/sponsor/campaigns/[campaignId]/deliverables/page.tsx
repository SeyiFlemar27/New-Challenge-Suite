"use client";

import { useParams } from "next/navigation";
import SponsorDeliverablesPage from "@/app/sponsor/deliverables/page";

export default function CampaignDeliverablesPage() {
  const params = useParams<{ campaignId: string }>();
  void params;
  return <SponsorDeliverablesPage />;
}
