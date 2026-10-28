import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
assert.match(process.env.GCLOUD_PROJECT??'',/^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST??'',/^127\.0\.0\.1:\d+$/);
const tests=['scripts/test-normal-paid-entry-emulator.mjs','scripts/test-enterprise-active-cap-concurrency.mjs','scripts/test-individual-cancellation-emulator.mjs'];
let failed=0;
for(const test of tests){
 console.log('STABILIZATION:',test);
 const result=spawnSync(process.execPath,['--experimental-transform-types','--experimental-loader','./scripts/ts-alias-loader.mjs',test],{stdio:'inherit',env:process.env,timeout:600000});
 console.log('STABILIZATION RESULT:',JSON.stringify({test,exitCode:result.status,error:result.error?.code??null}));
 if(result.status!==0||result.error)failed++;
}
console.log(`Selected backend stabilization: ${tests.length-failed}/${tests.length}; not the complete regression program.`);
process.exitCode=failed?1:0;
