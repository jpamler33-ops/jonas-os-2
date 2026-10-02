import {readFile,writeFile,rename} from 'node:fs/promises';

export const MEMECOIN_EVIDENCE_FACTORY_VERSION='BIGGJ_MEMECOIN_EVIDENCE_FACTORY_V1';
export const MEMECOIN_RETURN_QUALITY_GUARD_VERSION='BIGGJ_MEME_RETURN_QUALITY_GUARD_V1';
export const MEMECOIN_RETURN_MAX_PRICE_RATIO=1_000_000;

export const MEMECOIN_EVIDENCE_HORIZONS=Object.freeze({
  '5m':5*60_000,
  '15m':15*60_000,
  '30m':30*60_000,
  '1h':60*60_000,
  '4h':4*60*60_000,
  '12h':12*60*60_000,
  '24h':24*60*60_000
});

const HORIZON_TOLERANCE=Object.freeze({
  '5m':4*60_000,
  '15m':6*60_000,
  '30m':10*60_000,
  '1h':20*60_000,
  '4h':50*60_000,
  '12h':90*60_000,
  '24h':3*60*60_000
});

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function text(v,max=180){
  const s=String(v??'').replace(/\s+/g,' ').trim();
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,Number(v)||0));}
function keyOf(chainId,tokenAddress){
  const c=String(chainId||'').trim().toLowerCase();
  const a=String(tokenAddress||'').trim();
  if(!c||!a)return '';
  return c+':'+(c==='solana'?a:a.toLowerCase());
}
function returnQuality(entry,price){
  const e=finite(entry),p=finite(price);
  if(!(e>0)||!(p>0))return {
    valid:false,reason:'NON_POSITIVE_OR_MISSING_PRICE',return:null,rawReturn:null,priceRatio:null,absLogMove:null
  };
  const priceRatio=p/e;
  const rawReturn=priceRatio-1;
  const absLogMove=Math.abs(Math.log(priceRatio));
  if(!Number.isFinite(priceRatio)||!Number.isFinite(rawReturn)||!Number.isFinite(absLogMove))return {
    valid:false,reason:'NON_FINITE_PRICE_RATIO',return:null,rawReturn:Number.isFinite(rawReturn)?rawReturn:null,
    priceRatio:Number.isFinite(priceRatio)?priceRatio:null,absLogMove:Number.isFinite(absLogMove)?absLogMove:null
  };
  if(absLogMove>Math.log(MEMECOIN_RETURN_MAX_PRICE_RATIO))return {
    valid:false,reason:'EXTREME_PRICE_RATIO_QUARANTINED',return:null,rawReturn,priceRatio,absLogMove
  };
  return {valid:true,reason:null,return:rawReturn,rawReturn,priceRatio,absLogMove};
}
function ret(entry,price){
  const q=returnQuality(entry,price);
  return q.valid?q.return:null;
}
function mean(xs=[]){
  const a=xs.filter(Number.isFinite);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
}
function median(xs=[]){
  const a=xs.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if(!a.length)return null;
  const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function ageMinutes(row,now){
  const direct=finite(row?.score?.ageMinutes);
  if(direct!=null)return direct;
  const p=finite(row?.pairCreatedAt);
  return p==null?null:Math.max(0,(Number(now)-p)/60_000);
}
function ageBin(v){
  const x=finite(v);
  if(x==null)return 'AGE_UNKNOWN';
  if(x<5)return 'AGE_LT5';
  if(x<10)return 'AGE_5_10';
  if(x<20)return 'AGE_10_20';
  if(x<60)return 'AGE_20_60';
  if(x<360)return 'AGE_1_6H';
  return 'AGE_6HP';
}
function liqBin(v){
  const x=finite(v);
  if(x==null)return 'LIQ_UNKNOWN';
  if(x<10_000)return 'LIQ_LT10K';
  if(x<25_000)return 'LIQ_10_25K';
  if(x<75_000)return 'LIQ_25_75K';
  if(x<250_000)return 'LIQ_75_250K';
  if(x<1_000_000)return 'LIQ_250K_1M';
  return 'LIQ_1MP';
}
function pressureBin(buys,sells){
  const b=Math.max(0,finite(buys)??0),s=Math.max(0,finite(sells)??0),n=b+s;
  if(n<3)return 'PRESSURE_LOW_SAMPLE';
  const r=s>0?b/s:(b>0?99:1);
  if(r<.65)return 'PRESSURE_SELL';
  if(r<1.25)return 'PRESSURE_BALANCED';
  if(r<2)return 'PRESSURE_BUY';
  return 'PRESSURE_STRONG_BUY';
}
function attentionBin(row={}){
  const direct=row?.directSocialAttention||{};
  const band=String(direct?.attentionBand||'').toUpperCase();
  if(band==='SPIKING')return 'ATTN_SPIKING';
  if(band==='RISING')return 'ATTN_RISING';
  const signals=new Set(row?.score?.attentionSignals||[]);
  if(signals.has('SOCIAL_HIGH_REACH_AUTHOR'))return 'ATTN_HIGH_REACH';
  if(signals.has('X_DIRECT_POST')||signals.has('BLUESKY_DIRECT_POST')||signals.has('SOCIAL_POSTS_RECENT'))return 'ATTN_DIRECT';
  if(signals.has('NEW_BOOST')||signals.has('COMMUNITY_TAKEOVER'))return 'ATTN_DEX_EVENT';
  return signals.size?'ATTN_LIGHT':'ATTN_NONE';
}
function discoverySignals(row={}){
  const out=[];
  if(row?.signalNewPool)out.push('NEW_POOL');
  if(row?.signalProfile)out.push('DEX_PROFILE');
  if(row?.signalBoost)out.push('DEX_BOOST');
  if(row?.signalTakeover)out.push('COMMUNITY_TAKEOVER');
  if(row?.signalAd)out.push('DEX_AD');
  if(row?.socialDiscoverySeed)out.push('DIRECT_SOCIAL_SEED');
  if(Number(row?.externalAttentionCount||0)>0)out.push('EXTERNAL_MENTION');
  if(Number(row?.directSocialAttention?.posts||0)>0)out.push('DIRECT_SOCIAL_MATCH');
  return out;
}
function discoveryBin(f={}){
  const s=new Set(f?.discoverySignals||[]);
  if(s.has('DIRECT_SOCIAL_SEED'))return 'DISCOVERY_SOCIAL_SEED';
  if(s.has('NEW_POOL'))return 'DISCOVERY_NEW_POOL';
  if(s.has('DEX_BOOST'))return 'DISCOVERY_BOOST';
  if(s.has('DEX_PROFILE'))return 'DISCOVERY_PROFILE';
  if(s.has('DIRECT_SOCIAL_MATCH'))return 'DISCOVERY_SOCIAL_MATCH';
  return 'DISCOVERY_RADAR';
}
function snapshotFeatures(row={},now=Date.now()){
  const security=row?.security||{};
  return {
    chainId:String(row?.chainId||'').toLowerCase(),
    pairAddress:text(row?.pairAddress,200)||null,
    dexId:text(row?.dexId,80)||null,
    stage:String(row?.score?.stage||'UNKNOWN').toUpperCase(),
    discoverySignals:discoverySignals(row),
    socialDiscoverySource:text(row?.socialDiscoverySeed?.source,120)||null,
    xLinked:row?.xLinked===true,
    websiteLinked:row?.websiteLinked===true,
    researchPriorityScore:finite(row?.score?.researchPriorityScore),
    ageMinutes:ageMinutes(row,now),
    liquidityUsd:finite(row?.liquidityUsd),
    marketCap:finite(row?.marketCap),
    fdv:finite(row?.fdv),
    volumeM5:finite(row?.volumeM5),
    volumeH1:finite(row?.volumeH1),
    buysM5:finite(row?.buysM5),
    sellsM5:finite(row?.sellsM5),
    priceChangeM5:finite(row?.priceChangeM5),
    priceChangeH1:finite(row?.priceChangeH1),
    socialPosts:finite(row?.directSocialAttention?.posts),
    socialAuthors:finite(row?.directSocialAttention?.uniqueAuthors),
    socialEngagement:finite(row?.directSocialAttention?.engagement),
    socialAttentionBand:text(row?.directSocialAttention?.attentionBand,40)||null,
    attentionSignals:clone(row?.score?.attentionSignals||[]),
    riskFlags:clone(row?.score?.riskFlags||[]),
    securityGate:String(security?.evidenceGate||'UNKNOWN').toUpperCase(),
    securitySource:text(security?.source,160)||null,
    holderTop10Share:finite(security?.holderState?.top10Share),
    largestHolderShare:finite(security?.holderState?.largestHolderShare),
    holderFallbackUsed:security?.coverage?.holderConcentrationIndependent===true||Boolean(security?.independentHolderEvidence),
    holderEvidenceSource:text(security?.independentHolderEvidence?.source||security?.holderState?.independentSource,160)||null,
    memeLearningAction:String(row?.memeLearning?.action||'NEUTRAL').toUpperCase()
  };
}
function initialCase(row,now){
  const key=keyOf(row?.chainId,row?.tokenAddress),px=finite(row?.priceUsd);
  if(!key||!(px>0))return null;
  return {
    key,
    chainId:String(row?.chainId||'').toLowerCase(),
    tokenAddress:String(row?.tokenAddress||''),
    pairAddress:text(row?.pairAddress,200)||null,
    symbol:text(row?.symbol||row?.name||'',80),
    name:text(row?.name||'',120),
    discoveredAt:Number(now),
    firstSeenAt:finite(row?.firstSeenAt)??Number(now),
    pairCreatedAt:finite(row?.pairCreatedAt),
    initialPriceUsd:px,
    initial:snapshotFeatures(row,now),
    observations:{},
    observationCount:0,
    lastSeenAt:Number(now),
    lastPriceUsd:px,
    lastFollowupAttemptAt:null,
    followupFailures:0,
    lastFollowupError:null
  };
}
function candidateHorizon(rec,now,horizons=MEMECOIN_EVIDENCE_HORIZONS){
  const elapsed=Math.max(0,Number(now)-Number(rec?.discoveredAt||now));
  const candidates=Object.entries(horizons)
    .filter(([label,target])=>!rec?.observations?.[label]&&elapsed>=Number(target))
    .map(([label,target])=>{
      const lateBy=elapsed-Number(target);
      const tolerance=Number(HORIZON_TOLERANCE[label]??Math.max(60_000,target*.25));
      return {label,targetMs:Number(target),elapsedMs:elapsed,lateByMs:lateBy,toleranceMs:tolerance,onTime:lateBy<=tolerance};
    });
  if(!candidates.length)return null;
  const onTime=candidates.filter(x=>x.onTime).sort((a,b)=>a.lateByMs-b.lateByMs);
  if(onTime.length)return onTime[0];
  return candidates.sort((a,b)=>a.lateByMs-b.lateByMs)[0];
}
function recordObservation(rec,row,now,horizons=MEMECOIN_EVIDENCE_HORIZONS){
  const px=finite(row?.priceUsd);
  if(!(px>0))return {updated:false,horizon:null};
  rec.lastSeenAt=Number(now);rec.lastPriceUsd=px;
  const due=candidateHorizon(rec,now,horizons);
  if(!due)return {updated:false,horizon:null};
  rec.observations??={};
  const rq=returnQuality(rec.initialPriceUsd,px);
  rec.observations[due.label]={
    targetMs:due.targetMs,
    observedAt:Number(now),
    elapsedMs:due.elapsedMs,
    lateByMs:due.lateByMs,
    quality:due.onTime?'ON_TIME':'LATE',
    priceUsd:px,
    returnFromInitial:rq.valid?rq.return:null,
    returnFromInitialRaw:rq.rawReturn,
    returnQuality:rq.valid?'VALID':rq.reason,
    priceRatioFromInitial:rq.priceRatio,
    liquidityUsd:finite(row?.liquidityUsd),
    marketCap:finite(row?.marketCap),
    volumeM5:finite(row?.volumeM5),
    buysM5:finite(row?.buysM5),
    sellsM5:finite(row?.sellsM5),
    priceChangeM5:finite(row?.priceChangeM5)
  };
  rec.observationCount=Object.keys(rec.observations).length;
  rec.lastFollowupError=null;
  return {updated:true,horizon:due.label,quality:due.onTime?'ON_TIME':'LATE'};
}
function stateFrom(input){
  if(input?.version===MEMECOIN_EVIDENCE_FACTORY_VERSION&&Array.isArray(input.cases)){
    return {
      version:MEMECOIN_EVIDENCE_FACTORY_VERSION,
      updatedAt:finite(input.updatedAt),
      cases:clone(input.cases)
    };
  }
  return {version:MEMECOIN_EVIDENCE_FACTORY_VERSION,updatedAt:null,cases:[]};
}
function patternShape(c){
  const f=c?.initial||{};
  return {
    chain:String(f.chainId||c?.chainId||'unknown'),
    stage:String(f.stage||'UNKNOWN'),
    age:ageBin(f.ageMinutes),
    liq:liqBin(f.liquidityUsd),
    pressure:pressureBin(f.buysM5,f.sellsM5),
    attention:attentionBin({score:{attentionSignals:f.attentionSignals||[]},directSocialAttention:{attentionBand:f.socialAttentionBand}}),
    security:String(f.securityGate||'UNKNOWN'),
    discovery:discoveryBin(f)
  };
}
function patternKeys(c){
  const s=patternShape(c);
  return [
    ['CONTEXT',[s.chain,s.stage,s.age,s.liq,s.pressure].join('|')],
    ['CORE',[s.chain,s.stage,s.liq].join('|')],
    ['SECURITY',[s.chain,s.security,s.liq].join('|')],
    ['DISCOVERY',[s.chain,s.discovery,s.stage,s.liq].join('|')]
  ];
}
function outcomeAt(c,label){
  const o=c?.observations?.[label];
  if(!o||o.quality!=='ON_TIME')return null;
  const q=returnQuality(c?.initialPriceUsd,o?.priceUsd);
  return q.valid?q.return:null;
}
function aggregatePattern(rows,horizon){
  const vals=rows.map(x=>outcomeAt(x,horizon)).filter(Number.isFinite);
  const severe=vals.filter(x=>x<=-.45).length;
  const moon=vals.filter(x=>x>=1.5).length;
  return {
    samples:vals.length,
    averageReturn:mean(vals),
    medianReturn:median(vals),
    positiveRate:vals.length?vals.filter(x=>x>0).length/vals.length:null,
    severeLossRate:vals.length?severe/vals.length:null,
    moonshotRate:vals.length?moon/vals.length:null
  };
}
function walkForwardPatterns(cases,{horizon='1h',minTrain=20,minValidate=8,limit=8}={}){
  const mature=cases.filter(c=>Number.isFinite(outcomeAt(c,horizon))).sort((a,b)=>Number(a.discoveredAt)-Number(b.discoveredAt));
  if(mature.length<minTrain+minValidate)return {
    horizon,status:'INSUFFICIENT_SAMPLE',matureCases:mature.length,minTrain,minValidate,patterns:[]
  };
  const split=Math.max(minTrain,Math.floor(mature.length*.7));
  const train=mature.slice(0,split),validate=mature.slice(split);
  const trainMap=new Map(),validateMap=new Map();
  for(const c of train)for(const [level,key] of patternKeys(c)){const k=level+':'+key;const a=trainMap.get(k)||[];a.push(c);trainMap.set(k,a);}
  for(const c of validate)for(const [level,key] of patternKeys(c)){const k=level+':'+key;const a=validateMap.get(k)||[];a.push(c);validateMap.set(k,a);}
  const patterns=[];
  for(const [k,tr] of trainMap){
    const va=validateMap.get(k)||[];
    const trainStats=aggregatePattern(tr,horizon),validationStats=aggregatePattern(va,horizon);
    if(trainStats.samples<minTrain||validationStats.samples<minValidate)continue;
    const trainSign=Math.sign(trainStats.averageReturn||0),validationSign=Math.sign(validationStats.averageReturn||0);
    const directionConsistent=trainSign!==0&&trainSign===validationSign;
    const severeConsistent=trainStats.severeLossRate!=null&&validationStats.severeLossRate!=null&&
      Math.abs(trainStats.severeLossRate-validationStats.severeLossRate)<=.25;
    const validated=directionConsistent&&severeConsistent;
    patterns.push({
      pattern:k,train:trainStats,validation:validationStats,
      validated,
      status:validated?'WALK_FORWARD_VALIDATED':'FAILED_VALIDATION',
      decisionAuthority:false
    });
  }
  patterns.sort((a,b)=>{
    if(a.validated!==b.validated)return a.validated?-1:1;
    return (b.validation.samples-a.validation.samples)||
      Math.abs(b.validation.averageReturn||0)-Math.abs(a.validation.averageReturn||0);
  });
  return {
    horizon,status:patterns.some(x=>x.validated)?'VALIDATED_PATTERNS_PRESENT':'NO_VALIDATED_PATTERN',
    matureCases:mature.length,trainCases:train.length,validationCases:validate.length,
    minTrain,minValidate,patterns:patterns.slice(0,limit)
  };
}
function discreteCheckpointSimulation(c,{entryLabel=null,stop=-.45,take=1.5}={}){
  const labels=Object.keys(MEMECOIN_EVIDENCE_HORIZONS);
  const entryPrice=entryLabel?finite(c?.observations?.[entryLabel]?.priceUsd):finite(c?.initialPriceUsd);
  const entryTime=entryLabel?finite(c?.observations?.[entryLabel]?.observedAt):finite(c?.discoveredAt);
  if(!(entryPrice>0)||entryTime==null)return null;
  const obs=labels.map(label=>({label,...(c?.observations?.[label]||{})}))
    .filter(x=>x.quality==='ON_TIME'&&finite(x.priceUsd)>0&&finite(x.observedAt)>entryTime)
    .sort((a,b)=>Number(a.observedAt)-Number(b.observedAt));
  if(!obs.length)return null;
  let maxRet=-Infinity,minRet=Infinity,exit=null,largestRawAbsReturn=null;
  const quarantineReasons=[];
  for(const o of obs){
    const q=returnQuality(entryPrice,o.priceUsd);
    if(Number.isFinite(q.rawReturn)){
      const abs=Math.abs(q.rawReturn);
      largestRawAbsReturn=largestRawAbsReturn==null?abs:Math.max(largestRawAbsReturn,abs);
    }
    if(!q.valid){
      quarantineReasons.push(q.reason);
      continue;
    }
    const r=q.return;
    maxRet=Math.max(maxRet,r);minRet=Math.min(minRet,r);
    if(!exit&&(r<=stop||r>=take))exit={label:o.label,return:r,reason:r<=stop?'STOP_CHECKPOINT':'TAKE_CHECKPOINT'};
  }
  const last=obs[obs.length-1],finalQ=returnQuality(entryPrice,last.priceUsd);
  if(!finalQ.valid)quarantineReasons.push(finalQ.reason);
  const uniqueReasons=[...new Set(quarantineReasons.filter(Boolean))];
  const quarantined=uniqueReasons.length>0;
  return {
    entryLabel:entryLabel||'INITIAL',
    observations:obs.length,
    finalLabel:last.label,
    finalReturn:quarantined?null:finalQ.return,
    rawFinalReturn:finalQ.rawReturn,
    maxObservedReturn:quarantined?null:(Number.isFinite(maxRet)?maxRet:null),
    minObservedReturn:quarantined?null:(Number.isFinite(minRet)?minRet:null),
    checkpointExit:quarantined?null:exit,
    dataQuality:quarantined?'QUARANTINED':'VALID',
    quarantineReasons:uniqueReasons,
    largestRawAbsReturn,
    semantics:'DISCRETE_CHECKPOINT_APPROXIMATION_NOT_INTRABAR_PATH'
  };
}
function counterfactualAggregate(cases,entryLabel=null){
  const sims=cases.map(c=>discreteCheckpointSimulation(c,{entryLabel})).filter(Boolean);
  const usable=sims.filter(x=>x.dataQuality==='VALID');
  const quarantined=sims.filter(x=>x.dataQuality!=='VALID');
  const finals=usable.map(x=>finite(x.finalReturn)).filter(Number.isFinite);
  const quarantineReasons={};
  for(const sim of quarantined)for(const reason of sim.quarantineReasons||[]){
    quarantineReasons[reason]=Number(quarantineReasons[reason]||0)+1;
  }
  const largestRawAbsReturn=sims
    .map(x=>finite(x.largestRawAbsReturn))
    .filter(Number.isFinite)
    .reduce((m,x)=>m==null?x:Math.max(m,x),null);
  return {
    independentCases:sims.length,
    usableCases:usable.length,
    quarantinedCases:quarantined.length,
    quarantineReasons,
    largestRawAbsReturn,
    averageFinalReturn:mean(finals),
    medianFinalReturn:median(finals),
    positiveRate:finals.length?finals.filter(x=>x>0).length/finals.length:null,
    severeLossRate:finals.length?finals.filter(x=>x<=-.45).length/finals.length:null,
    moonshotRate:finals.length?finals.filter(x=>x>=1.5).length/finals.length:null,
    stopCheckpointRate:usable.length?usable.filter(x=>x.checkpointExit?.reason==='STOP_CHECKPOINT').length/usable.length:null,
    takeCheckpointRate:usable.length?usable.filter(x=>x.checkpointExit?.reason==='TAKE_CHECKPOINT').length/usable.length:null,
    qualityGuard:{
      version:MEMECOIN_RETURN_QUALITY_GUARD_VERSION,
      maxPriceRatio:MEMECOIN_RETURN_MAX_PRICE_RATIO,
      action:'QUARANTINE_NOT_CLIP',
      rawObservationPreserved:true
    },
    semantics:'ONE_TOKEN_LAUNCH_EQUALS_ONE_INDEPENDENT_CASE'
  };
}

function trimCases(cases,maxCases,asOf=Date.now()){
  const cap=Math.max(200,Number(maxCases)||4000);
  if(cases.length<=cap)return cases;
  const sorted=cases.slice().sort((a,b)=>Number(b.discoveredAt||0)-Number(a.discoveredAt||0));
  const protectionMs=26*60*60_000;
  const recent=sorted.filter(c=>Number(asOf)-Number(c.discoveredAt||0)<protectionMs);
  const old=sorted.filter(c=>Number(asOf)-Number(c.discoveredAt||0)>=protectionMs);
  return [...recent.slice(0,cap),...old.slice(0,Math.max(0,cap-recent.length))]
    .sort((a,b)=>Number(a.discoveredAt||0)-Number(b.discoveredAt||0));
}

export function createMemecoinEvidenceFactoryState(){
  return Object.freeze(stateFrom(null));
}

export function observeMemecoinEvidence(input,rows,{
  now=Date.now(),
  maxCases=4000,
  horizons=MEMECOIN_EVIDENCE_HORIZONS
}={}){
  const state=stateFrom(input);
  const byKey=new Map(state.cases.map((c,i)=>[c.key,i]));
  const results={created:0,observed:0,onTime:0,late:0,cases:state.cases.length};
  for(const row of Array.isArray(rows)?rows:[]){
    const key=keyOf(row?.chainId,row?.tokenAddress);
    if(!key)continue;
    let idx=byKey.get(key);
    if(idx==null){
      const c=initialCase(row,now);if(!c)continue;
      state.cases.push(c);idx=state.cases.length-1;byKey.set(key,idx);results.created++;
      continue;
    }
    const rec=state.cases[idx];
    const obs=recordObservation(rec,row,now,horizons);
    if(obs.updated){
      results.observed++;
      if(obs.quality==='ON_TIME')results.onTime++;else results.late++;
    }else{
      rec.lastSeenAt=Number(now);
      const px=finite(row?.priceUsd);if(px>0)rec.lastPriceUsd=px;
    }
  }
  state.cases=trimCases(state.cases,maxCases,now);
  state.updatedAt=Number(now);results.cases=state.cases.length;
  return Object.freeze({state:Object.freeze(state),results:Object.freeze(results)});
}

export function dueMemecoinEvidenceFollowups(input,{
  asOf=Date.now(),
  max=6,
  minRetryMs=60_000,
  horizons=MEMECOIN_EVIDENCE_HORIZONS
}={}){
  const state=stateFrom(input),out=[];
  for(const c of state.cases){
    const due=candidateHorizon(c,asOf,horizons);if(!due)continue;
    const lastAttempt=finite(c.lastFollowupAttemptAt);
    if(lastAttempt!=null&&Number(asOf)-lastAttempt<Math.max(15_000,Number(minRetryMs)||60_000))continue;
    out.push({
      key:c.key,chainId:c.chainId,tokenAddress:c.tokenAddress,symbol:c.symbol,
      horizon:due.label,targetMs:due.targetMs,lateByMs:due.lateByMs,toleranceMs:due.toleranceMs,
      priority:due.onTime?2:1
    });
  }
  return Object.freeze(out.sort((a,b)=>b.priority-a.priority||a.lateByMs-b.lateByMs).slice(0,Math.max(0,Number(max)||0)));
}

export function recordMemecoinEvidenceFollowupAttempt(input,key,{at=Date.now(),error=null}={}){
  const state=stateFrom(input);
  const c=state.cases.find(x=>x.key===String(key||''));
  if(!c)return Object.freeze({state:Object.freeze(state),updated:false});
  c.lastFollowupAttemptAt=Number(at);
  if(error){
    c.followupFailures=Number(c.followupFailures||0)+1;
    c.lastFollowupError=text(error,240);
  }else c.lastFollowupError=null;
  state.updatedAt=Number(at);
  return Object.freeze({state:Object.freeze(state),updated:true});
}

export function memecoinEvidenceFactorySummary(input,{
  asOf=Date.now(),
  minPatternTrain=20,
  minPatternValidate=8
}={}){
  const state=stateFrom(input);
  const byHorizon={};
  let quarantinedObservations=0;
  const quarantineReasons={};
  for(const label of Object.keys(MEMECOIN_EVIDENCE_HORIZONS)){
    const rows=state.cases.map(c=>({c,o:c?.observations?.[label]})).filter(x=>x.o);
    const onTime=rows.filter(x=>x.o.quality==='ON_TIME');
    const qualified=onTime.map(({c,o})=>returnQuality(c?.initialPriceUsd,o?.priceUsd));
    const returns=qualified.filter(x=>x.valid).map(x=>x.return).filter(Number.isFinite);
    const quarantined=qualified.filter(x=>!x.valid);
    quarantinedObservations+=quarantined.length;
    for(const q of quarantined)quarantineReasons[q.reason]=Number(quarantineReasons[q.reason]||0)+1;
    byHorizon[label]={
      observed:rows.length,onTime:onTime.length,late:rows.length-onTime.length,
      usable:returns.length,quarantined:quarantined.length,
      averageReturn:mean(returns),medianReturn:median(returns),
      positiveRate:returns.length?returns.filter(x=>x>0).length/returns.length:null,
      severeLossRate:returns.length?returns.filter(x=>x<=-.45).length/returns.length:null,
      moonshotRate:returns.length?returns.filter(x=>x>=1.5).length/returns.length:null
    };
  }
  const complete24h=state.cases.filter(c=>c?.observations?.['24h']?.quality==='ON_TIME').length;
  const followupFailures=state.cases.reduce((s,c)=>s+Number(c.followupFailures||0),0);
  const walkForward1h=walkForwardPatterns(state.cases,{horizon:'1h',minTrain:minPatternTrain,minValidate:minPatternValidate});
  const walkForward4h=walkForwardPatterns(state.cases,{horizon:'4h',minTrain:minPatternTrain,minValidate:minPatternValidate});
  return Object.freeze({
    version:MEMECOIN_EVIDENCE_FACTORY_VERSION,
    asOf:Number(asOf),
    independentCases:state.cases.length,
    complete24h,
    byHorizon,
    returnQualityGuard:{
      version:MEMECOIN_RETURN_QUALITY_GUARD_VERSION,
      maxPriceRatio:MEMECOIN_RETURN_MAX_PRICE_RATIO,
      action:'QUARANTINE_NOT_CLIP',
      rawObservationPreserved:true,
      quarantinedObservations,
      quarantineReasons
    },
    counterfactuals:{
      immediate:counterfactualAggregate(state.cases,null),
      delay5m:counterfactualAggregate(state.cases,'5m'),
      semantics:'COUNTERFACTUAL_VARIANTS_DO_NOT_INCREASE_INDEPENDENT_CASE_COUNT'
    },
    patternMiner:{
      walkForward1h,walkForward4h,
      decisionAuthority:false,
      status:walkForward1h.status==='VALIDATED_PATTERNS_PRESENT'||walkForward4h.status==='VALIDATED_PATTERNS_PRESENT'
        ?'RESEARCH_PATTERN_VALIDATED_NOT_PROMOTED'
        :'COLLECTING_OR_UNVALIDATED'
    },
    followupFailures,
    policyMutationAllowed:false,
    automaticPromotionAllowed:false,
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    epistemic:'PIT_OBSERVATIONAL_RESEARCH_NOT_PROFIT_PROBABILITY'
  });
}

export async function loadMemecoinEvidenceFactoryState(filePath){
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(parsed?.version!==MEMECOIN_EVIDENCE_FACTORY_VERSION)throw new Error('MEMECOIN_EVIDENCE_FACTORY_VERSION_MISMATCH');
    return {state:Object.freeze(stateFrom(parsed)),healthy:true,error:null};
  }catch(err){
    if(err?.code==='ENOENT')return {state:createMemecoinEvidenceFactoryState(),healthy:true,error:null};
    return {state:createMemecoinEvidenceFactoryState(),healthy:false,error:err instanceof Error?err.message:String(err)};
  }
}

export async function saveMemecoinEvidenceFactoryState(filePath,input,{maxCases=4000}={}){
  const state=stateFrom(input);
  state.cases=trimCases(state.cases,maxCases,Date.now());
  state.updatedAt=Date.now();
  const tmp=filePath+'.tmp';
  await writeFile(tmp,JSON.stringify(state),'utf8');
  await rename(tmp,filePath);
  return Object.freeze(state);
}
