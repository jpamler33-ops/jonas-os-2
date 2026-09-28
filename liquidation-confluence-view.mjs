export const LIQUIDATION_CONFLUENCE_VIEW_VERSION='TCX_LIQUIDATION_CONFLUENCE_VIEW_V1';

function finite(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,Number(v)||0));}
function price(v){
  const n=finite(v);
  if(n==null) return '—';
  const a=Math.abs(n);
  return n.toFixed(a<1?6:a<100?3:2);
}
function money(v){
  const n=finite(v);
  if(n==null) return '—';
  const a=Math.abs(n);
  if(a>=1e9)return '$'+(n/1e9).toFixed(2)+'B';
  if(a>=1e6)return '$'+(n/1e6).toFixed(2)+'M';
  if(a>=1e3)return '$'+(n/1e3).toFixed(1)+'K';
  return '$'+n.toFixed(0);
}
function bar(value,max,width=12){
  const v=Math.max(0,finite(value)||0),m=Math.max(1e-12,finite(max)||0);
  const n=v<=0?0:Math.max(1,Math.min(width,Math.round(v/m*width)));
  return '█'.repeat(n)+'░'.repeat(width-n);
}
function distanceText(bps){
  const n=finite(bps);
  if(n==null)return '—';
  return (n>=0?'+':'')+n.toFixed(1)+'bps';
}
function featureMap(rows){
  const m=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    const id=String(row?.id||'');
    const value=finite(row?.value);
    if(id&&value!=null)m.set(id,value);
  }
  return m;
}
function sideLabel(cluster){
  const s=finite(cluster?.longShare);
  if(s==null)return 'MIXED';
  if(s>=.62)return 'LONG LIQS';
  if(s<=.38)return 'SHORT LIQS';
  return 'MIXED';
}

export function buildObservedLiquidationHeatmap({
  symbol,
  liquidation,
  referencePrice,
  window='5m',
  live=false,
  refreshSeconds=10
}={}){
  const use15=String(window).toLowerCase()==='15m';
  const clusters=(use15?liquidation?.clusters15m:liquidation?.clusters5m)||[];
  const summary=use15?liquidation?.window15m:liquidation?.window5m;
  const ready=use15?liquidation?.ready15m===true:liquidation?.ready5m===true;
  const max=Math.max(1,...clusters.map(x=>finite(x?.totalUsd)||0));
  const ordered=[...clusters].sort((a,b)=>(finite(b?.price)||0)-(finite(a?.price)||0)).slice(0,12);
  const lines=[
    'TCX // LIQUIDATION HEATMAP · '+String(symbol||'').replace('USDT','/USDT'),
    String(window).toUpperCase()+' · '+(live?'⚡ AUTO '+Math.max(1,Math.round(Number(refreshSeconds)||10))+'s':'Snapshot'),
    '',
    'CURRENT  '+price(referencePrice),
    ready?'OBSERVED BYBIT LIQUIDATIONS':'COLLECTING LIVE COVERAGE',
    ''
  ];
  if(ready&&ordered.length){
    lines.push('PRICE ZONES');
    for(const c of ordered){
      const rel=finite(c?.distanceBps);
      const arrow=rel==null?'·':rel>4?'↑':rel<-4?'↓':'•';
      lines.push(
        arrow+' '+price(c.price)+'  '+bar(c.totalUsd,max,10)+'  '+money(c.totalUsd)+'  '+sideLabel(c)+'  '+distanceText(rel)
      );
    }
  }else{
    lines.push('Noch nicht genug beobachtete Ereignisse für Preiscluster.');
  }
  lines.push(
    '',
    'WINDOW',
    summary
      ?('Total '+money(summary.totalUsd)+' · Long '+((finite(summary.longShare)||0)*100).toFixed(0)+'% · Count '+Number(summary.count||0))
      :'—',
    '',
    'LESART',
    'Die Balken zeigen, WO in diesem Zeitfenster Liquidationen tatsächlich ausgeführt wurden.',
    'LONG LIQS = Long-Positionen wurden liquidiert · SHORT LIQS = Short-Positionen wurden liquidiert.',
    '',
    'KEINE Zukunfts-Liquidationslevel: Dafür wären offene Positionen, Entry-Preise und Hebelverteilung nötig.',
    'OBSERVED EVENTS · SHADOW_ONLY'
  );
  return Object.freeze({
    version:LIQUIDATION_CONFLUENCE_VIEW_VERSION,
    text:lines.join('\n').slice(0,4096),
    clusters:Object.freeze(ordered),
    window:String(window),
    ready,
    observedOnly:true,
    futureLiquidationLevels:false
  });
}

function candidate(priceValue,type,strength,meta={}){
  const p=finite(priceValue);
  if(!(p>0))return null;
  return {
    price:p,
    type:String(type),
    source:String(meta.source||type),
    strength:clamp(strength),
    side:String(meta.side||'NEUTRAL'),
    detail:String(meta.detail||'')
  };
}
function wallRows(book,side,limit=4){
  const rows=(side==='BID'?book?.bids:book?.asks)||[];
  const parsed=rows.slice(0,50).map(x=>{
    const p=finite(Array.isArray(x)?x[0]:x?.price),q=finite(Array.isArray(x)?x[1]:x?.qty);
    return p>0&&q>0?{price:p,notional:p*q}:null;
  }).filter(Boolean);
  const max=Math.max(1,...parsed.map(x=>x.notional));
  return parsed.sort((a,b)=>b.notional-a.notional).slice(0,limit).map(x=>({
    ...x,strength:clamp(x.notional/max),side
  }));
}
function mergeCandidates(rows,currentPrice,{mergeBps=20}={}){
  const sorted=[...rows].filter(Boolean).sort((a,b)=>a.price-b.price);
  const groups=[];
  for(const row of sorted){
    let best=null,bestDist=Infinity;
    for(const g of groups){
      const dist=Math.abs(row.price-g.center)/g.center*10000;
      if(dist<=mergeBps&&dist<bestDist){best=g;bestDist=dist;}
    }
    if(!best){
      best={center:row.price,rows:[],weight:0,weighted:0};
      groups.push(best);
    }
    const w=Math.max(.05,row.strength);
    best.rows.push(row);
    best.weight+=w;
    best.weighted+=row.price*w;
    best.center=best.weighted/best.weight;
  }
  return groups.map(g=>{
    const sources=[...new Set(g.rows.map(x=>x.source))];
    const types=[...new Set(g.rows.map(x=>x.type))];
    const supportVotes=g.rows.filter(x=>x.side==='SUPPORT'||x.side==='BID').length;
    const resistanceVotes=g.rows.filter(x=>x.side==='RESISTANCE'||x.side==='ASK').length;
    const role=supportVotes>resistanceVotes?'SUPPORT CONFLUENCE':resistanceVotes>supportVotes?'RESISTANCE CONFLUENCE':'MIXED CONFLUENCE';
    const strengthAvg=g.rows.reduce((s,x)=>s+x.strength,0)/Math.max(1,g.rows.length);
    const score=Math.round(100*clamp(.5*(sources.length/3)+.5*strengthAvg));
    return Object.freeze({
      price:g.center,
      distanceBps:currentPrice>0?(g.center-currentPrice)/currentPrice*10000:null,
      score,
      role,
      sources:Object.freeze(sources),
      types:Object.freeze(types),
      evidence:Object.freeze(g.rows)
    });
  }).sort((a,b)=>b.score-a.score||Math.abs(a.distanceBps||0)-Math.abs(b.distanceBps||0));
}

export function buildConfluenceMap({
  symbol,
  currentPrice,
  analysis={},
  book={},
  liquidation=null,
  intelligenceFeatures=[],
  mergeBps=20
}={}){
  const p=finite(currentPrice);
  const candidates=[];
  const add=x=>{if(x)candidates.push(x);};

  add(candidate(analysis?.support,'STRUCTURE_SUPPORT',1,{source:'STRUCTURE',side:'SUPPORT',detail:'5m support'}));
  add(candidate(analysis?.resistance,'STRUCTURE_RESISTANCE',1,{source:'STRUCTURE',side:'RESISTANCE',detail:'5m resistance'}));
  const pivots=(Array.isArray(analysis?.classifiedPivots)?analysis.classifiedPivots:[]).slice(-6);
  for(const x of pivots){
    add(candidate(x?.price,'SWING_'+String(x?.label||'UNKNOWN'),.55,{
      source:'STRUCTURE',side:x?.kind==='L'?'SUPPORT':'RESISTANCE',detail:String(x?.label||'swing')
    }));
  }

  for(const x of wallRows(book,'BID',4)) add(candidate(x.price,'BID_WALL',x.strength,{source:'ORDERBOOK',side:'BID',detail:money(x.notional)}));
  for(const x of wallRows(book,'ASK',4)) add(candidate(x.price,'ASK_WALL',x.strength,{source:'ORDERBOOK',side:'ASK',detail:money(x.notional)}));

  const liqClusters=liquidation?.clusters15m?.length?liquidation.clusters15m:(liquidation?.clusters5m||[]);
  const maxLiq=Math.max(1,...liqClusters.map(x=>finite(x?.totalUsd)||0));
  for(const x of liqClusters.slice(0,8)){
    add(candidate(x.price,'OBSERVED_LIQUIDATION_CLUSTER',(finite(x.totalUsd)||0)/maxLiq,{
      source:'LIQUIDATION',
      side:'NEUTRAL',
      detail:money(x.totalUsd)+' '+sideLabel(x)
    }));
  }

  const zones=mergeCandidates(candidates,p||1,{mergeBps}).slice(0,8);
  const fm=featureMap(intelligenceFeatures);
  const squeeze=fm.get('research.intelligence.squeezeRisk');
  const squeezeDirection=fm.get('research.intelligence.squeezeDirection');
  const options=fm.get('research.intelligence.optionsDownsidePressure');
  const macro=fm.get('research.intelligence.macroCurveStress');
  const cross=fm.get('research.intelligence.crossDomainStress');
  const crowd=fm.get('research.intelligence.leverageCrowding');

  const lines=[
    'TCX // CONFLUENCE MAP · '+String(symbol||'').replace('USDT','/USDT'),
    '━━━━━━━━━━━━━━━━━━━━',
    'Current '+price(p),
    '',
    'TOP PRICE ZONES'
  ];
  if(zones.length){
    for(const z of zones){
      lines.push(
        price(z.price)+' · '+z.score+'/100 · '+z.role+' · '+distanceText(z.distanceBps),
        '  '+z.sources.join(' + ')+' · '+z.types.slice(0,4).join(', ')
      );
    }
  }else lines.push('Noch keine ausreichenden Preiszonen.');

  lines.push(
    '',
    'GLOBAL CONTEXT',
    'Squeeze Risk       '+(squeeze==null?'—':Math.round(squeeze*100)+'/100'),
    'Squeeze Direction  '+(squeezeDirection==null?'—':squeezeDirection>0?'UP-SQUEEZE BIAS':squeezeDirection<0?'DOWN-SQUEEZE BIAS':'NEUTRAL'),
    'Leverage Crowding  '+(crowd==null?'—':crowd.toFixed(2)),
    'Options Downside   '+(options==null?'—':options.toFixed(2)),
    'Macro Curve Stress '+(macro==null?'—':macro.toFixed(2)),
    'Cross-Domain Stress '+(cross==null?'—':Math.round(cross*100)+'/100'),
    '',
    'LESART',
    'Ein hoher Confluence-Score heißt: mehrere Evidenzarten liegen nahe derselben Preiszone.',
    'Der Score ist KEINE Trefferwahrscheinlichkeit und KEIN Trade-Signal.',
    'Options/Makro wirken als globaler Kontext und werden nicht künstlich einem Preislevel zugeordnet.',
    '',
    'STRUCTURE + ORDERBOOK + OBSERVED LIQUIDATIONS · SHADOW_ONLY'
  );

  return Object.freeze({
    version:LIQUIDATION_CONFLUENCE_VIEW_VERSION,
    text:lines.join('\n').slice(0,4096),
    zones:Object.freeze(zones),
    globalContext:Object.freeze({squeeze,squeezeDirection,crowd,options,macro,cross}),
    scoreIsProbability:false,
    researchOnly:true
  });
}
