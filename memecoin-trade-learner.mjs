import { sha256 } from './institutional-kernel.mjs';
import { WALLET_4_MEME_SCOUT, WALLET_5_MEME_COPY } from './shadow-specialist-wallets.mjs';

export const MEMECOIN_TRADE_LEARNER_VERSION='BIGGJ_MEMECOIN_TRADE_LEARNER_V1';

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='')return fallback;
  const n=Number(v);return Number.isFinite(n)?n:fallback;
}
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,Number(v)||0));}
function text(v,max=160){const s=String(v??'').replace(/\s+/g,' ').trim();return s.length<=max?s:s.slice(0,max-1)+'…';}
function mean(xs=[]){const a=xs.filter(Number.isFinite);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;}
function median(xs=[]){const a=xs.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function percentile(xs=[],p=.5){const a=xs.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!a.length)return null;const i=Math.max(0,Math.min(a.length-1,Math.round((a.length-1)*p)));return a[i];}
function safeKey(parts=[]){return parts.map(x=>String(x??'UNKNOWN').replace(/\|/g,'/')).join('|');}
function ageBin(v){const x=finite(v);if(x==null)return 'AGE_UNKNOWN';if(x<5)return 'AGE_LT5';if(x<10)return 'AGE_5_10';if(x<20)return 'AGE_10_20';if(x<60)return 'AGE_20_60';return 'AGE_60P';}
function liqBin(v){const x=finite(v);if(x==null)return 'LIQ_UNKNOWN';if(x<25_000)return 'LIQ_LT25K';if(x<75_000)return 'LIQ_25_75K';if(x<250_000)return 'LIQ_75_250K';if(x<1_000_000)return 'LIQ_250K_1M';return 'LIQ_1MP';}
function mcapBin(v){const x=finite(v);if(x==null)return 'MC_UNKNOWN';if(x<100_000)return 'MC_LT100K';if(x<500_000)return 'MC_100_500K';if(x<2_000_000)return 'MC_500K_2M';if(x<10_000_000)return 'MC_2_10M';return 'MC_10MP';}
function pressureBin(buys,sells){
  const b=Math.max(0,finite(buys,0)),s=Math.max(0,finite(sells,0)),n=b+s;
  if(n<3)return 'PRESSURE_LOW_SAMPLE';
  const r=s>0?b/s:(b>0?99:1);
  if(r<.65)return 'PRESSURE_SELL';
  if(r<1.25)return 'PRESSURE_BALANCED';
  if(r<2)return 'PRESSURE_BUY';
  return 'PRESSURE_STRONG_BUY';
}
function volLiqBin(volume,liq){
  const v=finite(volume),l=finite(liq);if(v==null||!(l>0))return 'TURN_UNKNOWN';
  const r=v/l;if(r<.1)return 'TURN_LOW';if(r<.5)return 'TURN_NORMAL';if(r<1.5)return 'TURN_HIGH';return 'TURN_EXTREME';
}
function momentumBin(v){
  const x=finite(v);if(x==null)return 'MOM_UNKNOWN';if(x<=-25)return 'MOM_DUMP';if(x<0)return 'MOM_RED';if(x<=15)return 'MOM_CALM';if(x<=60)return 'MOM_UP';return 'MOM_CHASE';
}
function attentionBin(row={}){
  const a=new Set(row?.score?.attentionSignals||row?.entryAttentionSignals||[]);
  if(a.has('SOCIAL_ATTENTION_SPIKE'))return 'ATTN_SPIKE';
  if(a.has('SOCIAL_HIGH_REACH_AUTHOR'))return 'ATTN_HIGH_REACH';
  if(a.has('X_DIRECT_POST')||a.has('BLUESKY_DIRECT_POST')||a.has('SOCIAL_POSTS_RECENT'))return 'ATTN_DIRECT_SOCIAL';
  if(a.has('NEW_BOOST')||a.has('COMMUNITY_TAKEOVER'))return 'ATTN_DEX_EVENT';
  if(a.size)return 'ATTN_LIGHT';
  return 'ATTN_NONE';
}
function holderBin(row={}){
  const security=row?.security||{};
  const top10=finite(security?.holderState?.top10Share??row?.entryMarketFeatures?.holderTop10Share);
  if(top10==null)return security?.coverage?.holderConcentrationIndependent===true||row?.entryHolderFallbackUsed===true?'HOLDER_INDEPENDENT_UNKNOWN':'HOLDER_UNKNOWN';
  if(top10<=.25)return 'HOLDER_TOP10_LE25';
  if(top10<=.45)return 'HOLDER_TOP10_25_45';
  if(top10<=.60)return 'HOLDER_TOP10_45_60';
  return 'HOLDER_TOP10_GT60';
}
function scoreBin(v){const x=finite(v);if(x==null)return 'SCORE_UNKNOWN';if(x<.62)return 'SCORE_58_62';if(x<.70)return 'SCORE_62_70';if(x<.80)return 'SCORE_70_80';return 'SCORE_80P';}
function leverageBin(v){const x=Math.max(1,finite(v,1));if(x<=2)return 'LEV_1_2';if(x<=5)return 'LEV_3_5';if(x<=10)return 'LEV_6_10';return 'LEV_10P';}

export function memecoinScoutFeatureShape(row={},now=Date.now()){
  const f=row?.entryMarketFeatures||{};
  const pairCreatedAt=finite(f.pairCreatedAt??row?.pairCreatedAt??row?.sourcePairCreatedAt);
  const ageMinutes=finite(f.ageMinutes??row?.score?.ageMinutes)??(pairCreatedAt!=null?Math.max(0,(Number(now)-pairCreatedAt)/60_000):null);
  return Object.freeze({
    strategy:'W4_SCOUT',
    chain:String(f.chainId??row?.chainId??'UNKNOWN').toLowerCase(),
    stage:String(f.stage??row?.score?.stage??row?.entryStage??'UNKNOWN').toUpperCase(),
    age:ageBin(ageMinutes),
    score:scoreBin(f.researchPriorityScore??row?.score?.researchPriorityScore??row?.entryResearchPriorityScore),
    liquidity:liqBin(f.liquidityUsd??row?.liquidityUsd),
    marketCap:mcapBin(f.marketCap??row?.marketCap??row?.fdv),
    pressure:pressureBin(f.buysM5??row?.buysM5,f.sellsM5??row?.sellsM5),
    turnover:volLiqBin(f.volumeM5??row?.volumeM5,f.liquidityUsd??row?.liquidityUsd),
    momentum:momentumBin(f.priceChangeM5??row?.priceChangeM5),
    attention:attentionBin(row),
    holder:holderBin(row),
    holderFallback:Boolean(f.holderFallbackUsed??row?.entryHolderFallbackUsed??row?.security?.coverage?.holderConcentrationIndependent)
  });
}
export function memecoinCopyFeatureShape(pos={}){
  const symbol=String(pos?.sourceInstId||'').toUpperCase().replace(/-USDT-SWAP$/,'').replace(/USDT$/,'').split('-')[0]||'UNKNOWN';
  return Object.freeze({
    strategy:'W5_COPY',
    trader:text(pos?.sourceTraderCode||'UNKNOWN',80),
    symbol,
    side:String(pos?.side||'UNKNOWN').toUpperCase(),
    leverage:leverageBin(pos?.leverage)
  });
}
function w4Keys(shape){
  return [
    ['EXACT',safeKey([shape.chain,shape.stage,shape.age,shape.liquidity,shape.pressure,shape.momentum,shape.attention,shape.holder])],
    ['CONTEXT',safeKey([shape.chain,shape.stage,shape.age,shape.liquidity,shape.pressure])],
    ['CORE',safeKey([shape.chain,shape.stage,shape.liquidity])],
    ['CHAIN',shape.chain],
    ['GLOBAL','ALL']
  ];
}
function w5Keys(shape){
  return [
    ['EXACT',safeKey([shape.trader,shape.symbol,shape.side,shape.leverage])],
    ['TRADER_SYMBOL',safeKey([shape.trader,shape.symbol])],
    ['TRADER',shape.trader],
    ['SYMBOL',shape.symbol],
    ['GLOBAL','ALL']
  ];
}
function emptyRaw(){return {samples:0,wins:0,returns:[],pnls:[],maes:[],mfes:[],severeLosses:0,moonshots:0,stops:0,takeProfits:0,horizons:0,tailRiskExits:0,securityExits:0,liquidityExits:0,runnerTrails:0,riskReductions:0,profitLocks:0};}
function addRaw(map,key,row){
  const x=map.get(key)||emptyRaw(),ret=finite(row?.realizedReturnPct),pnl=finite(row?.realizedNetPnlQuote);
  if(ret==null||pnl==null)return;
  x.samples++;x.returns.push(ret);x.pnls.push(pnl);if(pnl>0)x.wins++;
  const mae=finite(row?.observedMaeReturnPct??row?.troughUnrealizedReturnPct);
  const mfe=finite(row?.observedMfeReturnPct??row?.peakUnrealizedReturnPct);
  if(mae!=null)x.maes.push(mae);if(mfe!=null)x.mfes.push(mfe);
  if(ret<=-.25)x.severeLosses++;if(ret>=1.5)x.moonshots++;
  const closeReason=String(row?.closeReason||'');
  if(closeReason==='MEME_STOP')x.stops++;if(closeReason==='MEME_TAKE_PROFIT')x.takeProfits++;
  if(closeReason==='MEME_HORIZON')x.horizons++;
  if(closeReason==='MEME_TAIL_RISK_EXIT')x.tailRiskExits++;
  if(closeReason==='MEME_SECURITY_ABSTAIN')x.securityExits++;
  if(closeReason==='MEME_LIQUIDITY_COLLAPSE')x.liquidityExits++;
  if(closeReason==='MEME_RUNNER_TRAIL')x.runnerTrails++;
  if(row?.riskReductionApplied===true)x.riskReductions++;
  if(row?.profitLockApplied===true)x.profitLocks++;
  map.set(key,x);
}
function summarize(raw,{priorWinRate=.5,priorStrength=10,returnPriorStrength=8}={}){
  const n=raw?.samples||0;
  const posteriorWinRate=((raw?.wins||0)+priorWinRate*priorStrength)/(n+priorStrength);
  const rawMean=mean(raw?.returns||[])??0;
  const shrink=n/(n+returnPriorStrength),shrinkedMeanReturn=rawMean*shrink;
  const severeLossRate=n?(raw.severeLosses||0)/n:null,moonshotRate=n?(raw.moonshots||0)/n:null;
  const confidence=clamp(n/(n+priorStrength));
  const downside=severeLossRate==null?.20:severeLossRate;
  const qualityScore=clamp(.42*posteriorWinRate+.28*clamp(.5+.5*Math.tanh(shrinkedMeanReturn/.35))+.18*(1-clamp(downside/.55))+.12*confidence);
  let label='UNCERTAIN';
  if(n>=8){
    const compensatedTailRisk=
      shrinkedMeanReturn>=.10&&
      (moonshotRate??0)>=.20&&
      (severeLossRate??0)<=.75;
    const uncompensatedSevereTail=
      (severeLossRate??0)>=.60&&
      shrinkedMeanReturn<=.05&&
      (moonshotRate??0)<.20;
    if(
      shrinkedMeanReturn<=-.12||
      (posteriorWinRate<=.40&&shrinkedMeanReturn<0)||
      uncompensatedSevereTail
    )label='LEARNED_BAD';
    else if(posteriorWinRate>=.57&&shrinkedMeanReturn>=.08&&(severeLossRate==null||severeLossRate<=.25))label='LEARNED_GOOD';
    else if(compensatedTailRisk)label='ASYMMETRIC_EDGE';
    else label='MIXED';
  }
  return Object.freeze({
    samples:n,wins:raw?.wins||0,rawWinRate:n?(raw.wins||0)/n:null,posteriorWinRate,
    rawMeanReturn:rawMean,medianReturn:median(raw?.returns||[]),p10Return:percentile(raw?.returns||[],.10),
    p90Return:percentile(raw?.returns||[],.90),shrinkedMeanReturn,
    averagePnlQuote:mean(raw?.pnls||[]),averageMaeReturn:mean(raw?.maes||[]),averageMfeReturn:mean(raw?.mfes||[]),
    severeLossRate,moonshotRate,confidence,qualityScore,label,
    closeReasons:{
      stop:raw?.stops||0,takeProfit:raw?.takeProfits||0,horizon:raw?.horizons||0,
      tailRisk:raw?.tailRiskExits||0,security:raw?.securityExits||0,liquidity:raw?.liquidityExits||0,
      runnerTrail:raw?.runnerTrails||0
    },
    interventions:{riskReductions:raw?.riskReductions||0,profitLocks:raw?.profitLocks||0}
  });
}
function buildGroups(rows,keyFn,shapeFn){
  const maps={};
  for(const row of rows){
    const shape=shapeFn(row);
    for(const [level,key] of keyFn(shape)){
      maps[level]??=new Map();
      addRaw(maps[level],key,row);
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(maps).map(([level,map])=>[
    level,Object.freeze(Object.fromEntries([...map.entries()].map(([k,v])=>[k,summarize(v)])))
  ])));
}
function eligibleClosed(wallet){
  return (wallet?.closed||[]).filter(x=>x?.execution==='SHADOW_ONLY'&&x?.canExecuteLive===false&&finite(x?.realizedReturnPct)!=null&&finite(x?.realizedNetPnlQuote)!=null);
}
function hasActionableScoutEntryFeatures(row={}){
  const f=row?.entryMarketFeatures;
  if(!f||typeof f!=='object')return false;
  return finite(f.ageMinutes)!=null&&finite(f.liquidityUsd)!=null&&
    finite(f.buysM5)!=null&&finite(f.sellsM5)!=null&&finite(f.priceChangeM5)!=null;
}
function topPatterns(groups,label,limit=5){
  const rows=[];
  for(const [level,g] of Object.entries(groups||{}))for(const [key,s] of Object.entries(g||{})){
    if(level==='GLOBAL'||s?.label!==label)continue;
    rows.push({level,key,...s});
  }
  return rows.sort((a,b)=>b.samples-a.samples||b.confidence-a.confidence).slice(0,limit);
}
function contrarianSummary(rows=[]){
  const raw=emptyRaw(),byViolation=new Map();
  for(const row of rows){
    addRaw(new Map([['ALL',raw]]),'ALL',row);
    const violations=Array.isArray(row?.entryContrarianViolations)&&row.entryContrarianViolations.length
      ?row.entryContrarianViolations:['UNKNOWN_SOFT_RULE'];
    for(const v of violations)addRaw(byViolation,String(v),row);
  }
  return Object.freeze({
    samples:rows.length,
    global:summarize(raw),
    byViolation:Object.freeze(Object.fromEntries([...byViolation.entries()].map(([k,v])=>[k,summarize(v)]))),
    authority:'RESEARCH_ONLY_NO_AUTOMATIC_PRIMARY_MUTATION'
  });
}

export function buildMemecoinTradeLearningModel(state,{asOf=Date.now()}={}){
  const w4=state?.wallets?.[WALLET_4_MEME_SCOUT]||{},w5=state?.wallets?.[WALLET_5_MEME_COPY]||{};
  const c4All=eligibleClosed(w4);
  const c4Contrarian=c4All.filter(x=>String(x?.entryResearchLane||'STANDARD')==='CONTRARIAN_PROBE');
  const c4=c4All.filter(x=>String(x?.entryResearchLane||'STANDARD')!=='CONTRARIAN_PROBE');
  const c4Actionable=c4.filter(hasActionableScoutEntryFeatures),c5=eligibleClosed(w5);
  const g4=buildGroups(c4Actionable,w4Keys,x=>memecoinScoutFeatureShape(x,x.openedAt||asOf));
  const g4All=buildGroups(c4,w4Keys,x=>memecoinScoutFeatureShape(x,x.openedAt||asOf));
  const g5=buildGroups(c5,w5Keys,memecoinCopyFeatureShape);
  const core={
    version:MEMECOIN_TRADE_LEARNER_VERSION,asOf:Number(asOf),
    wallet4:{
      samples:c4.length,
      totalSamples:c4All.length,
      contrarianSamples:c4Contrarian.length,
      featureCompleteSamples:c4Actionable.length,
      legacyOrIncompleteSamples:Math.max(0,c4.length-c4Actionable.length),
      groups:g4,
      global:g4All?.GLOBAL?.ALL||summarize(null),
      contrarian:contrarianSummary(c4Contrarian),
      topGood:topPatterns(g4,'LEARNED_GOOD'),
      topAsymmetric:topPatterns(g4,'ASYMMETRIC_EDGE'),
      topBad:topPatterns(g4,'LEARNED_BAD')
    },
    wallet5:{samples:c5.length,groups:g5,global:g5?.GLOBAL?.ALL||summarize(null),topGood:topPatterns(g5,'LEARNED_GOOD'),topBad:topPatterns(g5,'LEARNED_BAD')},
    execution:'SHADOW_ONLY',canExecuteLive:false,
    learningMode:'ABSTAIN_ONLY_AFTER_MINIMUM_EVIDENCE',
    automaticPositiveOverride:false,
    meaning:'EMPIRICAL_MEMECOIN_SHADOW_OUTCOME_MEMORY_NOT_PROFIT_GUARANTEE'
  };
  return Object.freeze({...core,fingerprint:sha256(core)});
}
function choose(groups,keys,mins){
  for(const [level,key] of keys){
    const row=groups?.[level]?.[key];if(!row)continue;
    const min=mins[level]??1;if(row.samples>=min)return {level,key,...row};
  }
  return {level:'PRIOR',key:'PRIOR',samples:0,posteriorWinRate:.5,shrinkedMeanReturn:0,severeLossRate:null,confidence:0,qualityScore:.5,label:'UNCERTAIN'};
}
export function scoreMemecoinScoutCandidate(model,row,{
  minExactSamples=8,minContextSamples=12,minCoreSamples=18,minChainSamples=30,minGlobalSamples=40,
  minBlockConfidence=.44,minBoostConfidence=.44,minThrottleConfidence=.65,throttleSizeMultiplier=.15
}={}){
  const shape=memecoinScoutFeatureShape(row);
  const keys=w4Keys(shape);
  const specificKeys=keys.filter(([level])=>['EXACT','CONTEXT','CORE'].includes(level));
  const broadKeys=keys.filter(([level])=>['CHAIN','GLOBAL'].includes(level));
  const specific=choose(model?.wallet4?.groups,specificKeys,{EXACT:minExactSamples,CONTEXT:minContextSamples,CORE:minCoreSamples});
  const broad=choose(model?.wallet4?.groups,broadKeys,{CHAIN:minChainSamples,GLOBAL:minGlobalSamples});
  const specificPositive=['LEARNED_GOOD','ASYMMETRIC_EDGE'].includes(String(specific.label||''));
  const broadDestructive=
    broad.label==='LEARNED_BAD'&&
    broad.confidence>=minThrottleConfidence&&
    Number(broad.shrinkedMeanReturn||0)<0&&
    Number(broad.severeLossRate||0)>=.60;
  let action='NEUTRAL',adjustment=0,sizeMultiplier=1,chosen=specific;
  if(specific.label==='LEARNED_BAD'&&specific.confidence>=minBlockConfidence){
    action='BLOCK';adjustment=-.20;sizeMultiplier=0;
  }else if(specific.label==='LEARNED_GOOD'&&specific.confidence>=minBoostConfidence){
    action='BOOST';adjustment=.05;
  }else if(!specificPositive&&broadDestructive){
    // Preserve learning without repeatedly paying full virtual notional for a
    // broadly destructive chain/regime. Specific positive evidence can still
    // graduate out of this throttle; live execution authority remains false.
    action='THROTTLE';adjustment=-.10;sizeMultiplier=clamp(throttleSizeMultiplier,.05,.35);chosen=broad;
  }
  const pack=x=>({level:x.level,key:x.key,samples:x.samples,posteriorWinRate:x.posteriorWinRate,shrinkedMeanReturn:x.shrinkedMeanReturn,severeLossRate:x.severeLossRate,confidence:x.confidence,qualityScore:x.qualityScore,label:x.label});
  return Object.freeze({
    version:MEMECOIN_TRADE_LEARNER_VERSION,shape,action,rankingAdjustment:adjustment,sizeMultiplier,
    evidence:pack(chosen),
    specificEvidence:pack(specific),
    broadEvidence:pack(broad),
    canOverrideSecurity:false,canCreateEntry:false,canExecuteLive:false
  });
}
export function scoreMemecoinCopyCandidate(model,pos,{
  minExactSamples=8,minTraderSymbolSamples=10,minTraderSamples=14,minSymbolSamples=20,minBlockConfidence=.44
}={}){
  const shape=memecoinCopyFeatureShape(pos);
  const chosen=choose(model?.wallet5?.groups,w5Keys(shape),{EXACT:minExactSamples,TRADER_SYMBOL:minTraderSymbolSamples,TRADER:minTraderSamples,SYMBOL:minSymbolSamples,GLOBAL:30});
  const action=chosen.label==='LEARNED_BAD'&&chosen.confidence>=minBlockConfidence?'BLOCK':'NEUTRAL';
  return Object.freeze({version:MEMECOIN_TRADE_LEARNER_VERSION,shape,action,evidence:{level:chosen.level,key:chosen.key,samples:chosen.samples,confidence:chosen.confidence,qualityScore:chosen.qualityScore,label:chosen.label},canCreateEntry:false,canExecuteLive:false});
}
export function memecoinTradeLearningSummary(model){
  return Object.freeze({
    version:MEMECOIN_TRADE_LEARNER_VERSION,
    wallet4:{
      samples:model?.wallet4?.samples||0,
      totalSamples:model?.wallet4?.totalSamples||model?.wallet4?.samples||0,
      contrarianSamples:model?.wallet4?.contrarianSamples||0,
      featureCompleteSamples:model?.wallet4?.featureCompleteSamples||0,
      legacyOrIncompleteSamples:model?.wallet4?.legacyOrIncompleteSamples||0,
      global:model?.wallet4?.global||null,
      contrarian:model?.wallet4?.contrarian||null,
      topGood:model?.wallet4?.topGood||[],
      topBad:model?.wallet4?.topBad||[]
    },
    wallet5:{samples:model?.wallet5?.samples||0,global:model?.wallet5?.global||null,topGood:model?.wallet5?.topGood||[],topBad:model?.wallet5?.topBad||[]},
    learningMode:model?.learningMode||'ABSTAIN_ONLY_AFTER_MINIMUM_EVIDENCE',
    automaticPositiveOverride:false,execution:'SHADOW_ONLY',canExecuteLive:false
  });
}
