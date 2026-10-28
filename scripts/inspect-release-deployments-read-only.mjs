import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const sha=process.argv[2];if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('EXACT_RELEASE_SHA_REQUIRED');
const project='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX',team='team_Aof3F7rzekkBNGBsPb6p9XmO';
function get(endpoint){const r=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api',endpoint,'--scope',team,'--method','GET'],{encoding:'utf8',timeout:90000,maxBuffer:8_000_000});if(r.status!==0)throw Error('DEPLOYMENT_INSPECTION_FAILED');return JSON.parse(r.stdout);}
const inventory=get('/v6/deployments?projectId='+project+'&limit=10');
const deployments=inventory.deployments.filter(d=>d.meta?.githubCommitSha===sha).map(d=>({id:d.uid,state:d.state,target:d.target||'preview',url:d.url,sha:d.meta?.githubCommitSha,branch:d.meta?.githubCommitRef,createdAt:d.created}));
const p=get('/v9/projects/'+project);const report={readOnly:true,project,team,expectedSha:sha,deployments,servingProduction:{id:p.targets?.production?.id,sha:p.targets?.production?.meta?.githubCommitSha},checkedAt:new Date().toISOString(),productionMutations:0};
fs.writeFileSync('docs/automatic-publishing-final-deployment-status-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
