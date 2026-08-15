"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChallengeGalleryMedia = {
  id: string;
  type: "image" | "video";
  url: string;
  posterUrl?: string;
  alt: string;
};

function pause(video: HTMLVideoElement | null) {
  if (video && !video.paused) video.pause();
}
function orderedMedia(videoUrl: string, images: string[], title: string): ChallengeGalleryMedia[] {
  const cleanImages = Array.from(new Set(images.map((value) => value.trim()).filter(Boolean)));
  return [
    ...(videoUrl ? [{ id: `video:${videoUrl}`, type: "video" as const, url: videoUrl, posterUrl: cleanImages[0], alt: `${title} video` }] : []),
    ...cleanImages.map((url, index) => ({ id: `image:${url}`, type: "image" as const, url, alt: `${title} image ${index + 1}` }))
  ];
}

export function ChallengeMediaGallery({
  title,
  videoUrl = "",
  images
}: {
  title: string;
  videoUrl?: string | null;
  images: Array<string | null | undefined>;
}) {
  const media = useMemo(
    () => orderedMedia(String(videoUrl ?? ""), images.map((value) => String(value ?? "")), title),
    [images, title, videoUrl]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const active = media[activeIndex];

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(media.length - 1, 0)));
  }, [media.length]);

  useEffect(() => {
    pause(videoRef.current);
  }, [activeIndex]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft") setActiveIndex((current) => Math.max(0, current - 1));
      if (event.key === "ArrowRight") setActiveIndex((current) => Math.min(media.length - 1, current + 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, media.length]);

  if (!active) {
    return (
      <div className="grid aspect-[16/10] place-items-center rounded-[12px] bg-[linear-gradient(135deg,#171717,#080808)] text-sm font-black uppercase tracking-[0.18em] text-[var(--gold)]">
        Challenge Suite
      </div>
    );
  }

  const previous = () => setActiveIndex((current) => Math.max(0, current - 1));
  const next = () => setActiveIndex((current) => Math.min(media.length - 1, current + 1));

  return (
    <div data-challenge-media-gallery data-video-first={media[0]?.type === "video"}>
      <div
        className="group relative aspect-[16/10] overflow-hidden rounded-[12px] bg-[#090909]"
        onMouseEnter={() => {
          if (active.type === "video") void videoRef.current?.play().catch(() => undefined);
        }}
        onMouseLeave={() => pause(videoRef.current)}
      >
        {active.type === "video" ? (
          <video ref={videoRef} src={active.url} poster={active.posterUrl} controls muted playsInline preload="metadata" className="h-full w-full object-contain" aria-label={active.alt} />
        ) : (
          <button type="button" className="h-full w-full cursor-zoom-in" onClick={() => setLightboxOpen(true)} aria-label={`Enlarge ${active.alt}`}>
            <img src={active.url} alt={active.alt} className="h-full w-full object-contain" loading="eager" />
          </button>
        )}
        {activeIndex > 0 ? <GalleryArrow direction="previous" onClick={previous} /> : null}
        {activeIndex < media.length - 1 ? <GalleryArrow direction="next" onClick={next} /> : null}
        <button type="button" onClick={() => setLightboxOpen(true)} className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-black/65 text-white opacity-90 transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--gold)]" aria-label="Open enlarged media viewer">
          <Expand size={17} />
        </button>
      </div>
      {media.length > 1 ? (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1" aria-label="Challenge media thumbnails">
          {media.map((item, index) => (
            <button key={item.id} type="button" onClick={() => setActiveIndex(index)} aria-label={`Show ${item.alt}`} aria-current={index === activeIndex ? "true" : undefined} className={cn("relative aspect-[16/10] w-24 shrink-0 overflow-hidden rounded-[6px] border-2 bg-black transition sm:w-28", index === activeIndex ? "border-[var(--gold)]" : "border-transparent opacity-70 hover:opacity-100")}>
              {item.type === "video" ? <><video src={item.url} poster={item.posterUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" /><span className="absolute inset-0 grid place-items-center bg-black/25 text-white"><Play size={17} fill="currentColor" /></span></> : <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />}
            </button>
          ))}
        </div>
      ) : null}
      {lightboxOpen ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label={`${title} media viewer`} onMouseDown={(event) => { if (event.target === event.currentTarget) setLightboxOpen(false); }}>
          <button type="button" onClick={() => setLightboxOpen(false)} className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close media viewer"><X /></button>
          {active.type === "video" ? <video src={active.url} poster={active.posterUrl} controls muted playsInline preload="metadata" className="max-h-[88vh] max-w-[92vw] object-contain" /> : <img src={active.url} alt={active.alt} className="max-h-[88vh] max-w-[92vw] object-contain" />}
          {activeIndex > 0 ? <GalleryArrow direction="previous" onClick={previous} fixed /> : null}
          {activeIndex < media.length - 1 ? <GalleryArrow direction="next" onClick={next} fixed /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function ExploreCardMedia({
  title,
  videoUrl = "",
  images
}: {
  title: string;
  videoUrl?: string | null;
  images: Array<string | null | undefined>;
}) {
  const media = useMemo(
    () => orderedMedia(String(videoUrl ?? ""), images.map((value) => String(value ?? "")), title),
    [images, title, videoUrl]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const active = media[activeIndex];

  useEffect(() => {
    pause(videoRef.current);
  }, [activeIndex]);

  if (!active) return <div className="grid aspect-[16/10] place-items-center bg-[#111] text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite</div>;

  const move = (direction: -1 | 1, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    pause(videoRef.current);
    setActiveIndex((current) => Math.max(0, Math.min(media.length - 1, current + direction)));
  };

  return (
    <div
      data-explore-media-carousel
      data-video-first={media[0]?.type === "video"}
      className="group/media relative aspect-[16/10] overflow-hidden bg-[#0d0d0d]"
      onMouseEnter={() => {
        if (active.type === "video") void videoRef.current?.play().catch(() => undefined);
      }}
      onMouseLeave={() => pause(videoRef.current)}
    >
      {active.type === "video" ? (
        <><video ref={videoRef} src={active.url} poster={active.posterUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-label={active.alt} /><span className="pointer-events-none absolute bottom-3 left-3 grid size-8 place-items-center rounded-full bg-black/70 text-white"><Play size={14} fill="currentColor" /></span></>
      ) : (
        <img src={active.url} alt={active.alt} className="h-full w-full object-cover" loading={activeIndex === 0 ? "eager" : "lazy"} />
      )}
      {activeIndex > 0 ? <CardArrow direction="previous" onClick={(event) => move(-1, event)} /> : null}
      {activeIndex < media.length - 1 ? <CardArrow direction="next" onClick={(event) => move(1, event)} /> : null}
      {media.length > 1 ? <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/65 px-2 py-1 text-[10px] font-bold text-white">{activeIndex + 1}/{media.length}</span> : null}
    </div>
  );
}

function GalleryArrow({ direction, onClick, fixed = false }: { direction: "previous" | "next"; onClick: () => void; fixed?: boolean }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return <button type="button" onClick={(event) => { event.stopPropagation(); onClick(); }} className={cn("absolute top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow-lg transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--gold)]", direction === "previous" ? "left-3" : "right-3", fixed && direction === "previous" ? "sm:left-8" : "", fixed && direction === "next" ? "sm:right-8" : "")} aria-label={direction === "previous" ? "Previous media" : "Next media"}><Icon size={20} /></button>;
}

function CardArrow({ direction, onClick }: { direction: "previous" | "next"; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return <button type="button" onClick={onClick} className={cn("absolute top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black opacity-100 shadow transition md:opacity-0 md:group-hover/media:opacity-100 md:focus-visible:opacity-100", direction === "previous" ? "left-2" : "right-2")} aria-label={direction === "previous" ? "Previous challenge media" : "Next challenge media"}><Icon size={18} /></button>;
}
