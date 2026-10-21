import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const project='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX',team='team_Aof3F7rzekkBNGBsPb6p9XmO';
function get(path){const r=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api',path,'--scope',team,'--method','GET'],{encoding:'utf8',timeout:90000,maxBuffer:8e6});if(r.status!==0)throw Error('VERCEL_READ_FAILED');return JSON.parse(r.stdout);}
const p=get('/v9/projects/'+project),list=get('/v6/deployments?projectId='+project+'&limit=8');
const report={checkedAt:new Date().toISOString(),project:p.id,name:p.name,git:p.link?{type:p.link.type,repo:p.link.repo,org:p.link.org,productionBranch:p.link.productionBranch}:null,deployments:(list.deployments??[]).map(d=>({id:d.uid,url:d.url,state:d.readyState??d.state,target:d.target,sha:d.meta?.githubCommitSha,branch:d.meta?.githubCommitRef,created:d.created}))};
writeFileSync('docs/six-dashboard-git-deployment-observation-2026-10-21.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
