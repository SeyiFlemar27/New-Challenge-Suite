import { redirect } from "next/navigation";

/** Preserve old bookmarks while removing the Sponsor proposal builder route. */
export default function RetiredSponsorProposalPage() {
  redirect("/sponsor/campaigns/create");
}
