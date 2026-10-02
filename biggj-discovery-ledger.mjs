import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_DISCOVERY_LEDGER_VERSION='BIGGJ_DISCOVERY_LEDGER_V1';
export const BIGGJ_DISCOVERY_LEDGER_SCHEMA_VERSION=1;

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function clone(v){ return v==null?v:structuredClone(v); }
function text(v,max=180){
  const s=String(v??'').replace(/\s+/g,' ').trim();
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function sampleBucket(n){
  const x=Math.max(0,Math.floor(Number(n)||0));
  if(x<=0)return 0;
  return 2**Math.floor(Math.log2(x));
}
function statusRank(status){
  const s=String(status||'');
  if(s==='ROBUST_FORWARD_LAW_CANDIDATE')return 7;
  if(s==='FORWARD_LAW_CANDIDATE'||s==='WALK_FORWARD_VALIDATED'||s==='SCALE_INVARIANT_CANDIDATE')return 6;
  if(s==='NILOMETER_CANDIDATE')return 5;
  if(s==='GENERATION_COMPLETED')return 4;
  if(s==='COLLECTING'||s==='MEASURING'||s==='UNVALIDATED')return 2;
  if(s==='FAILED_FORWARD_VALIDATION'||s==='FAILED_VALIDATION'||s==='CONTEXT_DEPENDENT'||s==='NO_TRAIN_EFFECT')return 1;
  return 0;
}
function entryKey(type,parts){
  return 'disc_'+sha256({
    version:BIGGJ_DISCOVERY_LEDGER_VERSION,
    type:String(type),
    parts:Array.isArray(parts)?parts.map(x=>String(x??'')):[String(parts??'')]
  }).slice(0,24);
}
function normalizedSnapshot(x={}){
  const out={};
  for(const [k,v] of Object.entries(x)){
    if(v===undefined)continue;
    if(typeof v==='number'&&!Number.isFinite(v))out[k]=null;
    else out[k]=clone(v);
  }
  return out;
}
function eventFingerprint({status,samples,bucket,summary}={}){
  return sha256({
    status:String(status||'UNKNOWN'),
    samples:Math.max(0,Number(samples)||0),
    bucket:Math.max(0,Number(bucket)||0),
    summary:normalizedSnapshot(summary||{})
  }).slice(0,24);
}
function ensureState(input,now=Date.now()){
  if(
    input?.version===BIGGJ_DISCOVERY_LEDGER_VERSION&&
    input?.schemaVersion===BIGGJ_DISCOVERY_LEDGER_SCHEMA_VERSION&&
    Array.isArray(input?.entries)
  ){
    return {
      version:BIGGJ_DISCOVERY_LEDGER_VERSION,
      schemaVersion:BIGGJ_DISCOVERY_LEDGER_SCHEMA_VERSION,
      createdAt:finite(input.createdAt)??Number(now),
      updatedAt:finite(input.updatedAt)??Number(now),
      entries:clone(input.entries)
    };
  }
  return {
    version:BIGGJ_DISCOVERY_LEDGER_VERSION,
    schemaVersion:BIGGJ_DISCOVERY_LEDGER_SCHEMA_VERSION,
    createdAt:Number(now),
    updatedAt:Number(now),
    entries:[]
  };
}
function lawRows(temple={}){
  const laws=temple?.transitionLaws||{};
  const rows=[];
  for(const x of Array.isArray(laws.candidates)?laws.candidates:[]){
    rows.push({
      key:entryKey('TRANSITION_LAW',[x.from,x.to,x.fromState,x.toState,x.forwardHorizon]),
      type:'TRANSITION_LAW',
      title:[x.fromState,'→',x.toState,'→',x.forwardHorizon].join(' '),
      status:String(x.status||'UNVALIDATED'),
      samples:Number(x.independentCases||0),
      robust:x.robust===true,
      validated:x.validated===true,
      summary:{
        from:x.from,to:x.to,fromState:x.fromState,toState:x.toState,
        forwardHorizon:x.forwardHorizon,
        independentCases:Number(x.independentCases||0),
        holdoutCases:Number(x.holdoutCases||0),
        contextsEligible:Number(x.contextsEligible||0),
        direction:x.direction||null,
        medianReturn:finite(x?.validation?.medianReturn),
        positiveRate:finite(x?.validation?.positiveRate),
        confidenceSupported:x.confidenceSupported===true,
        robust:x.robust===true,
        validated:x.validated===true
      },
      authority:'NONE',
      source:'TEMPORAL_TEMPLE'
    });
  }
  for(const x of Array.isArray(laws.collecting)?laws.collecting:[]){
    rows.push({
      key:entryKey('TRANSITION_LAW',[x.from,x.to,x.fromState,x.toState,x.forwardHorizon]),
      type:'TRANSITION_LAW',
      title:[x.fromState,'→',x.toState,'→',x.forwardHorizon].join(' '),
      status:'COLLECTING',
      samples:Number(x.samples||0),
      robust:false,
      validated:false,
      summary:{
        from:x.from,to:x.to,fromState:x.fromState,toState:x.toState,
        forwardHorizon:x.forwardHorizon,samples:Number(x.samples||0),
        required:Number(x.required||0)
      },
      authority:'NONE',
      source:'TEMPORAL_TEMPLE'
    });
  }
  return rows;
}
function patternRows(evidenceFactory={}){
  const miner=evidenceFactory?.patternMiner||{};
  const out=[];
  for(const w of [miner.walkForward1h,miner.walkForward4h].filter(Boolean)){
    for(const x of Array.isArray(w.patterns)?w.patterns:[]){
      out.push({
        key:entryKey('WALK_FORWARD_PATTERN',[w.horizon,x.pattern]),
        type:'WALK_FORWARD_PATTERN',
        title:text(x.pattern,180)+' · '+String(w.horizon||'?'),
        status:String(x.status||'UNVALIDATED'),
        samples:Number(x?.validation?.samples||0),
        robust:false,
        validated:x.validated===true,
        summary:{
          horizon:w.horizon,pattern:x.pattern,
          trainSamples:Number(x?.train?.samples||0),
          validationSamples:Number(x?.validation?.samples||0),
          trainAverageReturn:finite(x?.train?.averageReturn),
          validationAverageReturn:finite(x?.validation?.averageReturn),
          validationMedianReturn:finite(x?.validation?.medianReturn),
          validationPositiveRate:finite(x?.validation?.positiveRate),
          validationSevereLossRate:finite(x?.validation?.severeLossRate),
          validated:x.validated===true
        },
        authority:'NONE',
        source:'EVIDENCE_FACTORY'
      });
    }
  }
  return out;
}
function nilometerRows(temple={}){
  const out=[];
  for(const n of [temple?.nilometers?.oneHour,temple?.nilometers?.fourHour].filter(Boolean)){
    for(const x of Array.isArray(n.candidates)?n.candidates:[]){
      if(x.status!=='NILOMETER_CANDIDATE')continue;
      out.push({
        key:entryKey('NILOMETER_PROXY',[n.horizon,x.featureId]),
        type:'NILOMETER_PROXY',
        title:String(x.featureId||'UNKNOWN')+' · '+String(n.horizon||'?'),
        status:String(x.status),
        samples:Number(x.validationSamples||0),
        robust:false,
        validated:false,
        summary:{
          horizon:n.horizon,featureId:x.featureId,
          trainSamples:Number(x.trainSamples||0),
          validationSamples:Number(x.validationSamples||0),
          trainRho:finite(x.trainRho),
          validationRho:finite(x.validationRho),
          direction:x.direction||null,
          informationScore:finite(x.informationScore)
        },
        authority:'NONE',
        source:'TEMPORAL_TEMPLE'
      });
    }
  }
  return out;
}
function invariantRows(temple={}){
  const out=[];
  for(const x of Array.isArray(temple?.invariants?.candidates)?temple.invariants.candidates:[]){
    out.push({
      key:entryKey('SCALE_INVARIANT',[temple?.invariants?.from,temple?.invariants?.to,x.stateId]),
      type:'SCALE_INVARIANT',
      title:String(x.stateId||'?')+' · '+String(temple?.invariants?.from||'?')+'→'+String(temple?.invariants?.to||'?'),
      status:String(x.status||'CONTEXT_DEPENDENT'),
      samples:Number(x.samples||0),
      robust:false,
      validated:x.invariant===true,
      summary:{
        from:temple?.invariants?.from,to:temple?.invariants?.to,
        stateId:x.stateId,
        contexts:Number(x.contexts||0),
        samples:Number(x.samples||0),
        direction:x.direction||null,
        invariant:x.invariant===true
      },
      authority:'NONE',
      source:'TEMPORAL_TEMPLE'
    });
  }
  return out;
}
function worldRows(worlds={}){
  const out=[];
  for(const w of Array.isArray(worlds?.worlds)?worlds.worlds:[]){
    for(const h of Array.isArray(w?.recentGenerations)?w.recentGenerations:[]){
      if(String(h?.status)!=='COMPLETED_FORWARD_SHADOW_GENERATION')continue;
      out.push({
        key:entryKey('WORLD_GENERATION',[w.worldId,h.generation,h.genomeId]),
        type:'WORLD_GENERATION',
        title:String(w?.doctrine?.name||w?.label||w?.strategyId||'WORLD')+' · Gen '+Number(h.generation||0),
        status:'GENERATION_COMPLETED',
        samples:Number(h?.evidence?.closed||0),
        robust:false,
        validated:false,
        summary:{
          worldId:w.worldId,strategyId:w.strategyId,generation:Number(h.generation||0),
          genomeId:h.genomeId,
          mutation:h.mutation||null,
          closed:Number(h?.evidence?.closed||0),
          winRate:finite(h?.evidence?.winRate),
          meanReturn:finite(h?.evidence?.meanReturn),
          expectancyQuote:finite(h?.evidence?.expectancyQuote),
          maxDrawdownPct:finite(h?.evidence?.maxDrawdownPct)
        },
        authority:'NONE',
        source:'PARALLEL_STRATEGY_WORLDS'
      });
    }
  }
  return out;
}
function observationRows({temporalTemple,evidenceFactory,parallelWorlds}={}){
  const rows=[
    ...lawRows(temporalTemple),
    ...patternRows(evidenceFactory),
    ...nilometerRows(temporalTemple),
    ...invariantRows(temporalTemple),
    ...worldRows(parallelWorlds)
  ];
  const byKey=new Map();
  for(const row of rows){
    const prev=byKey.get(row.key);
    if(!prev||statusRank(row.status)>=statusRank(prev.status))byKey.set(row.key,row);
  }
  return [...byKey.values()];
}
function lifecycleEvent(row,{at,kind,previousStatus=null}={}){
  const bucket=sampleBucket(row.samples);
  return {
    at:Number(at),
    kind:String(kind||'OBSERVED'),
    status:String(row.status||'UNKNOWN'),
    previousStatus:previousStatus==null?null:String(previousStatus),
    samples:Number(row.samples||0),
    sampleBucket:bucket,
    summary:normalizedSnapshot(row.summary||{}),
    fingerprint:eventFingerprint({status:row.status,samples:row.samples,bucket,summary:row.summary})
  };
}

export function createBiggjDiscoveryLedger({now=Date.now()}={}){
  return ensureState(null,now);
}

export function refreshBiggjDiscoveryLedger(input,{
  temporalTemple=null,
  evidenceFactory=null,
  parallelWorlds=null,
  asOf=Date.now(),
  maxEntries=500,
  maxEventsPerEntry=40
}={}){
  const state=ensureState(input,asOf);
  const map=new Map(state.entries.map(x=>[String(x.key),clone(x)]));
  const observed=observationRows({temporalTemple,evidenceFactory,parallelWorlds});
  let changed=false,newEntries=0,statusChanges=0,milestones=0;

  for(const row of observed){
    const prev=map.get(row.key);
    const bucket=sampleBucket(row.samples);
    if(!prev){
      const first=lifecycleEvent(row,{at:asOf,kind:'FIRST_SEEN'});
      map.set(row.key,{
        key:row.key,type:row.type,title:row.title,
        source:row.source,authority:'NONE',
        firstSeenAt:Number(asOf),lastSeenAt:Number(asOf),
        currentStatus:row.status,statusRank:statusRank(row.status),
        samples:Number(row.samples||0),sampleBucket:bucket,
        robust:row.robust===true,validated:row.validated===true,
        current:normalizedSnapshot(row.summary||{}),
        timesSeen:1,
        events:[first]
      });
      changed=true;newEntries++;
      continue;
    }

    const previousStatus=String(prev.currentStatus||'UNKNOWN');
    const statusChanged=previousStatus!==String(row.status);
    const bucketChanged=Number(prev.sampleBucket||0)!==bucket;
    const robustChanged=Boolean(prev.robust)!==Boolean(row.robust);
    const validatedChanged=Boolean(prev.validated)!==Boolean(row.validated);
    const summaryChanged=sha256(prev.current||{})!==sha256(normalizedSnapshot(row.summary||{}));

    prev.lastSeenAt=Number(asOf);
    prev.timesSeen=Number(prev.timesSeen||0)+1;
    prev.currentStatus=row.status;
    prev.statusRank=statusRank(row.status);
    prev.samples=Number(row.samples||0);
    prev.sampleBucket=bucket;
    prev.robust=row.robust===true;
    prev.validated=row.validated===true;
    prev.current=normalizedSnapshot(row.summary||{});
    prev.title=row.title;
    prev.source=row.source;
    prev.authority='NONE';

    if(statusChanged||robustChanged||validatedChanged){
      prev.events=[...(prev.events||[]),lifecycleEvent(row,{
        at:asOf,kind:'STATUS_CHANGE',previousStatus
      })].slice(-Math.max(4,Number(maxEventsPerEntry)||40));
      changed=true;statusChanges++;
    }else if(bucketChanged){
      prev.events=[...(prev.events||[]),lifecycleEvent(row,{at:asOf,kind:'SAMPLE_MILESTONE'})]
        .slice(-Math.max(4,Number(maxEventsPerEntry)||40));
      changed=true;milestones++;
    }else if(summaryChanged){
      changed=true;
    }
    map.set(row.key,prev);
  }

  const entries=[...map.values()]
    .sort((a,b)=>
      Number(b.robust)-Number(a.robust)||
      Number(b.validated)-Number(a.validated)||
      Number(b.statusRank||0)-Number(a.statusRank||0)||
      Number(b.lastSeenAt||0)-Number(a.lastSeenAt||0)
    )
    .slice(0,Math.max(50,Number(maxEntries)||500));

  state.entries=entries;
  state.updatedAt=Number(asOf);
  return {
    state,
    changed,
    delta:{observed:observed.length,newEntries,statusChanges,milestones}
  };
}

export function biggjDiscoveryLedgerSummary(input,{asOf=Date.now(),recentMs=7*24*60*60_000}={}){
  const state=ensureState(input,asOf);
  const entries=state.entries||[];
  const since=Number(asOf)-Math.max(60_000,Number(recentMs)||0);
  const robust=entries.filter(x=>x.robust===true);
  const validated=entries.filter(x=>x.validated===true||x.currentStatus==='WALK_FORWARD_VALIDATED'||x.currentStatus==='FORWARD_LAW_CANDIDATE'||x.currentStatus==='ROBUST_FORWARD_LAW_CANDIDATE');
  const falsified=entries.filter(x=>['FAILED_FORWARD_VALIDATION','FAILED_VALIDATION','CONTEXT_DEPENDENT','NO_TRAIN_EFFECT'].includes(String(x.currentStatus)));
  const recent=entries.filter(x=>Number(x.lastSeenAt||0)>=since);
  const statusChanges=[];
  for(const x of entries){
    for(const e of x.events||[]){
      if(e.kind==='STATUS_CHANGE'&&Number(e.at||0)>=since)statusChanges.push({
        key:x.key,type:x.type,title:x.title,at:e.at,status:e.status,previousStatus:e.previousStatus,samples:e.samples
      });
    }
  }
  statusChanges.sort((a,b)=>Number(b.at)-Number(a.at));
  return {
    version:BIGGJ_DISCOVERY_LEDGER_VERSION,
    updatedAt:state.updatedAt,
    total:entries.length,
    robust:robust.length,
    validated:validated.length,
    falsified:falsified.length,
    recent:recent.length,
    topDiscoveries:entries.slice(0,12).map(x=>({
      key:x.key,type:x.type,title:x.title,currentStatus:x.currentStatus,
      samples:x.samples,robust:x.robust,validated:x.validated,
      firstSeenAt:x.firstSeenAt,lastSeenAt:x.lastSeenAt,current:x.current,
      authority:'NONE'
    })),
    recentlyChanged:statusChanges.slice(0,12),
    recentlyFalsified:falsified
      .sort((a,b)=>Number(b.lastSeenAt)-Number(a.lastSeenAt))
      .slice(0,8)
      .map(x=>({key:x.key,type:x.type,title:x.title,currentStatus:x.currentStatus,samples:x.samples,lastSeenAt:x.lastSeenAt})),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    automaticPromotion:false,
    automaticPrimaryMutation:false,
    semantics:'DURABLE_DISCOVERY_LIFECYCLE_LEDGER_NOT_MARKET_TRUTH'
  };
}

export async function loadBiggjDiscoveryLedger(filePath,{now=Date.now()}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(
      parsed?.version!==BIGGJ_DISCOVERY_LEDGER_VERSION||
      parsed?.schemaVersion!==BIGGJ_DISCOVERY_LEDGER_SCHEMA_VERSION
    )throw new Error('BIGGJ_DISCOVERY_LEDGER_SCHEMA_MISMATCH');
    return {state:ensureState(parsed,now),healthy:true,recoveredFromCorrupt:false,error:null};
  }catch(err){
    if(err?.code!=='ENOENT'){
      try{await rename(filePath,filePath+'.corrupt-'+Date.now());}catch{}
    }
    return {
      state:createBiggjDiscoveryLedger({now}),
      healthy:err?.code==='ENOENT',
      recoveredFromCorrupt:err?.code!=='ENOENT',
      error:err?.code==='ENOENT'?null:(err instanceof Error?err.message:String(err))
    };
  }
}

export async function saveBiggjDiscoveryLedger(filePath,input){
  await mkdir(path.dirname(filePath),{recursive:true});
  const state=ensureState(input,Date.now());
  state.updatedAt=Date.now();
  state.version=BIGGJ_DISCOVERY_LEDGER_VERSION;
  state.schemaVersion=BIGGJ_DISCOVERY_LEDGER_SCHEMA_VERSION;
  state.entries=(state.entries||[]).slice(0,500);
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return state;
}
