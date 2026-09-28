import { sha256 } from './institutional-kernel.mjs';

export const SHADOW_TRADE_QUALITY_LEARNER_VERSION='TCX_SHADOW_TRADE_QUALITY_LEARNER_V1';

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clamp(v,a=0,b=1){ return Math.max(a,Math.min(b,Number(v))); }
function mean(xs){ return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0; }
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) freeze(x);
  }
  return v;
}
function probBin(v){
  const x=finite(v,.5);
  if(x>=.70) return 'P70';
  if(x>=.62) return 'P62';
  if(x>=.56) return 'P56';
  if(x>=.52) return 'P52';
  return 'PLOW';
}
function edgeBin(v){
  const x=finite(v,0);
  if(x>=.25) return 'E25';
  if(x>=.16) return 'E16';
  if(x>=.10) return 'E10';
  if(x>=.05) return 'E05';
  return 'ELOW';
}
function returnBin(v){
  const x=Math.abs(finite(v,0));
  if(x>=.01) return 'R100';
  if(x>=.006) return 'R60';
  if(x>=.003) return 'R30';
  if(x>=.0015) return 'R15';
  return 'RLOW';
}
function horizonBin(v){
  const ms=Math.max(0,finite(v,0));
  if(ms<=5*60_000) return 'H_FAST';
  if(ms<=60*60_000) return 'H_INTRADAY';
  return 'H_LONG';
}
function featureShape(x={}){
  return {
    assetClass:String(x.assetClass||'CORE').toUpperCase(),
    side:String(x.side||'UNKNOWN').toUpperCase(),
    horizon:horizonBin(x.horizonMs),
    probability:probBin(x.directionalProbability),
    edge:edgeBin(x.probabilityEdge),
    expectedReturn:returnBin(x.expectedReturn)
  };
}
function keysFor(x={}){
  const f=featureShape(x);
  return [
    ['EXACT',[f.assetClass,f.side,f.horizon,f.probability,f.edge,f.expectedReturn].join('|')],
    ['CONTEXT',[f.assetClass,f.side,f.horizon].join('|')],
    ['ASSET_SIDE',[f.assetClass,f.side].join('|')],
    ['ASSET',f.assetClass],
    ['GLOBAL','ALL']
  ];
}
function add(map,key,row){
  const x=map.get(key)||{trades:0,wins:0,returns:[],pnls:[],explorationTrades:0};
  x.trades++;
  if(Number(row.realizedNetPnlQuote||0)>0) x.wins++;
  x.returns.push(Number(row.realizedReturnPct||0));
  x.pnls.push(Number(row.realizedNetPnlQuote||0));
  if(row.exploration===true||String(row.entryMode||'').toUpperCase()==='EXPLORATION') x.explorationTrades++;
  map.set(key,x);
}
function summarize(raw,{priorWinRate=.5,priorStrength=12,returnPriorStrength=10}={}){
  const n=raw?.trades||0,w=raw?.wins||0;
  const posteriorWinRate=(w+priorWinRate*priorStrength)/(n+priorStrength);
  const rawMeanReturn=mean(raw?.returns||[]);
  const shrinkage=n/(n+returnPriorStrength);
  const shrinkedMeanReturn=rawMeanReturn*shrinkage;
  const confidence=clamp(n/(n+priorStrength));
  const positiveReturnScore=clamp(.5+.5*Math.tanh(shrinkedMeanReturn/.006));
  const qualityScore=clamp(.50*posteriorWinRate+.30*positiveReturnScore+.20*confidence);
  const label=n<8
    ?'UNCERTAIN'
    :posteriorWinRate>=.55&&shrinkedMeanReturn>0
      ?'LEARNED_GOOD'
      :posteriorWinRate<=.45||shrinkedMeanReturn<-.001
        ?'LEARNED_BAD'
        :'MIXED';
  return {
    samples:n,
    wins:w,
    rawWinRate:n?w/n:null,
    posteriorWinRate,
    rawMeanReturn,
    shrinkedMeanReturn,
    expectancyQuote:mean(raw?.pnls||[]),
    confidence,
    qualityScore,
    label,
    explorationTrades:raw?.explorationTrades||0
  };
}

export function buildShadowTradeQualityModel(ledger,{
  asOf=Date.now(),
  priorWinRate=.5,
  priorStrength=12,
  returnPriorStrength=10
}={}){
  const closed=(ledger?.positions||[]).filter(p=>
    p&&p.execution==='SHADOW_ONLY'&&p.canExecuteLive===false&&p.status==='CLOSED'&&
    finite(p.realizedReturnPct)!=null&&finite(p.realizedNetPnlQuote)!=null
  );
  const maps={
    EXACT:new Map(),CONTEXT:new Map(),ASSET_SIDE:new Map(),ASSET:new Map(),GLOBAL:new Map()
  };
  for(const p of closed){
    for(const [level,key] of keysFor(p)) add(maps[level],key,p);
  }
  const groups={};
  for(const [level,map] of Object.entries(maps)){
    groups[level]=Object.fromEntries([...map.entries()].map(([key,raw])=>[
      key,summarize(raw,{priorWinRate,priorStrength,returnPriorStrength})
    ]));
  }
  const global=groups.GLOBAL.ALL||summarize(null,{priorWinRate,priorStrength,returnPriorStrength});
  const core={
    version:SHADOW_TRADE_QUALITY_LEARNER_VERSION,
    asOf:Number(asOf),
    samples:closed.length,
    explorationSamples:closed.filter(p=>p.exploration===true||String(p.entryMode||'').toUpperCase()==='EXPLORATION').length,
    groups,
    global,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'EMPIRICAL_SHADOW_OUTCOME_MEMORY_WITH_SHRINKAGE_NOT_PROFIT_GUARANTEE'
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function scoreShadowTradeCandidate(model,features,{minExactSamples=8,minContextSamples=12}={}){
  const levels=keysFor(features);
  let chosen=null;
  for(const [level,key] of levels){
    const row=model?.groups?.[level]?.[key];
    if(!row) continue;
    const min=level==='EXACT'?minExactSamples:level==='CONTEXT'?minContextSamples:1;
    if(row.samples>=min||level==='GLOBAL'){
      chosen={level,key,...row};
      break;
    }
  }
  if(!chosen){
    chosen={level:'PRIOR',key:'PRIOR',samples:0,wins:0,rawWinRate:null,posteriorWinRate:.5,
      rawMeanReturn:0,shrinkedMeanReturn:0,expectancyQuote:0,confidence:0,qualityScore:.4,
      label:'UNCERTAIN',explorationTrades:0};
  }
  const novelty=clamp(1-chosen.samples/30);
  const uncertainty=clamp(1-chosen.confidence);
  const learningValue=clamp(.55*novelty+.45*uncertainty);
  const core={
    version:SHADOW_TRADE_QUALITY_LEARNER_VERSION,
    featureShape:featureShape(features),
    matchedLevel:chosen.level,
    matchedKey:chosen.key,
    samples:chosen.samples,
    posteriorWinRate:chosen.posteriorWinRate,
    shrinkedMeanReturn:chosen.shrinkedMeanReturn,
    confidence:chosen.confidence,
    qualityScore:chosen.qualityScore,
    qualityLabel:chosen.label,
    novelty,
    uncertainty,
    learningValue,
    modelFingerprint:String(model?.fingerprint||''),
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function qualityLearnerSummary(model){
  const all=[];
  for(const [key,row] of Object.entries(model?.groups?.CONTEXT||{})) all.push({key,...row});
  all.sort((a,b)=>b.qualityScore-a.qualityScore||b.samples-a.samples);
  return freeze({
    version:SHADOW_TRADE_QUALITY_LEARNER_VERSION,
    samples:Number(model?.samples||0),
    explorationSamples:Number(model?.explorationSamples||0),
    global:model?.global||null,
    bestContexts:all.filter(x=>x.samples>=8).slice(0,5),
    weakContexts:[...all].filter(x=>x.samples>=8).sort((a,b)=>a.qualityScore-b.qualityScore).slice(0,5),
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}
