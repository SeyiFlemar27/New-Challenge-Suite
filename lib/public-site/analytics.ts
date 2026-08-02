"use client";
export type PublicEventName="public_search"|"hero_mode_changed"|"category_opened"|"calculator_completed"|"public_cta_clicked"|"plan_selected"|"public_menu_opened";
export function trackPublicEvent(name:PublicEventName,parameters:Record<string,string|number|boolean|null>={}){
 if(typeof window==="undefined")return;
 const safe=Object.fromEntries(Object.entries(parameters).filter(([,value])=>["string","number","boolean"].includes(typeof value)||value===null).slice(0,12));
 window.dispatchEvent(new CustomEvent("challenge-suite:analytics",{detail:{name,parameters:safe}}));
 const target=window as typeof window&{dataLayer?:Array<Record<string,unknown>>};
 if(Array.isArray(target.dataLayer))target.dataLayer.push({event:name,...safe});
}
