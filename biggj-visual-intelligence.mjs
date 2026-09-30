import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_VISUAL_INTELLIGENCE_VERSION='BIGGJ_VISUAL_INTELLIGENCE_V4';

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,Number(v)));}
function round(v,d=4){const n=finite(v);return n==null?null:Number(n.toFixed(d));}
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) freeze(x);
  }
  return v;
}
function avgKnown(values){
  const xs=values.map(finite).filter(x=>x!=null);
  return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
}
function deriveProbabilityVector(position={}){
  const dir=finite(position.directionalProbability);
  const edge=finite(position.probabilityEdge);
  if(dir==null||edge==null) return null;
  const opp=clamp(dir-edge,0,1);
  const flat=clamp(1-dir-opp,0,1);
  const side=String(position.side||'').toUpperCase();
  return side==='SHORT'
    ?{continuation:dir,range:flat,invalidation:opp,source:'DERIVED_FROM_STORED_FORECAST_PROBABILITIES'}
    :{continuation:dir,range:flat,invalidation:opp,source:'DERIVED_FROM_STORED_FORECAST_PROBABILITIES'};
}
function belief(name,value,{epistemic='MODELLED',note=''}={}){
  const v=finite(value);
  return freeze({name,value:v==null?null:clamp(v),known:v!=null,epistemic,note});
}
function scoreReturnMagnitude(expectedReturn){
  const r=Math.abs(finite(expectedReturn,0));
  return clamp(r/.02,0,1);
}
function scoreEdge(edge){
  return clamp(finite(edge,0)/.25,0,1);
}
function scoreQuality(position){
  const q=finite(position.entryQualityScore);
  if(q!=null) return clamp(q);
  return finite(position.setupScore)==null?null:clamp(position.setupScore);
}
function scoreRegime(position){return finite(position.entryRegimeConfidence);}
function scoreStress(position){return finite(position.entryStressRobustnessScore);}
function scoreForecast(position){
  const p=finite(position.directionalProbability);
  return p==null?null:clamp((p-.5)/.5,0,1);
}
function progress(position,asOf){
  const opened=finite(position.openedAt),h=Math.max(1,finite(position.horizonMs,1));
  return opened==null?null:clamp((Number(asOf)-opened)/h,0,2);
}
function tradeContextLabel(position={}){
  const setup=String(position?.setupType||'').trim().toUpperCase();
  if(setup&&setup!=='UNKNOWN') return setup;
  const mode=String(position?.entryMode||'').trim().toUpperCase();
  if(mode&&mode!=='UNKNOWN'&&mode!=='STANDARD') return mode;
  const strategy=String(position?.strategyId||'').trim().toUpperCase();
  if(strategy&&strategy!=='UNKNOWN') return strategy;
  return mode==='STANDARD'?'PRIMARY_UNCLASSIFIED':'UNCLASSIFIED';
}
function tradeLevels(position={}){
  const entry=finite(position.entryPrice);
  if(!(entry>0)) return null;
  const side=String(position.side||'').toUpperCase();
  const sl=Math.abs(finite(position.stopLossPct,0));
  const tp=Math.abs(finite(position.takeProfitPct,0));
  const stopPrice=side==='SHORT'?entry*(1+sl):entry*(1-sl);
  const takeProfitPrice=side==='SHORT'?entry*(1-tp):entry*(1+tp);
  const current=finite(position.lastMark?.executableExitPrice,finite(position.lastMark?.price));
  return freeze({
    entryPrice:entry,
    stopPrice,
    takeProfitPrice,
    currentPrice:current,
    rewardRisk:sl>0?tp/sl:null
  });
}

export function buildBiggjTradeThesis(position,{asOf=Date.now()}={}){
  if(!position||position.execution!=='SHADOW_ONLY'||position.canExecuteLive!==false) throw new Error('SHADOW_POSITION_REQUIRED');
  const symbol=String(position.symbol||'UNKNOWN').toUpperCase();
  const side=String(position.side||'UNKNOWN').toUpperCase();
  const probability=deriveProbabilityVector(position);
  const beliefs=freeze({
    forecast:belief('Forecast support',scoreForecast(position),{epistemic:'MODELLED',note:'Stored calibrated directional probability when available'}),
    edge:belief('Probability edge',scoreEdge(position.probabilityEdge),{epistemic:'MODELLED'}),
    expectedMove:belief('Expected move',scoreReturnMagnitude(position.expectedReturn),{epistemic:'MODELLED'}),
    regime:belief('Regime fit',scoreRegime(position),{epistemic:'INFERRED'}),
    stress:belief('Stress robustness',scoreStress(position),{epistemic:'MODELLED'}),
    quality:belief('Entry quality',scoreQuality(position),{epistemic:'MODELLED'})
  });
  const health=avgKnown(Object.values(beliefs).map(x=>x.value));
  const knownCount=Object.values(beliefs).filter(x=>x.known).length;
  const novelty=knownCount<3?'UNKNOWN':'UNASSESSED';
  const p=probability||{continuation:null,range:null,invalidation:null,source:'UNAVAILABLE'};
  const hypotheses=freeze([
    {id:'CONTINUATION',label:side==='SHORT'?'Bear continuation':'Bull continuation',support:p.continuation,epistemic:p.source},
    {id:'RANGE',label:'Range / chop',support:p.range,epistemic:p.source},
    {id:'INVALIDATION',label:side==='SHORT'?'Bull invalidation':'Bear invalidation',support:p.invalidation,epistemic:p.source}
  ]);
  const dna=freeze([
    {id:'FORECAST',label:'Forecast',value:beliefs.forecast.value},
    {id:'EDGE',label:'Edge',value:beliefs.edge.value},
    {id:'MOVE',label:'Expected move',value:beliefs.expectedMove.value},
    {id:'REGIME',label:'Regime fit',value:beliefs.regime.value},
    {id:'STRESS',label:'Stress',value:beliefs.stress.value},
    {id:'QUALITY',label:'Entry quality',value:beliefs.quality.value}
  ]);
  const whyNow=freeze([
    {id:'FORECAST',state:beliefs.forecast.known?'KNOWN':'MISSING',detail:beliefs.forecast.known?'Directional forecast admitted':'No stored directional probability'},
    {id:'REGIME',state:beliefs.regime.known?'KNOWN':'MISSING',detail:beliefs.regime.known?'Regime confidence '+round(beliefs.regime.value,3):'No regime confidence stored'},
    {id:'STRESS',state:beliefs.stress.known?'KNOWN':'MISSING',detail:beliefs.stress.known?'Stress robustness '+round(beliefs.stress.value,3):'No stress score stored'},
    {id:'QUALITY',state:beliefs.quality.known?'KNOWN':'MISSING',detail:beliefs.quality.known?'Entry quality '+round(beliefs.quality.value,3):'No quality score stored'},
    {id:'ADMISSION',state:String(position.admissionGate||'UNKNOWN'),detail:'Forecast admission gate'},
    {id:'EXECUTION',state:'SHADOW_ONLY',detail:'Real execution blocked'}
  ]);
  const thesisId='th_'+sha256({
    positionId:String(position.positionId||''),
    issuanceId:String(position.issuanceId||''),
    forecastFingerprint:String(position.forecastFingerprint||''),
    symbol,side,openedAt:finite(position.openedAt)
  }).slice(0,16);
  const core={
    version:BIGGJ_VISUAL_INTELLIGENCE_VERSION,
    thesisId,
    positionId:String(position.positionId||''),
    symbol,side,
    status:String(position.status||'UNKNOWN').toUpperCase(),
    openedAt:finite(position.openedAt),
    horizonId:String(position.horizonId||''),
    setupType:tradeContextLabel(position),
    setupScore:finite(position.setupScore),
    entryMode:String(position.entryMode||'STANDARD'),
    admissionGate:String(position.admissionGate||'UNKNOWN'),
    thesisHealth:health,
    knownBeliefs:knownCount,
    novelty,
    progress:progress(position,asOf),
    beliefs,
    hypotheses,
    tradeDna:dna,
    whyNow,
    levels:tradeLevels(position),
    mfe:finite(position.mfeMarginRoePct),
    mae:finite(position.maeMarginRoePct),
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    epistemic:'DERIVED_FROM_POINT_IN_TIME_SHADOW_POSITION_STATE'
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function tradeOverlayFromPosition(position,{asOf=Date.now()}={}){
  const thesis=buildBiggjTradeThesis(position,{asOf});
  const levels=thesis.levels;
  if(!levels) return null;
  return freeze({
    version:BIGGJ_VISUAL_INTELLIGENCE_VERSION,
    thesisId:thesis.thesisId,
    symbol:thesis.symbol,
    side:thesis.side,
    status:thesis.status,
    entryPrice:levels.entryPrice,
    stopPrice:levels.stopPrice,
    takeProfitPrice:levels.takeProfitPrice,
    currentPrice:levels.currentPrice,
    rewardRisk:levels.rewardRisk,
    thesisHealth:thesis.thesisHealth,
    progress:thesis.progress,
    setupType:thesis.setupType,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function renderBiggjThesisText(thesis){
  if(!thesis) return 'BIGGJ // THESIS unavailable';
  const pct=v=>finite(v)==null?'—':Math.round(clamp(v)*100)+'%';
  const bar=v=>{
    if(finite(v)==null) return '░░░░░░░░░░';
    const n=Math.round(clamp(v)*10);return '█'.repeat(n)+'░'.repeat(10-n);
  };
  const lines=[
    'BIGGJ // LIVING THESIS · '+thesis.symbol.replace('USDT','/USDT'),
    '━━━━━━━━━━━━━━━━━━━━',
    thesis.side+' · '+thesis.status+' · '+thesis.setupType,
    'THESIS '+thesis.thesisId,
    '',
    'THESIS HEALTH  '+bar(thesis.thesisHealth)+' '+pct(thesis.thesisHealth),
    'KNOWN BELIEFS  '+thesis.knownBeliefs+'/6',
    'NOVELTY        '+thesis.novelty,
    '',
    'GHOST PATHS',
    ...thesis.hypotheses.map(x=>x.label.padEnd(20,' ')+' '+bar(x.support)+' '+pct(x.support)),
    '',
    'TRADE DNA',
    ...thesis.tradeDna.map(x=>x.label.padEnd(18,' ')+' '+bar(x.value)+' '+pct(x.value)),
    '',
    'WHY NOW',
    ...thesis.whyNow.map(x=>'• '+x.id+' · '+x.state+' · '+x.detail),
    '',
    'EPISTEMIC: '+thesis.epistemic,
    'SHADOW_ONLY · REAL ORDERS BLOCKED'
  ];
  return lines.join('\n').slice(0,4096);
}
