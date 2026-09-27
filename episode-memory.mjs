import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

const SCHEMA_VERSION = 1;
const HORIZONS = [3,12,36];
const NUMERIC_KEYS = [
  'biasScore','pressureScore','spreadBps','imbalance','atrPct','realizedVolPct','volumeRatio',
  'emaGapPct','supportDistancePct','resistanceDistancePct'
];
const CATEGORICAL_KEYS = ['regime','localTrend','liquidity','flow','dominantPressure','patternStage','patternSide'];

function clamp(x,a,b){ return Math.max(a,Math.min(b,x)); }
function finiteOrNull(x){ const n=Number(x); return Number.isFinite(n)?n:null; }
function q(xs,p){
  if(!xs.length)return null;
  const s=[...xs].sort((a,b)=>a-b);
  const i=(s.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
  return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(i-lo);
}
function median(xs){ return q(xs,0.5); }

export function episodeVector({analysis,dashboard}) {
  const last=finiteOrNull(analysis?.lastClose);
  const ema20=finiteOrNull(analysis?.ema20);
  const ema50=finiteOrNull(analysis?.ema50);
  const support=finiteOrNull(analysis?.support);
  const resistance=finiteOrNull(analysis?.resistance);
  const pct=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?(a-b)/b*100:null;
  return {
    biasScore:finiteOrNull(dashboard?.biasScore),
    pressureScore:finiteOrNull(dashboard?.pressureScore),
    spreadBps:finiteOrNull(dashboard?.spreadBps),
    imbalance:finiteOrNull(dashboard?.imbalance),
    atrPct:finiteOrNull(dashboard?.atrPct),
    realizedVolPct:finiteOrNull(dashboard?.realizedVolPct),
    volumeRatio:finiteOrNull(dashboard?.volumeRatio),
    emaGapPct:pct(ema20,ema50),
    supportDistancePct:Number.isFinite(support)&&Number.isFinite(last)&&last!==0?(last-support)/last*100:null,
    resistanceDistancePct:Number.isFinite(resistance)&&Number.isFinite(last)&&last!==0?(resistance-last)/last*100:null,
    regime:String(dashboard?.regime||'UNKNOWN'),
    localTrend:String(dashboard?.localTrend||analysis?.trend||'UNKNOWN'),
    liquidity:String(dashboard?.liquidity||'UNKNOWN'),
    flow:String(dashboard?.flow||'UNKNOWN'),
    dominantPressure:String(dashboard?.dominantPressure||'UNKNOWN'),
    patternStage:String(analysis?.pattern?.stage||'NONE'),
    patternSide:String(analysis?.pattern?.side||'NONE')
  };
}

export function createEpisode({symbol,interval='5m',anchorCloseTime,availableAt,analysis,dashboard,market,samplingReason='CADENCE'}) {
  if(!/^[A-Z0-9]{2,18}USDT$/.test(String(symbol))) throw new Error('Invalid episode symbol');
  if(!Number.isFinite(Number(anchorCloseTime))||!Number.isFinite(Number(availableAt))) throw new Error('Invalid episode timestamps');
  if(Number(anchorCloseTime)>Number(availableAt)) throw new Error('PIT violation: anchor after availableAt');
  const vector=episodeVector({analysis,dashboard});
  return {
    id:`${symbol}:${interval}:${Number(anchorCloseTime)}`,
    schemaVersion:SCHEMA_VERSION,
    symbol:String(symbol),
    interval:String(interval),
    anchorCloseTime:Number(anchorCloseTime),
    availableAt:Number(availableAt),
    samplingReason:String(samplingReason),
    entryPrice:finiteOrNull(analysis?.lastClose),
    vector,
    epistemic:{
      features:'POINT_IN_TIME_DERIVED',
      market:'OBSERVED',
      mechanism:'NOT_INFERRED',
      outcome:'UNOBSERVED_AT_CAPTURE'
    },
    provenance:{
      marketSource:String(market?.source||'UNKNOWN'),
      marketVersion:String(market?.version||'UNKNOWN'),
      marketAvailableAt:finiteOrNull(market?.availableAt),
      mechanismPosterior:'NOT_IDENTIFIED'
    },
    outcomes:{}
  };
}

export function shouldSampleEpisode({anchorCloseTime,analysis,dashboard,lastEpisode}) {
  if(lastEpisode?.anchorCloseTime===anchorCloseTime) return {capture:false,reason:'DUPLICATE'};
  const cadence=new Date(anchorCloseTime).getUTCMinutes()%15===4 || new Date(anchorCloseTime+1).getUTCMinutes()%15===0;
  const event=Boolean(analysis?.pattern) || Number(dashboard?.pressureScore)>=65 || ['STRESS','TREND_EXPANSION'].includes(String(dashboard?.regime));
  if(event) return {capture:true,reason:'EVENT'};
  if(cadence) return {capture:true,reason:'CADENCE'};
  return {capture:false,reason:'SKIP'};
}

const SCALES = {
  biasScore:6, pressureScore:100, spreadBps:8, imbalance:1, atrPct:2, realizedVolPct:1, volumeRatio:4,
  emaGapPct:2, supportDistancePct:3, resistanceDistancePct:3
};

export function episodeDistance(a,b) {
  let sum=0,weight=0;
  for(const k of NUMERIC_KEYS){
    const x=finiteOrNull(a?.[k]),y=finiteOrNull(b?.[k]);
    if(x==null||y==null)continue;
    const scale=SCALES[k]||1;
    sum+=Math.min(1,Math.abs(x-y)/scale);
    weight+=1;
  }
  for(const k of CATEGORICAL_KEYS){
    const x=String(a?.[k]??'UNKNOWN'),y=String(b?.[k]??'UNKNOWN');
    sum+=(x===y?0:1);
    weight+=0.8;
  }
  return weight>0?sum/weight:1;
}

export function findSimilarEpisodes(currentVector,episodes,{symbol=null,k=8,requireMatured=true,horizonBars=12}={}) {
  return episodes
    .filter(e=>!symbol||e.symbol===symbol)
    .filter(e=>!requireMatured||e.outcomes?.[String(horizonBars)])
    .map(e=>({episode:e,distance:episodeDistance(currentVector,e.vector),similarity:1-episodeDistance(currentVector,e.vector)}))
    .sort((a,b)=>a.distance-b.distance)
    .slice(0,k);
}

export function computeOutcome(episode,candles,horizonBars) {
  const h=Number(horizonBars);
  if(!HORIZONS.includes(h)) throw new Error('Unsupported outcome horizon');
  const entry=finiteOrNull(episode?.entryPrice);
  if(entry==null||entry<=0) return null;
  const intervalMs=episode?.interval==='5m'?300000:null;
  if(intervalMs==null) return null;
  const future=candles
    .filter(c=>c.closed===true && Number(c.closeTime)>Number(episode.anchorCloseTime))
    .sort((a,b)=>a.closeTime-b.closeTime)
    .slice(0,h);
  if(future.length<h) return null;
  const toleranceMs=2500;
  for(let i=0;i<future.length;i++){
    const expected=Number(episode.anchorCloseTime)+intervalMs*(i+1);
    if(Math.abs(Number(future[i].closeTime)-expected)>toleranceMs) return null;
  }
  const end=future.at(-1);
  const maxHigh=Math.max(...future.map(c=>c.h));
  const minLow=Math.min(...future.map(c=>c.l));
  return {
    horizonBars:h,
    maturedAt:Number(end.closeTime),
    endClose:Number(end.c),
    returnPct:(Number(end.c)-entry)/entry*100,
    maxRisePct:(maxHigh-entry)/entry*100,
    maxFallPct:(minLow-entry)/entry*100,
    realizedRangePct:(maxHigh-minLow)/entry*100
  };
}

export function matureEpisode(episode,candles) {
  let changed=false;
  episode.outcomes=episode.outcomes||{};
  for(const h of HORIZONS){
    const key=String(h);
    if(episode.outcomes[key]) continue;
    const outcome=computeOutcome(episode,candles,h);
    if(outcome){ episode.outcomes[key]=outcome; changed=true; }
  }
  if(changed) episode.epistemic.outcome='OBSERVED_POST_EPISODE';
  return changed;
}

export function summarizeSimilar(matches,horizonBars=12) {
  const key=String(horizonBars);
  const rows=matches.map(m=>({m,o:m.episode.outcomes?.[key]})).filter(x=>x.o);
  if(!rows.length) return {n:0,horizonBars,medianSimilarity:null,returnPct:null,maxRisePct:null,maxFallPct:null,rangePct:null};
  const stat=k=>{
    const xs=rows.map(x=>Number(x.o[k])).filter(Number.isFinite);
    return {median:median(xs),q25:q(xs,0.25),q75:q(xs,0.75)};
  };
  return {
    n:rows.length,
    horizonBars:Number(horizonBars),
    medianSimilarity:median(rows.map(x=>x.m.similarity))*100,
    returnPct:stat('returnPct'),
    maxRisePct:stat('maxRisePct'),
    maxFallPct:stat('maxFallPct'),
    rangePct:stat('realizedRangePct')
  };
}

function sanitizeEpisode(e){
  if(!e||typeof e!=='object')return null;
  if(!/^[A-Z0-9]{2,18}USDT$/.test(String(e.symbol||'')))return null;
  if(!Number.isFinite(Number(e.anchorCloseTime))||!Number.isFinite(Number(e.availableAt)))return null;
  if(Number(e.anchorCloseTime)>Number(e.availableAt))return null;
  return {
    ...e,
    id:String(e.id||`${e.symbol}:${e.interval||'5m'}:${Number(e.anchorCloseTime)}`),
    interval:String(e.interval||'5m'),
    anchorCloseTime:Number(e.anchorCloseTime),
    availableAt:Number(e.availableAt),
    outcomes:(e.outcomes&&typeof e.outcomes==='object')?e.outcomes:{}
  };
}

export async function loadEpisodeMemory(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(parsed?.schemaVersion!==SCHEMA_VERSION) throw new Error(`unsupported episode schema: ${parsed?.schemaVersion}`);
    const episodes=(Array.isArray(parsed.episodes)?parsed.episodes:[]).map(sanitizeEpisode).filter(Boolean);
    return {episodes,recoveredFromCorrupt:false};
  }catch(err){
    if(err?.code==='ENOENT') return {episodes:[],recoveredFromCorrupt:false};
    try{ await rename(filePath,`${filePath}.corrupt-${Date.now()}`); }catch{}
    console.error('episode memory load failed; starting clean',err instanceof Error?err.message:String(err));
    return {episodes:[],recoveredFromCorrupt:true};
  }
}

export async function saveEpisodeMemory(filePath,episodes,{maxPerSymbol=2000}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const grouped=new Map();
  for(const e of episodes){
    if(!grouped.has(e.symbol)) grouped.set(e.symbol,[]);
    grouped.get(e.symbol).push(e);
  }
  const trimmed=[];
  for(const xs of grouped.values()){
    xs.sort((a,b)=>a.anchorCloseTime-b.anchorCloseTime);
    trimmed.push(...xs.slice(-maxPerSymbol));
  }
  trimmed.sort((a,b)=>a.anchorCloseTime-b.anchorCloseTime);
  const payload={schemaVersion:SCHEMA_VERSION,updatedAt:new Date().toISOString(),episodes:trimmed};
  const tmp=`${filePath}.tmp-${process.pid}`;
  await writeFile(tmp,JSON.stringify(payload,null,2),{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return trimmed;
}

export const EPISODE_HORIZONS=[...HORIZONS];