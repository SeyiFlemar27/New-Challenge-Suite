import fs from 'node:fs';
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>8_000_000)throw Error('DEPLOYMENT_RESPONSE_TOO_LARGE');}
const data=JSON.parse(input);
if(data.projectId!=='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX')throw Error('UNEXPECTED_VERCEL_PROJECT');
const report={id:data.id,projectId:data.projectId,url:data.url,readyState:data.readyState,target:data.target,aliases:data.alias||[],source:{sha:data.gitSource?.sha||data.meta?.githubCommitSha,branch:data.gitSource?.ref||data.meta?.githubCommitRef,organization:data.meta?.githubOrg,repository:data.meta?.githubRepo},inspectionOnly:true,applicationDeploymentPerformed:false,capturedAt:new Date().toISOString()};
fs.writeFileSync('docs/automatic-publishing-production-rollback-reference-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
