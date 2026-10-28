import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const project='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX',team='team_Aof3F7rzekkBNGBsPb6p9XmO';
function get(endpoint){const r=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api',endpoint,'--scope',team,'--method','GET'],{encoding:'utf8',timeout:90000,maxBuffer:8_000_000});if(r.status!==0)throw Error('VERCEL_READ_ONLY_FAILED');return JSON.parse(r.stdout);}
const p=get('/v9/projects/'+project);if(p.id!==project||p.accountId!==team||p.name!=='challenge-suite')throw Error('PROJECT_MISMATCH');
const env=get('/v10/projects/'+project+'/env');if(env.pagination?.next)throw Error('INCOMPLETE_ENV_INVENTORY');
const report={checkedAt:new Date().toISOString(),readOnly:true,resourceMutations:0,project,team,branch:'codex/automatic-publishing-exception-moderation',productionDeployment:{id:p.targets?.production?.id,sha:p.targets?.production?.meta?.githubCommitSha},records:env.envs.map(e=>({name:e.key,scope:e.target,gitBranch:e.gitBranch||null,type:e.type})),valuesOmitted:true};
fs.writeFileSync('docs/challenge-suite-staging-preview-metadata-2026-10-20.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,records:report.records.filter(e=>e.scope?.includes('preview'))},null,2));
