import { fetchBinanceKlines } from './binance-data.mjs';

const iso=ms=>new Date(Number(ms)).toISOString();

export function parseKrakenOHLC(row,intervalMinutes){
 if(!Array.isArray(row)||row.length<7) throw new Error('BIGGJ_KRAKEN_OHLC_INVALID');
 const [time,open,high,low,close,,volume]=row;
 const openMs=Number(time)*1000;
 const nums={open:Number(open),high:Number(high),low:Number(low),close:Number(close),volume:Number(volume)};
 if(!Number.isFinite(openMs)||!Object.values(nums).every(Number.isFinite)) throw new Error('BIGGJ_KRAKEN_OHLC_NUMERIC_INVALID');
 return Object.freeze({openTime:iso(openMs),closeTime:iso(openMs+Number(intervalMinutes)*60_000),...nums});
}

const krakenInterval={'1m':1,'5m':5,'15m':15,'30m':30,'1h':60,'4h':240,'1d':1440};
export async function fetchKrakenOHLC({interval='5m',fetchImpl=globalThis.fetch}={}){
 const minutes=krakenInterval[interval]; if(!minutes) throw new Error('BIGGJ_KRAKEN_INTERVAL_UNSUPPORTED');
 const response=await fetchImpl(`https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${minutes}`);
 if(!response?.ok) throw new Error(`BIGGJ_KRAKEN_HTTP_${response?.status??'UNKNOWN'}`);
 const body=await response.json(); if(body?.error?.length) throw new Error(`BIGGJ_KRAKEN_API_${body.error.join('_')}`);
 const key=Object.keys(body?.result??{}).find(k=>k!=='last'); const rows=key?body.result[key]:null;
 if(!Array.isArray(rows)) throw new Error('BIGGJ_KRAKEN_RESPONSE_INVALID');
 return rows.map(r=>parseKrakenOHLC(r,minutes));
}

export async function fetchHistoricalCandles({symbol='BTCUSDT',interval='5m',limit=1000,fetchImpl=globalThis.fetch}={}){
 const attempts=[];
 try { const candles=await fetchBinanceKlines({symbol,interval,limit,fetchImpl}); return {provider:'binance',symbol,interval,candles:candles.slice(-limit),attempts}; }
 catch(error){attempts.push({provider:'binance',error:String(error?.message??error)});}
 try { const candles=await fetchKrakenOHLC({interval,fetchImpl}); return {provider:'kraken',symbol:'XBTUSD',interval,candles:candles.slice(-limit),attempts}; }
 catch(error){attempts.push({provider:'kraken',error:String(error?.message??error)});}
 const failure=new Error('BIGGJ_ALL_MARKET_PROVIDERS_FAILED'); failure.attempts=attempts; throw failure;
}
