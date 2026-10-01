import { readFile, writeFile } from 'node:fs/promises';

const target=new URL('./biggj-mobile-webapp.mjs',import.meta.url);
const broken='function renderOverview(){function renderOverview(){';
const fixed='function renderOverview(){';
const source=await readFile(target,'utf8');
const count=source.split(broken).length-1;
if(count>1)throw new Error(`BIGGJ_WEBAPP_BOOT_REPAIR_AMBIGUOUS:${count}`);
if(count===1){
  const repaired=source.replace(broken,fixed);
  await writeFile(target,repaired,'utf8');
  console.log(JSON.stringify({type:'BIGGJ_WEBAPP_BOOT_REPAIRED',repair:'duplicate_renderOverview',count:1}));
}else{
  console.log(JSON.stringify({type:'BIGGJ_WEBAPP_BOOT_INTEGRITY',status:'CLEAN'}));
}
await import('./bot.mjs');
