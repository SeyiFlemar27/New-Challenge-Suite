"use client";
import { useEffect, useRef, type RefObject } from 'react';

/** Keyboard containment for existing mobile navigation drawers. */
export function useNavigationDialog(open:boolean,ref:RefObject<HTMLElement|null>,onClose:()=>void) {
  const close=useRef(onClose);
  useEffect(()=>{close.current=onClose;},[onClose]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    const controls=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,summary,[tabindex="0"]')??[]);
    controls()[0]?.focus();
    function keydown(event:KeyboardEvent){
      if(event.key==='Escape'){event.preventDefault();close.current();}
      if(event.key!=='Tab')return;
      const items=controls(),first=items[0],last=items.at(-1);if(!first||!last)return;
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
    document.addEventListener('keydown',keydown);
    return()=>{document.removeEventListener('keydown',keydown);previous?.focus();};
  },[open,ref]);
}
