"use client";
import Image from "next/image";
import {useEffect,useState} from "react";
import {encodeLiveEventTicketCode} from "@/lib/live-event-ticket-code";
import {createLiveEventQrImage} from "@/lib/live-event-qr-image";

/** Admission credentials stay local; QR generation never calls a third-party image service. */
export function LiveEventTicketQr({eventId,ticketId,credential}:{eventId:string;ticketId:string;credential:string}){
  const [image,setImage]=useState("");
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true;
    queueMicrotask(()=>{if(active){setImage("");setFailed(false);}});
    void Promise.all([import("qrcode-generator"),import("@zxing/browser")]).then(async([{default:qrcode},{BrowserQRCodeReader}])=>{
      const payload=encodeLiveEventTicketCode(ticketId,credential);
      const result=await createLiveEventQrImage(payload,(level,size)=>{const code=qrcode(0,level);code.addData(payload,"Alphanumeric");code.make();return code.createDataURL(size,size*4);},async source=>{
        const element=new window.Image();element.src=source;await element.decode();
        const reader=new BrowserQRCodeReader();const decoded=(await reader.decodeFromImageElement(element)).getText();
        for(const width of [200,264,296]){const canvas=document.createElement("canvas");canvas.width=width;canvas.height=width;const context=canvas.getContext("2d");if(!context)throw new Error("QR canvas unavailable");context.imageSmoothingEnabled=false;context.drawImage(element,0,0,width,width);if((await reader.decodeFromCanvas(canvas)).getText()!==payload)throw new Error("QR content mismatch");}
        return decoded;
      });
      if(active)setImage(result.source);
    }).catch(()=>{if(active){setImage("");setFailed(true);}});
    return ()=>{active=false;};
  },[eventId,ticketId,credential]);
  return image?<Image src={image} alt="Admission QR code — present this at the event entrance" width={320} height={320} unoptimized style={{imageRendering:"pixelated"}} className="mx-auto mt-4 h-auto w-full max-w-80 bg-white p-3"/>:<p role="status" className="mt-4 text-sm">{failed?"The QR code couldn't be verified. Use the ticket identification below at the entrance.":"Your admission details below remain available while the QR code loads."}</p>;
}
