import { renderBiggjMobileApp } from './biggj-mobile-webapp.mjs';

export const MISSION_CONTROL_VERSION='BIGGJ_MARKET_SCIENCE_CONTROL_V2';

export function missionControlSnapshot({health,portfolio,discovery,storage}={}){
  return {
    version:MISSION_CONTROL_VERSION,
    generatedAt:Date.now(),
    biggj:health?.biggjMarketScienceOs||null,
    health:health||{},
    portfolio:portfolio||{},
    discovery:discovery||{},
    storage:storage||{},
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

function tradingVisibilityPatch(){return `<script>
(()=>{
  const OLD_TRADING=trading;
  const val=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;
  const pct=x=>Number.isFinite(Number(x))?(Number(x)*100).toFixed(1)+'%':'—';
  const txt=x=>E(String(x??'—'));
  const modeName=x=>({CHALLENGER:'Challenger',ABSTAIN_PROBE:'ABSTAIN Probe',COVERAGE_PROBE:'Coverage Probe',EXPLORATION:'Exploration'}[String(x||'').toUpperCase()]||String(x||'Research'));
  const blocker=d=>Array.isArray(d?.topBlockers)&&d.topBlockers.length?d.topBlockers[0]:null;
  const researchCard=x=>'<div class="panel"><b>'+txt(String(x.symbol||'').replace('USDT','/USDT'))+' · '+txt(x.side||'—')+'</b><div class="ms">'+txt(modeName(x.entryMode))+' · Entry '+PRICE(x.entryPrice)+' · '+txt(x.horizonId||'kein Horizont')+'</div><div class="ms">PnL '+(Number.isFinite(Number(x.unrealizedNetPnlQuote))?MONEY(x.unrealizedNetPnlQuote):'—')+' · Return '+pct(x.unrealizedReturnPct)+'</div></div>';
  trading=function(){
    const p=S.portfolio||{},r=p.researchActivity||{},d=S.discovery||{},open=(p.positions||[]).filter(x=>String(x.status||'OPEN').toUpperCase()==='OPEN'),ro=Array.isArray(r.active)?r.active:[],rc=Array.isArray(r.recentClosed)?r.recentClosed:[],b=blocker(d),runtime=d.runtime||{};
    const pipeline=[
      ['SCAN',val(d.checkedCoins)],['FORECAST',val(d.forecastAvailable)],['ADMITTED',val(d.admittedForecasts)],['CALIBRATED',val(d.totalCalibratedHorizons)],['PRIMARY CAND.',val(d.standardCandidates)],['RESEARCH CAND.',val(d.explorationCandidates)],['PRIMARY TRADE',val(d.standardTrades)],['RESEARCH TRADE',val(d.explorationTrades)+val(d.coverageProbes)]
    ];
    const modes=Object.entries(r.byMode||{}).map(([k,v])=>'<div class="panel"><b>'+txt(modeName(k))+'</b><div class="ms">'+val(v?.open)+' offen · '+val(v?.closed)+' geschlossen · '+MONEY(v?.realizedPnlQuote)+'</div></div>').join('');
    return '<section class="view '+(TAB==='trading'?'active':'')+'"><div class="hero"><div class="over">SHADOW TRADING</div><h1>PRIMARY + <span class="cyan">RESEARCH</span></h1><div class="sub">Performance und Forschungs-Trades werden getrennt. Research-Aktivität wird nicht als Primary-Performance ausgegeben. SHADOW_ONLY · ABSTAIN · canExecuteLive:false.</div></div>'+
      sec('Primary Shadow','Performance')+'<div class="grid">'+metric('Equity',MONEY(p.equityQuote),'Primary Shadow')+metric('Net PnL',MONEY(p.netPnlQuote),val(p.closedTrades)+' closed',val(p.netPnlQuote)>=0?'good':'bad')+metric('Open',val(p.openPositions),'Primary')+metric('Closed',val(p.closedTrades),'Primary Trades')+'</div>'+
      sec('Research Trading','nicht in Primary-PnL')+'<div class="grid">'+metric('Research Open',val(r.openPositions),'Probes / Challenger')+metric('Research Closed',val(r.closedTrades),'Lern-Trades')+metric('Research PnL',MONEY(r.netPnlQuote),'separat',val(r.netPnlQuote)>=0?'good':'bad')+metric('Win Rate',pct(r.winRate),val(r.wins)+' W · '+val(r.losses)+' L')+'</div>'+
      sec('Discovery Pipeline','wo Kandidaten hängen')+'<div class="grid">'+pipeline.map(x=>metric(x[0],x[1],'')).join('')+'</div>'+
      sec('Aktueller Blocker',b?val(b.count)+' Treffer':'kein dominanter Blocker')+'<div class="panel"><div class="ml">'+txt(b?.reason||'PIPELINE STATUS')+'</div><div class="mv">'+txt(b?.text||d.nextStep||'Noch kein vollständiger Discovery-Scan.')+'</div><div class="ms">Kalibrierte Horizonte '+val(d.totalCalibratedHorizons)+' / '+val(d.totalHorizons)+' · Horizon PASS '+val(d.horizonPasses)+' · Data Safety NORMAL '+val(d.normalDataSafety)+' / '+val(d.checkedCoins)+'</div></div>'+
      sec('Runtime Gates')+'<div class="grid">'+metric('OMS',txt(runtime.omsStatus||'—'),val(runtime.omsFilled)+' filled')+metric('Academy',txt(runtime.academyStage||'—'),'Core '+(runtime.academyCoreAllowed===true?'frei':runtime.academyCoreAllowed===false?'HOLD':'—'))+metric('Supervisor',runtime.trainingHold===true?'HOLD':runtime.trainingHold===false?'FREI':'—',txt(runtime.trainingMission||'—'))+metric('Discovery Open',val(runtime.openDiscoveryPositions),'/ '+txt(runtime.discoveryOpenCap??'?'))+'</div>'+
      (modes?sec('Research Modi')+modes:'')+
      sec('Offene Primary Positionen')+(open.length?open.map(x=>'<div class="panel"><b>'+txt(String(x.symbol||'').replace('USDT','/USDT'))+' · '+txt(x.side||'—')+'</b><div class="ms">Entry '+PRICE(x.entryPrice||x.avgEntryPrice)+' · Mark '+PRICE(x.lastMark?.price||x.markPrice)+'</div></div>').join(''):'<div class="panel"><div class="ms">Keine offenen Primary-Shadow-Positionen.</div></div>')+
      sec('Aktive Research Positionen')+(ro.length?ro.slice(0,12).map(researchCard).join(''):'<div class="panel"><div class="ms">Aktuell keine offenen Research-Positionen. Die Pipeline oben zeigt, an welchem Gate neue Kandidaten hängen.</div></div>')+
      (rc.length?sec('Letzte Research Abschlüsse')+rc.slice(0,6).map(x=>'<div class="panel"><b>'+txt(String(x.symbol||'').replace('USDT','/USDT'))+' · '+txt(modeName(x.entryMode))+'</b><div class="ms">'+txt(x.closeReason||'geschlossen')+' · '+MONEY(x.realizedNetPnlQuote)+' · '+pct(x.realizedReturnPct)+'</div></div>').join(''):'')+
      '</section>';
  };
  if(typeof render==='function') render();
})();
</script>`;}

export function renderMissionControlHtml(snapshot={}){
  const html=renderBiggjMobileApp(snapshot);
  return html.replace('</body>',tradingVisibilityPatch()+'</body>');
}