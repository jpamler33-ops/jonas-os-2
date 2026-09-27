import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { sha256, canonicalJson } from './institutional-kernel.mjs';

const SCHEMA_VERSION=1;
const HORIZONS=[60_000,300_000,900_000];

function finite(x,fallback=null){ const n=Number(x); return Number.isFinite(n)?n:fallback; }
function clamp(x,a=0,b=1){ return Math.max(a,Math.min(b,x)); }

export const VENUE_QUALITY_MEMORY_VERSION='VQM_V1';
export const VENUE_QUALITY_MEMORY_CAPABILITIES=Object.freeze({
  execution:'SHADOW_ONLY',
  canExecuteLive:false,
  source:'COUNTERFACTUAL_PUBLIC_L2_PLUS_FUTURE_VENUE_MID',
  causalStatus:'NOT_IDENTIFIED'
});

export function venueSizeBucket(notionalQuote){
  const n=Number(notionalQuote);
  if(!(n>0)) return 'UNKNOWN';
  if(n<=100) return 'MICRO';
  if(n<=1_000) return 'SMALL';
  if(n<=10_000) return 'MEDIUM';
  if(n<=100_000) return 'LARGE';
  return 'BLOCK';
}

function selectedShareMap(route){
  const out=new Map();
  const total=Number(route?.filledBase||0);
  for(const leg of route?.legs||[]){
    out.set(String(leg.venue),total>0?Number(leg.baseQty||0)/total:0);
  }
  return out;
}

export function createVenueQualityObservations({
  report,
  symbol,
  regime='UNKNOWN',
  liquidity='UNKNOWN',
  pressureBand='UNKNOWN',
  capturedAt=Date.now()
}){
  const side=String(report?.intent?.side||'').toUpperCase();
  const notionalQuote=Number(report?.intent?.notionalQuote);
  if(!['BUY','SELL'].includes(side)||!(notionalQuote>0)) throw new Error('VQM_INVALID_REPORT_INTENT');
  const selected=selectedShareMap(report?.route);
  const rows=[];
  for(const c of report?.singleVenueCounterfactuals||[]){
    const exclusions=[...(c.exclusionReasons||[])].map(String);
    const eligible=exclusions.length===0;
    const core={
      schemaVersion:SCHEMA_VERSION,
      routeHash:String(report.routeHash||''),
      capturedAt:Number(capturedAt),
      symbol:String(symbol),
      venue:String(c.venue),
      source:String(c.source||c.venue),
      quote:String(c.quote||'UNKNOWN'),
      side,
      notionalQuote,
      sizeBucket:venueSizeBucket(notionalQuote),
      regime:String(regime||'UNKNOWN'),
      liquidity:String(liquidity||'UNKNOWN'),
      pressureBand:String(pressureBand||'UNKNOWN'),
      eligible,
      exclusionReasons:exclusions,
      selectedShare:clamp(Number(selected.get(String(c.venue))||0)),
      selectedByRouter:Number(selected.get(String(c.venue))||0)>0,
      routeAllInBps:finite(report?.route?.allInBps),
      routeFillRatio:clamp(Number(report?.route?.fillRatio||0)),
      routeSlippageBps:finite(report?.route?.slippageBps),
      routeVenueCount:Number(report?.route?.fragmentation?.venueCountUsed||report?.route?.legs?.length||0),
      routeMemoryActive:(report?.route?.legs||[]).some(x=>Number(x?.toxicityPenaltyBps||0)>0),
      fillRatio:clamp(Number(c.fillRatio||0)),
      avgFillPrice:finite(c.avgFillPrice),
      slippageBps:finite(c.slippageBps),
      allInBps:finite(c.allInBps),
      benchmarkReferenceMid:finite(c.benchmarkReferenceMid),
      benchmarkSlippageBps:finite(c.benchmarkSlippageBps),
      benchmarkAllInBps:finite(c.benchmarkAllInBps),
      predictedToxicityBps:finite(c.predictedToxicityBps,0),
      predictedToxicityStatus:String(c.predictedToxicityStatus||'NOT_APPLIED'),
      predictedToxicityEvidenceN:Math.max(0,Number(c.predictedToxicityEvidenceN||0)),
      feesQuote:finite(c.feesQuote,0),
      feeBps:finite(c.feeBps,0),
      fetchLatencyMs:finite(c.fetchLatencyMs),
      depthExhausted:c.depthExhausted===true,
      markouts:{},
      epistemic:{
        execution:'COUNTERFACTUAL_SHADOW_SIMULATION',
        book:'OBSERVED_PUBLIC_L2',
        futureMid:'NOT_YET_OBSERVED',
        causality:'NOT_IDENTIFIED'
      }
    };
    rows.push({...core,id:sha256(core)});
  }
  return rows;
}

export function appendVenueQualityObservations(records,observations,{maxRecords=50_000}={}){
  const byId=new Map((records||[]).map(x=>[x.id,x]));
  let added=0;
  for(const o of observations||[]){
    if(!o?.id||byId.has(o.id)) continue;
    byId.set(o.id,o);
    added++;
  }
  const next=[...byId.values()]
    .sort((a,b)=>Number(a.capturedAt)-Number(b.capturedAt)||String(a.id).localeCompare(String(b.id)))
    .slice(-Math.max(100,Number(maxRecords)||50_000));
  return {records:next,added};
}

export function matureVenueQualityObservation(record,{mid,at=Date.now(),maxLagMs=45_000}={}){
  if(!(Number(record?.avgFillPrice)>0)||Number(record?.fillRatio)<=0) return {record,changed:false};
  const m=finite(mid);
  const markouts={...(record.markouts||{})};
  let changed=false;
  let observed=false;
  const sideSign=record.side==='BUY'?1:-1;
  const elapsed=Number(at)-Number(record.capturedAt);
  const lag=Math.max(1_000,Number(maxLagMs)||45_000);

  for(const h of HORIZONS){
    const key=String(h);
    if(markouts[key]) continue;
    if(elapsed<h) continue;

    if(elapsed>h+lag){
      markouts[key]={
        horizonMs:h,
        status:'MISSED_CAPTURE_WINDOW',
        observedAt:Number(at)
      };
      changed=true;
      continue;
    }

    if(!(m>0)) continue;
    const signed=sideSign*(m-Number(record.avgFillPrice))/Number(record.avgFillPrice)*10000;
    markouts[key]={
      horizonMs:h,
      status:'OBSERVED',
      observedAt:Number(at),
      venueMid:m,
      signedMarkoutBps:signed,
      adverseSelectionBps:-signed
    };
    changed=true;
    observed=true;
  }

  if(!changed) return {record,changed:false};
  return {
    record:{
      ...record,
      markouts,
      epistemic:{
        ...record.epistemic,
        futureMid:observed?'OBSERVED_SAME_VENUE_PUBLIC_BOOK':record.epistemic?.futureMid||'NOT_YET_OBSERVED'
      }
    },
    changed:true
  };
}

function weightedMean(rows,valueFn,{now=Date.now(),halfLifeDays=30}={}){
  const hl=Math.max(1,Number(halfLifeDays))*86400000;
  let sw=0,sv=0;
  for(const r of rows){
    const v=Number(valueFn(r));
    if(!Number.isFinite(v)) continue;
    const age=Math.max(0,Number(now)-Number(r.capturedAt));
    const w=Math.pow(0.5,age/hl);
    sw+=w;sv+=w*v;
  }
  return sw>0?sv/sw:null;
}

function median(xs){
  const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length) return null;
  const i=Math.floor(a.length/2);
  return a.length%2?a[i]:(a[i-1]+a[i])/2;
}

function scopeCandidates(ctx){
  return [
    {name:'EXACT',keys:['venue','symbol','side','sizeBucket','regime','liquidity']},
    {name:'REGIME',keys:['venue','symbol','side','sizeBucket','regime']},
    {name:'SIZE',keys:['venue','symbol','side','sizeBucket']},
    {name:'SYMBOL_SIDE',keys:['venue','symbol','side']},
    {name:'VENUE_SIDE',keys:['venue','side']},
    {name:'VENUE_GLOBAL',keys:['venue']}
  ].map(x=>({...x,ctx}));
}

function matchesScope(r,scope){
  return scope.keys.every(k=>String(r?.[k]??'UNKNOWN')===String(scope.ctx?.[k]??'UNKNOWN'));
}

export function estimateVenueQuality(records,context,{
  minSamples=12,
  minToxicitySamples=30,
  now=Date.now(),
  halfLifeDays=30
}={}){
  const ctx={
    venue:String(context?.venue||''),
    symbol:String(context?.symbol||''),
    side:String(context?.side||'').toUpperCase(),
    sizeBucket:venueSizeBucket(context?.notionalQuote),
    regime:String(context?.regime||'UNKNOWN'),
    liquidity:String(context?.liquidity||'UNKNOWN')
  };
  const base=(records||[]).filter(r=>r?.eligible===true && r?.venue===ctx.venue);
  let chosen={name:'NO_EVIDENCE',keys:[],ctx},rows=[];
  for(const scope of scopeCandidates(ctx)){
    const xs=base.filter(r=>matchesScope(r,scope));
    if(xs.length>=minSamples){
      chosen=scope;rows=xs;break;
    }
    if(xs.length>rows.length){ chosen=scope;rows=xs; }
  }

  const filled=rows.filter(r=>Number(r.fillRatio)>0 && Number.isFinite(Number(r.avgFillPrice)));
  const adverse1=rows.filter(r=>Number.isFinite(Number(r.markouts?.['60000']?.adverseSelectionBps)));
  const adverse5=rows.filter(r=>Number.isFinite(Number(r.markouts?.['300000']?.adverseSelectionBps)));
  const adverse15=rows.filter(r=>Number.isFinite(Number(r.markouts?.['900000']?.adverseSelectionBps)));
  const adverse5Mean=weightedMean(adverse5,r=>r.markouts['300000'].adverseSelectionBps,{now,halfLifeDays});
  const toxicityEvidenceN=adverse5.length;
  const shrink=toxicityEvidenceN>=minToxicitySamples?toxicityEvidenceN/(toxicityEvidenceN+minToxicitySamples):0;
  const toxicityBps=toxicityEvidenceN>=minToxicitySamples && Number.isFinite(adverse5Mean)
    ? Math.max(0,adverse5Mean)*shrink
    : 0;

  return {
    version:VENUE_QUALITY_MEMORY_VERSION,
    venue:ctx.venue,
    symbol:ctx.symbol,
    side:ctx.side,
    sizeBucket:ctx.sizeBucket,
    regime:ctx.regime,
    liquidity:ctx.liquidity,
    scope:chosen.name,
    sampleN:rows.length,
    filledN:filled.length,
    confidence:clamp(rows.length/Math.max(1,minSamples*3)),
    fillRatioMean:weightedMean(rows,r=>r.fillRatio,{now,halfLifeDays}),
    slippageBpsMean:weightedMean(filled,r=>r.slippageBps,{now,halfLifeDays}),
    slippageBpsMedian:median(filled.map(r=>Number(r.slippageBps))),
    allInBpsMean:weightedMean(filled,r=>r.allInBps,{now,halfLifeDays}),
    latencyMsMean:weightedMean(rows,r=>r.fetchLatencyMs,{now,halfLifeDays}),
    adverseSelection1mBps:weightedMean(adverse1,r=>r.markouts['60000'].adverseSelectionBps,{now,halfLifeDays}),
    adverseSelection5mBps:adverse5Mean,
    adverseSelection15mBps:weightedMean(adverse15,r=>r.markouts['900000'].adverseSelectionBps,{now,halfLifeDays}),
    toxicityEvidenceN,
    toxicityBps,
    toxicityStatus:toxicityEvidenceN>=minToxicitySamples
      ? 'MODELLED_FROM_MATURED_VQM'
      : 'NOT_APPLIED_INSUFFICIENT_EVIDENCE',
    epistemic:'EMPIRICAL_SHADOW_EXECUTION_MEMORY_NOT_CAUSAL'
  };
}

export function venueQualitySummary(records,{symbol=null}={}){
  const xs=(records||[]).filter(r=>!symbol||r.symbol===symbol);
  const byVenue={};
  for(const r of xs){
    const v=String(r.venue);
    if(!byVenue[v]) byVenue[v]={records:0,eligible:0,selected:0,mature1m:0,mature5m:0,mature15m:0};
    const x=byVenue[v];
    x.records++;
    if(r.eligible) x.eligible++;
    if(r.selectedByRouter) x.selected++;
    if(r.markouts?.['60000']) x.mature1m++;
    if(r.markouts?.['300000']) x.mature5m++;
    if(r.markouts?.['900000']) x.mature15m++;
  }
  return {total:xs.length,byVenue};
}

function sanitizeRecord(r){
  if(!r||typeof r!=='object'||typeof r.id!=='string') return null;
  if(!/^[A-Z0-9]{2,18}USDT$/.test(String(r.symbol||''))) return null;
  if(!['BUY','SELL'].includes(r.side)) return null;
  if(!r.venue) return null;
  return r;
}

export async function loadVenueQualityMemory(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(parsed?.schemaVersion!==SCHEMA_VERSION) throw new Error('VQM_SCHEMA_MISMATCH');
    const records=(Array.isArray(parsed.records)?parsed.records:[]).map(sanitizeRecord).filter(Boolean);
    return {records,healthy:true,recoveredFromCorrupt:false};
  }catch(err){
    if(err?.code==='ENOENT') return {records:[],healthy:true,recoveredFromCorrupt:false};
    try{ await rename(filePath,`${filePath}.corrupt-${Date.now()}`); }catch{}
    return {records:[],healthy:false,recoveredFromCorrupt:true,error:err instanceof Error?err.message:String(err)};
  }
}

export async function saveVenueQualityMemory(filePath,records,{maxRecords=50_000}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const clean=(records||[]).map(sanitizeRecord).filter(Boolean).slice(-Math.max(100,Number(maxRecords)||50_000));
  const body={
    schemaVersion:SCHEMA_VERSION,
    version:VENUE_QUALITY_MEMORY_VERSION,
    updatedAt:new Date().toISOString(),
    capabilities:VENUE_QUALITY_MEMORY_CAPABILITIES,
    records:clean
  };
  const tmp=`${filePath}.tmp-${process.pid}`;
  await writeFile(tmp,canonicalJson(body),{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return clean;
}
