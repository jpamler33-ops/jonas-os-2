import { fetchHistoricalCandles } from './market-providers.mjs';
import { candlesToReplaySteps } from './market-data.mjs';
import { benchmarkSteps } from './benchmark.mjs';

const intervals=(process.env.BIGGJ_INTERVALS??'5m,15m,1h').split(',');
const horizons=(process.env.BIGGJ_HORIZONS??'1,3,12').split(',').map(Number);
const limit=Math.min(1000,Math.max(50,Number(process.env.BIGGJ_LIMIT??1000)));
const requestedSymbol=process.env.BIGGJ_SYMBOL??'BTCUSDT';
const results=[];
for(const interval of intervals){
 const market=await fetchHistoricalCandles({symbol:requestedSymbol,interval,limit});
 const candles=market.candles;
 for(const horizon of horizons){
  if(candles.length<=horizon+2) continue;
  const steps=candlesToReplaySteps(candles,{symbol:market.symbol,horizon,source:`${market.provider}:${interval}`});
  const benchmark=benchmarkSteps(steps);
  results.push({requestedSymbol,marketSymbol:market.symbol,provider:market.provider,providerFallbacks:market.attempts,interval,horizon,candles:candles.length,from:candles[0]?.openTime,to:candles.at(-1)?.closeTime,...benchmark});
 }
}
console.log(JSON.stringify({generatedAt:new Date().toISOString(),mode:'SHADOW_ONLY',canExecuteLive:false,results},null,2));
