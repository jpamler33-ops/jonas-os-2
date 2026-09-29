import { sha256 } from './institutional-kernel.mjs';
import { analyzeMultiTimeframe, closedCandles } from './market-structure.mjs';

export const BIGGJ_MARKET_PLAYBOOK_VERSION='BIGGJ_MARKET_PLAYBOOK_V1';

const finite=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)));
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
const token=(v,f='UNKNOWN')=>{const s=String(v??'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');return s||f;};
const finalized=core=>freeze({...core,fingerprint:sha256(core)});

export const BIGGJ_TRADING_STYLES=freeze({
  SCALP:{
    id:'SCALP',
    contextTimeframes:['15m','5m'],
    triggerTimeframes:['1m','5m'],
    nominalHoldRangeMs:[3*60_000,45*60_000],
    needsMicrostructure:true,
    needsHighLiquidity:true,
    maxSpreadBps:8,
    preferredStrategies:['LIQUIDITY_SWEEP_REVERSAL','BREAKOUT_RETEST','MOMENTUM_EXPANSION']
  },
  INTRADAY:{
    id:'INTRADAY',
    contextTimeframes:['1h','15m'],
    triggerTimeframes:['5m'],
    nominalHoldRangeMs:[30*60_000,6*60*60_000],
    needsMicrostructure:false,
    needsHighLiquidity:false,
    maxSpreadBps:16,
    preferredStrategies:['TREND_CONTINUATION','BREAKOUT_RETEST','RANGE_MEAN_REVERSION','MOMENTUM_EXPANSION']
  },
  SWING:{
    id:'SWING',
    contextTimeframes:['4h','1h'],
    triggerTimeframes:['15m','1h'],
    nominalHoldRangeMs:[4*60*60_000,3*24*60*60_000],
    needsMicrostructure:false,
    needsHighLiquidity:false,
    maxSpreadBps:24,
    preferredStrategies:['TREND_CONTINUATION','BREAKOUT_RETEST','RANGE_MEAN_REVERSION']
  }
});

function normalizeBook(book){
  const bids=(Array.isArray(book?.bids)?book.bids:[]).map(x=>[Number(x[0]),Number(x[1])]).filter(x=>x.every(Number.isFinite)&&x[0]>0&&x[1]>0);
  const asks=(Array.isArray(book?.asks)?book.asks:[]).map(x=>[Number(x[0]),Number(x[1])]).filter(x=>x.every(Number.isFinite)&&x[0]>0&&x[1]>0);
  const bestBid=bids[0]?.[0]??finite(book?.bestBid);
  const bestAsk=asks[0]?.[0]??finite(book?.bestAsk);
  const mid=bestBid!=null&&bestAsk!=null?(bestBid+bestAsk)/2:finite(book?.mid);
  const spreadBps=mid&&bestBid!=null&&bestAsk!=null?(bestAsk-bestBid)/mid*10000:null;
  const bidDepthQuote=bids.slice(0,12).reduce((s,[p,q])=>s+p*q,0);
  const askDepthQuote=asks.slice(0,12).reduce((s,[p,q])=>s+p*q,0);
  const total=bidDepthQuote+askDepthQuote;
  const imbalance=total>0?(bidDepthQuote-askDepthQuote)/total:0;
  return {bids,asks,bestBid,bestAsk,mid,spreadBps,bidDepthQuote,askDepthQuote,imbalance};
}

function wallRows(levels,side,currentPrice){
  return (levels||[]).map(([price,qty])=>({
    price,qty,notional:price*qty,
    distancePct:currentPrice>0?Math.abs(price-currentPrice)/currentPrice:null,
    side
  })).filter(x=>x.distancePct!=null).sort((a,b)=>a.distancePct-b.distancePct||b.notional-a.notional);
}

function structuralLevels(mtf,currentPrice){
  const rows=[];
  for(const [tf,a] of Object.entries(mtf?.analyses||{})){
    if(finite(a?.support)>0)rows.push({price:Number(a.support),kind:'SUPPORT',source:'STRUCTURE',timeframe:tf,distancePct:Math.abs(Number(a.support)-currentPrice)/currentPrice});
    if(finite(a?.resistance)>0)rows.push({price:Number(a.resistance),kind:'RESISTANCE',source:'STRUCTURE',timeframe:tf,distancePct:Math.abs(Number(a.resistance)-currentPrice)/currentPrice});
    for(const p of (a?.classifiedPivots||[]).slice(-8)){
      if(finite(p?.price)>0)rows.push({price:Number(p.price),kind:p.kind==='L'?'SWING_LOW':'SWING_HIGH',label:String(p.label||p.kind),source:'PIVOT',timeframe:tf,distancePct:Math.abs(Number(p.price)-currentPrice)/currentPrice});
    }
  }
  return rows.sort((a,b)=>a.distancePct-b.distancePct);
}

function liquidationLevels(liquidation,currentPrice){
  const xs=(liquidation?.clusters15m?.length?liquidation.clusters15m:liquidation?.clusters5m)||[];
  return xs.map(x=>({
    price:finite(x?.price),
    kind:'OBSERVED_LIQ_CLUSTER',
    source:'LIQUIDATION',
    totalUsd:finite(x?.totalUsd,0),
    longUsd:finite(x?.longUsd,0),
    shortUsd:finite(x?.shortUsd,0),
    distancePct:finite(x?.price)>0?Math.abs(Number(x.price)-currentPrice)/currentPrice:null
  })).filter(x=>x.price>0&&x.distancePct!=null).sort((a,b)=>a.distancePct-b.distancePct||b.totalUsd-a.totalUsd);
}

function sideFromForecast(forecast){
  const horizons=(Array.isArray(forecast?.horizons)?forecast.horizons:[])
    .filter(h=>String(h?.gate||'').toUpperCase()==='PASS'&&['UP','DOWN'].includes(String(h?.direction||'').toUpperCase()))
    .map(h=>{
      const p=h.display?.probabilities||h.probabilities||{};
      const dir=String(h.direction).toUpperCase();
      const directional=finite(dir==='UP'?p.up:p.down,.5);
      const opposite=finite(dir==='UP'?p.down:p.up,.5);
      return {...h,_edge:directional-opposite,_directional:directional};
    }).sort((a,b)=>b._edge-a._edge||Math.abs(Number(b.expectedReturn||0))-Math.abs(Number(a.expectedReturn||0)));
  if(!horizons.length)return {side:'UNKNOWN',edge:0,probability:.5,horizon:null};
  const h=horizons[0];
  return {side:String(h.direction).toUpperCase()==='UP'?'LONG':'SHORT',edge:Number(h._edge),probability:Number(h._directional),horizon:h};
}

function directionAlignment(trend,side){
  const t=String(trend||'NEUTRAL').toUpperCase(),s=String(side||'UNKNOWN').toUpperCase();
  if(s==='LONG')return t==='BULLISH'?1:t==='BEARISH'?-1:0;
  if(s==='SHORT')return t==='BEARISH'?1:t==='BULLISH'?-1:0;
  return 0;
}

function latestSweep(candles,side,{lookback=24,tolerancePct=.0015}={}){
  const xs=closedCandles(Array.isArray(candles)?candles:[]).slice(-Math.max(8,lookback));
  if(xs.length<6)return null;
  const last=xs.at(-1),history=xs.slice(0,-1);
  if(side==='LONG'){
    const priorLow=Math.min(...history.map(x=>Number(x.l)));
    const swept=Number(last.l)<priorLow*(1-tolerancePct*.15)&&Number(last.c)>priorLow*(1-tolerancePct);
    return swept?{side:'LONG',kind:'SELL_SIDE_LIQUIDITY_SWEEP',level:priorLow,sweepPrice:Number(last.l),close:Number(last.c)}:null;
  }
  if(side==='SHORT'){
    const priorHigh=Math.max(...history.map(x=>Number(x.h)));
    const swept=Number(last.h)>priorHigh*(1+tolerancePct*.15)&&Number(last.c)<priorHigh*(1+tolerancePct);
    return swept?{side:'SHORT',kind:'BUY_SIDE_LIQUIDITY_SWEEP',level:priorHigh,sweepPrice:Number(last.h),close:Number(last.c)}:null;
  }
  return null;
}

function chooseStrategy({side,mtf,sweep5m,flowScore=0,oiExpansion=0,currentPrice,levels}){
  const a5=mtf?.analyses?.['5m'],a15=mtf?.analyses?.['15m'],a1h=mtf?.analyses?.['1h'],a4h=mtf?.analyses?.['4h'];
  const patterns=[a5?.pattern,a15?.pattern,a1h?.pattern].filter(Boolean);
  const matchingBreak=patterns.find(p=>String(p.side||'').toUpperCase()===side&&String(p.stage||'').includes('RETEST'));
  if(matchingBreak)return {family:'BREAKOUT_RETEST',reason:'STRUCTURE_BREAK_RETEST_CONFIRMED',strength:.86};
  if(sweep5m&&sweep5m.side===side)return {family:'LIQUIDITY_SWEEP_REVERSAL',reason:sweep5m.kind,strength:.82};
  const htf=(directionAlignment(a4h?.trend,side)+directionAlignment(a1h?.trend,side))/2;
  const setup=directionAlignment(a15?.trend,side);
  if(htf>.4&&setup>=0)return {family:'TREND_CONTINUATION',reason:'HIGHER_TIMEFRAME_ALIGNMENT',strength:clamp(.65+.15*htf+.08*Math.max(0,flowScore))};
  const nearLevel=(levels||[]).find(x=>x.distancePct<=.006&&((side==='LONG'&&['SUPPORT','SWING_LOW'].includes(x.kind))||(side==='SHORT'&&['RESISTANCE','SWING_HIGH'].includes(x.kind))));
  if(nearLevel&&['NEUTRAL','INSUFFICIENT'].includes(String(a1h?.trend||'')))return {family:'RANGE_MEAN_REVERSION',reason:'RANGE_EDGE_PROXIMITY',strength:.65};
  if(Math.abs(flowScore)>=.45&&oiExpansion>=.35&&directionAlignment(a5?.trend,side)>=0)return {family:'MOMENTUM_EXPANSION',reason:'FLOW_AND_OPEN_INTEREST_EXPANSION',strength:.70};
  return {family:'ABSTAIN',reason:'NO_COHERENT_SETUP',strength:0};
}

function styleScores({side,mtf,book,sweep,strategy,forecastEdge,dataTrust=.5,flowAlignment=.5,macroAlignment=.5,onchainAlignment=.5,oiExpansion=0}){
  const a5=mtf?.analyses?.['5m'],a15=mtf?.analyses?.['15m'],a1h=mtf?.analyses?.['1h'],a4h=mtf?.analyses?.['4h'];
  const spreadScore=book.spreadBps==null?.3:clamp(1-book.spreadBps/25);
  const depthTotal=book.bidDepthQuote+book.askDepthQuote;
  const depthScore=clamp(Math.log10(1+depthTotal)/7);
  const micro=clamp(.45*spreadScore+.35*depthScore+.20*(sweep?1:.4));
  const intradayAlign=clamp(.5+.20*directionAlignment(a1h?.trend,side)+.18*directionAlignment(a15?.trend,side)+.12*directionAlignment(a5?.trend,side));
  const swingAlign=clamp(.5+.25*directionAlignment(a4h?.trend,side)+.20*directionAlignment(a1h?.trend,side)+.05*directionAlignment(a15?.trend,side));
  const strategyFit={
    SCALP:['LIQUIDITY_SWEEP_REVERSAL','BREAKOUT_RETEST','MOMENTUM_EXPANSION'].includes(strategy.family)?1:.45,
    INTRADAY:['TREND_CONTINUATION','BREAKOUT_RETEST','RANGE_MEAN_REVERSION','MOMENTUM_EXPANSION'].includes(strategy.family)?1:.5,
    SWING:['TREND_CONTINUATION','BREAKOUT_RETEST','RANGE_MEAN_REVERSION'].includes(strategy.family)?1:.35
  };
  const rows=[
    {
      style:'SCALP',
      score:clamp(.28*micro+.20*strategyFit.SCALP+.16*clamp(.5+flowAlignment*.5)+.14*clamp(.5+forecastEdge)+.12*dataTrust+.10*clamp(.5+oiExpansion*.5)),
      hardEligible:book.spreadBps!=null&&book.spreadBps<=BIGGJ_TRADING_STYLES.SCALP.maxSpreadBps&&dataTrust>=.70&&strategy.family!=='ABSTAIN',
      evidence:{microstructure:micro,strategyFit:strategyFit.SCALP,flowAlignment,forecastEdge,dataTrust}
    },
    {
      style:'INTRADAY',
      score:clamp(.26*intradayAlign+.22*strategyFit.INTRADAY+.18*clamp(.5+forecastEdge)+.12*clamp(.5+flowAlignment*.5)+.12*dataTrust+.10*clamp(.5+oiExpansion*.5)),
      hardEligible:(book.spreadBps==null||book.spreadBps<=BIGGJ_TRADING_STYLES.INTRADAY.maxSpreadBps)&&dataTrust>=.60&&strategy.family!=='ABSTAIN',
      evidence:{trendAlignment:intradayAlign,strategyFit:strategyFit.INTRADAY,flowAlignment,forecastEdge,dataTrust}
    },
    {
      style:'SWING',
      score:clamp(.30*swingAlign+.20*strategyFit.SWING+.16*clamp(.5+forecastEdge)+.10*dataTrust+.12*clamp(.5+macroAlignment*.5)+.12*clamp(.5+onchainAlignment*.5)),
      hardEligible:dataTrust>=.65&&strategy.family!=='ABSTAIN'&&swingAlign>=.55,
      evidence:{higherTimeframeAlignment:swingAlign,strategyFit:strategyFit.SWING,macroAlignment,onchainAlignment,forecastEdge,dataTrust}
    }
  ];
  return rows.sort((a,b)=>(b.hardEligible?1:0)-(a.hardEligible?1:0)||b.score-a.score);
}

function limitCandidate(side,currentPrice,levels,book){
  const structural=(levels||[]).filter(x=>{
    if(side==='LONG')return x.price<=currentPrice&&['SUPPORT','SWING_LOW'].includes(x.kind);
    if(side==='SHORT')return x.price>=currentPrice&&['RESISTANCE','SWING_HIGH'].includes(x.kind);
    return false;
  }).sort((a,b)=>a.distancePct-b.distancePct)[0]||null;
  const walls=side==='LONG'?wallRows(book.bids,'BID',currentPrice):wallRows(book.asks,'ASK',currentPrice);
  const wall=walls.filter(x=>x.distancePct<=.01)[0]||null;
  const candidates=[
    structural?{price:structural.price,source:structural.source+'_'+structural.kind,timeframe:structural.timeframe,distancePct:structural.distancePct}:null,
    wall?{price:wall.price,source:'ORDERBOOK_'+wall.side+'_WALL',distancePct:wall.distancePct,notional:wall.notional}:null
  ].filter(Boolean);
  candidates.sort((a,b)=>a.distancePct-b.distancePct);
  return candidates[0]||null;
}

function sweepTargets(side,currentPrice,levels,liq){
  const combined=[...(levels||[]),...(liq||[])].filter(x=>{
    if(!(finite(x.price)>0))return false;
    if(side==='LONG')return x.price>currentPrice;
    if(side==='SHORT')return x.price<currentPrice;
    return false;
  }).map(x=>({...x,distancePct:Math.abs(Number(x.price)-currentPrice)/currentPrice}))
    .sort((a,b)=>a.distancePct-b.distancePct);
  return combined.slice(0,5);
}

export function buildBiggjPreTradeAnalysis({
  symbol,
  asOf=Date.now(),
  candlesByTf={},
  orderBook=null,
  liquidation=null,
  forecast=null,
  dataTrustScore=.5,
  flowAlignment=0,
  openInterestExpansion=0,
  macroAlignment=0,
  onchainAlignment=0
}={}){
  const mtf=analyzeMultiTimeframe(candlesByTf||{});
  const book=normalizeBook(orderBook||{});
  const fallbackPrice=Object.values(mtf.analyses||{}).map(x=>finite(x?.lastClose)).find(x=>x>0);
  const currentPrice=finite(book.mid,fallbackPrice);
  if(!(currentPrice>0)){
    return finalized({
      version:BIGGJ_MARKET_PLAYBOOK_VERSION,
      symbol:String(symbol||'').toUpperCase(),
      asOf:Number(asOf),
      decision:'ABSTAIN',
      reason:'CURRENT_PRICE_UNAVAILABLE',
      execution:'SHADOW_ONLY',
      canExecuteLive:false
    });
  }
  const forecastSignal=sideFromForecast(forecast);
  const side=forecastSignal.side;
  const levels=structuralLevels(mtf,currentPrice);
  const liq=liquidationLevels(liquidation,currentPrice);
  const sweep5m=side!=='UNKNOWN'?latestSweep(candlesByTf?.['5m'],side):null;
  const strategy=side==='UNKNOWN'
    ?{family:'ABSTAIN',reason:'FORECAST_DIRECTION_UNAVAILABLE',strength:0}
    :chooseStrategy({
      side,mtf,sweep5m,
      flowScore:Number(flowAlignment)||0,
      oiExpansion:Number(openInterestExpansion)||0,
      currentPrice,levels
    });
  const styles=side==='UNKNOWN'?[]:styleScores({
    side,mtf,book,sweep:sweep5m,strategy,
    forecastEdge:forecastSignal.edge,
    dataTrust:clamp(dataTrustScore),
    flowAlignment:Number(flowAlignment)||0,
    macroAlignment:Number(macroAlignment)||0,
    onchainAlignment:Number(onchainAlignment)||0,
    oiExpansion:Number(openInterestExpansion)||0
  });
  const selectedStyle=styles.find(x=>x.hardEligible&&x.score>=.58)||null;
  const entryZone=selectedStyle?limitCandidate(side,currentPrice,levels,book):null;
  const targets=selectedStyle?sweepTargets(side,currentPrice,levels,liq):[];
  const breakout=strategy.family==='BREAKOUT_RETEST'||strategy.family==='MOMENTUM_EXPANSION';
  const entryType=!selectedStyle?'NONE':
    entryZone&&['TREND_CONTINUATION','RANGE_MEAN_REVERSION','LIQUIDITY_SWEEP_REVERSAL'].includes(strategy.family)
      ?'LIMIT_RETEST'
      :breakout&&book.spreadBps!=null&&book.spreadBps<=BIGGJ_TRADING_STYLES[selectedStyle.style].maxSpreadBps
        ?'MARKET_CONFIRMATION'
        :'WAIT_FOR_LIMIT_OR_CONFIRMATION';
  const why=[];
  if(selectedStyle)why.push('STYLE_'+selectedStyle.style+'_FIT_'+selectedStyle.score.toFixed(3));
  if(strategy.family!=='ABSTAIN')why.push('SETUP_'+strategy.family);
  if(forecastSignal.side!=='UNKNOWN')why.push('FORECAST_'+forecastSignal.side+'_EDGE_'+forecastSignal.edge.toFixed(3));
  if(sweep5m)why.push(sweep5m.kind);
  if(mtf.bias!=='MIXED')why.push('MTF_BIAS_'+mtf.bias);
  if(book.spreadBps!=null)why.push('SPREAD_'+book.spreadBps.toFixed(2)+'BPS');
  if(entryZone)why.push('ENTRY_ZONE_'+entryZone.source);
  const against=[];
  if(mtf.bias==='MIXED')against.push('MTF_MIXED');
  if(book.spreadBps==null)against.push('SPREAD_UNKNOWN');
  if(selectedStyle?.style==='SCALP'&&Math.abs(book.imbalance)<.05)against.push('ORDERBOOK_BALANCED');
  if(clamp(dataTrustScore)<.70)against.push('DATA_TRUST_LIMITED');
  if(strategy.family==='ABSTAIN')against.push(strategy.reason);

  return finalized({
    version:BIGGJ_MARKET_PLAYBOOK_VERSION,
    symbol:String(symbol||'').toUpperCase(),
    asOf:Number(asOf),
    currentPrice,
    decision:selectedStyle&&strategy.family!=='ABSTAIN'?'CANDIDATE':'ABSTAIN',
    side,
    selectedStyle:selectedStyle?.style||null,
    styleScore:selectedStyle?.score??null,
    styleProfile:selectedStyle?BIGGJ_TRADING_STYLES[selectedStyle.style]:null,
    styleCandidates:styles,
    strategyFamily:strategy.family,
    strategyReason:strategy.reason,
    strategyStrength:strategy.strength,
    marketStructure:{
      bias:mtf.bias,
      biasScore:mtf.biasScore,
      analyses:mtf.analyses
    },
    liquidityMap:{
      structuralLevels:levels.slice(0,16),
      observedLiquidationClusters:liq.slice(0,12),
      latestSweep:sweep5m,
      likelySweepTargets:targets
    },
    microstructure:{
      spreadBps:book.spreadBps,
      bidDepthQuote:book.bidDepthQuote,
      askDepthQuote:book.askDepthQuote,
      imbalance:book.imbalance
    },
    forecast:{
      side:forecastSignal.side,
      probability:forecastSignal.probability,
      edge:forecastSignal.edge,
      horizonId:String(forecastSignal.horizon?.horizonId||''),
      horizonMs:finite(forecastSignal.horizon?.horizonMs),
      expectedReturn:finite(forecastSignal.horizon?.expectedReturn)
    },
    entryPlan:{
      orderIntent:entryType,
      preferredLimitPrice:entryZone?.price??null,
      preferredLimitSource:entryZone?.source??null,
      currentPrice,
      distanceToPreferredLimitPct:entryZone?.distancePct??null,
      noRealOrderSubmission:true
    },
    expectedHoldRangeMs:selectedStyle?[...BIGGJ_TRADING_STYLES[selectedStyle.style].nominalHoldRangeMs]:null,
    whyEnter:why,
    counterEvidence:against,
    dataTrustScore:clamp(dataTrustScore),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    epistemic:{
      strategySelection:'HEURISTIC_POLICY_TO_BE_FORWARD_VALIDATED',
      liquidityTargets:'OBSERVED_STRUCTURE_ORDERBOOK_AND_LIQUIDATION_CONTEXT_NOT_CERTAINTY',
      entryPrice:'SHADOW_EXECUTION_PLAN_NOT_REAL_ORDER_INSTRUCTION'
    }
  });
}

export function freezeBiggjTradeDecision(analysis,{
  decisionId=null,
  invalidationPrice=null,
  targetPrice=null,
  plannedRewardRisk=null,
  thesisHealth=null,
  counterThesisStrength=null,
  additionalEvidence={}
}={}){
  if(!analysis||analysis.decision!=='CANDIDATE'){
    return finalized({
      version:BIGGJ_MARKET_PLAYBOOK_VERSION,
      frozen:false,
      reason:'NO_ADMITTED_MARKET_CANDIDATE',
      execution:'SHADOW_ONLY',
      canExecuteLive:false
    });
  }
  const core={
    version:BIGGJ_MARKET_PLAYBOOK_VERSION,
    decisionId:decisionId||'bd_'+sha256({symbol:analysis.symbol,asOf:analysis.asOf,side:analysis.side,style:analysis.selectedStyle,strategy:analysis.strategyFamily}).slice(0,24),
    frozen:true,
    frozenAt:Number(analysis.asOf),
    symbol:analysis.symbol,
    side:analysis.side,
    tradingStyle:analysis.selectedStyle,
    strategyFamily:analysis.strategyFamily,
    marketBias:analysis.marketStructure?.bias||'UNKNOWN',
    forecast:analysis.forecast,
    entryPlan:analysis.entryPlan,
    invalidationPrice:finite(invalidationPrice),
    targetPrice:finite(targetPrice),
    plannedRewardRisk:finite(plannedRewardRisk),
    expectedHoldRangeMs:analysis.expectedHoldRangeMs,
    whyEntered:[...(analysis.whyEnter||[])],
    counterEvidenceAtEntry:[...(analysis.counterEvidence||[])],
    predictedDrivers:{
      structure:String(analysis.strategyReason||'UNKNOWN'),
      forecastSide:String(analysis.forecast?.side||'UNKNOWN'),
      liquiditySweep:String(analysis.liquidityMap?.latestSweep?.kind||'NONE'),
      targetLiquidity:(analysis.liquidityMap?.likelySweepTargets||[]).slice(0,3).map(x=>({price:x.price,kind:x.kind,source:x.source}))
    },
    entryThesisHealth:finite(thesisHealth),
    entryCounterThesisStrength:finite(counterThesisStrength),
    marketSnapshot:{
      dataTrustScore:analysis.dataTrustScore,
      microstructure:analysis.microstructure,
      nearestStructuralLevels:(analysis.liquidityMap?.structuralLevels||[]).slice(0,8),
      liquidationClusters:(analysis.liquidityMap?.observedLiquidationClusters||[]).slice(0,8),
      styleCandidates:(analysis.styleCandidates||[]).slice(0,3).map(x=>({style:x.style,score:x.score,hardEligible:x.hardEligible}))
    },
    additionalEvidence:structuredClone(additionalEvidence||{}),
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
  return finalized(core);
}

export function reverseEngineerBiggjTrade(position,{
  decision=null,
  outcomeMemory=null,
  holdMemory=null,
  adaptiveAnalysis=null
}={}){
  const realized=finite(position?.realizedMarginRoePct,finite(position?.realizedReturnPct,0));
  const mfe=finite(position?.mfeMarginRoePct,0);
  const mae=finite(position?.maeMarginRoePct,0);
  const capture=finite(position?.captureEfficiency,mfe>0?realized/mfe:null);
  const regret=finite(position?.exitRegretMarginRoePct,mfe>0?Math.max(0,mfe-realized):null);
  const duration=Math.max(0,finite(position?.closedAt,0)-finite(position?.openedAt,0));
  const horizon=Math.max(1,finite(position?.horizonMs,1));
  const reasons=[];
  const right=[];
  const wrong=[];
  if(realized>0)right.push('DIRECTIONAL_OUTCOME_POSITIVE');
  if(realized<=0)wrong.push('DIRECTIONAL_OUTCOME_NON_POSITIVE');
  if(mfe>0)right.push('TRADE_HAD_FAVORABLE_EXCURSION');
  if(mae<0)reasons.push('ADVERSE_EXCURSION_PRESENT');
  if(capture!=null&&capture<.35)wrong.push('LOW_MFE_CAPTURE');
  if(regret!=null&&regret>=.005)wrong.push('EXIT_GAVE_BACK_MATERIAL_MFE');
  if(duration/horizon<.60)wrong.push('EXIT_RELATIVELY_EARLY');
  if(duration/horizon>1.75&&realized<=0)wrong.push('HELD_LONG_WITHOUT_POSITIVE_RESOLUTION');
  if(mae<-.01&&mfe>.01)reasons.push('TIMING_OR_STOP_PLACEMENT_MAY_HAVE_BEEN_POOR_DESPITE_DIRECTIONAL_RECOVERY');
  const entryWhy=[...(decision?.whyEntered||position?.biggjDecision?.whyEntered||[])];
  const entryCounter=[...(decision?.counterEvidenceAtEntry||position?.biggjDecision?.counterEvidenceAtEntry||[])];
  const associationWarnings=adaptiveAnalysis?.warningAssociations||[];
  const associationSupport=adaptiveAnalysis?.supportiveAssociations||[];
  const likelyError=
    realized<0&&mfe<=0?'ENTRY_THESIS_OR_DIRECTION_WRONG':
    realized<0&&mfe>0&&capture!=null&&capture<=0?'EXIT_OR_PROTECTION_FAILED_AFTER_FAVORABLE_MOVE':
    realized>0&&capture!=null&&capture<.35?'EXIT_TIMING_INEFFICIENT':
    realized>0?'PROCESS_PRODUCED_POSITIVE_OUTCOME':
    'INCONCLUSIVE';
  return finalized({
    version:BIGGJ_MARKET_PLAYBOOK_VERSION,
    positionId:String(position?.positionId||''),
    symbol:String(position?.symbol||''),
    tradingStyle:String(decision?.tradingStyle||position?.tradingStyle||'UNKNOWN'),
    strategyFamily:String(decision?.strategyFamily||position?.strategyFamily||'UNKNOWN'),
    realizedMarginRoePct:realized,
    mfeMarginRoePct:mfe,
    maeMarginRoePct:mae,
    captureEfficiency:capture,
    exitRegretMarginRoePct:regret,
    durationMs:duration,
    durationVsHorizon:duration/horizon,
    likelyError,
    whatWasRight:right,
    whatWasWrong:wrong,
    interactingFactors:{
      supportiveAssociations:associationSupport.slice(0,5),
      warningAssociations:associationWarnings.slice(0,5),
      observations:reasons
    },
    entryReasonAudit:{
      whyEntered:entryWhy,
      counterEvidenceAtEntry:entryCounter,
      predictedDrivers:decision?.predictedDrivers||position?.biggjDecision?.predictedDrivers||null
    },
    holdLearning:{
      matchedPlan:holdMemory?{
        available:true,
        note:'Use adaptive hold memory prospectively on future matching contexts.'
      }:null
    },
    lessons:{
      doNotClaimCausality:true,
      interpretation:'Reverse engineering identifies reproducible associations and timing errors; it does not prove causal market laws.',
      nextAction:likelyError==='PROCESS_PRODUCED_POSITIVE_OUTCOME'
        ?'REPEAT_ONLY_IF_FORWARD_EVIDENCE_REMAINS_STABLE'
        :'CREATE_OR_UPDATE_SHADOW_CHALLENGER'
    },
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}
