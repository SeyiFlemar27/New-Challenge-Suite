"use client";
import Link from "next/link";
import { ChevronDown, ChevronRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { PUBLIC_MENU } from "@/lib/public-site/config";
import { ChallengeSuiteLogo } from "@/components/brand/challenge-suite-logo";
import { trackPublicEvent } from "@/lib/public-site/analytics";
type Announcement={message:string;ctaLabel:string;ctaRoute:string}|null;
const footerGroups=[
 {label:"Compete",items:[["Explore Challenges","/explore"],["Voting Now","/explore?phase=voting_open"],["Tournaments","/tournaments"],["Live Events","/live-events"],["Winners","/winners"],["Competition Guidelines","/community-guidelines"]]},
 {label:"Create",items:[["Create a Challenge","/challenges/create"],["Private Challenges","/private-exclusive"],["Creator Plans","/subscriptions"],["Creator Earnings","/earnings"]]},
 {label:"Host",items:[["Host Tools","/dashboard/host"],["Tournament Management","/host/tournaments"],["Event Management","/host/live-events"],["Host Pricing","/subscriptions"]]},
 {label:"Sponsors",items:[["Sponsorship Opportunities","/explore?sponsorReady=true"],["Sponsor a Challenge","/sponsor/campaigns"],["Brand Campaigns","/sponsor/dashboard"],["Sponsor Plans","/sponsor/plans"]]},
 {label:"Support",items:[["Payments","/wallet"],["Safety","/community-guidelines"],["Community Guidelines","/community-guidelines"],["Contact Support","/contact"]]},
 {label:"Company",items:[["About","/about"],["Terms","/terms"],["Privacy","/privacy"],["Cookies","/cookie-policy"],["Sitemap","/sitemap.xml"]]}
] as const;
function dashboardHref(user:ReturnType<typeof useCurrentUser>["user"]){if(!user)return"/dashboard";if(user.isAdmin)return"/admin";if(user.isSponsor)return"/sponsor/dashboard";if(user.hostOnboardingComplete||user.planId==="host"||user.planId==="enterprise")return"/dashboard/host";return"/dashboard"}
function PublicLogo({size=40}:{size?:number}){const named=size<=36?"xs":size<=44?"sm":"md";return <ChallengeSuiteLogo clickable={false} size={named} priority={size>=40} imageClassName="object-contain"/>}
export function PublicHeader({announcement}: {announcement?:Announcement}){
 const {user}=useCurrentUser(); const [open,setOpen]=useState<string|null>(null);const [drawer,setDrawer]=useState(false);const [expanded,setExpanded]=useState<string|null>(null);const drawerRef=useRef<HTMLDivElement>(null);const signInHref=user?dashboardHref(user):"/auth/login";const signUpHref=user?"/onboarding/account-type":"/auth/register";
 useEffect(()=>{if(!drawer)return;document.body.style.overflow="hidden";const prior=document.activeElement as HTMLElement|null;const node=drawerRef.current;const focusable=()=>Array.from(node?.querySelectorAll<HTMLElement>('button,a[href]')??[]);focusable()[0]?.focus();const key=(event:KeyboardEvent)=>{if(event.key==="Escape")setDrawer(false);if(event.key==="Tab"){const items=focusable(),first=items[0],last=items.at(-1);if(!first||!last)return;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}};document.addEventListener("keydown",key);return()=>{document.body.style.overflow="";document.removeEventListener("keydown",key);prior?.focus()}},[drawer]);
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(null)};document.addEventListener("keydown",key);return()=>document.removeEventListener("keydown",key)},[]);
 return <><header className="public-header" data-public-header><div className="public-container flex h-[76px] items-center justify-between gap-6">
  <div className="flex min-w-0 items-center gap-8"><Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Challenge Suite home"><PublicLogo/><span className="hidden text-[15px] font-extrabold text-[#171717] sm:block">Challenge Suite</span></Link>
  <nav className="hidden items-stretch gap-1 lg:flex" aria-label="Public navigation">{PUBLIC_MENU.map((menu)=><div key={menu.label} className="relative" onMouseEnter={()=>setOpen(menu.label)} onMouseLeave={()=>setOpen(null)} onFocus={()=>setOpen(menu.label)} onBlur={(e)=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(null)}}>
   <button type="button" aria-expanded={open===menu.label} aria-haspopup="true" onClick={()=>{setOpen(open===menu.label?null:menu.label);trackPublicEvent("public_menu_opened",{menu:menu.label})}} className="public-nav-button">{menu.label}<ChevronDown size={14}/></button>
   {open===menu.label?<div className="public-mega-menu" role="menu"><p className="text-xs font-bold text-[#6b6b6b]">{menu.label}</p><div className="mt-4 grid grid-cols-2 gap-x-9 gap-y-1">{menu.items.map(([label,href])=><Link key={href} href={href} role="menuitem" className="public-mega-link" onClick={()=>setOpen(null)}>{label}<ChevronRight size={14}/></Link>)}</div></div>:null}
  </div>)}<Link href="/subscriptions" className="public-nav-button">Pricing</Link></nav></div>
  <div className="hidden items-center gap-2 lg:flex"><Link href={signInHref} className="public-login">Sign in</Link><Link href={signUpHref} className="public-primary-button">Sign up</Link></div>
  <button type="button" onClick={()=>setDrawer(true)} className="public-icon-button inline-flex lg:hidden" aria-label="Open navigation"><Menu/></button>
 </div></header>
 {announcement?<div className="public-container py-3"><div className="public-announcement"><p>{announcement.message}</p><Link href={announcement.ctaRoute}>{announcement.ctaLabel}<ChevronRight size={16}/></Link></div></div>:null}
 {drawer?<div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Public navigation"><button type="button" className="absolute inset-0 bg-black/45" onClick={()=>setDrawer(false)} aria-label="Close navigation"/><div ref={drawerRef} className="public-drawer">
  <div className="flex items-center justify-between border-b border-[#e7e7e2] pb-5"><Link href="/" className="flex items-center gap-3" onClick={()=>setDrawer(false)}><PublicLogo/><span className="font-extrabold">Challenge Suite</span></Link><button type="button" onClick={()=>setDrawer(false)} className="public-icon-button inline-flex" aria-label="Close navigation"><X/></button></div>
  <nav className="mt-5" aria-label="Mobile public navigation">{PUBLIC_MENU.map((menu)=><div key={menu.label} className="border-b border-[#e7e7e2]"><button type="button" className="flex min-h-14 w-full items-center justify-between font-bold" aria-expanded={expanded===menu.label} onClick={()=>setExpanded(expanded===menu.label?null:menu.label)}>{menu.label}<ChevronDown size={18} className={expanded===menu.label?"rotate-180":""}/></button>{expanded===menu.label?<div className="grid pb-4">{menu.items.map(([label,href])=><Link key={href} href={href} className="py-3 text-sm text-[#4d4d4d]" onClick={()=>setDrawer(false)}>{label}</Link>)}</div>:null}</div>)}<Link href="/subscriptions" className="flex min-h-14 items-center border-b border-[#e7e7e2] font-bold">Pricing</Link></nav>
  <div className="mt-8 grid gap-3"><Link href={signUpHref} className="public-primary-button justify-center">Sign up</Link><Link href={signInHref} className="public-secondary-button justify-center">Sign in</Link></div>
 </div></div>:null}</>
}
export function PublicFooter(){
 const [open,setOpen]=useState<string|null>(null);return <footer className="public-footer"><div className="public-container"><div className="grid gap-8 border-b border-white/15 pb-14 md:grid-cols-3 xl:grid-cols-6">{footerGroups.map((group)=><section key={group.label}><button type="button" className="flex w-full items-center justify-between py-2 text-left font-bold md:pointer-events-none" onClick={()=>setOpen(open===group.label?null:group.label)} aria-expanded={open===group.label}>{group.label}<ChevronDown className="md:hidden" size={16}/></button><div className={(open===group.label?"grid":"hidden")+" gap-3 pt-3 text-sm text-white/65 md:grid"}>{group.items.map(([label,href])=><Link key={label} href={href} className="hover:text-white">{label}</Link>)}</div></section>)}</div>
 <div className="flex flex-col gap-5 py-8 text-sm text-white/60 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3"><PublicLogo size={36}/><span>Challenge Suite. Competition, made intentional.</span></div><div className="flex flex-wrap gap-4"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/cookie-policy">Cookie preferences</Link><span>Mobile apps coming soon</span></div></div>
 </div></footer>
}
