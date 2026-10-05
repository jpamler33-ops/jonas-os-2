import {spawnSync} from 'node:child_process';
const files=['test/jonas-clone-v1.test.mjs','test/jonas-clone-v1-integration.test.mjs','test/jonas-clone-v1-safety.test.mjs','test/jonas-clone-v1-contract.test.mjs'];
for(const file of files){
  const r=spawnSync(process.execPath,['--test',file],{stdio:'inherit'});
  if(r.status!==0)process.exit(r.status||1);
}
const smoke=spawnSync(process.execPath,['scripts/jonas-clone-v1-contract-check.mjs'],{stdio:'inherit'});
process.exit(smoke.status||0);
