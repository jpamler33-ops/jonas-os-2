import { sha256 } from './institutional-kernel.mjs';
export const STRATEGY_EDGE_DECAY_VERSION='TCX_STRATEGY_EDGE_DECAY_V1';
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
const key=p=>[p.assetClass||'CORE',p.symbol||'UNKNOWN',p.side||'UNKNOWN',p.horizonId||'UNKNOWN',p.admissionGate||'UNKNOWN'].map(x=>String(x).toUpperCase()).join('|');
function stats(r){const n=r.length,net=r.reduce((s,x)=>s+finite(x.realizedNetPnlQuote),0),wins=r.filter(x=>finite(x.realizedNetPnlQuote)>0).length;return{trades:n,expectancyQuote:n?net/n:null,winRate:n?wins/n:null,netPnlQuote:net};}
export function buildStrategyEdgeDecayMap(ledger,{minTotal=24,recentTrades=12,disableRecentTrades=18,watchDropRatio=.50,disableDropRatio=.85}={}){
 const rows=(ledger?.positions||[]).filter(p=>p?.execution==='SHADOW_ONLY'&&p?.canExecuteLive===false&&p?.status==='CLOSED'&&!['COVERAGE_PROBE','ABSTAIN_PROBE','CHALLENGER'].includes(String(p.entryMode||'STANDARD').toUpperCase())&&Number.isFinite(Number(p.realizedNetPnlQuote))).sort((a,b)=>finite(a.closedAt)-finite(b.closedAt));
 const groups=new Map();for(const p of rows){const k=key(p),a=groups.get(k)||[];a.push(p);groups.set(k,a);}
 const cells=[];
 const recentWindow=Math.max(recentTrades,disableRecentTrades);
 for(const [dna,r] of groups){const all=stats(r),recent=stats(r.slice(-recentWindow)),prior=stats(r.slice(0,Math.max(0,r.length-recentWindow)));
  const baseline=Math.max(1e-9,finite(prior.expectancyQuote,0));const drop=baseline>0?(baseline-finite(recent.expectancyQuote,0))/baseline:0;
  let status='LEARNING',blocked=false;
  if(r.length>=minTotal){if(recent.trades>=disableRecentTrades&&finite(recent.expectancyQuote)>=0) status='HEALTHY';else if(prior.trades&&finite(prior.expectancyQuote)>0&&recent.trades>=disableRecentTrades&&finite(recent.expectancyQuote)<0&&drop>=disableDropRatio){status='DISABLE';blocked=true;}else if(prior.trades&&finite(prior.expectancyQuote)>0&&finite(recent.expectancyQuote)<0){status='DECAYING';}else if(drop>=watchDropRatio)status='WATCH';else status='HEALTHY';}
  cells.push({key:dna,status,blocked,samples:r.length,all,prior,recent,expectancyDropRatio:drop});
 }
 const core={version:STRATEGY_EDGE_DECAY_VERSION,samples:rows.length,cells,disabled:cells.filter(x=>x.blocked).map(x=>x.key),execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,meaning:'RECENT_VS_PRIOR_STRATEGY_DNA_DECAY_GUARD'};
 return freeze({...core,fingerprint:sha256(core)});
}
export function edgeDecayDecision(map,candidate){const c=(map?.cells||[]).find(x=>x.key===key(candidate));return freeze({version:STRATEGY_EDGE_DECAY_VERSION,status:c?.status||'LEARNING',blocked:c?.blocked===true,samples:c?.samples||0,reason:c?.blocked?'EDGE_DECAY_DISABLE':'EDGE_DECAY_'+String(c?.status||'LEARNING'),execution:'SHADOW_ONLY',canExecuteLive:false});}
