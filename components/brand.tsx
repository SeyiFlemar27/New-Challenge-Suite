import { Award, BadgeCheck, BriefcaseBusiness, Crown, Diamond, Flame, ShieldCheck, Sparkles, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserPlanId } from "@/lib/types";
import { findCustomizationOption } from "@/lib/customization/options";

export const logoUrl = "https://res.cloudinary.com/drefcs4o2/image/upload/v1775267495/logo-gold_chstxw.jpg";

export function BrandLogo({ className, imageClassName }: { className?: string; imageClassName?: string }) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <img src={logoUrl} alt="Challenge Suite" className={cn("h-20 w-20 rounded-full object-cover", imageClassName)} />
    </div>
  );
}

export function planBadgeLabel(planId?: UserPlanId | string | null) {
  switch (planId) {
    case "creator":
    case "creator_pro":
      return "Creator";
    case "pro":
    case "premium":
    case "competitor":
      return "Pro";
    case "host":
    case "verified_host":
    case "executive_host":
      return "Host";
    case "enterprise":
    case "chief_producer":
      return "Enterprise";
    case "sponsor_starter":
      return "Sponsor Starter";
    case "brand_partner":
      return "Brand Partner";
    case "enterprise_partner":
    case "enterprise_sponsor":
      return "Enterprise Partner";
    default:
      return "Free";
  }
}

export function PremiumBadge({ planId, compact = false, badgeStyleId, labelOverride }: { planId?: UserPlanId; compact?: boolean; badgeStyleId?: string; labelOverride?: string }) {
  const label = labelOverride || planBadgeLabel(planId);
  const premium = planBadgeLabel(planId) !== "Free";
  const sponsor = label.includes("Sponsor") || label.includes("Partner");
  const badgeStyle = badgeStyleId ? findCustomizationOption(badgeStyleId, "badge") : null;
  const BadgeIcon = sponsor ? BriefcaseBusiness
    : badgeStyleId === "premium_gold" ? Star
      : badgeStyleId === "premium_diamond" ? Diamond
        : badgeStyleId === "creator_pro" ? Crown
          : badgeStyleId === "top_voter" ? Flame
            : badgeStyleId === "rising_star" ? Sparkles
              : badgeStyleId === "verified_host" ? ShieldCheck
                : badgeStyleId === "elite_host" ? Award
                  : BadgeCheck;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border font-black", badgeStyle?.previewClass ?? (premium ? "border-[var(--gold)]/40 bg-[var(--gold)]/10 text-[var(--gold-2)]" : "border-white/10 bg-white/5 text-slate-300"), compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm")}>
      <BadgeIcon size={compact ? 14 : 16} className={premium ? "text-current" : "text-slate-400"} />
      {badgeStyle?.name ?? label}
    </span>
  );
}
