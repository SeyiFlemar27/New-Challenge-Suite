import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserPlanId } from "@/lib/types";

export const logoUrl = "https://res.cloudinary.com/drefcs4o2/image/upload/v1775267495/logo-gold_chstxw.jpg";

export function BrandLogo({ className, imageClassName }: { className?: string; imageClassName?: string }) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <img src={logoUrl} alt="Challenge Suite" className={cn("h-20 w-20 rounded-full object-cover", imageClassName)} />
    </div>
  );
}

export function PremiumBadge({ planId, compact = false }: { planId?: UserPlanId; compact?: boolean }) {
  const premium = planId && planId !== "observer";
  if (!premium) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-500/15 font-black text-sky-300", compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm")}>
      <BadgeCheck size={compact ? 14 : 16} className="fill-sky-400 text-black" />
      Premium
    </span>
  );
}
