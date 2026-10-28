import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

const root=resolve(process.cwd());
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024});
if(git('rev-parse','--show-toplevel').toString().trim().toLowerCase()!==root.replaceAll('\\','/').toLowerCase())throw Error('ROOT_MISMATCH');
const head=git('rev-parse','HEAD').toString().trim();
const files=[...new Set(git('ls-files','-z','--cached','--others','--exclude-standard').toString().split('\0').filter(Boolean))];
// Credentials and machine caches remain untouched in their original locations.
const excluded=files.filter(p=>/(^|\/)(\.env(?:\..*)?|\.vercel|\.pnpm-store|node_modules|\.next|.*credentials.*|.*service.account.*|.*\.log|.*\.tsbuildinfo)(\/|$)/i.test(p));
const included=files.filter(p=>!excluded.includes(p));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const before=included.map(path=>({path,sha256:hash(join(root,path))}));
const output=mkdtempSync(join(tmpdir(),'challenge-suite-master-recovery-'));
for(const item of before){const target=join(output,'source',item.path);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(root,item.path),target);if(hash(target)!==item.sha256)throw Error('COPY_MISMATCH');}
git('bundle','create',join(output,'head.bundle'),'HEAD');
git('bundle','verify',join(output,'head.bundle'));
for(const item of before)if(hash(join(root,item.path))!==item.sha256)throw Error('SOURCE_CHANGED');
if(git('rev-parse','HEAD').toString().trim()!==head)throw Error('HEAD_CHANGED');
writeFileSync(join(output,'manifest.json'),JSON.stringify({root,head,verified:true,files:before,excluded,createdAt:new Date().toISOString()},null,2));
writeFileSync('docs/master-recovery-snapshot-2026-10-26.json',JSON.stringify({output,head,verified:true,fileCount:before.length,excludedCount:excluded.length},null,2));
console.log(JSON.stringify({output,head,verified:true,fileCount:before.length,excludedCount:excluded.length}));
