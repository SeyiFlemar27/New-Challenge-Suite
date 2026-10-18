"use client";
import {useEffect,useRef,useState} from "react";
import {useParams} from "next/navigation";
import {AppShell} from "@/components/app-shell";
import {Button,Card,Field,inputClass,LinkButton} from "@/components/ui";
import {apiRequest} from "@/lib/api/client";
import {readLiveEventTicketCode} from "@/lib/live-event-ticket-code";
type Verified={ticketId:string;guestName:string;kind:string;competitorId:string|null;alreadyCheckedIn:boolean;competitionWithdrawn?:boolean};
export default function EventEntrance(){
  const {id}=useParams<{id:string}>(),[ticket,setTicket]=useState(""),[preview,setPreview]=useState<Verified|null>(null),[identity,setIdentity]=useState(false),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[scanning,setScanning]=useState(false);
  const video=useRef<HTMLVideoElement>(null),controls=useRef<{stop():void}|null>(null),generation=useRef(0),proof=useRef<{ticketId:string;credential?:string}|null>(null);
  useEffect(()=>()=>{generation.current++;controls.current?.stop();},[]);
  async function verify(raw:string){
    controls.current?.stop();setScanning(false);setPreview(null);setIdentity(false);setBusy(true);
    let value:{ticketId:string;credential?:string};
    try{
      value=readLiveEventTicketCode(raw,id);
    }catch{setBusy(false);setMessage("This ticket couldn't be read. Scan it again or use its ticket identification.");return;}
    proof.current=value;
    const result=await apiRequest<Verified>(`/api/live-events/${id}/check-in`,{method:"POST",body:JSON.stringify({...value,confirm:false})});
    setBusy(false);setMessage(result.message??"Please try again.");if(result.ok&&result.data)setPreview(result.data);
  }
  async function scan(){
    const version=++generation.current;setScanning(true);setMessage("Point the camera at the ticket QR code.");
    try{const {BrowserQRCodeReader}=await import("@zxing/browser");if(!video.current||version!==generation.current)return;
      const stream=await new BrowserQRCodeReader().decodeFromConstraints({video:{facingMode:{ideal:"environment"}},audio:false},video.current,(result,_error,control)=>{if(result&&version===generation.current){generation.current++;control.stop();setTicket(result.getText());void verify(result.getText());}});
      if(version!==generation.current)stream.stop();else controls.current=stream;
    }catch{setScanning(false);setMessage("Camera scanning isn't available. Check camera permission or enter the ticket identification below.");}
  }
  async function accept(){setBusy(true);const result=await apiRequest(`/api/live-events/${id}/staff`,{method:"POST",body:JSON.stringify({action:"accept",confirmed:true,reason:"I accept this event-specific check-in invitation.",requestKey:crypto.randomUUID()})});setBusy(false);setMessage(result.message??"Please try again.");}
  async function arrive(){if(!proof.current)return;setBusy(true);const result=await apiRequest(`/api/live-events/${id}/check-in`,{method:"POST",body:JSON.stringify({...proof.current,confirm:true,competitorIdentityConfirmed:identity})});setBusy(false);setMessage(result.message??"Please try again.");if(result.ok){setPreview(null);setTicket("");proof.current=null;}}
  return <AppShell><Card className="mx-auto max-w-2xl space-y-5 p-6"><h1 className="text-3xl font-bold">Event Check-In</h1><p>Only the organizer and accepted event check-in staff can confirm arrivals.</p><Button variant="secondary" disabled={busy} onClick={()=>void accept()}>Accept check-in invitation</Button><video ref={video} muted playsInline className={scanning?"w-full rounded-lg":"hidden"} aria-label="Ticket scanning camera"/><div className="flex flex-wrap gap-3"><Button disabled={busy||scanning} onClick={()=>void scan()}>Scan ticket</Button>{scanning?<Button variant="secondary" onClick={()=>{generation.current++;controls.current?.stop();setScanning(false);}}>Stop camera</Button>:null}</div><Field label="Ticket identification or shared ticket link"><input className={inputClass} value={ticket} onChange={event=>{setTicket(event.target.value);setPreview(null);}}/></Field><Button disabled={busy||!ticket.trim()} onClick={()=>void verify(ticket)}>Verify ticket</Button>{preview?<div className="space-y-3 rounded-lg border p-4"><h2 className="text-xl font-bold">{preview.guestName}</h2><p>{preview.kind==="competitor"?preview.competitionWithdrawn?"Competition withdrawn — admission only":"Participant Pass":"General Admission"}</p>{preview.competitorId?<><p className="break-all text-sm">Registered competitor: {preview.competitorId}</p><label className="flex gap-3"><input type="checkbox" checked={identity} onChange={event=>setIdentity(event.target.checked)}/>I verified that the person present is this registered competitor.</label></>:null}<p>{preview.alreadyCheckedIn?"Already used — do not admit again.":"Valid ticket. Confirm only when the guest is physically present."}</p><Button disabled={busy||preview.alreadyCheckedIn||preview.kind==="competitor"&&!identity} onClick={()=>void arrive()}>Confirm Arrival</Button></div>:null}<p role="status" aria-live="polite">{message}</p><LinkButton href={`/live-events/${id}`} variant="secondary">Event details</LinkButton></Card></AppShell>;
}
