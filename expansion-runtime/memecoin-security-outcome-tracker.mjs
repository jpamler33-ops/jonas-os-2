import {readFile,writeFile,rename} from 'node:fs/promises';

export const MEMECOIN_SECURITY_OUTCOME_TRACKER_VERSION='BIGGJ_MEME_SECURITY_OUTCOME_TRACKER_V1';

const DEFAULT_HORIZONS=Object.freeze({
  '5m':5*60_000,
  '15m':15*60_000,
  '1h':60*60_000,
  '6h':6*60*60_000,
  '12h':12*60*60_000
});

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function text(v,max=180){
  const s=String(v??'').replace(/\s+/g,' ').trim();
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);for(const x of Object.values(v))freeze(x);
  }
  return v;
}
function keyOf(chainId,tokenAddress){
  const c=String(chainId||'').trim().toLowerCase();
  const a=String(tokenAddress||'').trim();
  if(!c||!a)return '';
  return c+':'+(c==='solana'?a:a.toLowerCase());
}
function ret(entry,price){
  const e=finite(entry),p=finite(price);
  return e>0&&p>0?p/e-1:null;
}
function median(xs=[]){
  const a=xs.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if(!a.length)return null;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function average(xs=[]){
  const a=xs.filter(Number.isFinite);
  return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
}
function stateFrom(input){
  if(input?.version===MEMECOIN_SECURITY_OUTCOME_TRACKER_VERSION&&Array.isArray(input.records)){
    return {version:MEMECOIN_SECURITY_OUTCOME_TRACKER_VERSION,updatedAt:finite(input.updatedAt),records:clone(input.records)};
  }
  return {version:MEMECOIN_SECURITY_OUTCOME_TRACKER_VERSION,updatedAt:null,records:[]};
}
function initialRecord(row,now){
  const security=row?.security||{};
  const px=finite(row?.priceUsd);
  if(!(px>0))return null;
  const gate=String(security?.evidenceGate||'UNKNOWN').toUpperCase();
  const independent=security?.independentHolderEvidence||null;
  return {
    key:keyOf(row?.chainId,row?.tokenAddress),
    chainId:String(row?.chainId||'').toLowerCase(),
    tokenAddress:String(row?.tokenAddress||''),
    symbol:text(row?.symbol||row?.name||'',80),
    name:text(row?.name||'',120),
    observedAt:Number(now),
    entryPrice:px,
    gate,
    securitySource:text(security?.source||'',160),
    holderFallbackUsed:security?.coverage?.holderConcentrationIndependent===true||Boolean(independent),
    holderEvidenceSource:text(independent?.source||security?.holderState?.independentSource||'',160)||null,
    criticalRiskFlags:clone(security?.criticalRiskFlags||[]),
    warningFlags:clone(security?.warningFlags||[]),
    unknownReasonCodes:clone(security?.unknownReasonCodes||[]),
    score:finite(row?.score?.researchPriorityScore),
    stage:text(row?.score?.stage||'',40),
    pairCreatedAt:finite(row?.pairCreatedAt),
    liquidityUsd:finite(row?.liquidityUsd),
    marketCap:finite(row?.marketCap??row?.fdv),
    lastObservedAt:Number(now),
    lastPrice:px,
    latestReturn:0,
    minObservedReturn:0,
    maxObservedReturn:0,
    observations:1,
    horizons:{}
  };
}
function updateRecord(rec,row,now,horizons=DEFAULT_HORIZONS){
  const px=finite(row?.priceUsd);
  if(!(px>0))return false;
  const r=ret(rec.entryPrice,px);
  rec.lastObservedAt=Number(now);
  rec.lastPrice=px;
  rec.latestReturn=r;
  rec.observations=Number(rec.observations||0)+1;
  if(r!=null){
    rec.minObservedReturn=Math.min(finite(rec.minObservedReturn)??r,r);
    rec.maxObservedReturn=Math.max(finite(rec.maxObservedReturn)??r,r);
  }
  const elapsed=Math.max(0,Number(now)-Number(rec.observedAt||now));
  for(const [label,ms] of Object.entries(horizons)){
    if(rec.horizons?.[label]||elapsed<Number(ms))continue;
    rec.horizons??={};
    rec.horizons[label]={
      targetMs:Number(ms),
      observedAt:Number(now),
      elapsedMs:elapsed,
      price:px,
      return:r
    };
  }
  return true;
}
function cohortOf(rec){
  if(rec.gate==='PASS'&&rec.holderFallbackUsed)return 'PASS_HOLDER_FALLBACK';
  if(rec.gate==='PASS')return 'PASS_NATIVE';
  if(rec.gate==='ABSTAIN')return 'ABSTAIN';
  return 'UNKNOWN';
}
function summarizeRecords(records,horizons=DEFAULT_HORIZONS,asOf=Date.now()){
  const out={};
  for(const cohort of ['PASS_HOLDER_FALLBACK','PASS_NATIVE','ABSTAIN','UNKNOWN']){
    const rs=records.filter(x=>cohortOf(x)===cohort);
    const horizonsOut={};
    for(const label of Object.keys(horizons)){
      const vals=rs.map(x=>finite(x?.horizons?.[label]?.return)).filter(Number.isFinite);
      horizonsOut[label]={
        matured:vals.length,
        averageReturn:average(vals),
        medianReturn:median(vals),
        positiveRate:vals.length?vals.filter(x=>x>0).length/vals.length:null,
        severeLossRate:vals.length?vals.filter(x=>x<=-.45).length/vals.length:null,
        moonshotRate:vals.length?vals.filter(x=>x>=1.5).length/vals.length:null
      };
    }
    out[cohort]={
      records:rs.length,
      openObservationAgeMs:rs.length?Math.max(...rs.map(x=>Math.max(0,Number(asOf)-Number(x.observedAt||asOf)))):0,
      horizons:horizonsOut
    };
  }
  return out;
}

export function createMemecoinSecurityOutcomeState(){
  return freeze(stateFrom(null));
}

export function observeMemecoinSecurityOutcomes(input,rows,{
  now=Date.now(),
  horizons=DEFAULT_HORIZONS,
  maxRecords=5000
}={}){
  const state=stateFrom(input);
  const byKey=new Map(state.records.map((r,i)=>[r.key,i]));
  let created=0,updated=0,matured=0;
  for(const row of Array.isArray(rows)?rows:[]){
    const key=keyOf(row?.chainId,row?.tokenAddress);
    if(!key)continue;
    let index=byKey.get(key);
    let isNew=false;
    if(index==null){
      if(!row?.security)continue;
      const rec=initialRecord(row,now);
      if(!rec)continue;
      state.records.push(rec);
      index=state.records.length-1;
      byKey.set(key,index);
      created++;
      isNew=true;
    }
    const rec=state.records[index];
    if(!isNew){
      const before=Object.keys(rec.horizons||{}).length;
      if(updateRecord(rec,row,now,horizons))updated++;
      matured+=Math.max(0,Object.keys(rec.horizons||{}).length-before);
    }
  }
  state.records=state.records
    .sort((a,b)=>Number(a.observedAt||0)-Number(b.observedAt||0))
    .slice(-Math.max(100,Number(maxRecords)||5000));
  state.updatedAt=Number(now);
  return freeze({state,results:{created,updated,matured,records:state.records.length}});
}

export function dueMemecoinSecurityOutcomeFollowups(input,{
  asOf=Date.now(),
  horizons=DEFAULT_HORIZONS,
  recentObservationMs=60_000,
  max=3
}={}){
  const state=stateFrom(input);
  const due=[];
  for(const rec of state.records){
    const lastTouch=Math.max(Number(rec.lastObservedAt||0),Number(rec.lastFollowupAttemptAt||0));
    if(Number(asOf)-lastTouch<Math.max(0,Number(recentObservationMs)||0))continue;
    const elapsed=Math.max(0,Number(asOf)-Number(rec.observedAt||asOf));
    const next=Object.entries(horizons)
      .filter(([label,ms])=>!rec.horizons?.[label]&&elapsed>=Number(ms))
      .sort((a,b)=>Number(a[1])-Number(b[1]))[0];
    if(!next)continue;
    due.push({
      key:rec.key,chainId:rec.chainId,tokenAddress:rec.tokenAddress,symbol:rec.symbol,
      gate:rec.gate,holderFallbackUsed:rec.holderFallbackUsed===true,
      holderEvidenceSource:rec.holderEvidenceSource||null,
      dueHorizon:next[0],targetMs:Number(next[1]),
      overdueMs:elapsed-Number(next[1])
    });
  }
  return freeze(due.sort((a,b)=>b.overdueMs-a.overdueMs).slice(0,Math.max(0,Number(max)||0)));
}

export function recordMemecoinSecurityOutcomeFollowupAttempt(input,key,{at=Date.now(),error=null}={}){
  const state=stateFrom(input);
  const rec=state.records.find(x=>x.key===String(key||''));
  if(!rec)return freeze({state,updated:false});
  rec.lastFollowupAttemptAt=Number(at);
  if(error){
    rec.followupFailures=Number(rec.followupFailures||0)+1;
    rec.lastFollowupError=text(error,240);
  }else{
    rec.lastFollowupError=null;
  }
  state.updatedAt=Number(at);
  return freeze({state,updated:true});
}

export function memecoinSecurityOutcomeSummary(input,{
  asOf=Date.now(),
  horizons=DEFAULT_HORIZONS,
  minComparisonSample=30
}={}){
  const state=stateFrom(input);
  const cohorts=summarizeRecords(state.records,horizons,asOf);
  const fallback1h=cohorts.PASS_HOLDER_FALLBACK?.horizons?.['1h']?.matured||0;
  const native1h=cohorts.PASS_NATIVE?.horizons?.['1h']?.matured||0;
  const comparisonReady=fallback1h>=Number(minComparisonSample)&&native1h>=Number(minComparisonSample);
  return freeze({
    version:MEMECOIN_SECURITY_OUTCOME_TRACKER_VERSION,
    asOf:Number(asOf),
    records:state.records.length,
    cohorts,
    comparison:{
      horizon:'1h',
      minSamplePerPassCohort:Number(minComparisonSample),
      fallbackMatured:fallback1h,
      nativeMatured:native1h,
      ready:comparisonReady,
      status:comparisonReady?'MEASURABLE':'INSUFFICIENT_SAMPLE',
      policyMutationAllowed:false
    },
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export async function loadMemecoinSecurityOutcomeState(filePath){
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(parsed?.version!==MEMECOIN_SECURITY_OUTCOME_TRACKER_VERSION)throw new Error('MEME_SECURITY_OUTCOME_VERSION_MISMATCH');
    return {state:freeze(stateFrom(parsed)),healthy:true,error:null};
  }catch(err){
    if(err?.code==='ENOENT')return {state:createMemecoinSecurityOutcomeState(),healthy:true,error:null};
    return {state:createMemecoinSecurityOutcomeState(),healthy:false,error:err instanceof Error?err.message:String(err)};
  }
}

export async function saveMemecoinSecurityOutcomeState(filePath,input,{maxRecords=5000}={}){
  const state=stateFrom(input);
  state.records=state.records.slice(-Math.max(100,Number(maxRecords)||5000));
  state.updatedAt=Date.now();
  const tmp=filePath+'.tmp';
  await writeFile(tmp,JSON.stringify(state),'utf8');
  await rename(tmp,filePath);
  return freeze(state);
}
