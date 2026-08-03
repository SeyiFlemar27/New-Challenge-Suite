import { BriefcaseBusiness, Camera, Code2, Dumbbell, Gamepad2, GraduationCap, Music2, Palette, Shirt, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { brandConfig } from "@/lib/brand-config";
export const PUBLIC_LOGO_URL = brandConfig.logo.local;
export const PUBLIC_HERO_VIDEO_URL = "https://res.cloudinary.com/drefcs4o2/video/upload/v1785625901/14999510_1920_1080_25fps_vvlpn9.mp4";
export const PUBLIC_HERO_POSTER_URL = "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1800&q=82";
export type PublicCategory = { slug: string; name: string; icon: LucideIcon; description: string; specialties: string[] };
export const PUBLIC_CATEGORIES: PublicCategory[] = [
["fitness","Fitness",Dumbbell,"Fitness challenges for training, performance, wellness and movement.",["Strength","Endurance","Wellness","Movement","Coaching"]],
["gaming","Gaming",Gamepad2,"Competitive gaming challenges, community events and tournaments.",["Esports","Strategy","Streaming","Speedruns","Community events"]],
["design-creative","Design & Creative",Palette,"Creative competitions for designers, artists and visual storytellers.",["Graphic Design","UI/UX","Illustration","Branding","Motion Design","Photography"]],
["music-making","Music Making",Music2,"Music challenges for vocalists, producers, songwriters and performers.",["Singing","Beat Production","Songwriting","Instrumental","Performance"]],
["photography","Photography",Camera,"Photography challenges built around craft, stories and visual perspective.",["Portrait","Editorial","Street","Product","Documentary"]],
["food","Food",UtensilsCrossed,"Food challenges for cooks, bakers, creators and culinary communities.",["Cooking","Baking","Food styling","Recipes","Hospitality"]],
["education","Education",GraduationCap,"Learning challenges for students, educators and knowledge communities.",["Learning","Teaching","Research","Public speaking","Student projects"]],
["business","Business",BriefcaseBusiness,"Business challenges for founders, teams and professional communities.",["Pitching","Marketing","Sales","Operations","Entrepreneurship"]],
["development-it","Development & IT",Code2,"Technical challenges for developers, builders and technology teams.",["Web Development","Mobile","AI","Data","Cybersecurity","DevOps"]],
["fashion-modelling","Fashion & Modelling",Shirt,"Fashion and modelling challenges for talent, stylists and creative teams.",["Runway","Editorial","Commercial","Styling","Beauty","Model scouting"]]
].map(([slug,name,icon,description,specialties])=>({slug,name,icon,description,specialties})) as PublicCategory[];
export const PUBLIC_MENU = [
{label:"Explore",items:[["Browse All Challenges","/explore"],["Open for Registration","/explore?phase=registration_open"],["Voting Now","/explore?phase=voting_open"],["Ending Soon","/explore?sort=ending_soon"],["Completed Challenges","/explore?phase=completed"],["Winners","/winners"],["Categories","/#categories"]]},
{label:"Compete",items:[["How Competing Works","/for-talent#how-it-works"],["Free Challenges","/explore?entry=free"],["Paid-Entry Challenges","/explore?entry=paid"],["Tournaments","/tournaments"],["Live Events","/live-events"],["Private Challenges","/private-exclusive"],["Competition Guidelines","/community-guidelines"]]},
{label:"Create",items:[["Create Public Challenge","/challenges/create"],["Create Private Challenge","/host/private/create"],["Create Tournament","/host/tournaments/create"],["Create Live Event","/host/live/create"],["Creator Earnings","/earnings"],["Prize Funding","/challenges/create"],["Creator Plans","/subscriptions"]]},
{label:"Host",items:[["Host Dashboard","/dashboard/host"],["Tournament Management","/host/tournaments"],["Live Event Management","/host/live-events"],["Private Competitions","/host/private"],["Host Plans","/subscriptions"],["Host Resources","/community-guidelines"]]},
{label:"Sponsors",items:[["Sponsorship Opportunities","/explore?sponsorReady=true"],["Sponsor a Challenge","/sponsor/start"],["Brand Campaigns","/sponsor/start"],["Sponsor Plans","/sponsor/plans"],["Sponsor Guidelines","/community-guidelines"],["Sponsor Onboarding","/sponsor/start"]]}
] as const;
export const DEFAULT_PUBLIC_CONTENT = {
announcement:{enabled:true,message:"You've got skills, compete with other talents and monetize it.",ctaLabel:"Get Started",ctaRoute:"/for-talent",status:"published",priority:0,startAt:null as string|null,endAt:null as string|null,audience:"all",loggedInState:"all",roles:[] as string[],plans:[] as string[]},
hero:{eyebrow:"Competition, built around what you can do",headline:"Turn your talent into\nsomething worth winning.",supportingCopy:"Discover challenges, showcase what you can do, build your audience and earn through competitions created by people, communities and brands.",videoUrl:PUBLIC_HERO_VIDEO_URL,posterUrl:PUBLIC_HERO_POSTER_URL},
finalCta:{headline:"Find a challenge worth showing up for.",body:"Discover competitions, showcase your skills and build a reputation through challenges created by people, communities and brands.",label:"Compete now"},
assurances:["Transparent prize funding","Secure challenge payments","Verified withdrawal process","Moderated submissions","Sponsor approval process","Reporting and dispute support"],
faqs:[["How do I join a challenge?","Open a public challenge, review its requirements and use the available join action. Some challenges require approval or a confirmed entry payment."],["Are all challenges paid?","No. Challenge creators can publish free or paid-entry challenges, and each challenge displays its entry requirements."],["How are winners selected?","Winner rules are set on each challenge. Results can use eligible voting, judging and an admin review process before winners are confirmed."],["How are prizes funded?","Prize sources and confirmed funding are tracked separately from unconfirmed promises."],["When do winners receive payment?","Approved internal prize credits remain subject to wallet availability, identity checks and platform review before withdrawal."],["How does voting work?","Voting is available only during the configured window and only for eligible submissions."]]
};
export function categoryBySlug(slug:string){return PUBLIC_CATEGORIES.find((item)=>item.slug===slug)??null}
export function safePublicPath(value:unknown,fallback="/"){const path=typeof value==="string"?value.trim():"";return path.startsWith("/")&&!path.startsWith("//")&&!path.includes("://")?path:fallback}
export function protectedPublicHref(path:string,authenticated:boolean){const safe=safePublicPath(path);return authenticated?safe:`/auth/login?next=${encodeURIComponent(safe)}`}
export function calculatorCreationHref(input:Record<string,string|number>,authenticated:boolean){const payload=encodeURIComponent(JSON.stringify(input));const base=input.type==="tournament"?"/host/tournaments/create":input.type==="live_event"?"/host/live/create":"/challenges/create";return protectedPublicHref(`${base}?calculator=${payload}`,authenticated)}
export function publicAnnouncementIsActive(item:Record<string,unknown>,now=Date.now()){if(item.enabled===false||item.status!=="published")return false;const start=item.startAt?Date.parse(String(item.startAt)):Number.NEGATIVE_INFINITY;const end=item.endAt?Date.parse(String(item.endAt)):Number.POSITIVE_INFINITY;return start<=now&&now<end}
export function publicAnnouncementMatchesTarget(item:Record<string,unknown>,viewer:{authenticated:boolean;role?:string;planId?:string}){
 const state=String(item.loggedInState??"all");if(state==="guest"&&viewer.authenticated)return false;if(state==="authenticated"&&!viewer.authenticated)return false;
 const audience=String(item.audience??"all");if(audience!=="all"&&audience!==viewer.role)return false;
 const roles=Array.isArray(item.roles)?item.roles.map(String).filter(Boolean):[];if(roles.length&&(!viewer.role||!roles.includes(viewer.role)))return false;
 const plans=Array.isArray(item.plans)?item.plans.map(String).filter(Boolean):[];if(plans.length&&(!viewer.planId||!plans.includes(viewer.planId)))return false;
 return true;
}
