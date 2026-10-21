"use client";
import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { ContentImage } from '@/components/content-image';

/** Receives only server-resolved media URLs; never derives a Storage URL from a path. */
export function DashboardCover({src,title}:{src:unknown;title:string}) {
  const [failed,setFailed]=useState<string|null>(null);
  const url=typeof src==='string'&&(/^(https?:\/\/|\/(?!\/))/.test(src))?src:null;
  return url&&failed!==url?<ContentImage src={url} alt={`${title} cover`} className="h-full w-full object-cover" onError={()=>setFailed(url)}/>:<div data-cover-fallback role="img" aria-label={`${title} cover unavailable`}><ImageIcon size={28} aria-hidden="true"/></div>;
}
