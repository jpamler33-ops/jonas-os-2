import {sha256} from './institutional-kernel.mjs';
export const FINAL_FOUNDATION_PACK_VERSION='TCX_FINAL_FOUNDATION_PACK_V1';
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
function rets(rows){const x=(rows||[]).filter(r=>finite(r?.close)!=null&&finite(r?.closeTime)!=null).sort((a,b)=>a.closeTime-b.closeTime),o=[];for(let i=1;i<x.length;i++)o.push({t:Number(x[i].closeTime),r:Math.log(Number(x[i].close)/Number(x[i-1].close))});return o;}
function corr(a,b){if(a.length<3)return null;const ma=a.reduce((s,x)=>s+x,0)/a.length,mb=b.reduce((s,x)=>s+x,0)/b.length;let c=0,xv=0,yv=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;c+=x*y;xv+=x*x;yv+=y*y;}return xv&&yv?c/Math.sqrt(xv*yv):null;}

export function discoverLeadLag(seriesBySymbol,{asOf=Date.now(),maxLagBars=6,minSamples=48,minAbsCorrelation=.25,maxHypotheses=200}={}){
 const symbols=Object.keys(seriesBySymbol||{}),candidates=[],tests=Math.min(maxHypotheses,symbols.length*(symbols.length-1)*maxLagBars);
 for(const leader of symbols)for(const follower of symbols){if(leader===follower)continue;const a=rets(seriesBySymbol[leader]).filter(x=>x.t<=asOf),b=rets(seriesBySymbol[follower]).filter(x=>x.t<=asOf),bm=new Map(b.map(x=>[x.t,x.r]));const step=a.length>1?Math.max(1,a.at(-1).t-a.at(-2).t):300000;
  for(let lag=1;lag<=maxLagBars;lag++){const pairs=a.map(x=>[x.r,bm.get(x.t+lag*step)]).filter(x=>finite(x[1])!=null);if(pairs.length<minSamples)continue;const rho=corr(pairs.map(x=>x[0]),pairs.map(x=>x[1]));if(rho==null||Math.abs(rho)<minAbsCorrelation)continue;const conservativeThreshold=Math.min(.95,minAbsCorrelation+Math.sqrt(Math.log(Math.max(2,tests))/pairs.length)*.12);candidates.push({leader,follower,lagBars:lag,samples:pairs.length,rho,absRho:Math.abs(rho),promotionThreshold:conservativeThreshold,status:Math.abs(rho)>=conservativeThreshold?'RESEARCH_CANDIDATE':'SCREEN_ONLY'});}
 }
 candidates.sort((a,b)=>b.absRho-a.absRho);
 const core={version:FINAL_FOUNDATION_PACK_VERSION,asOf:Number(asOf),hypothesesScreened:tests,links:candidates.slice(0,30),meaning:'POINT_IN_TIME_LEAD_LAG_SCREEN_NOT_CAUSALITY_AND_NOT_FORECAST_PERMISSION',execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false};return freeze({...core,fingerprint:sha256(core)});
}

export function buildShockPropagation({seriesBySymbol={},graph=null,shockThreshold=.012,asOf=Date.now()}={}){
 const latest=Object.fromEntries(Object.entries(seriesBySymbol).map(([s,rows])=>{const r=rets(rows).filter(x=>x.t<=asOf);return[s,r.at(-1)||null];}));
 const origins=Object.entries(latest).filter(([,x])=>x&&Math.abs(x.r)>=shockThreshold).map(([symbol,x])=>({symbol,shockReturn:x.r,at:x.t}));
 const waves=[];
 for(const o of origins){for(const e of graph?.edges||[]){if(e.a!==o.symbol&&e.b!==o.symbol)continue;const target=e.a===o.symbol?e.b:e.a;waves.push({origin:o.symbol,target,originReturn:o.shockReturn,associationStrength:e.strength,expectedSign:o.shockReturn>=0?'SAME_SIGN_ASSOCIATION':'SAME_SIGN_ASSOCIATION',status:'OBSERVED_SHOCK_WITH_ASSOCIATED_NEIGHBOR'});}}
 const core={version:FINAL_FOUNDATION_PACK_VERSION,asOf:Number(asOf),origins,waves:waves.slice(0,30),meaning:'SHOCK_MAP_USES_OBSERVED_MOVE_PLUS_ASSOCIATION_NOT_CAUSAL_PROPAGATION_PROOF',execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false};return freeze({...core,fingerprint:sha256(core)});
}

export function buildEventReactionMemory(events,{asOf=Date.now(),minMatured=8,maxEvents=500}={}){
 const rows=(events||[]).filter(e=>Number(e?.availableAt||0)<=asOf&&e?.reaction&&finite(e.reaction.returnPct)!=null).slice(-maxEvents);
 const groups=new Map();for(const e of rows){const k=[e.eventType||'UNKNOWN',e.regimeKey||'UNKNOWN',e.symbol||'MARKET'].join('|');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
 const memories=[...groups.entries()].map(([key,x])=>{const rs=x.map(e=>Number(e.reaction.returnPct)).sort((a,b)=>a-b),med=rs[Math.floor(rs.length/2)]??0;return{key,eventType:x[0]?.eventType||'UNKNOWN',regimeKey:x[0]?.regimeKey||'UNKNOWN',symbol:x[0]?.symbol||'MARKET',matured:x.length,medianReaction:med,upRate:x.filter(e=>Number(e.reaction.returnPct)>0).length/x.length,status:x.length>=minMatured?'MEMORY_READY':'BUILDING'};}).sort((a,b)=>b.matured-a.matured);
 const core={version:FINAL_FOUNDATION_PACK_VERSION,asOf:Number(asOf),events:rows.length,memories,meaning:'HISTORICAL_EVENT_REACTION_MEMORY_NOT_EVENT_FORECAST',execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false};return freeze({...core,fingerprint:sha256(core)});
}

export function buildSystemReadiness({world=null,science=null,leadLag=null,shock=null,eventMemory=null,tradeDiagnostics=null}={}){
 const layers=[
  {id:'WORLD_MODEL',ready:Boolean(world?.graph?.nodes?.length>=3),detail:(world?.graph?.nodes?.length||0)+' nodes'},
  {id:'SCIENTIFIC_BRAIN',ready:['PASS','CAUTION'].includes(String(science?.diagnostics?.gate||'')),detail:String(science?.diagnostics?.gate||'UNKNOWN')},
  {id:'LEAD_LAG',ready:(leadLag?.links||[]).some(x=>x.status==='RESEARCH_CANDIDATE'),detail:(leadLag?.links||[]).filter(x=>x.status==='RESEARCH_CANDIDATE').length+' candidates'},
  {id:'SHOCK_MEMORY',ready:Boolean((shock?.origins||[]).length),detail:(shock?.origins||[]).length+' active shocks'},
  {id:'EVENT_MEMORY',ready:(eventMemory?.memories||[]).some(x=>x.status==='MEMORY_READY'),detail:(eventMemory?.memories||[]).filter(x=>x.status==='MEMORY_READY').length+' mature groups'},
  {id:'SHADOW_DISCOVERY',ready:Number(tradeDiagnostics?.checkedCoins||0)>0,detail:Number(tradeDiagnostics?.standardTrades||0)+Number(tradeDiagnostics?.explorationTrades||0)+' trades last scan'}
 ];
 const structural=layers.filter(x=>!['SHOCK_MEMORY'].includes(x.id));const readiness=structural.filter(x=>x.ready).length/structural.length;
 const core={version:FINAL_FOUNDATION_PACK_VERSION,layers,readiness,gate:readiness>=.8?'RESEARCH_READY':readiness>=.5?'BUILDING':'INSUFFICIENT',meaning:'SYSTEM_RESEARCH_READINESS_NOT_TRADING_PERMISSION',execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false};return freeze({...core,fingerprint:sha256(core)});
}

export function renderFinalFoundation({leadLag,shock,eventMemory,readiness}={}){
 const pc=x=>Math.round(Number(x||0)*100);const lines=['TCX // FINAL FOUNDATION','━━━━━━━━━━━━━━━━━━━━','','SYSTEM '+String(readiness?.gate||'—')+' · '+pc(readiness?.readiness)+'/100'];
 for(const l of readiness?.layers||[])lines.push((l.ready?'✓ ':'· ')+l.id+' · '+l.detail);
 lines.push('','LEAD / LAG');for(const x of (leadLag?.links||[]).filter(x=>x.status==='RESEARCH_CANDIDATE').slice(0,4))lines.push('• '+x.leader.replace('USDT','')+' → '+x.follower.replace('USDT','')+' · lag '+x.lagBars+' · r '+x.rho.toFixed(2));
 lines.push('','SHOCK MAP');if(!(shock?.origins||[]).length)lines.push('• no active observed shock');for(const x of (shock?.origins||[]).slice(0,3))lines.push('• '+x.symbol.replace('USDT','')+' '+(x.shockReturn*100).toFixed(2)+'%');
 lines.push('','EVENT MEMORY · '+Number(eventMemory?.events||0)+' matured events','Lead/Lag and shock links are research evidence, NOT causality.','Readiness is NOT trading permission.','SHADOW_ONLY · REAL ORDERS BLOCKED');return lines.join('\n').slice(0,4096);
}
