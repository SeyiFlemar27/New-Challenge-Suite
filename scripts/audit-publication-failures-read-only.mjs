import nextEnv from '@next/env';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Explicitly read-only: no record identifiers, user details or content are output.
const args=process.argv.slice(2), project=args[args.indexOf('--project')+1];
if (!args.includes('--project') || project!=='challenge-suite' || args.some(arg=>['--apply','--write','--migrate'].includes(arg))) throw new Error('Use --project challenge-suite for this bounded read-only audit. Writes are unsupported.');
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.CHALLENGE_SUITE_USE_FIREBASE_EMULATORS==='true') throw new Error('This read-only audit requires the explicitly selected project, not emulator data.');
if ((process.env.FIREBASE_PROJECT_ID||process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)!==project) throw new Error('Configured project does not match the explicitly selected project.');
let app;
try {
  if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) throw Object.assign(new Error(),{code:'LOCAL_CREDENTIALS_UNAVAILABLE'});
  app=initializeApp({projectId:project,credential:cert({projectId:project,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,'\n')})},'publication-audit-read-only');
  const db=getFirestore(app);
  const sample=await db.collection('auditLogs').where('action','==','challenge.publish_failed').select('metadata.causeCode').limit(100).get();
  const counts={};
  for (const row of sample.docs) {
    const value=row.data().metadata?.causeCode;
    const code=typeof value==='string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value)?value:'UNSPECIFIED';
    counts[code]=(counts[code]??0)+1;
  }
  console.log(JSON.stringify({readOnly:true,productionWrites:false,project,boundedUnorderedSample:true,limit:100,recordsRead:sample.size,failureCounts:counts},null,2));
} catch(error) {
  const raw=String(error?.code??'AUDIT_READ_UNAVAILABLE');
  console.log(JSON.stringify({readOnly:true,productionWrites:false,project,available:false,code:/^[A-Za-z0-9_/-]{1,80}$/.test(raw)?raw:'AUDIT_READ_UNAVAILABLE'}));
  process.exitCode=1;
} finally { if(app)await deleteApp(app); }
