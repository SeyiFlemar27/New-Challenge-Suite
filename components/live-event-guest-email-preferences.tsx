"use client";
import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {apiRequest} from "@/lib/api/client";
import {Card} from "@/components/ui";

export function LiveEventGuestEmailPreferences({eventId}:{eventId:string}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [pendingChoice,setPendingChoice]=useState<boolean|null>(null),client=useQueryClient();
  const query=useQuery({queryKey:["guest-event-email-preferences",eventId],queryFn:()=>apiRequest<{enabled:boolean}>(`/api/live-events/${encodeURIComponent(eventId)}/email-preferences`),retry:false});
  async function change(enabled:boolean){setPendingChoice(enabled);setBusy(true);try{const result=await apiRequest<{enabled:boolean}>(`/api/live-events/${encodeURIComponent(eventId)}/email-preferences`,{method:"PATCH",body:JSON.stringify({enabled})});setMessage(result.ok?"Your optional event email preference has been saved.":result.message??"Your preference could not be saved.");if(result.ok)client.setQueryData(["guest-event-email-preferences",eventId],result);}finally{setPendingChoice(null);setBusy(false);}}
  return <Card className="space-y-3 p-5"><h2 className="text-lg font-bold">Event email preferences</h2><p className="text-sm">Choose optional organizer announcements. Essential ticket, cancellation and material event-change messages are handled separately.</p>
    {query.isLoading?<p role="status">Loading your preference…</p>:query.data?.ok?<label className="flex items-start gap-2"><input type="checkbox" disabled={busy} checked={pendingChoice??query.data.data?.enabled===true} onChange={event=>void change(event.target.checked)}/>Receive optional organizer announcement emails for this event</label>:<><p role="status">{query.data?.message??"Your preference couldn't be loaded."}</p><button type="button" className="underline" onClick={()=>void query.refetch()}>Try again</button></>}
    <p role="status" aria-live="polite">{busy?"Saving your preference…":message}</p>
  </Card>;
}
