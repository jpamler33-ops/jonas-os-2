import { sha256 } from './institutional-kernel.mjs';
import { shadowTradeFeatureShape } from './shadow-trade-quality-learner.mjs';

export const LEARNED_CHALLENGER_ENGINE_VERSION='TCX_LEARNED_CHALLENGER_ENGINE_V1';

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
function baselineClosed(ledger){
  return (ledger?.positions||[]).filter(p=>
    p&&p.execution==='SHADOW_ONLY'&&p.canExecuteLive===false&&p.status==='CLOSED'&&
    !['CHALLENGER','LAB_UNCONSTRAINED'].includes(String(p.entryMode||'STANDARD').toUpperCase())&&
    finite(p.realizedReturnPct)!=null&&finite(p.realizedNetPnlQuote)!=null
  );
}
function challengerClosed(ledger,ruleId){
  return (ledger?.positions||[]).filter(p=>
    p&&p.execution==='SHADOW_ONLY'&&p.canExecuteLive===false&&p.status==='CLOSED'&&
    String(p.entryMode||'').toUpperCase()==='CHALLENGER'&&
    String(p.challengerRuleId||'')===String(ruleId)&&
    finite(p.realizedReturnPct)!=null&&finite(p.realizedNetPnlQuote)!=null
  ).sort((a,b)=>Number(a.closedAt||0)-Number(b.closedAt||0));
}
function posterior(rows,{priorStrength=12}={}){
  const n=rows.length;
  const wins=rows.filter(x=>Number(x.realizedNetPnlQuote||0)>0).length;
  const winRate=(wins+.5*priorStrength)/(n+priorStrength);
  const rawMeanReturn=mean(rows.map(x=>Number(x.realizedReturnPct||0)));
  const shrinkedMeanReturn=rawMeanReturn*(n/(n+10));
  return {n,wins,winRate,rawMeanReturn,shrinkedMeanReturn};
}
function parseExactKey(key){
  const [assetClass,side,horizon,probability,edge,expectedReturn]=String(key||'').split('|');
  if(!expectedReturn) return null;
  return {assetClass,side,horizon,probability,edge,expectedReturn};
}
function candidateStatus(rows){
  const all=posterior(rows);
  if(all.n<10) return {status:all.n?'TRIAL':'DISCOVERED',evidence:all,temporal:null};
  const split=Math.floor(all.n/2);
  const early=posterior(rows.slice(0,split));
  const recent=posterior(rows.slice(split));
  const degradation=all.n>=16&&(
    recent.shrinkedMeanReturn<0||
    recent.winRate<early.winRate-.12
  );
  if(degradation) return {status:'DRIFT_WATCH',evidence:all,temporal:{early,recent,degradation:true}};
  if(all.winRate>=.54&&all.shrinkedMeanReturn>0){
    return {status:'QUALIFIED',evidence:all,temporal:{early,recent,degradation:false}};
  }
  if(all.winRate<=.46||all.shrinkedMeanReturn<-.001){
    return {status:'REJECTED',evidence:all,temporal:{early,recent,degradation:false}};
  }
  return {status:'TRIAL',evidence:all,temporal:{early,recent,degradation:false}};
}
function attributionRows(ledger,global){
  const rows=baselineClosed(ledger);
  const dims=['assetClass','side','horizon','probability','edge','expectedReturn'];
  const maps=Object.fromEntries(dims.map(d=>[d,new Map()]));
  for(const p of rows){
    const f=shadowTradeFeatureShape(p);
    for(const d of dims){
      const key=String(f[d]);
      const a=maps[d].get(key)||[];
      a.push(p);maps[d].set(key,a);
    }
  }
  const out=[];
  for(const d of dims){
    for(const [value,xs] of maps[d]){
      if(xs.length<8) continue;
      const s=posterior(xs);
      const winLift=s.winRate-Number(global?.posteriorWinRate||.5);
      const returnLift=s.shrinkedMeanReturn-Number(global?.shrinkedMeanReturn||0);
      const effectScore=clamp(.62*(.5+winLift*2)+.38*(.5+Math.tanh(returnLift/.004)*.5));
      out.push({
        feature:d,value,samples:s.n,posteriorWinRate:s.winRate,
        shrinkedMeanReturn:s.shrinkedMeanReturn,winLift,returnLift,effectScore,
        direction:winLift>0&&returnLift>=0?'POSITIVE':winLift<0&&returnLift<=0?'NEGATIVE':'MIXED'
      });
    }
  }
  return out.sort((a,b)=>Math.abs(b.winLift)+Math.abs(b.returnLift)*40-(Math.abs(a.winLift)+Math.abs(a.returnLift)*40));
}

export function buildLearnedChallengerLab(qualityModel,ledger,{
  asOf=Date.now(),
  minDiscoverySamples=8,
  minWinLift=.02,
  maxRules=12
}={}){
  const global=qualityModel?.global||{posteriorWinRate:.5,shrinkedMeanReturn:0};
  const attributions=attributionRows(ledger,global);
  const rules=[];
  for(const [key,row] of Object.entries(qualityModel?.groups?.EXACT||{})){
    const shape=parseExactKey(key);
    if(!shape||Number(row.samples||0)<minDiscoverySamples) continue;
    const winLift=Number(row.posteriorWinRate||.5)-Number(global.posteriorWinRate||.5);
    const returnLift=Number(row.shrinkedMeanReturn||0)-Number(global.shrinkedMeanReturn||0);
    if(row.label!=='LEARNED_GOOD'||winLift<minWinLift||Number(row.shrinkedMeanReturn||0)<=0) continue;
    const ruleCore={
      shape,
      sourceModelFingerprint:String(qualityModel?.fingerprint||''),
      sourceKey:key,
      engineVersion:LEARNED_CHALLENGER_ENGINE_VERSION
    };
    const ruleId='lc_'+sha256(ruleCore).slice(0,24);
    const forward=challengerClosed(ledger,ruleId);
    const forwardState=candidateStatus(forward);
    const discoveryStrength=clamp(
      .42*Number(row.qualityScore||0)+
      .25*Number(row.confidence||0)+
      .20*clamp(.5+winLift*2)+
      .13*clamp(.5+Math.tanh(returnLift/.004)*.5)
    );
    const why=attributions
      .filter(a=>String(shape[a.feature])===String(a.value))
      .slice(0,3);
    rules.push({
      ruleId,shape,sourceKey:key,
      discovery:{
        samples:Number(row.samples||0),
        posteriorWinRate:Number(row.posteriorWinRate||0),
        shrinkedMeanReturn:Number(row.shrinkedMeanReturn||0),
        qualityScore:Number(row.qualityScore||0),
        confidence:Number(row.confidence||0),
        winLift,returnLift,discoveryStrength
      },
      forward:forwardState.evidence,
      temporal:forwardState.temporal,
      status:forwardState.status,
      why,
      eligible:!['REJECTED','DRIFT_WATCH'].includes(forwardState.status)
    });
  }
  rules.sort((a,b)=>{
    const rank={QUALIFIED:4,TRIAL:3,DISCOVERED:2,DRIFT_WATCH:1,REJECTED:0};
    return (rank[b.status]-rank[a.status])||
      (b.discovery.discoveryStrength-a.discovery.discoveryStrength)||
      (b.discovery.samples-a.discovery.samples);
  });
  const kept=rules.slice(0,Math.max(1,Number(maxRules)||12));
  const core={
    version:LEARNED_CHALLENGER_ENGINE_VERSION,
    asOf:Number(asOf),
    sourceModelFingerprint:String(qualityModel?.fingerprint||''),
    sourceSamples:Number(qualityModel?.samples||0),
    candidateRules:kept,
    featureAttribution:attributions.slice(0,20),
    counts:{
      discovered:kept.filter(x=>x.status==='DISCOVERED').length,
      trial:kept.filter(x=>x.status==='TRIAL').length,
      qualified:kept.filter(x=>x.status==='QUALIFIED').length,
      driftWatch:kept.filter(x=>x.status==='DRIFT_WATCH').length,
      rejected:kept.filter(x=>x.status==='REJECTED').length
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'HISTORICAL_PATTERN_DERIVATION_WITH_FORWARD_SHADOW_CHALLENGER_VALIDATION'
  };
  return freeze({...core,fingerprint:sha256(core)});
}

function safeIssuance(issuance,now,maxAgeMs){
  if(!issuance||issuance.executionMode!=='SHADOW_ONLY'||issuance.action!=='ABSTAIN'||issuance.canExecute!==false){
    return 'ISSUANCE_SAFETY_INVARIANT_INVALID';
  }
  if(!['PASS','CAUTION'].includes(String(issuance.admission?.gate||'').toUpperCase())) return 'ADMISSION_NOT_ELIGIBLE';
  if(issuance.probabilityDisplayAllowed!==true) return 'PROBABILITY_NOT_ADMITTED';
  if(String(issuance.trace?.safety?.state||'UNKNOWN').toUpperCase()!=='NORMAL') return 'DATA_SAFETY_NOT_NORMAL';
  const generatedAt=finite(issuance.generatedAt);
  if(generatedAt==null||now<generatedAt||now-generatedAt>maxAgeMs) return 'FORECAST_STALE_OR_INVALID';
  return null;
}

export function deriveLearnedChallengerTrades(issuance,lab,{
  now=Date.now(),
  assetClass='CORE',
  baseNotionalQuote=10,
  maxCandidates=2,
  maxAgeMs=10*60_000,
  regimeBrain=null,
  stressLab=null
}={}){
  const blocked=safeIssuance(issuance,Number(now),Math.max(1,Number(maxAgeMs)||1));
  if(blocked) return freeze({version:LEARNED_CHALLENGER_ENGINE_VERSION,candidates:[],reason:blocked,execution:'SHADOW_ONLY',canExecuteLive:false});
  const cls=String(assetClass||'CORE').toUpperCase();
  const rules=(lab?.candidateRules||[]).filter(r=>r.eligible&&r.shape?.assetClass===cls);
  const candidates=[];
  for(const h of Array.isArray(issuance.forecast?.horizons)?issuance.forecast.horizons:[]){
    if(
      String(h?.gate||'').toUpperCase()!=='PASS'||
      h?.display?.probabilityDisplayAllowed!==true||
      String(h?.calibration?.status||'').toUpperCase()!=='CALIBRATED'||
      !['UP','DOWN'].includes(String(h?.direction||'').toUpperCase())
    ) continue;
    const direction=String(h.direction).toUpperCase();
    const p=h.display?.probabilities||h.probabilities||{};
    const directionalProbability=finite(direction==='UP'?p.up:p.down);
    const oppositeProbability=finite(direction==='UP'?p.down:p.up);
    const expectedReturn=finite(h.expectedReturn);
    if([directionalProbability,oppositeProbability,expectedReturn].some(x=>x==null)) continue;
    const side=direction==='UP'?'BUY':'SELL';
    const shape=shadowTradeFeatureShape({
      assetClass:cls,
      side:side==='BUY'?'LONG':'SHORT',
      horizonMs:Number(h.horizonMs||0),
      directionalProbability,
      probabilityEdge:directionalProbability-oppositeProbability,
      expectedReturn
    });
    for(const rule of rules){
      if(JSON.stringify(rule.shape)!==JSON.stringify(shape)) continue;
      const statusMultiplier=rule.status==='QUALIFIED'?1:rule.status==='TRIAL'?.75:.5;
      const regimeDecision=typeof regimeBrain?.decisionForRule==='function'
        ?regimeBrain.decisionForRule(rule.ruleId)
        :{status:'NOT_APPLIED',multiplier:1,reason:'REGIME_BRAIN_NOT_REQUESTED',samples:0};
      if(Number(regimeDecision?.multiplier||0)<=0) continue;
      const stressDecision=typeof stressLab?.decisionForRule==='function'
        ?stressLab.decisionForRule(rule.ruleId)
        :{status:'NOT_APPLIED',multiplier:1,reason:'STRESS_LAB_NOT_REQUESTED',samples:0,robustnessScore:0};
      if(Number(stressDecision?.multiplier??1)<=0) continue;
      const core={
        issuanceId:String(issuance.issuanceId||''),
        forecastFingerprint:String(issuance.forecastFingerprint||issuance.forecast?.fingerprint||''),
        ruleId:rule.ruleId,
        horizonId:String(h.horizonId||''),
        symbol:String(issuance.symbol||'').toUpperCase(),
        side,
        engineVersion:LEARNED_CHALLENGER_ENGINE_VERSION
      };
      candidates.push({
        ...core,
        challengerDecisionKey:sha256(core),
        horizonMs:Number(h.horizonMs||0),
        expectedReturn,
        directionalProbability,
        probabilityEdge:directionalProbability-oppositeProbability,
        ruleStatus:rule.status,
        discoveryStrength:rule.discovery.discoveryStrength,
        sourceSamples:rule.discovery.samples,
        forwardSamples:rule.forward.n,
        why:rule.why,
        regimeStatus:String(regimeDecision?.status||'UNKNOWN'),
        regimeSamples:Number(regimeDecision?.samples||0),
        regimeMultiplier:Number(regimeDecision?.multiplier||.65),
        regimeReason:String(regimeDecision?.reason||'UNKNOWN'),
        stressStatus:String(stressDecision?.status||'UNKNOWN'),
        stressSamples:Number(stressDecision?.samples||0),
        stressMultiplier:Number(stressDecision?.multiplier??1),
        stressRobustnessScore:Number(stressDecision?.robustnessScore||0),
        stressReason:String(stressDecision?.reason||'UNKNOWN'),
        stressFailedChecks:Array.isArray(stressDecision?.failedChecks)?[...stressDecision.failedChecks]:[],
        notionalQuote:Math.max(1,Number(baseNotionalQuote)||10)
          *statusMultiplier
          *Number(regimeDecision?.multiplier||.65)
          *Number(stressDecision?.multiplier??1),
        generatedAt:Number(issuance.generatedAt),
        admissionGate:String(issuance.admission?.gate||'').toUpperCase(),
        execution:'SHADOW_ONLY',
        action:'ABSTAIN',
        canExecuteLive:false
      });
    }
  }
  candidates.sort((a,b)=>{
    const rank={QUALIFIED:3,TRIAL:2,DISCOVERED:1};
    return (rank[b.ruleStatus]-rank[a.ruleStatus])||(b.discoveryStrength-a.discoveryStrength);
  });
  return freeze({
    version:LEARNED_CHALLENGER_ENGINE_VERSION,
    candidates:candidates.slice(0,Math.max(1,Number(maxCandidates)||2)),
    reason:candidates.length?'CHALLENGERS_MATCHED':'NO_LEARNED_RULE_MATCH',
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function learnedChallengerSummary(lab){
  const top=lab?.candidateRules?.[0]||null;
  const strongest=(lab?.featureAttribution||[])[0]||null;
  return freeze({
    version:LEARNED_CHALLENGER_ENGINE_VERSION,
    sourceSamples:Number(lab?.sourceSamples||0),
    ruleCount:Number(lab?.candidateRules?.length||0),
    counts:lab?.counts||{},
    topRule:top?{
      ruleId:top.ruleId,status:top.status,shape:top.shape,
      discoveryStrength:top.discovery.discoveryStrength,
      sourceSamples:top.discovery.samples,forwardSamples:top.forward.n
    }:null,
    strongestFeature:strongest,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}
