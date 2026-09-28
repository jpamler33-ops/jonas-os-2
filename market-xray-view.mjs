export const MARKET_XRAY_VIEW_VERSION='TCX_MARKET_XRAY_VIEW_V1';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function price(v){
  const n=finite(v);
  if(n==null) return '—';
  const a=Math.abs(n);
  return n.toFixed(a<1?6:a<100?3:2);
}
function money(v){
  const n=finite(v);
  if(n==null) return '—';
  if(Math.abs(n)>=1e9) return '$'+(n/1e9).toFixed(2)+'B';
  if(Math.abs(n)>=1e6) return '$'+(n/1e6).toFixed(2)+'M';
  if(Math.abs(n)>=1e3) return '$'+(n/1e3).toFixed(1)+'K';
  return '$'+n.toFixed(0);
}
function pct(v,d=1){
  const n=finite(v);
  return n==null?'—':(n*100).toFixed(d)+'%';
}
function bar(v,max,width=10){
  const a=Math.max(0,finite(v)||0),m=Math.max(1e-12,finite(max)||0);
  const n=clamp(Math.round(a/m*width),1,width);
  return '█'.repeat(n)+'░'.repeat(Math.max(0,width-n));
}
function bookRows(rows,side,mid){
  return (Array.isArray(rows)?rows:[])
    .map(x=>{
      const p=finite(Array.isArray(x)?x[0]:x?.price);
      const q=finite(Array.isArray(x)?x[1]:x?.qty);
      if(!(p>0)||!(q>0)) return null;
      const notional=p*q;
      const distanceBps=side==='BID'?(mid-p)/mid*10000:(p-mid)/mid*10000;
      return {side,price:p,qty:q,notional,distanceBps};
    })
    .filter(Boolean);
}
function topWalls(rows,count=4){
  return [...rows].sort((a,b)=>b.notional-a.notional).slice(0,count);
}
function pressureWord(imbalance){
  const x=finite(imbalance);
  if(x==null) return 'UNKNOWN';
  if(x>=.25) return 'BID-HEAVY';
  if(x<=-.25) return 'ASK-HEAVY';
  return 'BALANCED';
}
function trendWord(v){
  const x=String(v||'').toUpperCase();
  if(x==='BULLISH'||x.includes('UP')) return 'BULL';
  if(x==='BEARISH'||x.includes('DOWN')) return 'BEAR';
  if(x==='NEUTRAL'||x.includes('RANGE')||x.includes('SIDE')) return 'NEUTRAL';
  return 'UNKNOWN';
}
function trendIcon(v){
  const t=trendWord(v);
  return t==='BULL'?'↗':t==='BEAR'?'↘':'→';
}
function lastPivot(analysis){
  const xs=Array.isArray(analysis?.classifiedPivots)?analysis.classifiedPivots:[];
  const p=xs.at(-1);
  return p?String(p.label||'—')+' '+price(p.price):'—';
}
function emaBias(analysis){
  const e20=finite(analysis?.ema20),e50=finite(analysis?.ema50);
  if(e20==null||e50==null) return '—';
  return e20>e50?'20>50':e20<e50?'20<50':'20=50';
}

export function buildMarketXray({
  symbol,
  book,
  liquidation=null,
  market=null,
  dashboard=null,
  live=false,
  refreshSeconds=10,
  now=Date.now()
}={}){
  const bids=bookRows(book?.bids,'BID',finite(book?.mid)||1).slice(0,50);
  const asks=bookRows(book?.asks,'ASK',finite(book?.mid)||1).slice(0,50);
  const bidNotional=bids.reduce((s,x)=>s+x.notional,0);
  const askNotional=asks.reduce((s,x)=>s+x.notional,0);
  const total=bidNotional+askNotional;
  const imbalance=total>0?(bidNotional-askNotional)/total:0;
  const walls=[...topWalls(bids),...topWalls(asks)];
  const maxWall=Math.max(1,...walls.map(x=>x.notional));
  const bidWalls=topWalls(bids);
  const askWalls=topWalls(asks);
  const lines=[];
  const wallLine=x=>(
    (x.side==='BID'?'BID ':'ASK ')+price(x.price)+'  '+bar(x.notional,maxWall,8)+'  '+money(x.notional)+'  '+x.distanceBps.toFixed(1)+'bps'
  );

  const w5=liquidation?.ready5m===true?liquidation.window5m:null;
  const w15=liquidation?.ready15m===true?liquidation.window15m:null;
  const liqState=w5
    ?((finite(w5.longShare)>=.6)?'LONGS HIT':(finite(w5.longShare)<=.4)?'SHORTS HIT':'BALANCED')
    :'COLLECTING';

  lines.push(
    'TCX // MARKET X-RAY · '+String(symbol||'').replace('USDT','/USDT'),
    (live?'⚡ AUTO '+Math.max(1,Math.round(Number(refreshSeconds)||10))+'s':'Snapshot')+' · ORDERBOOK + LIQUIDATIONS',
    '',
    'VISIBLE LIQUIDITY',
    'Mid '+price(book?.mid)+' · Spread '+(finite(book?.spreadBps)==null?'—':Number(book.spreadBps).toFixed(2)+'bps'),
    'Pressure '+pressureWord(imbalance)+' · Bid '+pct(bidNotional/Math.max(total,1),0)+' / Ask '+pct(askNotional/Math.max(total,1),0),
    '',
    'TOP ASK WALLS',
    ...(askWalls.length?askWalls.map(wallLine):['—']),
    '',
    'TOP BID WALLS',
    ...(bidWalls.length?bidWalls.map(wallLine):['—']),
    '',
    'LIQUIDATIONS',
    w5
      ?('5m '+money(w5.totalUsd)+' · Long '+pct(w5.longShare,0)+' · Largest '+pct(w5.largestShare,0)+' · '+liqState)
      :('5m '+(liquidation?.connected?'sammelt Daten':'Stream nicht verbunden')),
    w15
      ?('15m '+money(w15.totalUsd)+' · Long '+pct(w15.longShare,0))
      :'15m —',
    '',
    'MARKET CONTEXT',
    'Flow '+String(dashboard?.flow||'UNKNOWN')+' · Pressure '+Math.round(finite(dashboard?.pressureScore)||0)+'/100',
    'Price '+price(market?.price)+' · 24h '+(finite(market?.changePct)==null?'—':Number(market.changePct).toFixed(2)+'%'),
    '',
    'LESART',
    imbalance>=.25?'Mehr sichtbare Bid-Liquidität nahe am Markt.':imbalance<=-.25?'Mehr sichtbare Ask-Liquidität nahe am Markt.':'Sichtbares Orderbook relativ ausgeglichen.',
    w5&&w5.longShare>=.6?'In den letzten 5m wurden überwiegend Long-Positionen liquidiert.':w5&&w5.longShare<=.4?'In den letzten 5m wurden überwiegend Short-Positionen liquidiert.':'Liquidationsseite aktuell nicht stark einseitig.',
    '',
    'Sichtbare Orders können verschwinden oder verschoben werden.',
    'Orderbook-Druck ist KEINE Kurswahrscheinlichkeit.',
    'SHADOW_ONLY · REAL ORDERS BLOCKED'
  );

  return Object.freeze({
    version:MARKET_XRAY_VIEW_VERSION,
    text:lines.join('\n').slice(0,4096),
    imbalance,
    bidNotional,
    askNotional,
    topBidWalls:Object.freeze(bidWalls),
    topAskWalls:Object.freeze(askWalls),
    liquidationState:liqState,
    generatedAt:Number(now),
    researchOnly:true
  });
}

export function buildMtfMatrix({
  symbol,
  analyses={},
  dashboard=null,
  availableAt=Date.now()
}={}){
  const frames=['1m','5m','15m','1h','4h'];
  const rows=frames.map(tf=>{
    const a=analyses?.[tf]||{};
    return {
      tf,
      trend:trendWord(a?.trend),
      pivot:lastPivot(a),
      ema:emaBias(a),
      support:finite(a?.support),
      resistance:finite(a?.resistance)
    };
  });
  const bulls=rows.filter(x=>x.trend==='BULL').length;
  const bears=rows.filter(x=>x.trend==='BEAR').length;
  const alignment=bulls>=4?'STRONG BULL ALIGNMENT':bears>=4?'STRONG BEAR ALIGNMENT':bulls>=3?'BULL LEAN':bears>=3?'BEAR LEAN':'MIXED';
  const text=[
    'TCX // MTF MATRIX · '+String(symbol||'').replace('USDT','/USDT'),
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    'TF   TREND     LAST SWING      EMA',
    ...rows.map(x=>(
      x.tf.padEnd(4,' ')+' '+trendIcon(x.trend)+' '+x.trend.padEnd(8,' ')+' '+x.pivot.padEnd(15,' ')+' '+x.ema
    )),
    '',
    'ALIGNMENT  '+alignment,
    'REGIME     '+String(dashboard?.regime||'UNKNOWN'),
    'FLOW       '+String(dashboard?.flow||'UNKNOWN'),
    'PRESSURE   '+Math.round(finite(dashboard?.pressureScore)||0)+'/100',
    '',
    'KEY LEVELS',
    ...rows.filter(x=>x.tf!=='1m').map(x=>x.tf+'  S '+price(x.support)+' · R '+price(x.resistance)),
    '',
    'LESART',
    bulls>=4?'Fast alle Zeitebenen zeigen steigende Struktur.':bears>=4?'Fast alle Zeitebenen zeigen fallende Struktur.':'Zeitebenen widersprechen sich teilweise.',
    'Ein 1m-Signal allein wiegt deutlich weniger als 1h/4h-Struktur.',
    '',
    'DERIVED STRUCTURE · SHADOW_ONLY'
  ].join('\n').slice(0,4096);
  return Object.freeze({
    version:'TCX_MTF_MATRIX_V1',
    text,
    rows:Object.freeze(rows),
    alignment,
    availableAt:Number(availableAt),
    researchOnly:true
  });
}
