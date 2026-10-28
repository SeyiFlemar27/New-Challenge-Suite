import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const project='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX',team='team_Aof3F7rzekkBNGBsPb6p9XmO',results=[];
for(const [label,endpoint] of [['drains','/v1/drains?projectId='+project],['integrations','/v1/integrations/configurations?view=project']]){
 const r=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api',endpoint,'--scope',team,'--method','GET'],{encoding:'utf8',timeout:90000,maxBuffer:8_000_000});
 if(r.status!==0){results.push({label,verified:false,reason:'READ_ONLY_API_UNAVAILABLE'});continue;}
 try{const d=JSON.parse(r.stdout);const rows=Array.isArray(d)?d:d.drains||d.configurations;if(!Array.isArray(rows))throw Error('UNEXPECTED_RESPONSE');results.push({label,verified:true,items:rows.filter(x=>label==='drains'||!Array.isArray(x.projects)||x.projects.includes(project)).map(x=>({id:x.id,name:x.name||x.slug||x.integration?.slug||null,projectScoped:Array.isArray(x.projects)||Array.isArray(x.projectIds)}))});}catch{results.push({label,verified:false,reason:'RESPONSE_NOT_CERTIFIED'});}
}
const report={readOnly:true,productionMutations:0,project,team,completedAt:new Date().toISOString(),destinationsOrSecretsPrinted:false,results};fs.writeFileSync('docs/tournament-final-monitoring-integration-inspection-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
