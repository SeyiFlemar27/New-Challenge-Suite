"use client";

import { useState } from "react";
import { Check, Copy, Mail, Share2, X } from "lucide-react";
import { Button } from "@/components/ui";

interface ChallengeShareProps {
  title: string;
  description?: string;
  path: string;
  className?: string;
}

export function ChallengeShare({ title, description, path, className }: ChallengeShareProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(description || `Join ${title} on Challenge Suite.`);
  const shareLinks = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodedText}%20${encodedUrl}` },
    { label: "X / Twitter", href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
    { label: "Email", href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}%0A%0A${encodedUrl}` }
  ];

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: description || `Join ${title} on Challenge Suite.`, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    setOpen(true);
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Button type="button" className={className} variant="secondary" onClick={() => void share()}><Share2 size={17} /> Share</Button>
      {open ? <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <section className="w-full max-w-lg rounded-[8px] border border-[var(--gold)]/25 bg-[#101010] p-6 shadow-2xl sm:p-8">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Share challenge</p><h2 id="share-title" className="mt-2 text-2xl font-black">{title}</h2></div><button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-white/10" aria-label="Close share options"><X /></button></div>
          <Button type="button" className="mt-6 w-full" onClick={() => void copy()}>{copied ? <Check size={17} /> : <Copy size={17} />} {copied ? "Link Copied" : "Copy Link"}</Button>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {shareLinks.map((item) => <a key={item.label} href={item.href} target={item.label === "Email" ? undefined : "_blank"} rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-[#191919] px-4 text-sm font-bold transition hover:border-[var(--gold)]/40 hover:text-[var(--gold)]">{item.label === "Email" ? <Mail size={16} /> : <Share2 size={16} />}{item.label}</a>)}
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-500">Instagram does not support normal direct web link sharing. Use Copy Link for Instagram messages or stories.</p>
        </section>
      </div> : null}
    </>
  );
}
