import { sha256 } from './institutional-kernel.mjs';
export const TAIL_RISK_BOOTSTRAP_VERSION='TCX_TAIL_RISK_BOOTSTRAP_V1';
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
function rows(ledger){return (ledger?.positions||[]).filter(p=>p?.execution==='SHADOW_ONLY'&&p?.canExecuteLive===false&&p?.status==='CLOSED'&&!['COVERAGE_PROBE','ABSTAIN_PROBE','CHALLENGER'].includes(String(p.entryMode||'STANDARD').toUpperCase())&&Number.isFinite(Number(p.realizedNetPnlQuote))).sort((a,b)=>finite(a.closedAt)-finite(b.closedAt));}
function rng(seed){let x=seed>>>0||0x9e3779b9;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
function pct(xs,p){if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*p)))];}
export function evaluateTailRiskBootstrap(ledger,{paths=2000,blockSize=5,minTrades=100,capitalFloorPct=.70,maxP95DrawdownPct=.25,maxFloorBreachRate=.05}={}){
 const r=rows(ledger),initial=Math.max(1,finite(ledger?.initialEquityQuote,10000)),n=r.length;
 const seed=parseInt(sha256(r.map(x=>[x.closedAt,x.realizedNetPnlQuote])).slice(0,8),16),random=rng(seed);
 const dds=[],ends=[];let breaches=0;
 if(n){
  for(let k=0;k<paths;k++){let eq=initial,peak=initial,dd=0,breach=false,used=0;
   while(used<n){const start=Math.floor(random()*n);for(let j=0;j<blockSize&&used<n;j++,used++){eq+=finite(r[(start+j)%n].realizedNetPnlQuote);peak=Math.max(peak,eq);dd=Math.max(dd,peak>0?(peak-eq)/peak:1);if(eq<=initial*capitalFloorPct)breach=true;}}
   dds.push(dd);ends.push(eq);if(breach)breaches++;
  }
 }
 const floorBreachRate=paths&&n?breaches/paths:null,p95DrawdownPct=pct(dds,.95),p99DrawdownPct=pct(dds,.99);
 const checks={sampleSize:n>=minTrades,p95Drawdown:p95DrawdownPct!=null&&p95DrawdownPct<=maxP95DrawdownPct,capitalFloor:floorBreachRate!=null&&floorBreachRate<=maxFloorBreachRate,medianEndingEquity:(pct(ends,.5)??0)>initial};
 const passed=Object.values(checks).every(Boolean);
 const core={version:TAIL_RISK_BOOTSTRAP_VERSION,samples:n,paths:n?paths:0,blockSize,passed,checks,p95DrawdownPct,p99DrawdownPct,floorBreachRate,medianEndingEquity:pct(ends,.5),p05EndingEquity:pct(ends,.05),thresholds:{minTrades,capitalFloorPct,maxP95DrawdownPct,maxFloorBreachRate},execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,meaning:'DETERMINISTIC_BLOCK_BOOTSTRAP_RISK_EVIDENCE_NOT_A_FORECAST_OR_LIVE_AUTHORIZATION'};
 return freeze({...core,fingerprint:sha256(core)});
}
