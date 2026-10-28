import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
if(!process.argv.includes('--approved-eight-indexes'))throw Error('EXPLICIT_EIGHT_INDEX_APPROVAL_REQUIRED');
const plan=JSON.parse(fs.readFileSync('docs/automatic-publishing-required-index-additions-2026-10-20.json','utf8'));
assert.equal(plan.project,'challenge-suite');assert.equal(plan.database,'(default)');assert.equal(plan.additiveOnly,true);assert.equal(plan.additions.length,8);
const expected=[
 ['tournaments','privacy:A,createdAt:D,__name__:D'],['tournaments','privacy:A,createdAt:A,__name__:A'],['tournaments','privacy:A,participantCount:D,__name__:D'],
 ['tournamentJobs','status:A,type:A,runAt:A,__name__:A'],['tournamentJobs','status:A,type:A,schedulerDispatchState:A,runAt:A,__name__:A'],['tournamentJobs','status:A,type:A,schedulerDispatchState:A,createdAt:A,__name__:A'],['tournamentJobs','status:A,type:A,schedulerDispatchState:A,schedulerDispatchLeaseUntilAt:A,__name__:A'],
 ['tournamentVotes','tournamentId:A,matchId:A,voteSequence:A,__name__:A']
].map(([collection,fields])=>collection+'|COLLECTION|'+fields).sort();
function signature(index){const fields=index.fields.map(f=>{assert.ok(['ASCENDING','DESCENDING'].includes(f.order));return [f.fieldPath,f.order[0]];});if(!fields.some(f=>f[0]==='__name__'))fields.push(['__name__',fields.at(-1)[1]]);const collection=index.collectionGroup||index.name.split('/collectionGroups/')[1].split('/')[0];return collection+'|'+index.queryScope+'|'+fields.map(f=>f.join(':')).join(',');}
assert.deepEqual(plan.additions.map(signature).sort(),expected);
const require=createRequire(import.meta.url),auth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
const account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('CLI_ACCOUNT_UNAVAILABLE');
const {access_token:token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const api=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/apiv2.js');
api.setRefreshToken(account.tokens.refresh_token);
api.setAccessToken(token);
const client=new api.Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'});
const base='https://firestore.googleapis.com/v1/projects/challenge-suite/databases/(default)',results=[];
const output='docs/automatic-publishing-index-execution-2026-10-20.json';
const save=()=>fs.writeFileSync(output,JSON.stringify({project:plan.project,database:plan.database,additiveOnly:true,updatedAt:new Date().toISOString(),results},null,2)+'\n');
async function request(url,body){const parsed=new URL(url);assert.equal(parsed.origin,'https://firestore.googleapis.com');assert.ok(parsed.pathname.startsWith('/v1/projects/challenge-suite/databases/(default)'));const path=parsed.pathname.slice(3);const response=body?await client.post(path,body):await client.get(path,{queryParams:Object.fromEntries(parsed.searchParams)});return response.body;}
async function list(){const rows=[];let token;do{const url=new URL(base+'/collectionGroups/-/indexes');if(token)url.searchParams.set('pageToken',token);const data=await request(url);rows.push(...(data.indexes||[]));token=data.nextPageToken;}while(token);return [...new Map(rows.map(row=>[row.name,row])).values()];}
try{
 const database=await request(base);assert.equal(database.name,'projects/challenge-suite/databases/(default)');console.log(JSON.stringify({targetVerified:true,database:database.name,edition:database.databaseEdition||'STANDARD'}));
 let inventory=await list();console.log(JSON.stringify({latestIndexInventory:inventory.length,approvedDefinitions:8}));
 if(process.argv.includes('--preflight-only')){console.log(JSON.stringify({indexes:inventory.map(i=>({name:i.name,state:i.state,queryScope:i.queryScope,fields:i.fields}))},null,2));process.exit(0);}
 for(const definition of plan.additions){const match=inventory.find(i=>signature(i)===signature(definition));if(match){assert.ok(['READY','CREATING'].includes(match.state),'UNEXPECTED_EXISTING_INDEX_STATE');results.push({definition,action:'skipped_equivalent',name:match.name,state:match.state});}else{try{const operation=await request(base+'/collectionGroups/'+definition.collectionGroup+'/indexes',{queryScope:definition.queryScope,fields:definition.fields});results.push({definition,action:'created',operation:operation.name,state:'CREATING'});}catch(e){const id=/index ID = ([A-Za-z0-9_-]+)/.exec(String(e.message||''))?.[1];if(!id||Number(e.status||e.code)!==409)throw e;const existing=await request(base+'/collectionGroups/'+definition.collectionGroup+'/indexes/'+id);assert.equal(signature(existing),signature(definition),'CONFLICTING_INDEX_DEFINITION');assert.ok(['READY','CREATING'].includes(existing.state));results.push({definition,action:'skipped_equivalent_after_conflict',name:existing.name,state:existing.state});}}save();console.log(JSON.stringify({query:definition.dependentQuery,action:results.at(-1).action,state:results.at(-1).state}));}
 const deadline=Date.now()+30*60_000;let previous='';
 while(true){inventory=await list();for(const row of results){const match=inventory.find(i=>signature(i)===signature(row.definition))||(row.name?await request('https://firestore.googleapis.com/v1/'+row.name):null);if(!match){row.state='CREATING';continue;}row.name=match.name;row.state=match.state;if(!['READY','CREATING'].includes(match.state))throw Error('INDEX_BUILD_FAILED');}save();const state=results.map(r=>r.state).join(',');if(state!==previous){console.log(JSON.stringify({ready:results.filter(r=>r.state==='READY').length,total:8}));previous=state;}if(results.every(r=>r.state==='READY'))break;if(Date.now()>deadline)throw Error('INDEX_READY_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,10000));}
 console.log(JSON.stringify({allRequiredIndexesReady:true,created:results.filter(r=>r.action==='created').length,skipped:results.filter(r=>r.action!=='created').length}));
}catch(e){save();console.error(JSON.stringify({stopped:true,code:String(e.code||e.status||e.name||'INDEX_CREATION_FAILED'),message:String(e.message||'').slice(0,500),createdSoFar:results.filter(r=>r.action==='created').length}));process.exitCode=1;}
