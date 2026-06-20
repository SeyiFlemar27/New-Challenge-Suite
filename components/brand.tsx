import { Award, BadgeCheck, Crown, Diamond, Flame, ShieldCheck, Sparkles, Star } from "lucide-react";
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

function planBadgeLabel(planId?: UserPlanId) {
  if (planId === "verified_host" || planId === "executive_host" || planId === "chief_producer") return "Verified Host";
  if (planId === "creator_pro") return "Creator Pro";
  if (planId === "premium" || planId === "creator" || planId === "competitor") return "Premium";
  return "Free Member";
}

export function PremiumBadge({ planId, compact = false, badgeStyleId }: { planId?: UserPlanId; compact?: boolean; badgeStyleId?: string }) {
  const label = planBadgeLabel(planId);
  const premium = label !== "Free Member";
  const badgeStyle = badgeStyleId ? findCustomizationOption(badgeStyleId, "badge") : null;
  const BadgeIcon = badgeStyleId === "premium_gold" ? Star
    : badgeStyleId === "premium_diamond" ? Diamond
      : badgeStyleId === "creator_pro" ? Crown
        : badgeStyleId === "top_voter" ? Flame
          : badgeStyleId === "rising_star" ? Sparkles
            : badgeStyleId === "verified_host" ? ShieldCheck
              : badgeStyleId === "elite_host" ? Award
                : BadgeCheck;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border font-black", badgeStyle?.previewClass ?? (premium ? "border-sky-400/40 bg-sky-500/15 text-sky-300" : "border-white/10 bg-white/5 text-slate-300"), compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm")}>
      <BadgeIcon size={compact ? 14 : 16} className={premium ? "text-current" : "text-slate-400"} />
      {badgeStyle?.name ?? label}
    </span>
  );
}
