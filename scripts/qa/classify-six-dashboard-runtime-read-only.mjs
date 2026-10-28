import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const result=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','logs','--deployment','dpl_DtepZCxm8w1hXGDYmmYZmQy5zuf5','--project','prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX','--scope','team_Aof3F7rzekkBNGBsPb6p9XmO','--environment','production','--no-branch','--since','2026-10-21T23:02:00.000Z','--level','error','--limit','100','--json'],{encoding:'utf8',timeout:90000,maxBuffer:8e6});
if(result.status!==0)throw Error('LOG_READ_FAILED');
const rows=result.stdout.split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x));
function redact(value){return String(value).replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g,'[private material omitted]').replace(/Bearer\s+\S+/gi,'Bearer [omitted]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[token omitted]').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g,'[email omitted]').replace(/https?:\/\/[^\s"']+/g,'[URL omitted]').replace(/\b(?:sk|pk)_(?:live|test)_\w+/g,'[key omitted]').replace(/[a-f0-9]{24,}/gi,'[identifier omitted]').slice(0,1800);}
const report={checkedAt:new Date().toISOString(),readOnly:true,entries:rows.map(row=>({keys:Object.keys(row),message:redact(row.message??row.text??row)}))};
writeFileSync('docs/six-dashboard-runtime-classification-2026-10-22.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
