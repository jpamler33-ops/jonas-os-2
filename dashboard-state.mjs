import { closedCandles } from './market-structure.mjs';

function clamp(x,a,b){ return Math.max(a,Math.min(b,x)); }
function mean(xs){ return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0; }
function median(xs){
  if(!xs.length) return 0;
  const s=[...xs].sort((a,b)=>a-b);
  const m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
}
function stdev(xs){
  if(xs.length<2) return 0;
  const m=mean(xs);
  return Math.sqrt(mean(xs.map(x=>(x-m)**2)));
}

export function deriveChartDashboard(candles, analysis, mtf, market) {
  const xs=closedCandles(candles);
  const recent=xs.slice(-30);
  const returns=[];
  for(let i=1;i<recent.length;i++){
    if(recent[i-1].c>0 && recent[i].c>0) returns.push(Math.log(recent[i].c/recent[i-1].c));
  }
  const realizedVolPct=stdev(returns)*100;
  const ranges=recent.map(c=>c.c>0?(c.h-c.l)/c.c*100:0);
  const atrPct=mean(ranges.slice(-20));
  const vols=recent.map(c=>c.v);
  const baselineVol=median(vols.slice(0,-1).slice(-20));
  const volumeRatio=baselineVol>0?(vols.at(-1)||0)/baselineVol:0;

  const spreadBps=Number.isFinite(market?.spreadBps)?market.spreadBps:0;
  const imbalance=Number.isFinite(market?.imbalance)?market.imbalance:0;
  const absImbalance=Math.abs(imbalance);
  const pressureScore=clamp(
    absImbalance*120 +
    Math.min(spreadBps,10)*6 +
    Math.min(atrPct,5)*8 +
    Math.max(0,Math.min(volumeRatio,5)-1)*12,
    0,100
  );
  const pressureBand=pressureScore>=65?'HIGH':pressureScore>=35?'MEDIUM':'LOW';
  const liquidity=spreadBps<1?'TIGHT':spreadBps<4?'NORMAL':'WIDE';
  const flow=imbalance>0.15?'BID_PRESSURE':imbalance<-0.15?'ASK_PRESSURE':'BALANCED';

  const localTrend=analysis?.trend || 'INSUFFICIENT';
  const bias=mtf?.bias || 'MIXED';
  const aligned=(localTrend==='BULLISH'&&bias==='BULLISH')||(localTrend==='BEARISH'&&bias==='BEARISH');

  let regime='MIXED';
  if(pressureScore>=72 && (spreadBps>=3 || atrPct>=0.8)) regime='STRESS';
  else if(aligned && volumeRatio>=1.35 && atrPct>=0.25) regime='TREND_EXPANSION';
  else if(aligned) regime='TREND_ORDERLY';
  else if(localTrend==='NEUTRAL' && atrPct<0.45) regime='RANGE';

  const dominantPressure=
    liquidity==='WIDE' ? 'LIQUIDITY_STRESS' :
    absImbalance>=0.25 ? 'FLOW_SKEW' :
    volumeRatio>=1.8 ? 'VOLUME_EXPANSION' :
    atrPct>=0.8 ? 'RANGE_EXPANSION' :
    'LOW_EVIDENCE';

  return {
    regime,
    bias,
    biasScore:mtf?.biasScore ?? 0,
    localTrend,
    liquidity,
    flow,
    spreadBps,
    imbalance,
    pressureScore,
    pressureBand,
    dominantPressure,
    atrPct,
    realizedVolPct,
    volumeRatio,
    mechanismPosterior:'NOT_IDENTIFIED',
    epistemic:{
      market:'OBSERVED',
      structure:'DERIVED_HEURISTIC',
      regime:'DERIVED_HEURISTIC',
      riftPressure:'DERIVED_HEURISTIC',
      mechanism:'NOT_INFERRED'
    }
  };
}
