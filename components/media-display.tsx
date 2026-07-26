import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type MediaFrameProps = { src?: string | null; alt: string; className?: string; objectFit?: "cover" | "contain"; placeholder?: string };

function Frame({ ratio, src, alt, className, objectFit = "cover", placeholder = "Challenge Suite" }: MediaFrameProps & { ratio: string }) {
  return <div className={cn("relative overflow-hidden rounded-[8px] border border-white/10 bg-[#171717]", ratio, className)}>
    {src ? <img src={src} alt={alt} className={cn("h-full w-full object-center", objectFit === "cover" ? "object-cover" : "object-contain")} /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#191919] via-[#101010] to-[#2b220b] p-4 text-center text-sm font-black uppercase tracking-[0.16em] text-[var(--gold)]">{placeholder}</div>}
  </div>;
}

export function ChallengeMediaFrame(props: MediaFrameProps) { return <Frame {...props} ratio="aspect-video" />; }
export function GalleryMediaFrame(props: MediaFrameProps) { return <Frame {...props} ratio="aspect-[4/5]" />; }
export function SubmissionMediaFrame(props: MediaFrameProps) { return <Frame {...props} ratio="aspect-[4/5]" objectFit={props.objectFit ?? "cover"} />; }
export function AvatarFrame(props: MediaFrameProps) { return <Frame {...props} ratio="aspect-square rounded-full" placeholder={props.placeholder ?? "CS"} />; }
export function SponsorLogoFrame(props: MediaFrameProps) { return <Frame {...props} ratio="aspect-square" placeholder={props.placeholder ?? "Sponsor"} />; }
export function SponsorBannerFrame(props: MediaFrameProps) { return <Frame {...props} ratio="aspect-[3/1]" placeholder={props.placeholder ?? "Sponsor Banner"} />; }

export function MessageAttachmentPreview({ attachment }: { attachment: { url?: string; contentType?: string; fileName?: string } }) {
  if (String(attachment.contentType ?? "").startsWith("image/")) {
    return <ChallengeMediaFrame src={attachment.url} alt={attachment.fileName || "Message attachment"} objectFit="contain" className="max-w-sm" placeholder="Attachment" />;
  }
  return <div className="inline-flex min-h-16 items-center gap-3 rounded-[8px] border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-slate-200"><FileText size={18} />{attachment.fileName || "Document attachment"}</div>;
}
