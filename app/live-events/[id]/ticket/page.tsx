"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import {AppShell} from "@/components/app-shell";
import {Card,LinkButton} from "@/components/ui";
import {LiveEventTicketQr} from "@/components/live-event-ticket-qr";
import {apiRequest} from "@/lib/api/client";
type Presentation={ticket:{id:string;guestName:string;kind:string;status:string;competitionWithdrawn?:boolean};event:{title:string;startsAt:string;timezone:string;venueName:string;address:string;city:string;country:string;status:string}};
export default function SharedEventTicket(){
  const {id}=useParams<{id:string}>(),[data,setData]=useState<Presentation|null>(null),[credential,setCredential]=useState(""),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    const match=location.hash.slice(1).match(/^([a-f0-9]{64})\.([a-zA-Z0-9_-]{43})$/);
    if(!match){queueMicrotask(()=>{if(active)setError("This ticket link couldn't be verified. Ask the sender to share it again.");});return ()=>{active=false;};}
    void apiRequest<Presentation>(`/api/live-events/${id}/presentation`,{method:"POST",body:JSON.stringify({ticketId:match[1],credential:match[2]})}).then(result=>{if(!active)return;if(result.ok&&result.data){setData(result.data);setCredential(match[2]);}else setError("This ticket couldn't be verified. Contact the event organizer.");}).catch(()=>{if(active)setError("Your ticket couldn't be loaded. Check your connection and try again.");});
    return ()=>{active=false;};
  },[id]);
  let date="";try{if(data)date=new Intl.DateTimeFormat(undefined,{dateStyle:"long",timeStyle:"short",timeZone:data.event.timezone}).format(new Date(data.event.startsAt));}catch{date="Date unavailable";}
  const usable=data&&data.ticket.status==="confirmed"&&data.event.status!=="cancelled";
  return <AppShell><Card className="mx-auto max-w-xl space-y-4 p-6"><h1 className="text-3xl font-bold">{data?.event.title??"Your Event Ticket"}</h1>{error?<p role="alert">{error}</p>:!data?<p role="status">Getting your ticket ready…</p>:<><h2 className="text-xl font-bold">{data.ticket.guestName}</h2><p>{data.ticket.kind==="competitor"?data.ticket.competitionWithdrawn?"Competition withdrawn — admission only, for the registered account holder":"Participant Pass — only valid for the registered competitor":"General Admission — valid for one person presenting this unused ticket"}</p><p>{date}</p><p>{[data.event.venueName,data.event.address,data.event.city,data.event.country].filter(Boolean).join(", ")}</p><p className="font-semibold">{usable?"Ready to present at the entrance":data.ticket.status==="checked_in"?"This ticket has already been used":data.event.status==="cancelled"?"This event has been cancelled":"This ticket is not valid for admission"}</p>{usable?<LiveEventTicketQr eventId={id} ticketId={data.ticket.id} credential={credential}/>:null}<p className="break-all text-xs">Ticket identification: {data.ticket.id}</p></>}<LinkButton href={`/live-events/${id}`} variant="secondary">Event details</LinkButton></Card></AppShell>;
}
