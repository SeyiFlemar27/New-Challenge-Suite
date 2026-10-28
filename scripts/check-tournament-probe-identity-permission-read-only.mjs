import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),auth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
const account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('EXISTING_CLI_ACCOUNT_REQUIRED');
const {access_token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const r=await fetch('https://iam.googleapis.com/v1/projects/challenge-suite/serviceAccounts/tournament-lifecycle-invoker@challenge-suite.iam.gserviceaccount.com:testIamPermissions',{method:'POST',headers:{authorization:'Bearer '+access_token,'content-type':'application/json'},body:JSON.stringify({permissions:['iam.serviceAccounts.getOpenIdToken']}),signal:AbortSignal.timeout(30000)});
const data=await r.json();const report={readOnly:true,project:'challenge-suite',existingInvokerOnly:true,canMintIntendedProbeIdentity:r.ok&&data.permissions?.includes('iam.serviceAccounts.getOpenIdToken')===true,status:r.status,credentialsPrinted:false,iamChanges:0,capturedAt:new Date().toISOString()};fs.writeFileSync('docs/tournament-probe-identity-permission-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
