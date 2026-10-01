import http from 'node:http';
import {candlePayload,chartRequest} from './biggj-superchart-api.mjs';
import {readFile} from 'node:fs/promises';

const originalCreateServer=http.createServer.bind(http);
const chartScript=await readFile(new URL('./biggj-superchart-v2.js',import.meta.url),'utf8');
const allowedSymbols=/^[A-Z0-9]{5,20}$/;
const intervalMap=new Set(['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d']);

async function fetchKlines(symbol,interval){
  const bases=(process.env.TCX_BINANCE_REST_BASES||process.env.TCX_BINANCE_REST_BASE||'https://data-api.binance.vision,https://api1.binance.com,https://api.binance.com').split(',').map(x=>x.trim().replace(/\/+$/,'')).filter(Boolean);
  let lastError=null;
  for(const base of bases){
    try{
      const u=new URL(base+'/api/v3/klines');
      u.searchParams.set('symbol',symbol);u.searchParams.set('interval',interval);u.searchParams.set('limit','500');
      const r=await fetch(u,{headers:{accept:'application/json'},signal:AbortSignal.timeout(7000)});
      if(!r.ok)throw new Error('HTTP_'+r.status);
      const rows=await r.json();
      if(!Array.isArray(rows))throw new Error('INVALID_KLINES');
      return {rows,source:'BINANCE_PUBLIC_REST_KLINES',host:new URL(base).host};
    }catch(err){lastError=err;}
  }
  throw lastError||new Error('KLINES_UNAVAILABLE');
}

function injectSuperChart(html){
  if(typeof html!=='string'||!html.includes('/superchart.png'))return html;
  const img=/<img\s+id="chartImg"[^>]*>/;
  const replacement='<canvas id="biggjChartCanvas" data-symbol="BTCUSDT" data-interval="1m" style="width:100%;height:100%;touch-action:none"></canvas><img id="biggjChartFallback" hidden alt="BIGGJ SuperChart fallback">';
  let out=html.replace(img,replacement);
  out=out.replace('</body>','<script src="/biggj-superchart-v2.js"></script></body>');
  out=out.replace("const img=document.getElementById('chartImg');if(!img)return;", "const img=document.getElementById('biggjChartFallback');const canvas=document.getElementById('biggjChartCanvas');if(canvas){canvas.dataset.symbol=CHART.symbol;canvas.dataset.interval=CHART.interval;canvas.hidden=false;}if(!img&&!canvas)return;");
  out=out.replace("img.src=url;", "if(img)img.src=url;if(window.BIGGJSuperChart)window.BIGGJSuperChart.reload();");
  return out;
}

http.createServer=(...args)=>{
  const listener=typeof args.at(-1)==='function'?args.pop():null;
  const wrapped=listener?async(req,res)=>{
    const path=String(req.url||'').split('?')[0];
    if(path==='/biggj-superchart-v2.js'){
      res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(chartScript);return;
    }
    if(path==='/market-candles.json'){
      try{
        const q=chartRequest(req.url||'/');
        if(!allowedSymbols.test(q.symbol)||!intervalMap.has(q.interval))throw new Error('INVALID_CHART_REQUEST');
        const {rows,source,host}=await fetchKlines(q.symbol,q.interval);
        const payload=candlePayload(rows,{symbol:q.symbol,interval:q.interval,observedAt:Date.now(),source:source+'@'+host});
        res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-biggj-execution':'SHADOW_ONLY'});res.end(JSON.stringify(payload));return;
      }catch(err){
        res.writeHead(503,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({ok:false,error:'MARKET_CANDLES_UNAVAILABLE',message:String(err?.message||err).slice(0,160),execution:'SHADOW_ONLY',canExecuteLive:false}));return;
      }
    }
    if(path==='/mission-control'){
      const chunks=[];
      const end=res.end.bind(res);
      const write=res.write.bind(res);
      const writeHead=res.writeHead.bind(res);
      let pendingHead=null;
      res.writeHead=(...headArgs)=>{pendingHead=headArgs;return res;};
      res.write=(chunk,...rest)=>{if(chunk!==undefined&&chunk!==null)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk)));return true;};
      res.end=(chunk,...rest)=>{
        if(chunk!==undefined&&chunk!==null)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk)));
        const body=Buffer.concat(chunks).toString('utf8');
        const contentType=String(res.getHeader?.('content-type')||pendingHead?.[1]?.['content-type']||pendingHead?.[1]?.['Content-Type']||'');
        const next=contentType.includes('text/html')||body.includes('/superchart.png')?injectSuperChart(body):body;
        res.setHeader?.('content-length',Buffer.byteLength(next));
        if(pendingHead){
          const [statusCode,statusMessageOrHeaders,maybeHeaders]=pendingHead;
          const headers=(typeof statusMessageOrHeaders==='string'?maybeHeaders:statusMessageOrHeaders)||{};
          const safeHeaders={...headers,'content-length':String(Buffer.byteLength(next))};
          if(typeof statusMessageOrHeaders==='string')writeHead(statusCode,statusMessageOrHeaders,safeHeaders);
          else writeHead(statusCode,safeHeaders);
        }
        return end(next,...rest);
      };
      try{return await listener(req,res);}catch(err){res.write=write;res.end=end;res.writeHead=writeHead;throw err;}
    }
    return listener(req,res);
  }:undefined;
  return originalCreateServer(...args,wrapped).on('error',err=>console.error('[BIGGJ_RUNTIME_V2_HTTP]',err));
};

await import('./bot.mjs');
