import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_ADAPTIVE_LEARNING_VERSION='BIGGJ_ADAPTIVE_LEARNING_V1';
export const BIGGJ_HOLD_MULTIPLIERS=Object.freeze([0.50,0.75,1.00,1.50,2.00,3.00,4.00,8.00]);

const finite=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)));
const token=(v,f='UNKNOWN')=>{
  const s=String(v??'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return s||f;
};
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
const finalized=core=>freeze({...core,fingerprint:sha256(core)});
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const variance=xs=>{if(xs.length<2)return 0;const m=mean(xs);return xs.reduce((s,x)=>s+(x-m)**2,0)/(xs.length-1);};
const stdev=xs=>Math.sqrt(Math.max(0,variance(xs)));

function modeWeight(p){
  const mode=token(p?.entryMode,'STANDARD');
  if(mode==='COVERAGE_PROBE')return .35;
  if(mode==='ABSTAIN_PROBE')return .50;
  if(mode==='STYLE_EXPERIMENT')return .50;
  if(mode==='EXPLORATION')return .65;
  if(mode==='CHALLENGER')return .75;
  return 1;
}
function horizonBin(ms){
  const x=Math.max(0,finite(ms,0));
  if(x<=15*60_000)return 'H_15M_OR_LESS';
  if(x<=60*60_000)return 'H_1H';
  if(x<=3*60*60_000)return 'H_3H';
  return 'H_LONG';
}
function probabilityBin(v){
  const x=finite(v,.5);
  if(x>=.72)return 'P72';
  if(x>=.64)return 'P64';
  if(x>=.58)return 'P58';
  if(x>=.54)return 'P54';
  return 'PLOW';
}
function edgeBin(v){
  const x=finite(v,0);
  if(x>=.25)return 'E25';
  if(x>=.16)return 'E16';
  if(x>=.10)return 'E10';
  if(x>=.06)return 'E06';
  return 'ELOW';
}
function expectedReturnBin(v){
  const x=Math.abs(finite(v,0));
  if(x>=.015)return 'R150';
  if(x>=.008)return 'R80';
  if(x>=.004)return 'R40';
  if(x>=.002)return 'R20';
  return 'RLOW';
}
function scoreBin(v){
  const x=finite(v);
  if(x==null)return 'UNKNOWN';
  if(x>=.80)return 'S80';
  if(x>=.70)return 'S70';
  if(x>=.60)return 'S60';
  if(x>=.50)return 'S50';
  return 'SLOW';
}
function regimeParts(position={}){
  const state=position.entryRegimeState&&typeof position.entryRegimeState==='object'?position.entryRegimeState:{};
  const c=state.components&&typeof state.components==='object'?state.components:state;
  return {
    regime:token(c.regime??position.entryRegimeKey),
    trend:token(c.trend),
    volatility:token(c.volatility),
    liquidity:token(c.liquidity),
    pressure:token(c.pressure)
  };
}
function ctx(position={}){
  const snap=position.biggjContextSnapshot&&typeof position.biggjContextSnapshot==='object'?position.biggjContextSnapshot:{};
  const regime=regimeParts(position);
  return {
    assetClass:token(position.assetClass,'CORE'),
    entryMode:token(position.entryMode,'STANDARD'),
    strategyFamily:token(position.strategyFamily??snap.strategyFamily??position.setupType),
    side:token(position.side),
    setupType:token(position.setupType),
    horizon:horizonBin(position.horizonMs),
    regime:regime.regime,
    regimeTrend:regime.trend,
    volatility:regime.volatility,
    liquidity:regime.liquidity,
    pressure:regime.pressure,
    stressStatus:token(position.entryStressStatus),
    qualityLabel:token(position.entryQualityLabel),
    admissionGate:token(position.admissionGate),
    probability:probabilityBin(position.directionalProbability),
    edge:edgeBin(position.probabilityEdge),
    expectedReturn:expectedReturnBin(position.expectedReturn),
    setupScore:scoreBin(position.setupScore),
    qualityScore:scoreBin(position.entryQualityScore),
    evidenceScore:scoreBin(position.entryEvidenceScore??snap.entryEvidenceScore),
    counterThesis:scoreBin(position.entryCounterThesisStrength??snap.counterThesisStrength),
    dataTrust:scoreBin(position.entryDataTrustScore??snap.dataTrustScore),
    flowState:token(position.entryFlowState??snap.flowState),
    structureState:token(position.entryStructureState??snap.structureState),
    liquidationState:token(position.entryLiquidationState??snap.liquidationState),
    onchainState:token(position.entryOnchainState??snap.onchainState),
    macroState:token(position.entryMacroState??snap.macroState)
  };
}
export function biggjTradeContextVector(position={}){
  return freeze(ctx(position));
}

const FACTOR_DIMENSIONS=Object.freeze([
  'assetClass','entryMode','strategyFamily','side','setupType','horizon',
  'regimeTrend','volatility','liquidity','pressure','stressStatus','qualityLabel',
  'admissionGate','probability','edge','expectedReturn','setupScore','qualityScore',
  'evidenceScore','counterThesis','dataTrust','flowState','structureState',
  'liquidationState','onchainState','macroState'
]);

function realizedRoe(p){
  return finite(p?.realizedMarginRoePct,finite(p?.realizedReturnPct,0));
}
function closedRows(ledger){
  return (ledger?.positions||[]).filter(p=>
    p&&p.execution==='SHADOW_ONLY'&&p.canExecuteLive===false&&p.status==='CLOSED'&&
    finite(p.closedAt)!=null&&finite(p.openedAt)!=null&&finite(realizedRoe(p))!=null
  );
}
function createAgg(){return{samples:0,effectiveSamples:0,weightedWins:0,weightedReturn:0,weightedAbsLoss:0,weightedMfe:0,weightedMae:0,weightedCapture:0,weightedExitRegret:0};}
function addAgg(a,p){
  const w=modeWeight(p),ret=realizedRoe(p),mfe=finite(p.mfeMarginRoePct,0),mae=finite(p.maeMarginRoePct,0);
  const cap=finite(p.captureEfficiency),reg=finite(p.exitRegretMarginRoePct);
  a.samples++;a.effectiveSamples+=w;a.weightedReturn+=ret*w;
  if(ret>0)a.weightedWins+=w;
  if(ret<0)a.weightedAbsLoss+=Math.abs(ret)*w;
  a.weightedMfe+=mfe*w;a.weightedMae+=mae*w;
  if(cap!=null)a.weightedCapture+=cap*w;
  if(reg!=null)a.weightedExitRegret+=reg*w;
  return a;
}
function baseStats(rows){
  const weighted=rows.reduce((a,p)=>addAgg(a,p),createAgg());
  const n=Math.max(1e-9,weighted.effectiveSamples);
  return {
    samples:weighted.samples,
    effectiveSamples:weighted.effectiveSamples,
    winRate:weighted.weightedWins/n,
    meanReturn:weighted.weightedReturn/n,
    meanAbsLoss:weighted.weightedAbsLoss/n,
    meanMfe:weighted.weightedMfe/n,
    meanMae:weighted.weightedMae/n,
    meanCaptureEfficiency:weighted.weightedCapture/n,
    meanExitRegret:weighted.weightedExitRegret/n
  };
}
function summarizeAssociation(raw,global,{priorStrength=12,minSamples=6}={}){
  const n=Math.max(0,raw.effectiveSamples);
  const denom=n+priorStrength;
  const win=(raw.weightedWins+global.winRate*priorStrength)/Math.max(1e-9,denom);
  const ret=(raw.weightedReturn+global.meanReturn*priorStrength)/Math.max(1e-9,denom);
  const loss=(raw.weightedAbsLoss+global.meanAbsLoss*priorStrength)/Math.max(1e-9,denom);
  const confidence=n/Math.max(1e-9,n+priorStrength);
  const winLift=win-global.winRate,returnLift=ret-global.meanReturn;
  const normalizedReturn=Math.tanh(returnLift/.004);
  const normalizedWin=Math.tanh(winLift/.08);
  const associationScore=clamp(.5+.5*confidence*(.58*normalizedReturn+.42*normalizedWin));
  const direction=associationScore>=.57?'POSITIVE':associationScore<=.43?'NEGATIVE':'MIXED';
  return {
    samples:raw.samples,effectiveSamples:n,
    posteriorWinRate:win,shrinkedMeanReturn:ret,shrinkedMeanAbsLoss:loss,
    winLift,returnLift,confidence,associationScore,direction,
    evidenceReady:raw.samples>=minSamples&&n>=Math.max(3,minSamples*.6)
  };
}

export function buildBiggjOutcomeFactorMemory(ledger,{
  minSamples=6,
  priorStrength=12,
  maxPairDimensions=14
}={}){
  const rows=closedRows(ledger);
  const global=baseStats(rows);
  const singles=new Map(),pairs=new Map();
  const dims=FACTOR_DIMENSIONS.slice(0,Math.max(2,Math.min(FACTOR_DIMENSIONS.length,Number(maxPairDimensions)||14)));
  for(const p of rows){
    const f=ctx(p);
    for(const d of FACTOR_DIMENSIONS){
      const value=String(f[d]??'UNKNOWN');
      const key=d+'='+value;
      const a=singles.get(key)||{...createAgg(),dimensions:[d],values:{[d]:value}};
      addAgg(a,p);singles.set(key,a);
    }
    for(let i=0;i<dims.length;i++)for(let j=i+1;j<dims.length;j++){
      const aDim=dims[i],bDim=dims[j],aVal=String(f[aDim]??'UNKNOWN'),bVal=String(f[bDim]??'UNKNOWN');
      const key=aDim+'='+aVal+' & '+bDim+'='+bVal;
      const a=pairs.get(key)||{...createAgg(),dimensions:[aDim,bDim],values:{[aDim]:aVal,[bDim]:bVal}};
      addAgg(a,p);pairs.set(key,a);
    }
  }
  const finish=(map)=>[...map.entries()].map(([key,raw])=>({
    key,dimensions:raw.dimensions,values:raw.values,
    ...summarizeAssociation(raw,global,{priorStrength,minSamples})
  })).sort((a,b)=>Math.abs(b.associationScore-.5)-Math.abs(a.associationScore-.5)||b.samples-a.samples);
  const singleRows=finish(singles),pairRows=finish(pairs);
  const evidence=[...singleRows,...pairRows].filter(x=>x.evidenceReady);
  const positive=evidence.filter(x=>x.direction==='POSITIVE').sort((a,b)=>b.associationScore-a.associationScore||b.samples-a.samples);
  const negative=evidence.filter(x=>x.direction==='NEGATIVE').sort((a,b)=>a.associationScore-b.associationScore||b.samples-a.samples);
  const core={
    version:BIGGJ_ADAPTIVE_LEARNING_VERSION,
    asOf:Date.now(),
    samples:rows.length,
    global,
    factorDimensions:[...FACTOR_DIMENSIONS],
    singleFactors:singleRows,
    factorInteractions:pairRows,
    strongestPositive:positive.slice(0,20),
    strongestNegative:negative.slice(0,20),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'POINT_IN_TIME_ENTRY_FACTOR_ASSOCIATION_MEMORY_POST_HOC_NOT_CAUSAL'
  };
  return finalized(core);
}

function matchesAssociation(row,features){
  if(!row?.values)return false;
  return Object.entries(row.values).every(([k,v])=>String(features?.[k]??'UNKNOWN')===String(v));
}
export function analyzeBiggjClosedTrade(position,memory){
  const features=ctx(position);
  const candidates=[
    ...(memory?.singleFactors||[]),
    ...(memory?.factorInteractions||[])
  ].filter(x=>x.evidenceReady&&matchesAssociation(x,features));
  const supportive=candidates.filter(x=>x.direction==='POSITIVE').sort((a,b)=>b.associationScore-a.associationScore).slice(0,5);
  const warnings=candidates.filter(x=>x.direction==='NEGATIVE').sort((a,b)=>a.associationScore-b.associationScore).slice(0,5);
  const ret=realizedRoe(position);
  const durationMs=Math.max(0,finite(position.closedAt,0)-finite(position.openedAt,0));
  const horizonMs=Math.max(1,finite(position.horizonMs,1));
  const capture=finite(position.captureEfficiency);
  const exitRegret=finite(position.exitRegretMarginRoePct);
  const postHoc=[];
  if(exitRegret!=null&&exitRegret>=.005)postHoc.push('LARGE_MFE_GIVEBACK_BEFORE_EXIT');
  if(capture!=null&&capture>=0&&capture<.35)postHoc.push('LOW_CAPTURE_EFFICIENCY');
  if(durationMs/horizonMs<.6)postHoc.push('SHORT_RELATIVE_HOLD');
  if(durationMs/horizonMs>1.5)postHoc.push('LONG_RELATIVE_HOLD');
  const contextSignal=warnings.length&&!supportive.length?'NEGATIVE_CONTEXT':
    supportive.length&&!warnings.length?'POSITIVE_CONTEXT':
      supportive.length||warnings.length?'MIXED_CONTEXT':'INSUFFICIENT_CONTEXT';
  return finalized({
    version:BIGGJ_ADAPTIVE_LEARNING_VERSION,
    positionId:String(position.positionId||''),
    symbol:String(position.symbol||''),
    outcome:ret>0?'WIN':ret<0?'LOSS':'FLAT',
    realizedMarginRoePct:ret,
    durationMs,
    horizonMs,
    durationRatio:durationMs/horizonMs,
    entryContext:features,
    contextSignal,
    supportiveAssociations:supportive,
    warningAssociations:warnings,
    postHocObservations:postHoc,
    mfeMarginRoePct:finite(position.mfeMarginRoePct),
    maeMarginRoePct:finite(position.maeMarginRoePct),
    captureEfficiency:capture,
    exitRegretMarginRoePct:exitRegret,
    epistemic:{
      entryAssociations:'AVAILABLE_BEFORE_FUTURE_TRADES_AFTER_LEARNING',
      outcomeExplanation:'POST_HOC_ASSOCIATION_NOT_CAUSAL_PROOF',
      futureLeakage:'PROHIBITED'
    },
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

function validPathPoint(x,openedAt){
  const at=finite(x?.at,finite(x?.markedAt));
  const ret=finite(x?.marginRoePct,finite(x?.counterfactualMarginRoePct,finite(x?.unrealizedMarginRoePct)));
  if(at==null||ret==null||at<openedAt||x?.fullyExecutable===false)return null;
  return {at,marginRoePct:ret,source:token(x?.source,'OBSERVED_EXECUTABLE_MARK')};
}
export function biggjLearningPath(position){
  const openedAt=finite(position?.openedAt);
  if(openedAt==null)return freeze([]);
  const candidates=[
    ...(Array.isArray(position?.learningTimeline)?position.learningTimeline:[]),
    ...(Array.isArray(position?.postExitMarkouts)?position.postExitMarkouts:[])
  ];
  if(finite(position?.closedAt)!=null&&finite(realizedRoe(position))!=null){
    candidates.push({at:Number(position.closedAt),marginRoePct:realizedRoe(position),fullyExecutable:true,source:'ACTUAL_EXIT'});
  }
  const byAt=new Map();
  for(const x of candidates){
    const p=validPathPoint(x,openedAt);if(!p)continue;byAt.set(p.at,p);
  }
  return freeze([...byAt.values()].sort((a,b)=>a.at-b.at));
}
function holdKeys(position){
  const f=ctx(position);
  return [
    ['EXACT',[f.assetClass,f.strategyFamily,f.regimeTrend,f.volatility,f.liquidity,f.setupType,f.horizon].join('|')],
    ['CONTEXT',[f.assetClass,f.strategyFamily,f.regimeTrend,f.volatility,f.setupType].join('|')],
    ['REGIME',[f.assetClass,f.regimeTrend,f.volatility,f.liquidity].join('|')],
    ['FAMILY',[f.assetClass,f.strategyFamily].join('|')],
    ['GLOBAL','ALL']
  ];
}
function holdAgg(){return{samples:0,effectiveSamples:0,returns:[],weightedReturn:0,weightedWins:0,weightedLosses:0};}
function addHold(a,ret,w){
  a.samples++;a.effectiveSamples+=w;a.returns.push(ret);a.weightedReturn+=ret*w;
  if(ret>0)a.weightedWins+=w;if(ret<0)a.weightedLosses+=w;
}
function nearestPathPoint(points,target,tolerance){
  let best=null,bestDelta=Infinity;
  for(const p of points){
    const d=Math.abs(p.at-target);
    if(d<=tolerance&&d<bestDelta){best=p;bestDelta=d;}
  }
  return best;
}
function summarizeHold(raw,multiplier,{priorStrength=10,minSamples=8}={}){
  const n=Math.max(0,raw.effectiveSamples),denom=n+priorStrength;
  const posteriorWinRate=(raw.weightedWins+.5*priorStrength)/Math.max(1e-9,denom);
  const shrinkedMeanReturn=raw.weightedReturn/Math.max(1e-9,n)*(n/Math.max(1e-9,denom));
  const sigma=stdev(raw.returns);
  const downsideRate=n>0?raw.weightedLosses/n:.5;
  const returnScore=clamp(.5+.5*Math.tanh(shrinkedMeanReturn/.006));
  const consistencyScore=clamp(1-sigma/.03);
  const objectiveScore=clamp(.35*posteriorWinRate+.35*returnScore+.20*consistencyScore+.10*(1-downsideRate));
  return {
    multiplier,samples:raw.samples,effectiveSamples:n,posteriorWinRate,shrinkedMeanReturn,
    stdevReturn:sigma,downsideRate,consistencyScore,objectiveScore,
    evidenceReady:raw.samples>=minSamples&&n>=Math.max(4,minSamples*.65)
  };
}
export function buildBiggjAdaptiveHoldMemory(ledger,{
  multipliers=BIGGJ_HOLD_MULTIPLIERS,
  minSamples=8,
  priorStrength=10,
  pointTolerancePct=.30,
  minPointToleranceMs=5*60_000
}={}){
  const rows=closedRows(ledger);
  const groups={EXACT:new Map(),CONTEXT:new Map(),REGIME:new Map(),FAMILY:new Map(),GLOBAL:new Map()};
  let usableTrades=0,totalObservations=0;
  for(const p of rows){
    const horizon=Math.max(60_000,finite(p.horizonMs,0));if(!horizon)continue;
    const points=biggjLearningPath(p);if(!points.length)continue;
    let used=false;
    for(const multiplier of multipliers){
      const target=Number(p.openedAt)+horizon*Number(multiplier);
      const tolerance=Math.max(minPointToleranceMs,horizon*pointTolerancePct);
      const point=nearestPathPoint(points,target,tolerance);
      if(!point)continue;
      used=true;totalObservations++;
      for(const [level,key] of holdKeys(p)){
        const map=groups[level],cell=map.get(key)||new Map(),m=String(multiplier);
        const raw=cell.get(m)||holdAgg();
        addHold(raw,point.marginRoePct,modeWeight(p));
        cell.set(m,raw);map.set(key,cell);
      }
    }
    if(used)usableTrades++;
  }
  const output={};
  for(const [level,map] of Object.entries(groups)){
    output[level]={};
    for(const [key,cells] of map){
      const choices=[...cells.entries()].map(([m,raw])=>summarizeHold(raw,Number(m),{priorStrength,minSamples}))
        .sort((a,b)=>b.objectiveScore-a.objectiveScore||b.samples-a.samples);
      const ready=choices.filter(x=>x.evidenceReady);
      output[level][key]={
        choices,
        best:ready[0]||null,
        evidenceReady:ready.length>0
      };
    }
  }
  return finalized({
    version:BIGGJ_ADAPTIVE_LEARNING_VERSION,
    samples:rows.length,
    usableTrades,
    totalObservations,
    multipliers:[...multipliers],
    groups:output,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'FORWARD_REUSABLE_HOLD_DURATION_MEMORY_FROM_POINT_IN_TIME_EXECUTABLE_PATH_OBSERVATIONS'
  });
}
export function selectBiggjAdaptiveHoldPlan(memory,position,current={}){
  let match=null;
  for(const [level,key] of holdKeys(position)){
    const row=memory?.groups?.[level]?.[key];
    if(row?.evidenceReady&&row.best){match={level,key,...row.best};break;}
  }
  const learned=match?.multiplier??1;
  const thesis=clamp(finite(current.thesisHealth,.5));
  const opposite=clamp(finite(current.oppositeThesisStrength,.5));
  const structure=clamp(finite(current.structureHealth,.5));
  const regime=clamp(finite(current.regimeAlignment,.5));
  const flow=clamp(finite(current.flowAlignment,.5));
  const liquidity=clamp(finite(current.liquidityHealth,.5));
  const shock=clamp(finite(current.volatilityShock,0));
  const liveSignal=
    .32*(thesis-.5)-
    .28*(opposite-.5)+
    .14*(structure-.5)+
    .10*(regime-.5)+
    .08*(flow-.5)+
    .06*(liquidity-.5)-
    .12*shock;
  const style=token(position?.tradingStyle,'INTRADAY');
  const maxMultiplier=style==='SWING'?8:style==='SCALP'?1.5:3;
  let adjusted=clamp(learned+liveSignal,0.50,maxMultiplier);
  if(thesis<=.35||opposite>=.70||structure<=.30) adjusted=Math.min(adjusted,.75);
  else if(thesis>=.75&&opposite<=.25&&structure>=.65&&regime>=.60) adjusted=Math.max(adjusted,Math.min(maxMultiplier,learned+.25));
  const mode=adjusted>=1.20?'EXTEND':adjusted<=.85?'SHORTEN':'BASE';
  const confidence=match?clamp(match.effectiveSamples/(match.effectiveSamples+12)):0;
  return finalized({
    version:BIGGJ_ADAPTIVE_LEARNING_VERSION,
    mode,
    learnedMultiplier:learned,
    liveAdjustment:adjusted-learned,
    recommendedHoldMultiplier:adjusted,
    matchedLevel:match?.level||'PRIOR',
    matchedKey:match?.key||'PRIOR',
    evidenceSamples:match?.samples||0,
    effectiveSamples:match?.effectiveSamples||0,
    evidenceConfidence:confidence,
    liveInputs:{thesisHealth:thesis,oppositeThesisStrength:opposite,structureHealth:structure,regimeAlignment:regime,flowAlignment:flow,liquidityHealth:liquidity,volatilityShock:shock},
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    meaning:'ADAPTIVE_REVIEW_HORIZON_RECOMMENDATION_NOT_AUTOMATIC_PROFIT_CLAIM'
  });
}

export function discoverBiggjStrategyExperiments(memory,{
  minSamples=10,
  minAssociationScore=.60,
  maxExperiments=10
}={}){
  const source=(memory?.factorInteractions||[])
    .filter(x=>x.evidenceReady&&x.samples>=minSamples&&x.direction==='POSITIVE'&&x.associationScore>=minAssociationScore)
    .sort((a,b)=>b.associationScore-a.associationScore||b.samples-a.samples);
  const experiments=[];
  for(const x of source){
    if(experiments.length>=maxExperiments)break;
    const core={
      sourceFingerprint:String(memory?.fingerprint||''),
      constraints:x.values,
      sourceKey:x.key
    };
    experiments.push({
      experimentId:'bx_'+sha256(core).slice(0,24),
      mode:'CHALLENGER_ONLY',
      status:'DISCOVERED',
      hypothesis:{
        constraints:x.values,
        associationScore:x.associationScore,
        posteriorWinRate:x.posteriorWinRate,
        shrinkedMeanReturn:x.shrinkedMeanReturn,
        sourceSamples:x.samples,
        interpretation:'ENTRY_CONTEXT_ASSOCIATION_TO_VALIDATE_FORWARD'
      },
      promotionGate:{
        minForwardSamples:30,
        minForwardTradingDays:7,
        requirePositiveExpectancy:true,
        requireRecentPositiveExpectancy:true,
        requireCostStressPass:true,
        requireWinnerRemovalStressPass:true,
        requireRegimeAndSymbolConcentrationCheck:true
      },
      execution:'SHADOW_ONLY',
      canExecuteLive:false
    });
  }
  return finalized({
    version:BIGGJ_ADAPTIVE_LEARNING_VERSION,
    sourceMemoryFingerprint:String(memory?.fingerprint||''),
    experiments,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'AUTONOMOUS_HYPOTHESIS_GENERATION_REQUIRES_FORWARD_SHADOW_VALIDATION_BEFORE_PRIMARY_USE'
  });
}

export function scoreBiggjTradingConsistency(positions=[]){
  const rows=(Array.isArray(positions)?positions:[]).filter(p=>p?.status==='CLOSED'&&finite(realizedRoe(p))!=null).sort((a,b)=>Number(a.closedAt||0)-Number(b.closedAt||0));
  const returns=rows.map(realizedRoe),wins=returns.filter(x=>x>0).length,losses=returns.filter(x=>x<0);
  const gp=returns.filter(x=>x>0).reduce((s,x)=>s+x,0),gl=Math.abs(losses.reduce((s,x)=>s+x,0));
  const profitFactor=gl>0?gp/gl:(gp>0?null:0);
  let equity=0,peak=0,maxDrawdown=0;
  for(const r of returns){equity+=r;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}
  const split=Math.max(1,Math.floor(rows.length*.60));
  const early=returns.slice(0,split),recent=returns.slice(split);
  const earlyMean=mean(early),recentMean=mean(recent);
  const stability=rows.length<6?0:clamp(1-Math.abs(recentMean-earlyMean)/Math.max(.003,Math.abs(earlyMean)+Math.abs(recentMean)));
  const expectancy=mean(returns),sigma=stdev(returns),downsideSigma=stdev(returns.filter(x=>x<0));
  const expectancyScore=clamp(.5+.5*Math.tanh(expectancy/.005));
  const pfScore=profitFactor==null?1:clamp((profitFactor-.7)/1.3);
  const ddScore=clamp(1-maxDrawdown/.12);
  const varianceScore=clamp(1-sigma/.04);
  const score=clamp(.30*expectancyScore+.20*pfScore+.18*ddScore+.12*varianceScore+.12*stability+.08*(rows.length?wins/rows.length:0));
  return finalized({
    version:BIGGJ_ADAPTIVE_LEARNING_VERSION,
    trades:rows.length,
    winRate:rows.length?wins/rows.length:0,
    expectancy,
    profitFactor,
    stdevReturn:sigma,
    downsideStdev:downsideSigma,
    maxCumulativeReturnDrawdown:maxDrawdown,
    temporalStability:stability,
    consistencyScore:score,
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    meaning:'RISK_ADJUSTED_SHADOW_CONSISTENCY_OBJECTIVE_NOT_PROFIT_GUARANTEE'
  });
}
