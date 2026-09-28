import {findSimilarEpisodes,summarizeSimilar} from './episode-memory.mjs';
export const COGNITIVE_CORE_VERSION='TCX_COGNITIVE_CORE_V1';
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const q=(xs,p)=>{const s=xs.filter(Number.isFinite).sort((a,b)=>a-b);if(!s.length)return null;const i=(s.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return l===h?s[l]:s[l]+(s[h]-s[l])*(i-l);};
const med=xs=>q(xs,.5);
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};

export function buildSuperMemory(currentVector,episodes,{symbol=null,horizonBars=12,k=60,minSimilarity=.35}={}){
 const matches=findSimilarEpisodes(currentVector,episodes,{symbol,k,requireMatured:true,horizonBars}).filter(x=>x.similarity>=minSimilarity);
 const summary=summarizeSimilar(matches,horizonBars);
 const returns=matches.map(x=>finite(x.episode?.outcomes?.[String(horizonBars)]?.returnPct)).filter(Number.isFinite);
 const counts={up:returns.filter(x=>x>.15).length,down:returns.filter(x=>x<-.15).length,flat:returns.filter(x=>Math.abs(x)<=.15).length};
 return freeze({version:COGNITIVE_CORE_VERSION,symbol,horizonBars,matches:matches.slice(0,12).map(x=>({id:x.episode.id,similarity:x.similarity,anchorCloseTime:x.episode.anchorCloseTime,outcome:x.episode.outcomes?.[String(horizonBars)]})),summary,counts,evidenceStatus:matches.length>=30?'MATURE':matches.length>=12?'BUILDING':'INSUFFICIENT',researchOnly:true});
}

function patternSignature(e){
 const v=e?.vector||{};
 const pressure=finite(v.pressureScore);
 const pressureBand=pressure==null?'UNK':pressure>=65?'HIGH':pressure>=35?'MID':'LOW';
 const ema=finite(v.emaGapPct);
 const emaBand=ema==null?'UNK':ema>.15?'POS':ema<-.15?'NEG':'FLAT';
 return [v.regime||'UNKNOWN',v.localTrend||'UNKNOWN',v.flow||'UNKNOWN',v.liquidity||'UNKNOWN',pressureBand,emaBand,v.patternStage||'NONE',v.patternSide||'NONE'].join('|');
}
export function discoverPatterns(episodes,{horizonBars=12,minCases=20,minIndependentCases=10,minAbsMedianReturn=.20,maxPatterns=12}={}){
 const groups=new Map();
 for(const e of episodes||[]){
  const o=e?.outcomes?.[String(horizonBars)],ret=finite(o?.returnPct);
  if(ret==null)continue;
  const sig=patternSignature(e);if(!groups.has(sig))groups.set(sig,[]);groups.get(sig).push({e,ret});
 }
 const out=[];
 for(const [signature,rows] of groups){
  rows.sort((a,b)=>a.e.anchorCloseTime-b.e.anchorCloseTime);
  const independent=[];let last=-Infinity;
  for(const r of rows){if(r.e.anchorCloseTime-last>=horizonBars*5*60_000){independent.push(r);last=r.e.anchorCloseTime;}}
  if(rows.length<minCases||independent.length<minIndependentCases)continue;
  const rs=independent.map(x=>x.ret),median=med(rs),up=rs.filter(x=>x>.15).length/rs.length,down=rs.filter(x=>x<-.15).length/rs.length;
  if(Math.abs(median)<minAbsMedianReturn)continue;
  const direction=median>0?'UP':'DOWN',hit=direction==='UP'?up:down;
  const robustness=clamp((independent.length/minIndependentCases)*.35+Math.min(1,Math.abs(median)/(minAbsMedianReturn*2))*.30+hit*.35);
  out.push({patternId:'DISC-'+Buffer.from(signature).toString('base64url').slice(0,10),signature,cases:rows.length,independentCases:independent.length,medianReturnPct:median,q25:q(rs,.25),q75:q(rs,.75),direction,directionalHitRate:hit,robustness,status:independent.length>=30&&hit>=.6?'CANDIDATE_VALIDATED':'RESEARCH_CANDIDATE'});
 }
 return freeze({version:COGNITIVE_CORE_VERSION,horizonBars,patterns:out.sort((a,b)=>b.robustness-a.robustness).slice(0,maxPatterns),researchOnly:true,autoExecution:false});
}

export function buildDigitalTwin({symbol,price,forecast=null,memory=null,patterns=null}={}){
 const p=finite(price);if(p==null||p<=0)throw new Error('positive price required');
 const horizons=(forecast?.horizons||forecast?.forecasts||[]).map(h=>{
  const lo=finite(h.lowerPrice??h.interval?.q10??h.interval?.adjusted?.lower);
  const mid=finite(h.medianPrice??h.median??h.interval?.median??h.expectedPrice);
  const hi=finite(h.upperPrice??h.interval?.q90??h.interval?.adjusted?.upper);
  return {id:String(h.horizonId||h.id||''),lower:lo,median:mid,upper:hi};
 }).filter(x=>x.lower!=null&&x.median!=null&&x.upper!=null);
 const mem=memory?.summary?.returnPct;
 const analog=mem?.median!=null?{lower:p*(1+(mem.q25||0)/100),median:p*(1+mem.median/100),upper:p*(1+(mem.q75||0)/100)}:null;
 const strongest=patterns?.patterns?.[0]||null;
 const branches=[];
 if(horizons.length){
  branches.push({id:'MODEL_DOWNSIDE',source:'FORECAST_INTERVAL',points:horizons.map(h=>({horizon:h.id,price:h.lower}))});
  branches.push({id:'MODEL_BASE',source:'FORECAST_MEDIAN',points:horizons.map(h=>({horizon:h.id,price:h.median}))});
  branches.push({id:'MODEL_UPSIDE',source:'FORECAST_INTERVAL',points:horizons.map(h=>({horizon:h.id,price:h.upper}))});
 }
 if(analog)branches.push({id:'MEMORY_ANALOG',source:'OBSERVED_EPISODES',points:[{horizon:String(memory.horizonBars)+'bars',price:analog.median,lower:analog.lower,upper:analog.upper}]});
 return freeze({version:COGNITIVE_CORE_VERSION,symbol,anchorPrice:p,branches,patternContext:strongest?{patternId:strongest.patternId,direction:strongest.direction,robustness:strongest.robustness,status:strongest.status}:null,status:branches.length?'ACTIVE':'INSUFFICIENT',interpretation:'PLAUSIBLE_BRANCHES_NOT_FUTURE_FACTS',researchOnly:true,canExecuteLive:false});
}

export function renderCognitiveCore({memory,patterns,twin}={}){
 const lines=['TCX // COGNITIVE CORE','━━━━━━━━━━━━━━━━━━━━',''];
 lines.push('SUPER MEMORY  '+String(memory?.evidenceStatus||'—')+' · ähnliche Fälle '+String(memory?.summary?.n||0));
 if(memory?.summary?.n)lines.push('Outcomes       ↑ '+memory.counts.up+'  ↓ '+memory.counts.down+'  → '+memory.counts.flat);
 lines.push('PATTERN LAB   '+String(patterns?.patterns?.length||0)+' Kandidaten');
 for(const p of (patterns?.patterns||[]).slice(0,3))lines.push('• '+p.patternId+' · '+p.direction+' · n='+p.independentCases+' · '+Math.round(p.directionalHitRate*100)+'% historisch');
 lines.push('DIGITAL TWIN  '+String(twin?.status||'—')+' · '+String(twin?.branches?.length||0)+' Zweige');
 if(twin?.patternContext)lines.push('Pattern ctx   '+twin.patternContext.patternId+' · '+twin.patternContext.status);
 lines.push('','Musterwerte sind historische Forschung, keine sichere Vorhersage.','Digital-Twin-Zweige sind plausible Szenarien, keine Zukunftsfakten.','SHADOW_ONLY · REAL ORDERS BLOCKED');
 return lines.join('\n').slice(0,4096);
}
