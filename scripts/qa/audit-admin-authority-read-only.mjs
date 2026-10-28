import nextEnv from '@next/env';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const project='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX',team='team_Aof3F7rzekkBNGBsPb6p9XmO';
function read(path){const r=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api',path,'--scope',team,'--method','GET'],{encoding:'utf8',timeout:90000,maxBuffer:8e6});if(r.status!==0)throw Error('VERCEL_READ_FAILED');return JSON.parse(r.stdout);}
const inventory=read('/v10/projects/'+project+'/env');if(inventory.pagination?.next)throw Error('INCOMPLETE_INVENTORY');
const authority=[];
for(const name of ['ADMIN_EMAIL_ALLOWLIST','NEXT_PUBLIC_INITIAL_ADMIN_EMAILS']){
 const rows=inventory.envs.filter(e=>e.key===name&&e.target?.includes('production'));
 if(rows.length>1)throw Error('DUPLICATE_ADMIN_CONFIGURATION');
 let value=rows[0]?.value;
 if(rows[0]&&rows[0].type==='encrypted'){const detail=read('/v1/projects/'+project+'/env/'+rows[0].id+'?decrypt=true');value=detail.value;}
 authority.push({name,present:rows.length===1,type:rows[0]?.type??null,values:String(value||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)});
}
const {getAdminDb,getFirebaseAdminConfigStatus}=await import('../../lib/firebase/admin.ts');if(getFirebaseAdminConfigStatus().projectId!=='challenge-suite')throw Error('WRONG_PROJECT');
const users=await getAdminDb().collection('users').select('email','role','accountType','planId','isAdmin','adminRoles','adminRole').limit(101).get();
const matches=users.docs.map(doc=>{const p=doc.data(),email=String(p.email||'').trim().toLowerCase();return{accountTag:createHash('sha256').update(doc.id).digest('hex').slice(0,10),plan:p.planId,role:p.role??null,accountType:p.accountType??null,adminFlag:p.isAdmin===true,adminFlagType:typeof p.isAdmin,serverAllowlistMatch:authority[0].values.includes(email),signupAllowlistMatch:authority[1].values.includes(email),roleAssignments:Array.isArray(p.adminRoles)?p.adminRoles:[]};}).filter(p=>p.adminFlag||p.serverAllowlistMatch||p.signupAllowlistMatch||p.role==='admin'||p.adminFlagType==='string');
const report={checkedAt:new Date().toISOString(),readOnly:true,mutations:0,complete:users.size<101,configuration:authority.map(({values,...entry})=>({...entry,entryCount:values.length})),accounts:matches};
fs.writeFileSync('docs/dashboard-admin-authority-read-only-2026-10-21.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
