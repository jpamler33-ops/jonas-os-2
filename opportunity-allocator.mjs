import { sha256 } from './institutional-kernel.mjs';
import { buildStrategyEdgeDecayMap, edgeDecayDecision } from './strategy-edge-decay.mjs';

export const OPPORTUNITY_ALLOCATOR_VERSION='TCX_OPPORTUNITY_ALLOCATOR_V1';

const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)));
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};

function dnaKey(x={}){
  return [
    String(x.assetClass||'CORE').toUpperCase(),
    String(x.symbol||'UNKNOWN').toUpperCase(),
    String(x.side||'UNKNOWN').toUpperCase(),
    String(x.horizonId||'UNKNOWN').toUpperCase(),
    String(x.admissionGate||'UNKNOWN').toUpperCase()
  ].join('|');
}

export function buildStrategyDnaMemory(ledger,{minSamples=4}={}){
  const closed=(ledger?.positions||[]).filter(p=>
    p?.execution==='SHADOW_ONLY'&&p?.canExecuteLive===false&&p?.status==='CLOSED'&&
    !['COVERAGE_PROBE','ABSTAIN_PROBE','CHALLENGER'].includes(String(p.entryMode||'STANDARD').toUpperCase())
  );
  const buckets=new Map();
  for(const p of closed){
    const key=dnaKey(p), a=buckets.get(key)||[];
    a.push(p); buckets.set(key,a);
  }
  const decayMap=buildStrategyEdgeDecayMap(ledger);
  const cells=[];
  for(const [key,rows] of buckets){
    const n=rows.length,wins=rows.filter(x=>finite(x.realizedNetPnlQuote)>0).length;
    const meanReturn=rows.reduce((s,x)=>s+finite(x.realizedReturnPct),0)/Math.max(1,n);
    const posteriorWinRate=(wins+6)/(n+12);
    const shrinkedReturn=meanReturn*(n/(n+10));
    const confidence=clamp(n/(n+12));
    const failureRate=1-posteriorWinRate;
    const lossSeverity=Math.max(0,-shrinkedReturn);
    const failureScore=clamp(.55*failureRate+.30*clamp(lossSeverity/.01)+.15*confidence);
    const opportunityScore=clamp(.45*posteriorWinRate+.35*(.5+.5*Math.tanh(shrinkedReturn/.006))+.20*confidence);
    const status=n<minSamples?'LEARNING':failureScore>=.62?'AVOID':opportunityScore>=.58&&shrinkedReturn>0?'FAVORED':'NEUTRAL';
    const decay=edgeDecayDecision(decayMap,{assetClass:rows[0]?.assetClass,symbol:rows[0]?.symbol,side:rows[0]?.side,horizonId:rows[0]?.horizonId,admissionGate:rows[0]?.admissionGate});
    cells.push({key,samples:n,wins,posteriorWinRate,meanReturn,shrinkedReturn,confidence,failureScore,opportunityScore,status,edgeDecayStatus:decay.status,edgeDecayBlocked:decay.blocked,edgeDecaySamples:decay.samples});
  }
  cells.sort((a,b)=>b.opportunityScore-a.opportunityScore||b.samples-a.samples);
  const core={version:OPPORTUNITY_ALLOCATOR_VERSION,samples:closed.length,cells,
    execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false};
  return freeze({...core,fingerprint:sha256(core)});
}

export function allocateShadowOpportunity(memory,candidate,{baseNotionalQuote=100}={}){
  const key=dnaKey(candidate);
  const cell=(memory?.cells||[]).find(x=>x.key===key)||null;
  const forecastEdge=clamp((finite(candidate.directionalProbability,.5)-.5)*2);
  const returnSignal=clamp(Math.abs(finite(candidate.expectedReturn))/0.01);
  const learned=cell?cell.opportunityScore:.5;
  const confidence=cell?cell.confidence:0;
  const failure=cell?cell.failureScore:.5;
  const score=clamp(.35*forecastEdge+.20*returnSignal+.30*learned+.15*confidence);
  const blocked=(cell?.status==='AVOID'&&cell.samples>=4)||cell?.edgeDecayBlocked===true;
  const multiplier=blocked?0:score>=.72?1.25:score>=.60?1:score>=.48?.75:.5;
  const core={
    version:OPPORTUNITY_ALLOCATOR_VERSION,key,score,multiplier,blocked,
    reason:cell?.edgeDecayBlocked?'EDGE_DECAY_DISABLE':blocked?'FAILURE_MEMORY_AVOID':cell?'STRATEGY_DNA_ALLOCATED':'COLD_START_CONSERVATIVE',
    edgeDecayStatus:cell?.edgeDecayStatus||'UNAVAILABLE',edgeDecaySamples:cell?.edgeDecaySamples||0,
    samples:cell?.samples||0,failureScore:cell?.failureScore??null,
    opportunityScore:cell?.opportunityScore??null,
    notionalQuote:Math.max(1,finite(baseNotionalQuote,100)*multiplier),
    execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false
  };
  return freeze({...core,fingerprint:sha256(core)});
}
