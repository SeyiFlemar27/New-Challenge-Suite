"use client";

import Link from "next/link";
import { ChevronDown, Globe2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { workspaceForRoute } from "@/lib/workspace-routing";

const publicFooterSections = [
  { title: "Explore", links: [["Explore challenges", "/explore"], ["Live events", "/live-events"], ["Tournaments", "/tournaments"]] },
  { title: "Challenges", links: [["All challenges", "/challenges"], ["My entries", "/my-entries"], ["Winners", "/winners"]] },
  { title: "Creators", links: [["Profiles", "/profile"], ["Leaderboards", "/leaderboards"], ["Create a challenge", "/challenges/create"]] },
  { title: "Sponsors", links: [["Become a sponsor", "/sponsor/start"], ["Discover challenges", "/sponsor/discover/challenges"], ["Sponsor plans", "/sponsor/plans"]] },
  { title: "Company", links: [["About", "/about"], ["Contact", "/contact"], ["Enterprise", "/enterprise"]] },
  { title: "Support", links: [["Contact support", "/contact"], ["Community guidelines", "/community-guidelines"], ["Refund policy", "/refund-policy"]] },
  { title: "Legal", links: [["Privacy", "/privacy"], ["Terms", "/terms"], ["Cookie policy", "/cookie-policy"]] }
] as const;

const enterpriseFooterSections = [
  { title: "Enterprise", links: [["Enterprise Studio", "/enterprise"], ["Official challenges", "/enterprise/challenges"], ["Assigned to me", "/enterprise/assigned"], ["Saved", "/enterprise/saved"]] },
  { title: "Community", links: [["Explore", "/explore"], ["Leaderboards", "/leaderboards"], ["Winners", "/winners"]] },
  { title: "Account", links: [["Profile", "/profile"], ["Settings", "/settings"], ["Contact support", "/contact"]] },
  { title: "Legal", links: [["Privacy", "/privacy"], ["Terms", "/terms"], ["Cookie policy", "/cookie-policy"]] }
] as const;

const sponsorFooterSections = [
  { title: "Sponsor", links: [["Sponsor Dashboard", "/sponsor/dashboard"], ["Discover challenges", "/sponsor/discover/challenges"], ["Proposals", "/sponsor/proposals"], ["Saved", "/sponsor/saved"]] },
  { title: "Account", links: [["Sponsor reports", "/sponsor/reports"], ["Wallet & payments", "/sponsor/wallet"], ["Settings", "/settings"], ["Contact support", "/contact"]] },
  { title: "Legal", links: [["Privacy", "/privacy"], ["Terms", "/terms"], ["Cookie policy", "/cookie-policy"]] }
] as const;

export function MobileFooter() {
  const pathname = usePathname();
  const { user, loading, signedOut } = useCurrentUser();
  const workspace = signedOut ? "personal" : workspaceForRoute(pathname, user?.activeWorkspace, user?.availableWorkspaces ?? ["personal"]);
  const footerSections = workspace === "enterprise" ? enterpriseFooterSections : workspace === "sponsor" ? sponsorFooterSections : publicFooterSections;

  if (loading && !signedOut) return null;

  return (
    <footer data-mobile-footer className="mt-14 border-t border-white/10 bg-[var(--panel)] lg:hidden">
      <div className="mx-auto max-w-xl px-5 py-8">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">Competition, made intentional.</p>
        <div className="mt-7 divide-y divide-white/10 border-y border-white/10">
          {footerSections.map((section) => (
            <details key={section.title} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">
                {section.title}
                <ChevronDown size={18} className="text-slate-500 transition group-open:rotate-180" />
              </summary>
              <div className="grid gap-1 pb-4">
                {section.links.map(([label, href]) => (
                  <Link key={href} href={href} className="flex min-h-11 items-center rounded-[8px] px-3 text-sm font-bold text-slate-400 hover:bg-white/5 hover:text-white">
                    {label}
                  </Link>
                ))}
              </div>
            </details>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-6 text-xs font-bold text-slate-500">
          <span className="inline-flex items-center gap-2"><Globe2 size={15} /> English</span>
          <span>Challenge timezone shown per competition</span>
          <span>USD where supported</span>
        </div>
      </div>
    </footer>
  );
}
