
export const BIGGJ_EXPERIENCE_VERSION='BIGGJ_EXPERIENCE_V6';

export const BIGGJ_EXPERIENCE_LAYOUT=Object.freeze([
  {category:'BIGGJ • DESK',channels:[
    {name:'biggj-needs',topic:'Was BIGGJ aktuell braucht, um effizienter, vollständiger und autonomer zu werden. Priorisiert und ohne erfundene Anforderungen.'},
    {name:'learned-playbook',topic:'Was BIGGJ bereits gelernt, validiert, verworfen oder als belastbare Arbeitsregel gespeichert hat.'},
    {name:'learning-timeline',topic:'Chronologische Lern-, Review-, Protokoll- und Revisionsereignisse mit Aktivitätsfenstern.'}
  ]},
  {category:'BIGGJ • INTELLIGENCE',channels:[
    {name:'news-feed',topic:'Allgemeiner relevanter News-Feed aus BIGGJs verifizierten Global-Intel-Ereignissen.'},
    {name:'world-watch',topic:'Geopolitik, Makro, globale Risiken und deren beobachtete bzw. hypothesierte Marktübertragung.'},
    {name:'trader-watch',topic:'Öffentlich belegbare High-Performance-Trader-/Wallet-Research. Keine privaten Daten, keine erfundenen PnL-Rankings.'}
  ]},
  {category:'BIGGJ • TRADING',channels:[
    {name:'trade-cockpit',topic:'Kompaktes Shadow-Trade Cockpit: offene Positionen, Thesis Health, Risiko, Markout und nächste relevante Aktion.'}
  ]}
]);

export const BIGGJ_EXPERIENCE_MARKERS=Object.freeze({
  needs:'BIGGJ_EXPERIENCE_NEEDS_V1',
  learned:'BIGGJ_EXPERIENCE_LEARNED_PLAYBOOK_V1',
  traders:'BIGGJ_EXPERIENCE_TRADER_WATCH_V1',
  cockpit:'BIGGJ_EXPERIENCE_TRADE_COCKPIT_V1',
  mobile:'BIGGJ_EXPERIENCE_MOBILE_APP_V1'
});

const arr=v=>Array.isArray(v)?v:[];
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,finite(v)));
const pct=v=>Math.round(clamp(v)*100)+'%';
const clip=(v,max=900)=>{
  const s=String(v==null?'—':v).replace(/\s+/g,' ').trim()||'—';
  return s.length<=max?s:s.slice(0,Math.max(1,max-1))+'…';
};
const money=v=>{
  const n=Number(v);
  return Number.isFinite(n)?n.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' USDT':'—';
};
const age=ms=>{
  const n=Number(ms);
  if(!Number.isFinite(n))return '—';
  const x=Math.max(0,Date.now()-n);
  if(x<60_000)return Math.round(x/1000)+'s';
  if(x<3_600_000)return Math.round(x/60_000)+'m';
  if(x<86_400_000)return Math.round(x/3_600_000)+'h';
  return Math.round(x/86_400_000)+'d';
};
const safeField=(name,value,inline=false)=>({name:clip(name,256),value:clip(value,1024),inline:Boolean(inline)});
function payload(title,description,fields,marker,components=[]){
  return {
    embeds:[{
      title,
      description:clip(description,4096),
      fields:arr(fields).slice(0,25),
      footer:{text:marker},
      timestamp:new Date().toISOString()
    }],
    components:arr(components).slice(0,5),
    allowedMentions:{parse:[]}
  };
}

function providerNeedLines(snapshot={}){
  const h=snapshot?.health||{};
  const needs=[];
  const coverage=h?.researchCoverage||{};
  const operator=h?.autonomousOperator||{};
  const factory=h?.autonomousResearchFactory||{};
  const intel=h?.globalIntel||{};
  const traders=h?.traderWatch||{};

  if(Number(coverage?.blocked||0)>0)needs.push({priority:1,label:'Research coverage reparieren',detail:(coverage.blocked||0)+' Märkte/Slots blockiert · '+(coverage.blockedFeatures||0)+' Features betroffen'});
  if(String(factory?.mode)==='DATA_QUALITY_BLOCKED')needs.push({priority:1,label:'Datenqualität',detail:'Research Factory ist durch Data Governance/Coverage blockiert.'});
  if(String(factory?.mode)==='RESEARCH_STALLED')needs.push({priority:1,label:'Research Deadlock',detail:'Research macht trotz neuer Source-States keinen messbaren Fortschritt.'});
  if(operator?.operatorNeeded===true)needs.push({priority:1,label:'Operator-Eskalation',detail:operator.humanJobRemaining||'Explizite Freigabe/Entscheidung nötig.'});
  if(traders?.sourceReady!==true)needs.push({priority:2,label:'Trader Intelligence Source',detail:'Für belastbare Profit-Trader-Rankings fehlt noch eine öffentliche, PIT-fähige Performance-/Wallet-Quelle.'});
  if(finite(intel?.eventCount)===0)needs.push({priority:2,label:'Live News Coverage',detail:'Global-Intel-Speicher ist leer; zusätzliche verifizierte Live-Quellen erhöhen Event-Coverage.'});
  if(Number(coverage?.averageCoverage||1)<.8)needs.push({priority:2,label:'Mehr Live Data',detail:'Research Coverage '+pct(coverage.averageCoverage)+' · Ziel: breitere Point-in-Time-Quellen statt mehr Duplikate.'});
  if(!needs.length)needs.push({priority:3,label:'Keine harte Lücke',detail:'Aktuell kein zwingender Operator-/Source-Blocker. BIGGJ kann weiter Daten sammeln und validieren.'});
  return needs.sort((a,b)=>a.priority-b.priority||a.label.localeCompare(b.label));
}

export function buildBiggjNeedsPayload(snapshot={}){
  const h=snapshot?.health||{};
  const operator=h?.autonomousOperator||{};
  const factory=h?.autonomousResearchFactory||{};
  const needs=providerNeedLines(snapshot);
  const top=needs.slice(0,8).map((x,i)=>[
    (x.priority===1?'🔴':x.priority===2?'🟡':'⚪')+' **'+(i+1)+'. '+x.label+'**',
    x.detail
  ].join('\n')).join('\n\n');
  return payload(
    'BIGGJ // WHAT I NEED',
    '**Die priorisierte Einkauf-/Integrationsliste für BIGGJs nächsten Effizienzsprung.**\nNur echte Runtime-Lücken werden gezeigt; keine Wunschliste ohne Beleg.',
    [
      safeField('JETZT AM WICHTIGSTEN',top),
      safeField('AUTONOMY',[
        'Operator '+clip(operator.mode||'UNKNOWN',40)+' · human needed '+(operator.operatorNeeded?'YES':'NO'),
        'Factory '+clip(factory.mode||'UNKNOWN',40)+' · data-only '+(factory.operatorDataOnly?'YES':'NO'),
        'Automation coverage '+pct(operator.automationCoverage)
      ].join('\n')),
      safeField('REGEL','Neue Quelle/Manager/Monitor nur dann hinzufügen, wenn sie eine konkrete Coverage-, Freshness-, Independence-, Latency- oder Governance-Lücke schließt.')
    ],
    BIGGJ_EXPERIENCE_MARKERS.needs
  );
}

export function buildBiggjLearnedPayload(snapshot={}){
  const brain=snapshot?.health?.biggjObservability||{};
  const rows=arr(brain.knowledge)
    .filter(x=>['TRUSTED','VALIDATED','TESTING','LEARNING'].includes(String(x?.status||'').toUpperCase()))
    .slice(0,12);
  const knowledge=rows.length?rows.map(x=>
    '• **'+clip(x.title||x.skillId,64)+'** · '+clip(x.status,22)+' · U '+pct(x.uncertainty)
  ).join('\n'):'Noch kein belastbarer Knowledge-State verfügbar.';
  const revisions=arr(brain.revisions).slice(0,6).map(x=>
    '• '+clip(x.type,36)+' · '+clip(x.assumptionId,58)+(arr(x.falsifierCodes).length?' · '+clip(x.falsifierCodes.join(', '),110):'')
  ).join('\n')||'Keine aktuellen Revisionen.';
  const queue=arr(brain.researchQueue).slice(0,5).map(x=>
    '• '+clip(x.title||x.skillId,58)+' → '+clip(x.nextGate,34)+' · U '+pct(x.uncertainty)
  ).join('\n')||'Keine offenen Research-Gates.';
  return payload(
    'BIGGJ // LEARNED PLAYBOOK',
    '**Was BIGGJ heute als Wissen, getestete Fähigkeit oder noch unsichere Arbeitsregel führt.**\nStatus und Unsicherheit bleiben sichtbar; „gelernt“ wird nicht mit „wahr“ gleichgesetzt.',
    [
      safeField('CURRENT KNOWLEDGE',knowledge),
      safeField('WHAT CHANGED',revisions),
      safeField('WHAT BIGGJ IS STILL TESTING',queue),
      safeField('MATURITY','Index '+pct(brain.maturityIndex)+' · Trusted '+finite(brain.trustedSkills)+' · Decaying '+finite(brain.decayingSkills))
    ],
    BIGGJ_EXPERIENCE_MARKERS.learned
  );
}

export function buildBiggjTraderWatchPayload(snapshot={}){
  const t=snapshot?.health?.traderWatch||{};
  const registry=t?.entityRegistry||{};
  const flow=t?.entityFlow||{};
  const sourceReady=t?.sourceReady===true;
  const reason=sourceReady
    ?'Öffentliche Trader-/Wallet-Performancequelle aktiv.'
    :'Noch **kein belastbarer öffentlicher PnL-/Trader-Ranking-Feed** angebunden. BIGGJ zeigt deshalb keine erfundenen „Top Trader“.';
  return payload(
    'BIGGJ // PROFIT TRADER WATCH',
    reason,
    [
      safeField('CURRENT COVERAGE',[
        'Entity registry '+finite(registry?.entities??registry?.entityCount)+' bekannte Entities',
        'Entity-flow observations '+finite(flow?.observations??flow?.observationCount),
        'Source status '+(sourceReady?'READY':'SOURCE REQUIRED')
      ].join('\n')),
      safeField('QUALIFICATION RULES',[
        '• öffentlich belegbare Historie',
        '• Point-in-Time erfassbar',
        '• realisierte vs. unrealisierte PnL getrennt',
        '• Gebühren/Slippage soweit verfügbar',
        '• mindestens mehrere unabhängige Trades/Zeiträume',
        '• kein Ranking nur nach einem Screenshot oder einer einzelnen Wallet-Bewegung'
      ].join('\n')),
      safeField('NEXT SOURCE NEED',clip(t?.nextNeed||'PIT-fähige öffentliche Trader-/Wallet-Performancequelle mit stabiler Identität und Historie.',700)),
      safeField('PRIVACY','Nur öffentliche Markt-/On-Chain-Daten. Keine privaten Accounts, DMs oder nichtöffentlichen personenbezogenen Daten.')
    ],
    BIGGJ_EXPERIENCE_MARKERS.traders
  );
}

export function buildBiggjTradeCockpitPayload(snapshot={}){
  const p=snapshot?.portfolio||{};
  const open=arr(p.positions).filter(x=>String(x?.status||'OPEN')==='OPEN').slice(0,8);
  const rows=open.length?open.map(x=>{
    const mark=x?.lastMark||{};
    const pnl=mark?.unrealizedNetPnlQuote??x?.unrealizedPnlQuote??x?.pnlQuote;
    const health=x?.thesisHealth??x?.metadata?.thesisHealth;
    return [
      '**'+clip(x.symbol,18)+' · '+clip(x.side,8)+'**',
      'Entry '+clip(x.entryPrice??x.avgEntryPrice,30)+' · PnL '+money(pnl),
      Number.isFinite(Number(health))?'Thesis '+pct(health):'Thesis —',
      'Mode '+clip(x.entryMode||x.strategyId||'STANDARD',36)
    ].join('\n');
  }).join('\n\n'):'Keine offenen Shadow-Positionen.';
  const recent=arr(p.recentClosed).slice(0,5).map(x=>
    '• '+clip(x.symbol,16)+' · '+clip(x.side,8)+' · '+money(x?.netPnlQuote??x?.pnlQuote)+' · '+clip(x?.exitReason||'closed',42)
  ).join('\n')||'Keine kürzlich geschlossenen Shadow-Trades.';
  return payload(
    'BIGGJ // TRADE COCKPIT',
    '**Ein Screen für aktive Shadow-Trades.** Keine Tabellenwand: Position → Thesis → PnL → nächster Kontext.',
    [
      safeField('OPEN NOW',rows),
      safeField('RECENTLY CLOSED',recent),
      safeField('PORTFOLIO',[
        'Equity '+money(p.equityQuote),
        'Open '+finite(p.openPositions)+' · Closed '+finite(p.closedTrades),
        'Net PnL '+money(p.netPnlQuote)
      ].join('\n')),
      safeField('MODE','SHADOW_ONLY · canExecuteLive:false · ABSTAIN is valid')
    ],
    BIGGJ_EXPERIENCE_MARKERS.cockpit
  );
}

export function buildBiggjMobileAppPayload({url}={}){
  const appUrl=String(url||'').trim();
  return payload(
    'BIGGJ // MOBILE COMMAND CENTER',
    appUrl
      ?'**'+appUrl+'**\n\nAuf dem iPhone öffnen → Teilen → **Zum Home-Bildschirm**. Danach startet BIGGJ wie eine eigene App.'
      :'Die Mobile-Webapp ist im Runtime-Service vorhanden. Für einen direkten Install-Link muss eine öffentliche Domain gesetzt sein.',
    [
      safeField('HOME','Autonomy · Needs · Learning · Markets · Trades · Intel · System'),
      safeField('MOBILE UX','Responsive · Safe Area · PWA Manifest · Standalone Mode · Auto Refresh'),
      safeField('TRUTH','Nur Runtime-State. Fehlende Daten werden als fehlend gezeigt, nicht geschätzt.')
    ],
    BIGGJ_EXPERIENCE_MARKERS.mobile
  );
}

export function buildBiggjExperiencePanelMap(snapshot={},options={}){
  return [
    {channel:'biggj-needs',marker:BIGGJ_EXPERIENCE_MARKERS.needs,payload:buildBiggjNeedsPayload(snapshot)},
    {channel:'learned-playbook',marker:BIGGJ_EXPERIENCE_MARKERS.learned,payload:buildBiggjLearnedPayload(snapshot)},
    {channel:'trader-watch',marker:BIGGJ_EXPERIENCE_MARKERS.traders,payload:buildBiggjTraderWatchPayload(snapshot)},
    {channel:'trade-cockpit',marker:BIGGJ_EXPERIENCE_MARKERS.cockpit,payload:buildBiggjTradeCockpitPayload(snapshot)},
    {channel:'mobile-app',marker:BIGGJ_EXPERIENCE_MARKERS.mobile,payload:buildBiggjMobileAppPayload({url:options.mobileUrl})}
  ];
}
