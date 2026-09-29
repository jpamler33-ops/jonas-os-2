import { candlesToReplaySteps } from './market-data.mjs';
import { historicalPitReplay } from './replay.mjs';

const BASE='https://api.binance.com/api/v3/klines';
export function parseBinanceKline(k){if(!Array.isArray(k)||k.length<7)throw new Error('BIGGJ_BINANCE_KLINE_INVALID');return {openTime:new Date(Number(k[0])).toISOString(),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),closeTime:new Date(Number(k[6])).toISOString()};}
export async function fetchBinanceCandles({symbol='BTCUSDT',interval='1h',startTime,endTime,limit=1000,fetchImpl=fetch}={}){
 const u=new URL(BASE);u.searchParams.set('symbol',symbol);u.searchParams.set('interval',interval);u.searchParams.set('limit',String(Math.min(1000,Math.max(1,limit))));if(startTime)u.searchParams.set('startTime',String(Date.parse(startTime)));if(endTime)u.searchParams.set('endTime',String(Date.parse(endTime)));
 const r=await fetchImpl(u);if(!r.ok)throw new Error(`BIGGJ_BINANCE_HTTP_${r.status}`);const body=await r.json();if(!Array.isArray(body))throw new Error('BIGGJ_BINANCE_RESPONSE_INVALID');return body.map(parseBinanceKline);
}
export async function runBinanceBaseline(opts={}){const candles=await fetchBinanceCandles(opts);const steps=candlesToReplaySteps(candles,{source:'binance-spot-klines',symbol:opts.symbol??'BTCUSDT',horizon:opts.horizon??1});return historicalPitReplay(steps);}
