import { FileText, Play } from "lucide-react";
import { cn } from "@/lib/utils";

type MediaFrameProps = { src?: string | null; alt: string; className?: string; objectFit?: "cover" | "contain"; placeholder?: string };

function Frame({ ratio, src, alt, className, objectFit = "cover", placeholder = "Challenge Suite" }: MediaFrameProps & { ratio: string }) {
  return <div className={cn("relative overflow-hidden rounded-[8px] border border-white/10 bg-[#171717]", ratio, className)}>
    {src ? <img src={src} alt={alt} className={cn("h-full w-full object-center", objectFit === "cover" ? "object-cover" : "object-contain")} /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#191919] via-[#101010] to-[#2b220b] p-4 text-center text-sm font-black uppercase tracking-[0.16em] text-[var(--gold)]">{placeholder}</div>}
  </div>;
}

export function ChallengeMediaFrame(props: MediaFrameProps) { return <Frame {...props} ratio="aspect-video" />; }

export function ChallengeMediaGallery({ title, videoUrl, images }: { title: string; videoUrl?: string | null; images: Array<string | null | undefined> }) {
  const imageUrls = Array.from(new Set(images.map((value) => String(value ?? "").trim()).filter(Boolean)));
  return <div className="space-y-3" data-challenge-media-gallery data-video-first={Boolean(videoUrl)}>
    {videoUrl ? <div className="group relative aspect-video overflow-hidden rounded-[8px] border border-white/10 bg-black">
      <video src={videoUrl} controls playsInline preload="metadata" className="h-full w-full object-contain" aria-label={`${title} video`} />
      <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold text-white opacity-80 transition group-hover:opacity-30"><Play size={12} fill="currentColor" /> Video</span>
    </div> : null}
    {imageUrls.length ? <div className={`grid gap-3 ${imageUrls.length > 1 ? "sm:grid-cols-2" : ""}`}>
      {imageUrls.map((src, index) => <ChallengeMediaFrame key={src} src={src} alt={`${title} image ${index + 1}`} className="h-auto border-0" />)}
    </div> : !videoUrl ? <ChallengeMediaFrame alt={title} placeholder="Challenge Suite" className="h-auto border-0" /> : null}
  </div>;
}
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
