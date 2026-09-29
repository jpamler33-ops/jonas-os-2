import { evidenceRecord } from './core.mjs';

export function candleToEvidence(candle,{source='btc-candles',symbol='BTCUSDT'}={}){
 if(!candle?.openTime||!candle?.closeTime) throw new Error('BIGGJ_CANDLE_TIME_REQUIRED');
 const nums=['open','high','low','close','volume']; for(const k of nums) if(!Number.isFinite(Number(candle[k]))) throw new Error(`BIGGJ_CANDLE_${k.toUpperCase()}_INVALID`);
 // A completed candle only becomes usable after closeTime. This prevents intra-candle look-ahead.
 return evidenceRecord({source,eventTime:candle.closeTime,availableAt:candle.availableAt??candle.closeTime,observedAt:candle.availableAt??candle.closeTime,independenceGroup:`${source}:${symbol}:${candle.openTime}`,confidence:1,payload:{type:'OHLCV',symbol,openTime:candle.openTime,closeTime:candle.closeTime,open:Number(candle.open),high:Number(candle.high),low:Number(candle.low),close:Number(candle.close),volume:Number(candle.volume)}});
}

export function candlesToReplaySteps(candles,{source='btc-candles',symbol='BTCUSDT',horizon=1}={}){
 if(!Number.isInteger(horizon)||horizon<1) throw new Error('BIGGJ_HORIZON_INVALID');
 const ordered=[...candles].sort((a,b)=>Date.parse(a.closeTime)-Date.parse(b.closeTime));
 const evidence=ordered.map(c=>candleToEvidence(c,{source,symbol})); const steps=[];
 for(let i=1;i<ordered.length-horizon;i++){
  const prev=ordered[i-1],cur=ordered[i],future=ordered[i+horizon];
  const momentum=(Number(cur.close)-Number(prev.close))/Number(prev.close);
  const outcome=(Number(future.close)-Number(cur.close))/Number(cur.close);
  const direction=Math.sign(momentum);
  steps.push({asset:'BTC',asOf:cur.closeTime,evidence:evidence.slice(0,i+1),claim:`completed-candle momentum ${direction>=0?'up':'down'}`,direction,priorConfidence:Math.min(.9,.5+Math.abs(momentum)*10),support:.5+Math.min(.5,Math.abs(momentum)*20),directionalEdge:direction*Math.min(1,Math.abs(momentum)*25),expectedReturnPct:momentum,outcomeReturnPct:outcome});
 }
 return steps;
}
