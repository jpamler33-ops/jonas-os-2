import crypto from 'node:crypto';
const iso=x=>new Date(x).toISOString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function fetchKrakenPagedOHLC({pair='XBTUSD',interval=60,since,until,fetchImpl=globalThis.fetch,maxPages=100,pauseMs=250}={}){
 if(!Number.isFinite(Number(since))||!Number.isFinite(Number(until))||Number(since)>=Number(until))throw new Error('BIGGJ_DATASET_BOUNDS_INVALID');
 let cursor=Math.floor(Number(since)/1000),pages=0;const byTime=new Map();
 while(pages++<maxPages){const u=`https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${interval}&since=${cursor}`;const res=await fetchImpl(u);if(!res?.ok)throw new Error(`BIGGJ_KRAKEN_HTTP_${res?.status??'UNKNOWN'}`);const body=await res.json();if(body?.error?.length)throw new Error(`BIGGJ_KRAKEN_API_${body.error.join('_')}`);const key=Object.keys(body?.result??{}).find(k=>k!=='last'),rows=key?body.result[key]:[];if(!Array.isArray(rows)||!rows.length)break;let newest=cursor;for(const r of rows){const t=Number(r[0]);newest=Math.max(newest,t);const ms=t*1000;if(ms<Number(since)||ms>=Number(until))continue;byTime.set(ms,{openTime:iso(ms),closeTime:iso(ms+interval*60_000),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[6])});}const next=Number(body.result.last)||newest+1;if(next<=cursor||newest*1000>=Number(until))break;cursor=next;if(pauseMs)await sleep(pauseMs);}
 return [...byTime.values()].sort((a,b)=>Date.parse(a.openTime)-Date.parse(b.openTime));
}
export function sealDataset({provider,pair,interval,start,end,candles}){const payload={schema:'BIGGJ_DATASET_V1',provider,pair,interval,start:iso(start),endExclusive:iso(end),count:candles.length,candles};const sha256=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');return Object.freeze({...payload,sha256});}
export function verifyDataset(dataset){const {sha256,...payload}=dataset;return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')===sha256;}
export function splitByCutoff(dataset,cutoff){if(!verifyDataset(dataset))throw new Error('BIGGJ_DATASET_INTEGRITY_FAILED');const t=Date.parse(cutoff);return Object.freeze({preHoldout:dataset.candles.filter(c=>Date.parse(c.closeTime)<=t),holdout:dataset.candles.filter(c=>Date.parse(c.openTime)>=t),cutoff:new Date(t).toISOString(),datasetSha256:dataset.sha256});}
