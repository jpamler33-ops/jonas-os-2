export const SUPERCHART_VERSION='TCX_SUPERCHART_V1';

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function pct(v,d=0){const n=finite(v);return n==null?'—':(n*100).toFixed(d)+'%';}
function signed(v,d=2){const n=finite(v);return n==null?'—':(n>0?'+':'')+n.toFixed(d);}
function money(v){
  const n=finite(v);if(n==null)return '—';
  const a=Math.abs(n);if(a>=1e9)return '$'+(n/1e9).toFixed(1)+'B';
  if(a>=1e6)return '$'+(n/1e6).toFixed(1)+'M';
  if(a>=1e3)return '$'+(n/1e3).toFixed(1)+'K';
  return '$'+n.toFixed(0);
}
function topEntity(entityFlow){
  if(entityFlow?.ok!==true)return null;
  const rows=[];
  for(const [entityId,windows] of Object.entries(entityFlow.entities||{})){
    const m=windows?.['5m']||windows?.['15m'];
    if(m)rows.push({entityId,...m});
  }
  return rows.sort((a,b)=>Number(b.grossExternalEth||0)-Number(a.grossExternalEth||0))[0]||null;
}
function liqZones(liquidation,max=5){
  const rows=liquidation?.clusters15m?.length?liquidation.clusters15m:(liquidation?.clusters5m||[]);
  return rows.slice(0,max).map(x=>Object.freeze({
    price:finite(x?.price),
    totalUsd:finite(x?.totalUsd)||0,
    longUsd:finite(x?.longUsd)||0,
    shortUsd:finite(x?.shortUsd)||0
  })).filter(x=>x.price!=null);
}
export function buildSuperchartIntel({
  mode='PRO',
  symbol,
  confluence=null,
  liquidation=null,
  entityFlow=null,
  walletCohort=null,
  onchain=null,
  accuracy=null,
  events=null,
  forecastOverlay=null
}={}){
  const m=['CLEAN','PRO','FULL'].includes(String(mode).toUpperCase())?String(mode).toUpperCase():'PRO';
  const top=topEntity(entityFlow);
  const acc=accuracy?.ready?accuracy?.evaluation?.overall:null;
  const zones=(confluence?.zones||[]).slice(0,m==='FULL'?6:4).map(z=>Object.freeze({
    price:finite(z?.price),score:finite(z?.score)||0,role:String(z?.role||'ZONE'),sources:[...(z?.sources||[])]
  })).filter(z=>z.price!=null);
  const lz=liqZones(liquidation,m==='FULL'?6:4);
  const eventRows=(events?.events||[]).slice(0,m==='FULL'?6:3);
  const badges=[
    {label:'MODE',value:m},
    {label:'FORECAST',value:forecastOverlay?String(forecastOverlay.status||'ACTIVE'):'—'},
    {label:'EVENTS',value:String(eventRows.length)}
  ];
  if(m!=='CLEAN'){
    badges.push({label:'CONFL',value:zones[0]?String(Math.round(zones[0].score))+'/100':'—'});
    badges.push({label:'FLOW',value:top?((finite(top.netExternalEth)||0)>0?'INFLOW':(finite(top.netExternalEth)||0)<0?'OUTFLOW':'BAL'):'—'});
  }
  if(m==='FULL'){
    badges.push({label:'ACC',value:acc?pct(acc.directionalAccuracy,0):'COLLECT'});
    badges.push({label:'Brier',value:acc&&finite(acc.multiclassBrier)!=null?Number(acc.multiclassBrier).toFixed(3):'—'});
  }
  const panel=[];
  if(m!=='CLEAN'){
    panel.push('CONFL '+(zones[0]?Math.round(zones[0].score)+'/100 '+zones[0].role:'—'));
    panel.push('LIQ '+(lz[0]?money(lz[0].totalUsd):'—'));
    panel.push('FLOW '+(top?top.entityId+' '+signed(top.netExternalEth,1)+' ETH':'—'));
  }
  if(m==='FULL'){
    panel.push('ACC '+(acc?pct(acc.directionalAccuracy,1):'collecting'));
    panel.push('ECE '+(acc?pct(acc.expectedCalibrationError,1):'—'));
    panel.push('CHAIN '+(onchain?.ok?String(onchain.chain||'LIVE'):'—'));
    panel.push('COHORT '+(walletCohort?.ok?'LIVE':'—'));
  }
  return Object.freeze({
    version:SUPERCHART_VERSION,mode:m,symbol:String(symbol||''),
    confluenceZones:Object.freeze(zones),
    liquidationZones:Object.freeze(lz),
    events:Object.freeze(eventRows),
    badges:Object.freeze(badges),
    panel:Object.freeze(panel),
    accuracyReady:Boolean(acc),
    researchOnly:true
  });
}
