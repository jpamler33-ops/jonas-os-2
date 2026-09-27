import { episodeDistance, episodeVector } from './episode-memory.mjs';

function clamp(x,a=0,b=1){ return Math.max(a,Math.min(b,x)); }
function finite(x,fallback=0){ const n=Number(x); return Number.isFinite(n)?n:fallback; }
function mean(xs){ return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0; }

export function pressureBand(score){
  const x=finite(score,0);
  return x>=65?'HIGH':x>=35?'MEDIUM':'LOW';
}

export function transitionStateKey(vector){
  return [
    String(vector?.regime||'UNKNOWN'),
    String(vector?.localTrend||'UNKNOWN'),
    String(vector?.flow||'UNKNOWN'),
    String(vector?.liquidity||'UNKNOWN'),
    pressureBand(vector?.pressureScore),
    String(vector?.patternStage||'NONE'),
    String(vector?.patternSide||'NONE')
  ].join('|');
}

export function mechanismChannels(vector){
  const spread=clamp(finite(vector?.spreadBps)/8);
  const imbalance=clamp(Math.abs(finite(vector?.imbalance)));
  const atr=clamp(finite(vector?.atrPct)/2);
  const volume=clamp((finite(vector?.volumeRatio)-1)/3);
  const emaGap=clamp(Math.abs(finite(vector?.emaGapPct))/2);
  const bias=clamp(Math.abs(finite(vector?.biasScore))/6);
  const supportNear=clamp(1-finite(vector?.supportDistancePct,3)/3);
  const resistanceNear=clamp(1-finite(vector?.resistanceDistancePct,3)/3);

  const liquidityStress=clamp(0.60*spread+0.40*atr);
  const forcedFlow=clamp(0.58*imbalance+0.42*volume);
  const reflexiveAlignment=clamp(0.42*bias+0.33*emaGap+0.25*volume);
  const boundaryCompression=clamp(0.50*Math.max(supportNear,resistanceNear)+0.30*atr+0.20*volume);

  const localTrend=String(vector?.localTrend||'UNKNOWN');
  const flow=String(vector?.flow||'UNKNOWN');
  const flowTrendConflict=
    (flow==='BID_PRESSURE'&&localTrend==='BEARISH') ||
    (flow==='ASK_PRESSURE'&&localTrend==='BULLISH');

  const absorption=clamp(
    0.55*imbalance +
    0.25*(1-emaGap) +
    0.20*(flowTrendConflict?1:0)
  );

  const cascadeRisk=clamp(
    0.27*liquidityStress+
    0.30*forcedFlow+
    0.23*reflexiveAlignment+
    0.20*atr
  );

  return {
    LIQUIDITY_STRESS:liquidityStress,
    FORCED_FLOW:forcedFlow,
    REFLEXIVE_ALIGNMENT:reflexiveAlignment,
    BOUNDARY_COMPRESSION:boundaryCompression,
    ABSORPTION:absorption,
    CASCADE_RISK:cascadeRisk
  };
}

export function evidenceAudit(vector,channels,witnessReport=null){
  const modalities={
    ORDERBOOK:Number.isFinite(Number(vector?.spreadBps))&&Number.isFinite(Number(vector?.imbalance)),
    PRICE_STRUCTURE:['BULLISH','BEARISH','NEUTRAL'].includes(String(vector?.localTrend)),
    VOLATILITY:Number.isFinite(Number(vector?.atrPct))&&Number.isFinite(Number(vector?.realizedVolPct)),
    VOLUME:Number.isFinite(Number(vector?.volumeRatio)),
    MULTI_TIMEFRAME:Number.isFinite(Number(vector?.biasScore))
  };
  const coverage=Object.values(modalities).filter(Boolean).length/Object.keys(modalities).length;

  const conflictFlags=[];
  const flow=String(vector?.flow||'UNKNOWN');
  const trend=String(vector?.localTrend||'UNKNOWN');
  const bias=finite(vector?.biasScore,0);
  if(flow==='BID_PRESSURE'&&trend==='BEARISH') conflictFlags.push('FLOW_VS_TREND');
  if(flow==='ASK_PRESSURE'&&trend==='BULLISH') conflictFlags.push('FLOW_VS_TREND');
  if(bias>=3&&trend==='BEARISH') conflictFlags.push('MTF_VS_LOCAL');
  if(bias<=-3&&trend==='BULLISH') conflictFlags.push('MTF_VS_LOCAL');
  if(finite(vector?.spreadBps)>4&&finite(vector?.pressureScore)<35) conflictFlags.push('SPREAD_VS_PRESSURE');
  if(finite(vector?.volumeRatio)<0.7&&channels.FORCED_FLOW>0.65) conflictFlags.push('FLOW_WITHOUT_VOLUME');

  const baseContradiction=clamp(conflictFlags.length/4);
  const witnessConflicts=(witnessReport?.contradictions||[])
    .filter(x=>!String(x).startsWith('QUOTE_BASIS_RISK_'));
  const witnessDenom=Math.max(2,Number(witnessReport?.externalWitnessCount||0)*2);
  const witnessContradiction=clamp(witnessConflicts.length/witnessDenom);
  const contradictionScore=witnessReport
    ? clamp(baseContradiction*0.70+witnessContradiction*0.30)
    : baseContradiction;

  return {
    modalities,
    modalityCoverage:coverage,
    contradictionScore,
    baseContradiction,
    witnessContradiction,
    conflictFlags:[...new Set([...conflictFlags,...witnessConflicts])],
    sourceIndependence:witnessReport?.sourceIndependence||'SINGLE_PROVIDER_MULTI_MODALITY',
    independentWitnessSatisfied:witnessReport?.independentWitnessSatisfied===true,
    witnessAgreement:finite(witnessReport?.agreementScore,0),
    witnessCoverage:Number(witnessReport?.externalWitnessCount||0),
    witnessCaveats:witnessReport?.caveats||[]
  };
}

function successorAt(episodes,index,horizonMs,toleranceMs){
  const base=episodes[index];
  for(let j=index+1;j<episodes.length;j++){
    const dt=Number(episodes[j].anchorCloseTime)-Number(base.anchorCloseTime);
    if(dt<horizonMs-toleranceMs) continue;
    if(dt>horizonMs+toleranceMs) return null;
    return episodes[j];
  }
  return null;
}

export function buildTransitionObservations(episodes,{symbol=null,horizonMinutes=15,toleranceMinutes=7.5}={}){
  const xs=episodes
    .filter(e=>!symbol||e.symbol===symbol)
    .filter(e=>e?.vector&&Number.isFinite(Number(e.anchorCloseTime)))
    .sort((a,b)=>a.anchorCloseTime-b.anchorCloseTime);
  const horizonMs=horizonMinutes*60_000;
  const toleranceMs=toleranceMinutes*60_000;
  const out=[];
  for(let i=0;i<xs.length;i++){
    const next=successorAt(xs,i,horizonMs,toleranceMs);
    if(!next) continue;
    out.push({
      from:xs[i],
      to:next,
      deltaMinutes:(next.anchorCloseTime-xs[i].anchorCloseTime)/60_000,
      fromKey:transitionStateKey(xs[i].vector),
      toKey:transitionStateKey(next.vector)
    });
  }
  return out;
}

function entropy(counts){
  const total=[...counts.values()].reduce((a,b)=>a+b,0);
  if(total<=1) return 0;
  let h=0;
  for(const n of counts.values()){
    const p=n/total;
    h-=p*Math.log2(p);
  }
  return h;
}

export function queryTransitionLattice(currentVector,episodes,{
  symbol=null,
  horizonMinutes=15,
  k=24,
  maxDistance=0.55,
  minSupport=5
}={}){
  const obs=buildTransitionObservations(episodes,{symbol,horizonMinutes});
  const candidates=obs
    .map(o=>({obs:o,distance:episodeDistance(currentVector,o.from.vector)}))
    .filter(x=>x.distance<=maxDistance)
    .sort((a,b)=>a.distance-b.distance)
    .slice(0,k);

  const counts=new Map();
  for(const x of candidates) counts.set(x.obs.toKey,(counts.get(x.obs.toKey)||0)+1);
  const ranked=[...counts.entries()]
    .map(([state,n])=>({state,count:n,share:candidates.length?n/candidates.length:0}))
    .sort((a,b)=>b.count-a.count);

  const rawEntropy=entropy(counts);
  const maxEntropy=counts.size>1?Math.log2(counts.size):1;
  const normalizedEntropy=counts.size<=1?0:clamp(rawEntropy/maxEntropy);

  const nearestDistance=candidates[0]?.distance ?? 1;
  const novelty=clamp(nearestDistance/0.55);
  const support=candidates.length;
  const supportScore=clamp(support/Math.max(minSupport*2,10));
  const concentration=ranked[0]?.share ?? 0;
  const transitionCoherence=clamp(
    0.45*(1-normalizedEntropy)+
    0.35*concentration+
    0.20*supportScore
  );

  return {
    horizonMinutes,
    support,
    nearestDistance,
    novelty,
    transitionEntropy:normalizedEntropy,
    transitionCoherence,
    states:ranked.slice(0,5),
    sufficient:support>=minSupport&&novelty<=0.75,
    epistemic:'OBSERVATIONAL_TRANSITION_EVIDENCE'
  };
}

export function mechanismHypothesis(vector,channels,audit,lattice){
  const ranked=Object.entries(channels).sort((a,b)=>b[1]-a[1]);
  const [candidate,score]=ranked[0]||['NONE',0];

  const evidenceStrength=clamp(
    0.32*audit.modalityCoverage+
    0.28*(1-audit.contradictionScore)+
    0.20*(1-lattice.novelty)+
    0.20*lattice.transitionCoherence
  );

  let gate='INSUFFICIENT_EVIDENCE';
  if(lattice.support>=8&&evidenceStrength>=0.65&&audit.contradictionScore<=0.25){
    gate='HYPOTHESIS_SUPPORTED';
  }
  if(audit.independentWitnessSatisfied&&gate==='HYPOTHESIS_SUPPORTED'&&lattice.transitionCoherence>=0.70){
    gate='IDENTIFIABILITY_REVIEW';
  }

  return {
    candidate,
    candidateScore:score,
    evidenceStrength,
    gate,
    causalStatus:'NOT_IDENTIFIED',
    independentWitnessSatisfied:audit.independentWitnessSatisfied,
    reason:gate==='IDENTIFIABILITY_REVIEW'
      ? 'multi-venue independent witness + historical transition coherence qualifies the hypothesis for identifiability review; causal status remains not identified'
      : gate==='HYPOTHESIS_SUPPORTED'
        ? (audit.sourceIndependence==='SINGLE_PROVIDER_MULTI_MODALITY'
            ? 'multiple modalities + historical transition coherence; still single-provider observational evidence'
            : 'multiple modalities + partial cross-venue support; identifiability requirements still incomplete')
        : 'evidence, support, novelty, contradiction, or witness requirements not met'
  };
}

export function runMechanismTransitionEngine({analysis,dashboard,episodes,symbol,horizonMinutes=15,witnessReport=null}){
  const vector=episodeVector({analysis,dashboard});
  const channels=mechanismChannels(vector);
  const audit=evidenceAudit(vector,channels,witnessReport);
  const lattice=queryTransitionLattice(vector,episodes,{symbol,horizonMinutes});
  const hypothesis=mechanismHypothesis(vector,channels,audit,lattice);
  return {
    version:'MTL_V1',
    vector,
    channels,
    audit,
    lattice,
    hypothesis,
    witnessReport,
    action:'ABSTAIN',
    execution:'SHADOW_ONLY'
  };
}
