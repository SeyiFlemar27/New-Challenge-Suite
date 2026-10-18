const credentialCode=/^([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/;
const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function encodeBytes(bytes:number[]){let pending=0,bits=0,result="";for(const byte of bytes){pending=(pending<<8)|byte;bits+=8;while(bits>=5){bits-=5;result+=alphabet[(pending>>>bits)&31];}pending&=(1<<bits)-1;}if(bits)result+=alphabet[(pending<<(5-bits))&31];return result;}
function decodeBytes(value:string){let pending=0,bits=0;const bytes:number[]=[];for(const char of value){const digit=alphabet.indexOf(char);if(digit<0)throw new Error("Invalid admission code");pending=(pending<<5)|digit;bits+=5;if(bits>=8){bits-=8;bytes.push((pending>>>bits)&255);}pending&=(1<<bits)-1;}if(pending!==0||bytes.length!==64)throw new Error("Invalid admission code");return bytes;}
const urlBase64=(value:string)=>btoa(value).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
/** Compact bearer proof. The authenticated server still validates event, staff and admission state. */
export function encodeLiveEventTicketCode(ticketId:string,credential:string){
  if(!credentialCode.test(`${ticketId}.${credential}`))throw new Error("Invalid admission code");
  const proof=atob(credential.replaceAll("-","+").replaceAll("_","/")+"=");
  if(proof.length!==32||urlBase64(proof)!==credential)throw new Error("Invalid admission code");
  // Alphanumeric mode needs fewer QR modules without shortening either 256-bit value.
  const bytes=[...ticketId.matchAll(/../g)].map(match=>Number.parseInt(match[0],16));
  return `CSLE2:${encodeBytes([...bytes,...Array.from(proof,char=>char.charCodeAt(0))])}`;
}
export function readLiveEventTicketCode(raw:string,eventId:string):{ticketId:string;credential?:string}{
  const value=raw.trim();
  if(/^[a-f0-9]{64}$/.test(value))return{ticketId:value};
  if(value.startsWith("CSLE2:")){
    if(!/^CSLE2:[A-Z2-7]{103}$/.test(value))throw new Error("Invalid admission code");
    const bytes=decodeBytes(value.slice(6));
    return{ticketId:bytes.slice(0,32).map(byte=>byte.toString(16).padStart(2,"0")).join(""),credential:urlBase64(bytes.slice(32).map(byte=>String.fromCharCode(byte)).join(""))};
  }
  if(value.startsWith("CSLE1:")){
    const match=value.slice(6).match(credentialCode);if(!match)throw new Error("Invalid admission code");
    return{ticketId:match[1],credential:match[2]};
  }
  if(value.startsWith("{")){
    const parsed=JSON.parse(value);
    if(parsed.eventId!==eventId||!credentialCode.test(`${parsed.ticketId}.${parsed.credential}`))throw new Error("Invalid admission code");
    return{ticketId:parsed.ticketId,credential:parsed.credential};
  }
  const url=new URL(value),match=url.hash.slice(1).match(credentialCode);
  if(!["https:","http:"].includes(url.protocol)||!url.pathname.endsWith(`/live-events/${eventId}/ticket`)||!match)throw new Error("Invalid admission code");
  return{ticketId:match[1],credential:match[2]};
}
