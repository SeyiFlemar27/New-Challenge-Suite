import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import qrcode from 'qrcode-generator';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {encodeLiveEventTicketCode,readLiveEventTicketCode} from '../lib/live-event-ticket-code.ts';
import {createLiveEventQrImage} from '../lib/live-event-qr-image.ts';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const page=await browser.newPage();
  await page.setContent('<img alt="Ticket QR" width="320" height="320" style="width:296px;height:auto;padding:12px;background:white">');
  await page.addScriptTag({path:resolve('node_modules/@zxing/browser/umd/zxing-browser.min.js')});
  for(let index=0;index<256;index++){
    const ticketId=createHash('sha256').update(`local-ticket-${index}`).digest('hex'),credential=createHash('sha256').update(`local-credential-${index}`).digest('base64url');
    const encoded=encodeLiveEventTicketCode(ticketId,credential),expected={ticketId,credential};
    assert.deepEqual(readLiveEventTicketCode(encoded,'local-event'),expected);
    assert.deepEqual(readLiveEventTicketCode(`CSLE1:${ticketId}.${credential}`,'local-event'),expected);
    assert.deepEqual(readLiveEventTicketCode(JSON.stringify({version:1,eventId:'local-event',...expected}),'local-event'),expected);
    assert.deepEqual(readLiveEventTicketCode(`https://example.test/live-events/local-event/ticket#${ticketId}.${credential}`,'local-event'),expected);
    assert.throws(()=>readLiveEventTicketCode(`https://example.test/live-events/another-event/ticket#${ticketId}.${credential}`,'local-event'));
    const selected=await createLiveEventQrImage(encoded,(level,size)=>{const code=qrcode(0,level);code.addData(encoded,'Alphanumeric');code.make();return code.createDataURL(size,size*4);},source=>page.evaluate(async({source,expected})=>{const image=new Image();image.src=source;await image.decode();const reader=new window.ZXingBrowser.BrowserQRCodeReader();const decoded=(await reader.decodeFromImageElement(image)).getText();for(const width of [200,264,296]){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=width;const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;context.drawImage(image,0,0,width,width);if((await reader.decodeFromCanvas(canvas)).getText()!==expected)throw new Error('QR content mismatch');}return decoded;},{source,expected:encoded}));
    const code=qrcode(0,selected.level);code.addData(encoded,'Alphanumeric');code.make();
    await page.locator('img').evaluate((image,src)=>{image.src=src;},selected.source);
    const result=await page.evaluate(async()=>{
      const image=document.querySelector('img');await image.decode();
      const reader=new window.ZXingBrowser.BrowserQRCodeReader();
      const rendered=[];for(const width of [200,264,296]){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=width;const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;context.drawImage(image,0,0,width,width);rendered.push((await reader.decodeFromCanvas(canvas)).getText());}
      return {rendered,original:(await reader.decodeFromImageUrl(image.src)).getText()};
    }).catch(async error=>{
      const hints=createRequire(import.meta.resolve('@zxing/browser'))('@zxing/library').DecodeHintType;
      const trials=await page.evaluate(async({variants,tryHarder,pure})=>{const result=[];for(const variant of variants){for(const mode of ['default','try_harder','pure_diagnostic']){try{const reader=new window.ZXingBrowser.BrowserQRCodeReader(mode==='default'?undefined:new Map([[mode==='try_harder'?tryHarder:pure,true]]));await reader.decodeFromImageUrl(variant.src);result.push(`${variant.label}/${mode}:yes`);}catch{result.push(`${variant.label}/${mode}:no`);}}}return result;},{variants:[...[4,5,6,8,12].map(size=>({label:`gif_${size}`,src:code.createDataURL(size,size*4)})),{label:'svg_5',src:`data:image/svg+xml;base64,${Buffer.from(code.createSvgTag(5,20)).toString('base64')}`}],tryHarder:hints.TRY_HARDER,pure:hints.PURE_BARCODE});
      throw new Error(`Deterministic QR fixture ${index}: ${error.message}; diagnostics=${trials.join(', ')}`);
    });
    assert.equal(result.original,encoded,`generated QR ${index} must decode from original pixels`);
    assert.deepEqual(result.rendered,[encoded,encoded,encoded],`QR ${index} must decode at mobile and desktop presentation sizes`);
  }
  console.log('Live Event QR: 256 deterministic codes passed original/rendered browser round trips and compact/legacy/link parsing checks. Physical camera testing remains unverified.');
}finally{await browser.close();}
