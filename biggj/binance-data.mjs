const BASE_URL='https://api.binance.com';

export function parseBinanceKline(row){
 if(!Array.isArray(row)||row.length<6) throw new Error('BIGGJ_BINANCE_KLINE_INVALID');
 const [openTime,open,high,low,close,volume,closeTime]=row;
 const nums={open:Number(open),high:Number(high),low:Number(low),close:Number(close),volume:Number(volume)};
 if(!Object.values(nums).every(Number.isFinite)) throw new Error('BIGGJ_BINANCE_KLINE_NUMERIC_INVALID');
 return Object.freeze({openTime:new Date(Number(openTime)).toISOString(),closeTime:new Date(Number(closeTime)).toISOString(),...nums});
}

export async function fetchBinanceKlines({symbol='BTCUSDT',interval='5m',limit=1000,startTime,endTime,fetchImpl=globalThis.fetch}={}){
 if(typeof fetchImpl!=='function') throw new Error('BIGGJ_FETCH_UNAVAILABLE');
 const safeLimit=Math.min(1000,Math.max(1,Number(limit)||1000));
 const params=new URLSearchParams({symbol:String(symbol).toUpperCase(),interval:String(interval),limit:String(safeLimit)});
 if(startTime!=null) params.set('startTime',String(typeof startTime==='number'?startTime:Date.parse(startTime)));
 if(endTime!=null) params.set('endTime',String(typeof endTime==='number'?endTime:Date.parse(endTime)));
 const response=await fetchImpl(`${BASE_URL}/api/v3/klines?${params}`);
 if(!response?.ok) throw new Error(`BIGGJ_BINANCE_HTTP_${response?.status??'UNKNOWN'}`);
 const body=await response.json();
 if(!Array.isArray(body)) throw new Error('BIGGJ_BINANCE_RESPONSE_INVALID');
 return body.map(parseBinanceKline);
}
