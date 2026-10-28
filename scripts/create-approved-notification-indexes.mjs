import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
if(!process.argv.includes('--create-exact-owner-approved-notification-indexes'))throw Error('Specific owner approval flag required.');
const cli=process.argv[2];if(!cli)throw Error('Pass the installed Firebase CLI directory.');
const require=createRequire(import.meta.url),auth=require(join(cli,'lib/auth.js'));
const approved=[['status'],['read'],['status','read']].map(keys=>({collectionGroup:'notifications',queryScope:'COLLECTION',fields:[{fieldPath:'userId',order:'ASCENDING'},...keys.map(fieldPath=>({fieldPath,order:'ASCENDING'})),{fieldPath:'createdAt',order:'DESCENDING'}]}));
const proposed=JSON.parse(fs.readFileSync('docs/notification-index-minimal-2026-10-28.json','utf8'));
if(JSON.stringify(proposed.indexes)!==JSON.stringify(approved)||proposed.fieldOverrides.length)throw Error('Definitions differ from the exact owner-approved three indexes.');
const account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('Existing Firebase CLI account required.');
const {access_token:token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const root='https://firestore.googleapis.com/v1/projects/challenge-suite/databases/(default)';
async function request(url,body){const response=await fetch(url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(!response.ok){const failure=await response.json().catch(()=>({}));throw Error(`INDEX_ADMIN_HTTP_${response.status}: ${String(failure.error?.message??"Request rejected").replace(/https?:\/\/\S+/g,"[reference]").slice(0,700)}`);}return response.json();}
const database=await request(root);if(database.name!=='projects/challenge-suite/databases/(default)'||database.databaseEdition!=='STANDARD')throw Error('Existing default Standard database verification failed.');
async function list(){const result=[];let cursor;do{const page=await request(root+'/collectionGroups/notifications/indexes'+(cursor?'?pageToken='+encodeURIComponent(cursor):''));result.push(...page.indexes??[]);cursor=page.nextPageToken;}while(cursor);return result;}
const same=(index,definition)=>index.queryScope===definition.queryScope&&JSON.stringify(index.fields.filter(field=>field.fieldPath!=='__name__').map(({fieldPath,order})=>({fieldPath,order})))===JSON.stringify(definition.fields);
const report={startedAt:new Date().toISOString(),project:'challenge-suite',database:'(default)',authorization:'Owner approved exactly these three COLLECTION composites in this conversation',documentWrites:0,existingIndexesModified:0,results:[]};
const output='docs/notification-index-execution-2026-10-28.json';const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
try{
 let existing=await list();
 for(const definition of approved){const prior=existing.find(index=>same(index,definition));if(prior){report.results.push({definition,name:prior.name,state:prior.state,created:false});save();continue;}
  const operation=await request(root+'/collectionGroups/notifications/indexes',{queryScope:definition.queryScope,fields:definition.fields});report.results.push({definition,operation:operation.name,state:'CREATING',created:true});save();console.log('Created only approved notification index:',definition.fields.map(f=>f.fieldPath+' '+f.order).join(', '));
 }
 const until=Date.now()+15*60000;
 while(Date.now()<until){existing=await list();for(const entry of report.results){const current=existing.find(index=>same(index,entry.definition));if(current){entry.name=current.name;entry.state=current.state;}}save();if(report.results.every(row=>row.state==='READY')){report.completedAt=new Date().toISOString();report.allReady=true;save();console.log('All three approved notification indexes READY. No existing indexes or documents modified.');process.exit(0);}if(report.results.some(row=>row.state==='NEEDS_REPAIR'))throw Error('INDEX_BUILD_NEEDS_REPAIR');await new Promise(resolve=>setTimeout(resolve,15000));}
 throw Error('INDEX_READY_TIMEOUT');
}catch(error){report.error=error.message;report.allReady=false;save();console.error(error.message);process.exitCode=1;}
