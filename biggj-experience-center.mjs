
export const BIGGJ_EXPERIENCE_VERSION='BIGGJ_EXPERIENCE_V7_MARKET_SCIENCE';

export const BIGGJ_EXPERIENCE_LAYOUT=Object.freeze([
  {category:'BIGGJ • SCIENCE',channels:[
    {name:'biggj-needs',topic:'Science-first Prioritäten: welche Evidence, Quelle, Variable oder Forschungsentscheidung BIGGJ als Nächstes wirklich braucht.'},
    {name:'learned-playbook',topic:'Kanonischer Wissensstand: Hypothesen, validierte Erkenntnisse, verworfene Theorien und offene Unsicherheit. PnL ist kein Wahrheitskriterium.'}
  ]},
  {category:'BIGGJ • REALITY',channels:[
    {name:'news-feed',topic:'Reality feed für markt- und systemrelevante Ereignisse. Beobachtung, Verifikation und Interpretation bleiben getrennt.'},
    {name:'world-watch',topic:'Makro, Geopolitik, Rohstoffe und globale Risiken als Input für das World Model. Keine Headline wird automatisch zur Theorie.'},
    {name:'trader-watch',topic:'Öffentlich belegbare Trader-/Wallet-Beobachtungen als mögliche Evidence. Keine privaten Daten und keine erfundenen PnL-Rankings.'}
  ]},
  {category:'BIGGJ • APPLICATIONS',channels:[
    {name:'chart-desk',topic:'Decision Intelligence / TCX View: Charts, Forecasts und Deep Dives als nachgelagerte Anwendung des Science-Stacks.'},
    {name:'trade-cockpit',topic:'Shadow-Trading-Anwendung. Trade/PnL-Ergebnisse dürfen als Evidence zurückfließen, besitzen aber keine wissenschaftliche Autorität.'}
  ]},
  {category:'BIGGJ • SYSTEM',channels:[
    {name:'mobile-app',topic:'Installierbares BIGGJ Market Science OS für iPhone/Startbildschirm: Science → World → Lab → Decisions → Trading.'}
  ]}
]);

export const BIGGJ_EXPERIENCE_MARKERS=Object.freeze({
  needs:'BIGGJ_EXPERIENCE_NEEDS_V1',
  learned:'BIGGJ_EXPERIENCE_LEARNED_PLAYBOOK_V1',
  traders:'BIGGJ_EXPERIENCE_TRADER_WATCH_V1',
  cockpit:'BIGGJ_EXPERIENCE_TRADE_COCKPIT_V1',
  charts:'BIGGJ_EXPERIENCE_CHART_DESK_V1',
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

export function deriveBiggjExperienceNeeds(snapshot={}){
  const h=snapshot?.health||{};
  const needs=[];
  const coverage=h?.researchCoverage||{};
  const operator=h?.autonomousOperator||{};
  const factory=h?.autonomousResearchFactory||{};
  const intel=h?.globalIntel||{};
  const traders=h?.traderWatch||{};
  const passiveWait=operator?.waitingForData===true&&operator?.operatorNeeded!==true;

  if(Number(coverage?.blocked||0)>0&&!passiveWait)needs.push({priority:1,label:'Research coverage reparieren',detail:(coverage.blocked||0)+' Märkte/Slots blockiert · '+(coverage.blockedFeatures||0)+' Features betroffen'});
  if(String(factory?.mode)==='DATA_QUALITY_BLOCKED'&&!passiveWait)needs.push({priority:1,label:'Datenqualität',detail:'Research Factory ist durch Data Governance/Coverage blockiert.'});
  if(String(factory?.mode)==='RESEARCH_STALLED'){
    if(operator?.waitingForData===true){
      const waitingOn=arr(factory?.dataNeeds).slice(0,4).map(x=>clip(x,44)).join(', ');
      needs.push({
        priority:3,
        label:'Research wartet auf Daten',
        detail:'Kein Eingriff nötig · BIGGJ wartet auf neue Point-in-Time-Evidence'+(waitingOn?' · '+waitingOn:'')+'.'
      });
    }else{
      needs.push({priority:1,label:'Research Deadlock',detail:'Research macht trotz verfügbarer Inputs keinen messbaren Fortschritt · Research-Stack prüfen.'});
    }
  }
  if(operator?.operatorNeeded===true)needs.push({priority:1,label:'Operator-Eskalation',detail:operator.humanJobRemaining||'Explizite Freigabe/Entscheidung nötig.'});
  if(traders?.sourceReady!==true)needs.push({priority:2,label:'Trader Intelligence Source',detail:'Für belastbare Profit-Trader-Rankings fehlt noch eine öffentliche, PIT-fähige Performance-/Wallet-Quelle.'});
  if(intel?.sourceReady!==true)needs.push({priority:2,label:'Live News Coverage',detail:intel?.lastError?'News-Discovery eingeschränkt: '+clip(intel.lastError,260):'Kein aktiver öffentlicher Live-News-Feed im Serving-State.'});
  else if(intel?.lastError)needs.push({priority:2,label:'News Source Degraded',detail:'Mindestens ein News-Abruf ist eingeschränkt: '+clip(intel.lastError,260)});
  else if(intel?.fallbackUsed===true)needs.push({priority:2,label:'News Primary Source Resilience',detail:'Live-News laufen über Fallback ('+clip(intel?.source||'secondary provider',120)+'). Primärquelle weiter beobachten; Serving bleibt aktiv.'});
  else if(finite(intel?.eventCount)===0)needs.push({priority:2,label:'News Event Coverage',detail:'Live-News-Quelle ist erreichbar, liefert aktuell aber keine relevanten Events.'});
  const meme=h?.memecoinRadar||{};
  if(meme?.sourceReady!==true)needs.push({priority:2,label:'Memecoin Live Coverage',detail:meme?.lastError?'DEX-Radar eingeschränkt: '+clip(meme.lastError,260):'DexScreener Live-Radar liefert aktuell keine verwertbaren Rows.'});
  else if(meme?.lastError)needs.push({priority:2,label:'Memecoin Source Degraded',detail:'DEX-Radar hat aktuelle Abruffehler: '+clip(meme.lastError,260)});
  if(Number(coverage?.averageCoverage||1)<.8&&!passiveWait)needs.push({priority:2,label:'Mehr Live Data',detail:'Research Coverage '+pct(coverage.averageCoverage)+' · Ziel: breitere Point-in-Time-Quellen statt mehr Duplikate.'});
  if(!needs.length)needs.push({priority:3,label:'Keine harte Lücke',detail:'Aktuell kein zwingender Operator-/Source-Blocker. BIGGJ kann weiter Daten sammeln und validieren.'});
  return needs.sort((a,b)=>a.priority-b.priority||a.label.localeCompare(b.label));
}

export function buildBiggjNeedsPayload(snapshot={}){
  const h=snapshot?.health||{};
  const operator=h?.autonomousOperator||{};
  const factory=h?.autonomousResearchFactory||{};
  const needs=deriveBiggjExperienceNeeds(snapshot);
  const top=needs.slice(0,8).map((x,i)=>[
    (x.priority===1?'🔴':x.priority===2?'🟡':'⚪')+' **'+(i+1)+'. '+x.label+'**',
    x.detail
  ].join('\n')).join('\n\n');
  const humanNeeded=operator.operatorNeeded===true;
  return payload(
    'BIGGJ // WHAT I NEED',
    '**Nur Dinge, die BIGGJ wirklich fehlen oder die du wirklich tun musst.**\nPassive Wartezeiten werden nicht mehr als Fehler oder Kaufbedarf ausgegeben.',
    [
      safeField('JETZT AM WICHTIGSTEN',top),
      safeField('AUTONOMY',[
        'Operator: '+clip(operator.mode||'UNKNOWN',40),
        'Mensch nötig: '+(humanNeeded?'JA · '+clip(operator.humanJobRemaining||'Freigabe/Entscheidung nötig',90):'NEIN · aktuell nichts zu tun'),
        'Research Factory: '+clip(factory.mode||'UNKNOWN',40),
        'Nur Datensammlung: '+((factory.operatorDataOnly||operator.waitingForData===true)?'JA':'NEIN'),
        'Automatisiert: '+pct(operator.automationCoverage)
      ].join('\n')),
      safeField('REGEL','Neue Quelle/Manager/Monitor nur dann hinzufügen, wenn sie eine konkrete Coverage-, Freshness-, Independence-, Latency- oder Governance-Lücke schließt.')
    ],
    BIGGJ_EXPERIENCE_MARKERS.needs,
    [
      {type:1,components:[
        {type:2,style:1,label:'Research Queue',custom_id:'dc6:brain:research'},
        {type:2,style:2,label:'Evidence',custom_id:'dc6:brain:evidence'},
        {type:2,style:2,label:'Decisions',custom_id:'dc6:brain:decisions'}
      ]},
      {type:1,components:[
        {type:2,style:2,label:'Brain Pulse',custom_id:'dc6:brain:pulse'},
        {type:2,style:2,label:'Data Health',custom_id:'dc3:home:data'}
      ]}
    ]
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
    BIGGJ_EXPERIENCE_MARKERS.learned,
    [
      {type:1,components:[
        {type:2,style:1,label:'Knowledge',custom_id:'dc6:brain:knowledge'},
        {type:2,style:2,label:'Skill Tree',custom_id:'dc6:brain:skills'},
        {type:2,style:2,label:'Changes',custom_id:'dc6:brain:changes'},
        {type:2,style:2,label:'Timeline',custom_id:'dc6:brain:timeline'}
      ]}
    ]
  );
}

export function buildBiggjTraderWatchPayload(snapshot={}){
  const t=snapshot?.health?.traderWatch||{};
  const registry=t?.entityRegistry||{};
  const flow=t?.entityFlow||{};
  const sourceReady=t?.sourceReady===true;
  const traders=arr(t?.traders).slice(0,5);
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null;};
  const sp=v=>{const x=n(v);return x==null?'—':(x>=0?'+':'')+(x*100).toFixed(Math.abs(x)>=1?0:1)+'%';};
  const compactMoney=v=>{
    const x=n(v);if(x==null)return '—';
    const a=Math.abs(x),sign=x<0?'-':x>0?'+':'';
    if(a>=1_000_000)return sign+(a/1_000_000).toFixed(2)+'M';
    if(a>=1_000)return sign+(a/1_000).toFixed(1)+'k';
    return sign+a.toFixed(0);
  };
  const holdingLabel=x=>({SCALP:'Scalp',INTRADAY:'Intraday',SWING:'Swing',POSITION:'Position',UNRESOLVED:'unklar'}[String(x||'').toUpperCase()]||clip(x,24));
  const biasLabel=x=>({LONG_BIAS:'Long-Bias',SHORT_BIAS:'Short-Bias',TWO_WAY:'Long/Short',UNRESOLVED:'unklar'}[String(x||'').toUpperCase()]||clip(x,24));
  const leverageLabel=x=>({HIGH_LEVERAGE:'hoher Hebel',MODERATE_LEVERAGE:'mittlerer Hebel',LOW_LEVERAGE:'niedriger Hebel',UNRESOLVED:'Hebel unklar'}[String(x||'').toUpperCase()]||clip(x,28));
  const lossLabel=x=>({CUTS_LOSERS_FASTER:'Verlierer schneller raus',HOLDS_LOSERS_LONGER:'Verlierer länger gehalten',BALANCED_HOLD_TIME:'ähnliche Haltedauer',UNRESOLVED:'Loss-Handling unklar'}[String(x||'').toUpperCase()]||clip(x,34));
  const edgeLabel=x=>({BALANCED_EDGE:'Winrate + Payoff',PAYOFF_DRIVEN:'Payoff-getrieben',HIT_RATE_DRIVEN:'Trefferquote-getrieben',NO_CLEAR_EDGE_SHAPE:'kein klares Muster',UNRESOLVED:'unklar'}[String(x||'').toUpperCase()]||clip(x,28));
  const duration=v=>{
    const ms=n(v);if(ms==null)return '—';
    if(ms<60*60_000)return Math.round(ms/60_000)+'m';
    if(ms<48*60*60_000)return (ms/3_600_000).toFixed(ms<10*3_600_000?1:0)+'h';
    return (ms/86_400_000).toFixed(1)+'d';
  };
  const ratio=v=>{const x=n(v);return x==null?'—':x.toFixed(2)+'x';};
  const traderFields=traders.map((trader,index)=>{
    const m=trader?.metrics||{},strategy=trader?.strategy||{};
    const positions=arr(trader?.openPositions).slice(0,3);
    const openLines=positions.length?positions.map(pos=>{
      if(pos?.protectedFields)return '• '+(pos?.instId||'geschützt')+' · Details vom Trader geschützt';
      const lever=n(pos?.leverage),upl=n(pos?.uplRatio),entry=n(pos?.openAvgPx),mark=n(pos?.markPx);
      return '• '+clip(pos?.side||'?',8)+' '+clip(pos?.instId||'?',26)+
        (lever!=null?' · '+lever.toFixed(1).replace(/\.0$/,'')+'x':'')+
        (entry!=null?' · Entry '+entry.toLocaleString('de-DE',{maximumFractionDigits:4}):'')+
        (mark!=null?' · Mark '+mark.toLocaleString('de-DE',{maximumFractionDigits:4}):'')+
        (upl!=null?' · UPL '+sp(upl):'');
    }):['• keine öffentlich sichtbare offene Position'];
    const focus=arr(strategy?.topSymbols).slice(0,3).map(x=>String(x?.symbol||'').replace('-USDT-SWAP','')).filter(Boolean).join(' / ')||'—';
    const inferred=[
      holdingLabel(strategy?.holdingStyle),
      biasLabel(strategy?.directionalBias),
      leverageLabel(strategy?.leverageStyle),
      'Fokus '+focus
    ].join(' · ');
    const edge=[
      'Recent '+String(strategy?.observedClosedTrades??0)+' Trades',
      'WR '+sp(strategy?.realizedWinRate),
      'Payoff '+ratio(strategy?.payoffRatio),
      'PF '+ratio(strategy?.profitFactor),
      'Ø '+sp(strategy?.expectancyPnlRatio)
    ].join(' · ');
    return safeField(
      '#'+String(trader?.providerRank||index+1)+' · '+clip(trader?.nickname||'Public Lead Trader',70),
      [
        '90T ROI '+sp(m?.pnlRatio90d)+' · Win '+sp(m?.winRatio)+' · PnL '+compactMoney(m?.pnl90d)+' USDT',
        'AUM '+compactMoney(m?.aum)+' USDT · Copier '+(n(m?.copyTraderNum)??'—')+' · Lead '+(n(m?.leadDays)??'—')+'d',
        '**Wie er handelt:** '+inferred,
        '**Recent Edge-Sample:** '+edge,
        '**Trade-Management:** '+lossLabel(strategy?.lossHandling)+' · '+edgeLabel(strategy?.edgeShape)+' · Median '+duration(strategy?.medianHoldMs),
        '**Offene Trades:**',
        ...openLines
      ].join('\n')
    );
  });
  const comparison=traders[0]?.cohortComparison||null;
  const cmpValue=(key,value)=>{
    const x=n(value);if(x==null)return '—';
    if(['win_rate','expectancy','concentration'].includes(key))return (x*100).toFixed(1)+'%';
    if(key==='hold_time')return duration(x);
    if(key==='leverage')return x.toFixed(1)+'x';
    if(key==='frequency')return x.toFixed(1)+'/Tag';
    return x.toFixed(2)+'x';
  };
  const comparisonLines=comparison?.observations?.length?comparison.observations.slice(0,7).map(o=>{
    const key=String(o?.key||'');
    const topRaw=key==='win_rate'||key==='expectancy'||key==='concentration' ? n(o?.top)/100 :
      key==='hold_time'?n(o?.top):key==='leverage'||key==='frequency'?n(o?.top):n(o?.top);
    const lowRaw=key==='win_rate'||key==='expectancy'||key==='concentration' ? n(o?.lower)/100 :
      key==='hold_time'?n(o?.lower):key==='leverage'||key==='frequency'?n(o?.lower):n(o?.lower);
    const labels={
      win_rate:'Winrate recent',payoff:'Gewinner/Verlierer',profit_factor:'Profit Factor',
      expectancy:'Ø Trade-Return',leverage:'Median-Hebel',hold_time:'Haltedauer',
      loser_hold:'Loss/Winner-Haltezeit',concentration:'Top-Markt-Anteil',frequency:'Trade-Frequenz'
    };
    const interpretation=o?.interpretation==='TOP_SAMPLE_FAVORABLE'?' ✓':o?.interpretation==='TOP_SAMPLE_UNFAVORABLE'?' !':'';
    return '• '+(labels[key]||clip(o?.label,40))+': **'+cmpValue(key,topRaw)+'** vs '+cmpValue(key,lowRaw)+interpretation;
  }):[];
  const reason=sourceReady
    ?'Live aus **OKX Public Copy Trading**. BIGGJ zeigt zusätzlich, welche Handelsmuster sich im aktuellen Top-Sample von einem niedrigeren-PnL-Sample unterscheiden.'
    :'Trader-Quelle aktuell nicht frisch/verfügbar. BIGGJ erfindet keine Positionen oder Rankings.';
  return payload(
    'BIGGJ // TOP TRADER WATCH',
    reason,
    [
      ...(comparison?safeField('WAS MACHEN DIE TOP-TRADER ANDERS?',[
        'Top-Sample '+String(comparison?.top?.traders??'—')+' Trader / '+String(comparison?.top?.observedClosedTrades??'—')+' Recent Trades',
        'Lower-PnL-Sample '+String(comparison?.lowerProfit?.traders??'—')+' Trader / '+String(comparison?.lowerProfit?.observedClosedTrades??'—')+' Recent Trades',
        ...comparisonLines,
        'Qualität '+clip(comparison?.sampleQuality||'LIMITED',18)+' · **DESKRIPTIV, NICHT KAUSAL**'
      ].join('\n')):[]),
      ...traderFields,
      safeField('SOURCE / FRESHNESS',[
        'Quelle '+clip(t?.source||'OKX_PUBLIC_COPY_TRADING_API',80),
        'Snapshot '+(t?.capturedAt?age(t.capturedAt)+' alt':'—'),
        'Ranking '+clip(t?.rankingMethod||'OKX_OVERVIEW',40),
        'Offene Positionen können laut Provider verzögert oder teilweise geschützt sein.',
        t?.lastError?'Degraded: '+clip(t.lastError,260):'Status '+(sourceReady?'READY':'SOURCE REQUIRED')
      ].join('\n')),
      safeField('METHOD',[
        '„Strategie“ = INFERRED, nicht Selbstauskunft.',
        'Basis pro Trader: Haltedauer, Long/Short, Hebel, Markt-Fokus, Recent-Winrate, Winner/Loss-Größe, Profit Factor, Trade-Frequenz und Loss-Haltedauer.',
        'Vergleichsgruppe = niedrigere-PnL-Trader aus demselben OKX-Overview-Snapshot; das beweist **keine Ursache** für Profitabilität.',
        'Kein automatisches Copy-Trading · keine echten Orders.'
      ].join('\n')),
      safeField('CROSS-CHECK',clip(t?.nextNeed||'Zweite unabhängige öffentliche Traderquelle für Cross-Validation.',700)),
      safeField('PUBLIC DATA ONLY',[
        'Entity registry '+finite(registry?.entities??registry?.entityCount)+' Entities · Flow '+finite(flow?.observations??flow?.observationCount),
        'Keine privaten Accounts/DMs · keine Identitätsauflösung natürlicher Personen.'
      ].join('\n'))
    ],
    BIGGJ_EXPERIENCE_MARKERS.traders,
    [
      {type:1,components:[
        {type:2,style:1,label:'Evidence',custom_id:'dc6:brain:evidence'},
        {type:2,style:2,label:'Research Queue',custom_id:'dc6:brain:research'},
        {type:2,style:2,label:'Data Health',custom_id:'dc3:home:data'}
      ]}
    ]
  );
}

export function buildBiggjTradeCockpitPayload(snapshot={}){
  const p=snapshot?.portfolio||{};
  const open=arr(p.positions).filter(x=>String(x?.status||'OPEN')==='OPEN').slice(0,8);
  const rows=open.length?open.map(x=>{
    const mark=x?.lastMark||{};
    const pnl=mark?.unrealizedNetPnlQuote??x?.unrealizedPnlQuote??x?.pnlQuote;
    const health=x?.thesisHealth??x?.metadata?.thesisHealth;
    const current=mark?.price??mark?.markPrice??x?.currentPrice;
    const stop=x?.stopPrice??x?.levels?.stopPrice??x?.metadata?.stopPrice;
    const target=x?.takeProfitPrice??x?.targetPrice??x?.levels?.takeProfitPrice??x?.metadata?.takeProfitPrice;
    return [
      '**'+clip(x.symbol,18)+' · '+clip(x.side,8)+'** · '+clip(x.status||'OPEN',12),
      'Entry '+clip(x.entryPrice??x.avgEntryPrice,24)+(current!=null?' · Mark '+clip(current,24):'')+' · PnL '+money(pnl),
      Number.isFinite(Number(health))?'Thesis '+pct(health):'Thesis —',
      'Stop '+clip(stop,22)+' · Target '+clip(target,22)+' · '+clip(x.entryMode||x.strategyId||'STANDARD',32)
    ].join('\n');
  }).join('\n\n'):'Keine offenen Shadow-Positionen.';
  const recent=arr(p.recentClosed).slice(0,5).map(x=>
    '• '+clip(x.symbol,16)+' · '+clip(x.side,8)+' · '+money(x?.netPnlQuote??x?.pnlQuote)+' · '+clip(x?.exitReason||'closed',42)
  ).join('\n')||'Keine kürzlich geschlossenen Shadow-Trades.';
  const controlPositions=[];
  const seenControlSymbols=new Set();
  for(const x of open){
    const symbol=String(x?.symbol||'').toUpperCase();
    if(!symbol||seenControlSymbols.has(symbol))continue;
    seenControlSymbols.add(symbol);
    controlPositions.push(x);
    if(controlPositions.length>=2)break;
  }
  const components=controlPositions.map(x=>{
    const symbol=String(x?.symbol||'').toUpperCase();
    return {type:1,components:[
      {type:2,style:1,label:clip(symbol.replace('USDT','')+' Chart',24),custom_id:'dc3:superchart:'+symbol+':PRO:5m'},
      {type:2,style:2,label:'Living Thesis',custom_id:'dc4:thesis:'+symbol},
      {type:2,style:2,label:'Warum?',custom_id:'dc3:why:'+symbol}
    ]};
  });
  return payload(
    'BIGGJ // TRADE COCKPIT',
    '**Ein Screen für aktive Shadow-Trades.** Position → Live-Chart → Thesis → Risiko → Ergebnis. Nur Buttons für Trades, die gerade offen sind.',
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
    BIGGJ_EXPERIENCE_MARKERS.cockpit,
    components
  );
}

export function buildBiggjChartDeskPayload(snapshot={}){
  const discovery=snapshot?.discovery||{};
  const top=arr(discovery?.topCandidates||discovery?.candidates).slice(0,5).map(x=>
    '• **'+clip(x.symbol||x.asset||'UNKNOWN',18)+'** · '+clip(x.status||x.reason||'WATCH',56)
  ).join('\n')||'Radar-Kandidaten erscheinen hier, sobald Discovery-State verfügbar ist.';
  const components=[
    {type:1,components:[
      {type:2,style:1,label:'BTC SuperChart',custom_id:'dc3:superchart:BTCUSDT:FULL:5m'},
      {type:2,style:1,label:'ETH SuperChart',custom_id:'dc3:superchart:ETHUSDT:FULL:5m'},
      {type:2,style:1,label:'SOL SuperChart',custom_id:'dc3:superchart:SOLUSDT:FULL:5m'}
    ]},
    {type:1,components:[
      {type:2,style:2,label:'Super Radar',custom_id:'dc3:terminal:radar'},
      {type:2,style:2,label:'BTC Forecast',custom_id:'dc3:forecast:BTCUSDT'},
      {type:2,style:2,label:'BTC Deep Dive',custom_id:'dc3:deep:BTCUSDT'}
    ]}
  ];
  return payload(
    'BIGGJ // CHART DESK',
    '**FULL SuperCharts ohne Command-Suche.** Markt öffnen → Struktur → Forecast → Liquidität/Confluence → Events/Flow → Thesis → Risiko.',
    [
      safeField('QUICK START','BTC · ETH · SOL SuperChart direkt öffnen. Weitere Märkte über das Market-Menü im Command Center.'),
      safeField('RADAR NOW',top),
      safeField('READING ORDER','1. Structure · 2. Regime · 3. Flow/Liquidity · 4. Forecast · 5. Gegenargumente · 6. Invalidation'),
      safeField('MODE','Charts zeigen Point-in-Time Research/Shadow-State. Keine garantierte Kursbahn.')
    ],
    BIGGJ_EXPERIENCE_MARKERS.charts,
    components
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
    {channel:'chart-desk',marker:BIGGJ_EXPERIENCE_MARKERS.charts,payload:buildBiggjChartDeskPayload(snapshot)},
    {channel:'mobile-app',marker:BIGGJ_EXPERIENCE_MARKERS.mobile,payload:buildBiggjMobileAppPayload({url:options.mobileUrl})}
  ];
}
