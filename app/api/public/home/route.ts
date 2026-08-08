import { getAdminDb } from "@/lib/firebase/admin";
import { DEFAULT_PUBLIC_CONTENT, publicAnnouncementIsActive, publicAnnouncementMatchesTarget, resolvePublicHeroVideoUrl, safePublicPath } from "@/lib/public-site/config";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { ok, serverError } from "@/lib/server/responses";
export const dynamic="force-dynamic"; export const revalidate=0;
const text=(v:unknown,max=500)=>typeof v==="string"?v.trim().slice(0,max):"";
const num=(v:unknown)=>Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
function publicConfig(raw:Record<string,unknown>={}){
 const announcement={...DEFAULT_PUBLIC_CONTENT.announcement,...((raw.announcement as Record<string,unknown>)||{})};
 const hero={...DEFAULT_PUBLIC_CONTENT.hero,...((raw.hero as Record<string,unknown>)||{})};
 const finalCta={...DEFAULT_PUBLIC_CONTENT.finalCta,...((raw.finalCta as Record<string,unknown>)||{})};
 const list=(value:unknown)=>Array.isArray(value)?value.map((item)=>text(item,40)).filter(Boolean).slice(0,12):[];
 return {announcement:{enabled:announcement.enabled!==false,message:text(announcement.message,180)||DEFAULT_PUBLIC_CONTENT.announcement.message,ctaLabel:text(announcement.ctaLabel,40)||"Get Started",ctaRoute:safePublicPath(announcement.ctaRoute,"/for-talent"),status:text(announcement.status,30)||"published",priority:Number(announcement.priority||0),startAt:text(announcement.startAt,40)||null,endAt:text(announcement.endAt,40)||null,audience:text(announcement.audience,20)||"all",loggedInState:text(announcement.loggedInState,20)||"all",roles:list(announcement.roles),plans:list(announcement.plans)},hero:{eyebrow:text(hero.eyebrow,100)||DEFAULT_PUBLIC_CONTENT.hero.eyebrow,headline:text(hero.headline,180)||DEFAULT_PUBLIC_CONTENT.hero.headline,supportingCopy:text(hero.supportingCopy,500)||DEFAULT_PUBLIC_CONTENT.hero.supportingCopy,videoUrl:resolvePublicHeroVideoUrl(hero.videoUrl),posterUrl:text(hero.posterUrl,600)||DEFAULT_PUBLIC_CONTENT.hero.posterUrl},finalCta:{headline:text(finalCta.headline,160)||DEFAULT_PUBLIC_CONTENT.finalCta.headline,body:text(finalCta.body,400)||DEFAULT_PUBLIC_CONTENT.finalCta.body,label:text(finalCta.label,40)||DEFAULT_PUBLIC_CONTENT.finalCta.label},assurances:Array.isArray(raw.assurances)?raw.assurances.map((v)=>text(v,100)).filter(Boolean).slice(0,8):DEFAULT_PUBLIC_CONTENT.assurances,faqs:Array.isArray(raw.faqs)?raw.faqs.flatMap((item)=>{const row=item as Record<string,unknown>;const q=text(row.question,180),a=text(row.answer,900);return q&&a?[[q,a]]:[]}).slice(0,12):DEFAULT_PUBLIC_CONTENT.faqs};
}
export async function GET(request:Request){
 const db=getAdminDb(); if(!db)return ok({content:publicConfig(),announcement:DEFAULT_PUBLIC_CONTENT.announcement,stats:[],stories:[],source:"defaults_without_backend",realDataOnly:true},"Public site loaded without dynamic content.");
 try{
  const user=await getOptionalRequestUser(request);const viewer={authenticated:Boolean(user),role:user?.isAdmin?"admin":user?.role,planId:user?.planId};
  const [configSnap,statsSnap,annSnap,storiesSnap]=await Promise.all([db.collection("publicSiteConfig").doc("default").get(),db.collection("platformStats").doc("public").get(),db.collection("publicAnnouncements").where("status","==","published").limit(20).get(),db.collection("successStories").where("status","==","published").limit(12).get()]);
  const content=publicConfig(configSnap.exists?(configSnap.data()??{}):{});
  const scheduled=(annSnap.docs.map((doc)=>({id:doc.id,...doc.data()})) as Array<Record<string,unknown>>).filter((item)=>item.adminApproved===true&&publicAnnouncementIsActive(item)&&publicAnnouncementMatchesTarget(item,viewer)).sort((a,b)=>Number(b.priority??0)-Number(a.priority??0))[0];
  const announcement=scheduled?{enabled:true,message:text(scheduled.message,180),ctaLabel:text(scheduled.ctaLabel,40)||"Learn more",ctaRoute:safePublicPath(scheduled.ctaRoute,"/for-talent"),status:"published",startAt:scheduled.startAt??null,endAt:scheduled.endAt??null}:publicAnnouncementIsActive(content.announcement as Record<string,unknown>)&&publicAnnouncementMatchesTarget(content.announcement as Record<string,unknown>,viewer)?content.announcement:null;
  const statsRaw=statsSnap.exists?statsSnap.data()??{}:{};
  const candidates=[["Registered talents",num(statsRaw.registeredTalents)],["Active challenges",num(statsRaw.activeChallenges)],["Completed competitions",num(statsRaw.completedCompetitions)],["Confirmed prize value",num(statsRaw.confirmedPrizeValueUsd)],["Countries represented",num(statsRaw.countriesRepresented)],["Verified creators",num(statsRaw.verifiedCreators)]];
  const stats=candidates.flatMap(([label,value])=>typeof value==="number"?[{label,value,prefix:label==="Confirmed prize value"?"$":"",suffix:""}]:[]);
  const stories=storiesSnap.docs.flatMap((doc)=>{const d=doc.data();if(d.adminApproved!==true)return[];const quote=text(d.quote,360),name=text(d.displayName,100),role=text(d.role,100);return quote&&name&&role?[{id:doc.id,quote,displayName:name,role,portraitUrl:text(d.portraitUrl,600)}]:[]});
  return ok({content,announcement,stats,stories,source:"server_aggregates_and_admin_approved",realDataOnly:true},"Public site content loaded.");
 }catch(error){return serverError("Public site content could not be loaded.",error instanceof Error?error.message:error)}
}
