import Image from "next/image";
import Link from "next/link";
import { brandConfig } from "@/lib/brand-config";
import { cn } from "@/lib/utils";

export type ChallengeSuiteLogoProps = {
  variant?: "full" | "compact" | "icon";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  showWordmark?: boolean;
  href?: string;
  clickable?: boolean;
};

const dimensions = {
  xs: 32,
  sm: 40,
  md: 52,
  lg: 72,
  xl: 96
} as const;

export function ChallengeSuiteLogo({
  variant = "full",
  size = "md",
  priority = false,
  className,
  imageClassName,
  showWordmark = false,
  href = brandConfig.homeHref,
  clickable = true
}: ChallengeSuiteLogoProps) {
  const pixels = dimensions[size];
  const image = (
    <Image
      src={brandConfig.logo.local}
      alt={showWordmark ? "" : brandConfig.name}
      width={pixels}
      height={pixels}
      priority={priority}
      sizes={`${pixels}px`}
      className={cn("h-auto shrink-0 object-contain", imageClassName)}
    />
  );
  const content = (
    <span
      className={cn("inline-flex min-w-0 items-center justify-center gap-3", className)}
      data-challenge-suite-logo
      data-logo-variant={variant}
    >
      {image}
      {showWordmark ? <span className="truncate font-black">{brandConfig.name}</span> : null}
    </span>
  );
  if (!clickable) return content;
  return <Link href={href} aria-label={`${brandConfig.name} home`} className="inline-flex min-w-0">{content}</Link>;
}
