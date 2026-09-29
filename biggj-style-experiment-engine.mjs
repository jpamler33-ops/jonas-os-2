import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_STYLE_EXPERIMENT_VERSION='BIGGJ_STYLE_EXPERIMENT_V1';

const finite=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)));
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
const finalized=core=>freeze({...core,fingerprint:sha256(core)});

const STYLE_WINDOWS=Object.freeze({
  SCALP:Object.freeze({min:5*60_000,max:60*60_000,notionalMultiplier:.18}),
  INTRADAY:Object.freeze({min:60*60_000,max:3*60*60_000,notionalMultiplier:.22}),
  SWING:Object.freeze({min:3*60*60_000,max:12*60*60_000,notionalMultiplier:.18})
});

function horizonRows(issuance,style){
  const w=STYLE_WINDOWS[style];
  return (Array.isArray(issuance?.forecast?.horizons)?issuance.forecast.horizons:[])
    .filter(h=>
      String(h?.gate||'').toUpperCase()==='PASS'&&
      h?.display?.probabilityDisplayAllowed===true&&
      String(h?.calibration?.status||'').toUpperCase()==='CALIBRATED'&&
      ['UP','DOWN'].includes(String(h?.direction||'').toUpperCase())&&
      finite(h?.horizonMs)!=null&&Number(h.horizonMs)>=w.min&&Number(h.horizonMs)<=w.max
    )
    .map(h=>{
      const d=String(h.direction).toUpperCase();
      const p=h.display?.probabilities||h.probabilities||{};
      const dp=finite(d==='UP'?p.up:p.down,.5),op=finite(d==='UP'?p.down:p.up,.5);
      return {h,edge:dp-op,directionalProbability:dp,oppositeProbability:op};
    })
    .sort((a,b)=>b.edge-a.edge||Math.abs(Number(b.h.expectedReturn||0))-Math.abs(Number(a.h.expectedReturn||0)));
}
function contextShape({analysis,style,horizon,setupType='UNKNOWN',assetClass='CORE'}){
  const side=String(analysis?.side||'UNKNOWN').toUpperCase();
  const bias=String(analysis?.marketStructure?.bias||'MIXED').toUpperCase();
  const spread=finite(analysis?.microstructure?.spreadBps);
  return {
    assetClass:String(assetClass||'CORE').toUpperCase(),
    entryMode:'STYLE_EXPERIMENT',
    strategyFamily:String(analysis?.strategyFamily||'UNKNOWN').toUpperCase(),
    side,
    setupType:String(setupType||'UNKNOWN').toUpperCase(),
    horizon:Number(horizon?.horizonMs||0)<=15*60_000?'H_15M_OR_LESS':
      Number(horizon?.horizonMs||0)<=60*60_000?'H_1H':
        Number(horizon?.horizonMs||0)<=3*60*60_000?'H_3H':'H_LONG',
    regimeTrend:bias==='BULLISH'?'UP':bias==='BEARISH'?'DOWN':'NEUTRAL',
    liquidity:spread==null?'UNKNOWN':spread<=2?'DEEP':spread<=10?'NORMAL':'THIN'
  };
}
function matchExperiments(lab,shape){
  return (lab?.experiments||[]).filter(x=>{
    const constraints=x?.hypothesis?.constraints||{};
    return Object.entries(constraints).every(([k,v])=>{
      if(!(k in shape)) return false;
      return String(shape[k])===String(v);
    });
  }).slice(0,5);
}

export function deriveBiggjStyleExperimentCandidates(issuance,analysis,{
  assetClass='CORE',
  baseNotionalQuote=20,
  setupType='UNKNOWN',
  learnedExperimentLab=null,
  now=Date.now(),
  maxCandidates=3
}={}){
  if(!issuance||issuance.executionMode!=='SHADOW_ONLY'||issuance.canExecute!==false){
    return finalized({
      version:BIGGJ_STYLE_EXPERIMENT_VERSION,candidates:[],
      reason:'ISSUANCE_SAFETY_INVALID',execution:'SHADOW_ONLY',canExecuteLive:false
    });
  }
  if(!analysis||analysis.decision!=='CANDIDATE'||!['LONG','SHORT'].includes(String(analysis.side))){
    return finalized({
      version:BIGGJ_STYLE_EXPERIMENT_VERSION,candidates:[],
      reason:'NO_MARKET_CANDIDATE',execution:'SHADOW_ONLY',canExecuteLive:false
    });
  }
  const styleRows=(analysis.styleCandidates||[]).filter(x=>x.score>=.45);
  const candidates=[];
  for(const styleRow of styleRows){
    const style=String(styleRow.style||'').toUpperCase();
    if(!STYLE_WINDOWS[style]) continue;
    const horizons=horizonRows(issuance,style);
    if(!horizons.length) continue;
    const selected=horizons[0];
    const h=selected.h;
    const forecastSide=String(h.direction).toUpperCase()==='UP'?'LONG':'SHORT';
    if(forecastSide!==String(analysis.side).toUpperCase()) continue;
    const shape=contextShape({analysis,style,horizon:h,setupType,assetClass});
    const learnedMatches=matchExperiments(learnedExperimentLab,shape);
    const slot=Math.floor(Number(now)/Math.max(5*60_000,Number(h.horizonMs||0)));
    const core={
      version:BIGGJ_STYLE_EXPERIMENT_VERSION,
      symbol:String(issuance.symbol||'').toUpperCase(),
      style,
      strategyFamily:String(analysis.strategyFamily||'UNKNOWN'),
      side:forecastSide,
      horizonId:String(h.horizonId||''),
      horizonMs:Number(h.horizonMs),
      slot,
      forecastFingerprint:String(issuance.forecastFingerprint||issuance.forecast?.fingerprint||'')
    };
    candidates.push({
      ...core,
      experimentKey:'bsx_'+sha256(core).slice(0,24),
      score:clamp(Number(styleRow.score||0)),
      styleEvidence:styleRow.evidence||{},
      expectedReturn:finite(h.expectedReturn),
      directionalProbability:selected.directionalProbability,
      probabilityEdge:selected.edge,
      setupType:String(setupType||'UNKNOWN'),
      contextShape:shape,
      learnedHypothesisIds:learnedMatches.map(x=>x.experimentId),
      learnedHypothesisMatches:learnedMatches.length,
      notionalQuote:Math.max(1,Number(baseNotionalQuote||20)*STYLE_WINDOWS[style].notionalMultiplier),
      fixedHorizonResearch:true,
      horizonOnlyExit:true,
      execution:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecuteLive:false
    });
  }
  candidates.sort((a,b)=>b.learnedHypothesisMatches-a.learnedHypothesisMatches||b.score-a.score||b.probabilityEdge-a.probabilityEdge);
  return finalized({
    version:BIGGJ_STYLE_EXPERIMENT_VERSION,
    candidates:candidates.slice(0,Math.max(1,Number(maxCandidates)||3)),
    reason:candidates.length?'STYLE_EXPERIMENTS_READY':'NO_STYLE_EXPERIMENT_MATCH',
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'RESEARCH_ONLY_STYLE_X_STRATEGY_X_REGIME_FORWARD_EXPERIMENTS'
  });
}
