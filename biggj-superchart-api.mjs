export const BIGGJ_SUPERCHART_API_VERSION='BIGGJ_SUPERCHART_API_V2';

const INTERVALS=new Set(['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d']);
export function normalizeChartSymbol(value='BTCUSDT'){
  const s=String(value).toUpperCase().replace(/[^A-Z0-9]/g,'');
  return /^[A-Z0-9]{5,20}$/.test(s)?s:'BTCUSDT';
}
export function normalizeChartInterval(value='1m'){
  const v=String(value);
  return INTERVALS.has(v)?v:'1m';
}
export function candlePayload(klines=[],meta={}){
  const candles=(Array.isArray(klines)?klines:[]).map((x,i)=>Array.isArray(x)?{
    t:Number(x[0]),o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5]||0)
  }:{
    t:Number(x?.t??x?.time??x?.openTime??i),o:Number(x?.o??x?.open),h:Number(x?.h??x?.high),l:Number(x?.l??x?.low),c:Number(x?.c??x?.close),v:Number(x?.v??x?.volume??0)
  }).filter(x=>Number.isFinite(x.t)&&[x.o,x.h,x.l,x.c,x.v].every(Number.isFinite)&&x.h>=Math.max(x.o,x.c,x.l)&&x.l<=Math.min(x.o,x.c,x.h));
  return {version:BIGGJ_SUPERCHART_API_VERSION,symbol:normalizeChartSymbol(meta.symbol),interval:normalizeChartInterval(meta.interval),observedAt:Number(meta.observedAt)||Date.now(),source:String(meta.source||'BIGGJ_POINT_IN_TIME'),candles};
}
export function chartRequest(url='/',base='http://localhost'){
  const u=new URL(url,base);
  return {symbol:normalizeChartSymbol(u.searchParams.get('symbol')),interval:normalizeChartInterval(u.searchParams.get('interval'))};
}
