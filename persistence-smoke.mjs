import fs from 'node:fs';
import path from 'node:path';

export const PERSISTENCE_SMOKE_VERSION='TCX_PERSISTENCE_SMOKE_V1';

function safeRead(file){
  try{
    if(!fs.existsSync(file)) return null;
    const raw=fs.readFileSync(file,'utf8');
    const value=JSON.parse(raw);
    return value&&typeof value==='object'?value:null;
  }catch{
    return null;
  }
}

export function runPersistenceSmokeTest({
  dir=process.env.RAILWAY_VOLUME_MOUNT_PATH||'/data',
  now=Date.now()
}={}){
  const file=path.join(dir,'tcx-persistence-smoke.json');
  fs.mkdirSync(dir,{recursive:true});
  const previous=safeRead(file);
  const createdAt=Number(previous?.createdAt)||Number(now);
  const previousBootCount=Math.max(0,Math.floor(Number(previous?.bootCount)||0));
  const state={
    version:PERSISTENCE_SMOKE_VERSION,
    createdAt,
    lastBootAt:Number(now),
    bootCount:previousBootCount+1,
    survivedPreviousBoot:Boolean(previous),
    mountPath:dir
  };
  fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n','utf8');
  return Object.freeze({
    file,
    ...state
  });
}
