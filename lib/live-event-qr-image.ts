export type TicketQrLevel="M"|"Q"|"H";
/** Some valid symbol patterns confuse finder detection. Select only an encoding
 * the application's scanner verifies; never alter or shorten the bearer proof.
 */
export async function createLiveEventQrImage(payload:string,generate:(level:TicketQrLevel,moduleSize:number)=>string,verify:(source:string)=>Promise<string>){
  for(const moduleSize of [4,5,6])for(const level of ["M","Q","H"] as const){
    const source=generate(level,moduleSize);
    try{if(await verify(source)===payload)return {source,level,moduleSize};}catch{/* Try another standard representation of the identical payload. */}
  }
  throw new Error("Admission QR verification failed; use ticket identification.");
}
