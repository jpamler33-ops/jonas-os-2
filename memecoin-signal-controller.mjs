export const MEMECOIN_SIGNAL_CONTROLLER_VERSION='BIGGJ_MEMECOIN_SIGNAL_CONTROLLER_V1';

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='')return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,Number(v)||0));}
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v))freeze(x);
  }
  return v;
}
function arr(v){return Array.isArray(v)?v:[];}
function upper(v){return String(v||'').toUpperCase();}
function unique(xs){return [...new Set(xs.filter(Boolean))];}

const HARD_RISK_FLAGS=new Set([
  'LIQUIDITY_UNKNOWN',
  'LIQUIDITY_EXTREME_THIN',
  'ONE_SIDED_NO_SELLS_OBSERVED',
  'M5_CRASH_EXTREME',
  'DATA_ANOMALY_MCAP_LIQUIDITY',
  'DATA_ANOMALY_FDV_LIQUIDITY'
]);

const POSITIVE_ATTENTION=new Set([
  'NEW_BOOST',
  'COMMUNITY_TAKEOVER',
  'EXTERNAL_MENTION',
  'SOCIAL_POSTS_RECENT',
  'SOCIAL_ATTENTION_SPIKE',
  'SOCIAL_HIGH_REACH_AUTHOR',
  'X_DIRECT_POST',
  'BLUESKY_DIRECT_POST'
]);

function qualityFlow(buys,sells,minTrades,minBuyShare){
  const b=Math.max(0,finite(buys,0));
  const s=Math.max(0,finite(sells,0));
  const trades=b+s;
  const buyShare=trades>0?b/trades:null;
  const enough=trades>=minTrades&&buyShare!=null&&buyShare>=minBuyShare;
  const tradeQuality=clamp(trades/Math.max(minTrades*2,1));
  const shareQuality=buyShare==null?0:clamp((buyShare-.5)/.25);
  return {trades,buyShare,enough,quality:clamp(.45*tradeQuality+.55*shareQuality)};
}
function qualityTurnover(volume,liquidity,minTurnover){
  const v=Math.max(0,finite(volume,0));
  const l=Math.max(0,finite(liquidity,0));
  const ratio=l>0?v/l:null;
  return {
    ratio,
    enough:ratio!=null&&ratio>=minTurnover,
    quality:ratio==null?0:clamp(ratio/Math.max(minTurnover*2,1e-9))
  };
}
function qualityMomentum(priceChangeM5,{minMomentumPct,maxMomentumPct}={}){
  const p=finite(priceChangeM5);
  if(p==null)return {value:null,enough:false,quality:0};
  const enough=p>=minMomentumPct&&p<=maxMomentumPct;
  let quality=0;
  if(p>=minMomentumPct&&p<=maxMomentumPct){
    const target=Math.min(25,Math.max(minMomentumPct,(minMomentumPct+maxMomentumPct)/3));
    quality=p<=target
      ?clamp((p-minMomentumPct)/Math.max(1,target-minMomentumPct))
      :clamp(1-(p-target)/Math.max(1,maxMomentumPct-target));
    quality=Math.max(.45,quality);
  }
  return {value:p,enough,quality};
}
function qualityAttention(row){
  const signals=arr(row?.score?.attentionSignals);
  const positive=signals.filter(x=>POSITIVE_ATTENTION.has(String(x)));
  const posts=Math.max(0,finite(row?.directSocialAttention?.posts,0));
  const authors=Math.max(0,finite(row?.directSocialAttention?.uniqueAuthors,0));
  const band=upper(row?.directSocialAttention?.attentionBand);
  const enough=positive.length>0||posts>=2||band==='SPIKING'||band==='MULTI_POST';
  const quality=clamp(
    (positive.length?Math.min(.65,.2+.15*positive.length):0)+
    Math.min(.2,posts*.04)+
    Math.min(.1,authors*.03)+
    (band==='SPIKING'?.2:band==='MULTI_POST'?.1:0)
  );
  return {signals:positive,posts,authors,band,enough,quality};
}

export function evaluateMemecoinEntrySignal(row,{
  minReadyResearchScore=.60,
  minBuyResearchScore=.68,
  minLiquidityUsd=25_000,
  minTradesM5=10,
  minBuyShare=.56,
  minTurnover=.12,
  minMomentumPct=2,
  maxMomentumPct=65,
  minTriggerPillars=3,
  minEntryReadiness=.72
}={}){
  const securityGate=upper(row?.security?.evidenceGate||'UNKNOWN');
  const securityCritical=arr(row?.security?.criticalRiskFlags);
  const riskFlags=arr(row?.score?.riskFlags).map(String);
  const hardRisk=riskFlags.filter(x=>HARD_RISK_FLAGS.has(x));
  const learningAction=upper(row?.memeLearning?.action||'NEUTRAL');
  const stage=upper(row?.score?.stage||'WATCH');
  const researchScore=clamp(finite(row?.score?.researchPriorityScore,0));
  const liquidityUsd=Math.max(0,finite(row?.liquidityUsd,0));
  const priceUsd=finite(row?.priceUsd);

  const blockers=[];
  if(!(priceUsd>0))blockers.push('PRICE_MISSING');
  if(securityGate!=='PASS')blockers.push('SECURITY_NOT_PASS');
  if(securityCritical.length)blockers.push('SECURITY_CRITICAL_RISK');
  if(hardRisk.length)blockers.push('HARD_MARKET_RISK');
  if(learningAction==='BLOCK')blockers.push('LEARNED_BAD_COHORT');

  const flow=qualityFlow(row?.buysM5,row?.sellsM5,minTradesM5,minBuyShare);
  const turnover=qualityTurnover(row?.volumeM5,row?.liquidityUsd,minTurnover);
  const momentum=qualityMomentum(row?.priceChangeM5,{minMomentumPct,maxMomentumPct});
  const attention=qualityAttention(row);

  const triggerPillars={
    flow:flow.enough,
    turnover:turnover.enough,
    momentum:momentum.enough,
    attention:attention.enough
  };
  const triggerCount=Object.values(triggerPillars).filter(Boolean).length;

  const liquidityQuality=clamp(liquidityUsd/Math.max(minLiquidityUsd*3,1));
  const learningQuality=learningAction==='BOOST'?1:learningAction==='THROTTLE'?0:.5;
  const readiness=clamp(
    .35*researchScore+
    .18*flow.quality+
    .14*turnover.quality+
    .13*momentum.quality+
    .10*attention.quality+
    .06*liquidityQuality+
    .04*learningQuality
  );

  const missing=[];
  if(!['NEW_NOW','EARLY'].includes(stage))missing.push('STAGE_NOT_ENTRY_READY');
  if(researchScore<minReadyResearchScore)missing.push('RESEARCH_SCORE_BELOW_READY');
  if(liquidityUsd<minLiquidityUsd)missing.push('LIQUIDITY_BELOW_SIGNAL_MIN');
  if(learningAction==='THROTTLE')missing.push('LEARNED_DESTRUCTIVE_COHORT_THROTTLED');
  if(!flow.enough)missing.push('FLOW_TRIGGER_MISSING');
  if(!turnover.enough)missing.push('TURNOVER_TRIGGER_MISSING');
  if(!momentum.enough)missing.push('MOMENTUM_TRIGGER_MISSING');
  if(!attention.enough)missing.push('ATTENTION_TRIGGER_MISSING');

  let action='WATCH';
  if(blockers.length){
    action='BLOCKED';
  }else{
    const foundationReady=
      ['NEW_NOW','EARLY'].includes(stage)&&
      researchScore>=minReadyResearchScore&&
      liquidityUsd>=minLiquidityUsd&&
      learningAction!=='THROTTLE';
    const buyReady=
      foundationReady&&
      researchScore>=minBuyResearchScore&&
      triggerCount>=Math.max(1,Math.min(4,Number(minTriggerPillars)||3))&&
      readiness>=clamp(minEntryReadiness);
    if(buyReady)action='BUY';
    else if(foundationReady)action='READY';
  }

  const label={
    BLOCKED:'⛔ BLOCKIERT',
    WATCH:'👀 WATCH',
    READY:'⏳ READY',
    BUY:'🟢 KAUFEN'
  }[action];

  const reasons=[];
  if(action==='BUY'){
    reasons.push(
      'SECURITY_PASS',
      'LIQUIDITY_PASS',
      'RESEARCH_SCORE_PASS',
      ...Object.entries(triggerPillars).filter(([,ok])=>ok).map(([k])=>'TRIGGER_'+k.toUpperCase())
    );
    if(learningAction==='BOOST')reasons.push('LEARNED_GOOD_COHORT');
  }else if(action==='READY'){
    reasons.push('FOUNDATION_PASS','ENTRY_TRIGGER_INCOMPLETE');
  }else if(action==='WATCH'){
    reasons.push('NOT_ENTRY_READY');
  }else{
    reasons.push('HARD_GATE_FAILED');
  }

  return freeze({
    version:MEMECOIN_SIGNAL_CONTROLLER_VERSION,
    action,
    label,
    entryReadinessScore:Number(readiness.toFixed(4)),
    triggerPillars,
    triggerCount,
    blockers:unique(blockers),
    missing:unique(missing),
    reasons:unique(reasons),
    evidence:{
      stage,
      researchPriorityScore:researchScore,
      liquidityUsd,
      priceUsd,
      securityGate,
      securityCriticalRiskFlags:securityCritical,
      hardRiskFlags:hardRisk,
      learningAction,
      flow:{trades:flow.trades,buyShare:flow.buyShare==null?null:Number(flow.buyShare.toFixed(4))},
      turnoverRatio:turnover.ratio==null?null:Number(turnover.ratio.toFixed(4)),
      priceChangeM5:momentum.value,
      attentionSignals:attention.signals,
      socialPosts:attention.posts,
      socialAuthors:attention.authors,
      socialBand:attention.band
    },
    authority:'PAPER_ENTRY_GATE_ONLY',
    epistemic:'DETERMINISTIC_ENTRY_READINESS_NOT_PROFIT_PROBABILITY',
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false
  });
}

export function applyMemecoinEntrySignals(snapshot,options={}){
  const rows=arr(snapshot?.rows).map(row=>freeze({
    ...row,
    memeSignal:evaluateMemecoinEntrySignal(row,options)
  }));
  const counts={BLOCKED:0,WATCH:0,READY:0,BUY:0};
  for(const row of rows){
    const a=upper(row?.memeSignal?.action);
    if(Object.hasOwn(counts,a))counts[a]++;
  }
  return freeze({
    ...snapshot,
    rows,
    signalController:{
      version:MEMECOIN_SIGNAL_CONTROLLER_VERSION,
      counts,
      buyCandidates:rows.filter(x=>x?.memeSignal?.action==='BUY').length,
      entryAuthority:'BUY_REQUIRED_WHEN_ENFORCED',
      execution:'SHADOW_ONLY',
      canExecute:false,
      canExecuteLive:false
    }
  });
}
