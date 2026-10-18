"use client";
import {useRef,useState} from "react";
import {Button,Card,Field,inputClass,textareaClass} from "@/components/ui";
import {apiRequest} from "@/lib/api/client";

const fields=[["venueName","Venue name"],["eventAddress","Full address"],["eventCity","City"],["eventState","State or region"],["eventCountry","Country"],["startsAt","Event start"],["endsAt","Event end"],["checkInStartAt","Check-in opens"],["checkInEndAt","Check-in closes"]] as const;
const localInput=(value:unknown)=>{const date=new Date(String(value));return Number.isFinite(date.getTime())?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`:"";};
export function LiveEventChangeProposal({eventId,version,onChanged,current={}}:{eventId:string;version:number;onChanged:()=>void;current?:Record<string,unknown>}){
  const [values,setValues]=useState<Record<string,string>>({}),[clearRegion,setClearRegion]=useState(false),[reason,setReason]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const retry=useRef<{fingerprint:string;key:string}|null>(null);
  const changeCount=Object.values(values).filter(value=>value.trim()).length+(clearRegion?1:0);
  async function act(action:"propose"|"cancel"|"start"){
    let changes:Record<string,string>|undefined;
    try{
      if(action==="propose"){
        changes=Object.fromEntries(Object.entries(values).filter(([,value])=>value.trim()).map(([key,value])=>[key,key.endsWith("At")?(current[key]&&localInput(current[key])===value?String(current[key]):new Date(value).toISOString()):value.trim()]));
        if(clearRegion)changes.eventState="";
        if((changes.startsAt||changes.endsAt)&&(!changes.checkInStartAt||!changes.checkInEndAt)){setMessage("Include both check-in times with a reschedule, even when keeping them unchanged.");return;}
      }
    }catch{setMessage("Enter valid event and check-in times.");return;}
    if(!window.confirm(action==="cancel"?"Cancel this event and initiate the applicable full original-payment refund process? Uncertain payments and completed payouts require financial review.":action==="start"?"Confirm that the physical event genuinely starts now? This closes sponsor funding immediately. The cutoff will not reopen automatically.":"Send all entered changes together for Admin review? Published details remain unchanged until approval."))return;
    const payload={action,changes,expectedVersion:version,reason,confirmed:true},fingerprint=JSON.stringify({eventId,...payload});
    if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,key:crypto.randomUUID()};
    setBusy(true);
    try{
      const result=await apiRequest(`/api/live-events/${encodeURIComponent(eventId)}/changes`,{method:"POST",body:JSON.stringify({...payload,requestKey:retry.current.key})});
      setMessage(result.message);
      if(result.ok){setValues({});setClearRegion(false);setReason("");onChanged();}
    }catch{setMessage("Your request could not be confirmed. Retry without changing the request to safely reuse its reference.");}finally{setBusy(false);}
  }
  return <Card className="space-y-4 p-5">
    <h2 className="text-xl font-bold">Event Details</h2>
    <p>Request related venue and schedule changes together. Published details change only after Admin approval, with registrant notifications and applicable refund rights.</p>
    <p className="text-sm">Leave fields empty to keep them unchanged. Times use this device&apos;s local timezone; the event&apos;s saved timezone remains unchanged. Rescheduling requires explicit check-in times. Prices, existing booking deadlines and staff access expirations are not automatically changed.</p>
    <details><summary>Current published venue and schedule</summary><dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">{fields.map(([key,label])=><div key={key}><dt className="font-bold">{label}</dt><dd className="break-words">{String(current[key]??"Not configured")}</dd></div>)}</dl><p className="mt-2 text-sm">Stored timestamps include their UTC offset. Event timezone: {String(current.timezone??"Not configured")}.</p></details>
    <Button variant="secondary" disabled={busy||!localInput(current.checkInStartAt)||!localInput(current.checkInEndAt)} onClick={()=>setValues(previous=>({...previous,checkInStartAt:localInput(current.checkInStartAt),checkInEndAt:localInput(current.checkInEndAt)}))}>Keep current check-in times in this request</Button>
    <div className="grid gap-4 md:grid-cols-2">{fields.map(([key,label])=><Field key={key} label={label}><input className={inputClass} type={key.endsWith("At")?"datetime-local":"text"} disabled={busy||key==="eventState"&&clearRegion} maxLength={key==="eventAddress"?500:200} value={values[key]??""} onChange={event=>setValues(current=>({...current,[key]:event.target.value}))}/></Field>)}</div>
    <label className="flex gap-2 text-sm"><input type="checkbox" disabled={busy} checked={clearRegion} onChange={event=>{setClearRegion(event.target.checked);setValues(current=>({...current,eventState:""}));}}/>Clear the existing optional state or region</label>
    <Field label="Required reason"><textarea className={textareaClass} disabled={busy} maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)}/></Field>
    <Button disabled={busy||reason.trim().length<8||changeCount===0} onClick={()=>void act("propose")}>Request Admin review</Button>
    <div className="flex flex-wrap gap-3 border-t pt-4"><Button variant="secondary" disabled={busy||reason.trim().length<8} onClick={()=>void act("start")}>Confirm physical event start</Button><Button variant="secondary" disabled={busy||reason.trim().length<8} onClick={()=>void act("cancel")}>Cancel event</Button></div>
    <p role="status" aria-live="polite">{message}</p>
  </Card>;
}
