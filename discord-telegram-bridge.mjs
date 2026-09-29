import { AttachmentBuilder, ChannelType, Client, Events, GatewayIntentBits, PermissionFlagsBits, REST, Routes } from 'discord.js';
import { buildBiggjTradeThesis } from './biggj-visual-intelligence.mjs';
import { discordComponents, decodeDiscordCallbackCustomId } from './discord-component-ids.mjs';
import { createSerialDedupeQueue } from './discord-serial-dedupe-queue.mjs';

export const DISCORD_TELEGRAM_BRIDGE_VERSION='BIGGJ_DISCORD_COMMAND_CENTER_V4';

const COMMANDS=[
  {name:'start',description:'TCX Command Center öffnen'},
  {name:'help',description:'TCX Befehle anzeigen'},
  {name:'dashboard',description:'TCX Mission Control öffnen'},
  {name:'market',description:'Marktübersicht öffnen',options:[symbolOption()]},
  {name:'forecast',description:'TCX Forecast anzeigen',options:[symbolOption()]},
  {name:'chart',description:'Marktchart anzeigen',options:[symbolOption(),intervalOption()]},
  {name:'superchart',description:'TCX SuperChart öffnen',options:[symbolOption(),intervalOption()]},
  {name:'deep',description:'Deep-Dive Analysezentrum öffnen',options:[symbolOption()]},
  {name:'why',description:'Evidence und Begründung anzeigen',options:[symbolOption()]},
  {name:'flow',description:'Flow Radar öffnen',options:[symbolOption()]},
  {name:'liquidations',description:'Liquidation Heatmap öffnen',options:[symbolOption()]},
  {name:'xray',description:'Market X-Ray öffnen',options:[symbolOption()]},
  {name:'events',description:'Structure Events öffnen',options:[symbolOption()]},
  {name:'accuracy',description:'Forecast Accuracy öffnen',options:[symbolOption()]},
  {name:'radar',description:'TCX Super Radar öffnen'},
  {name:'thesis',description:'BIGGJ Living Thesis für einen aktiven Shadow-Trade',options:[symbolOption()]},
  {name:'structure',description:'Marktstruktur anzeigen',options:[symbolOption()]},
  {name:'portfolio',description:'Shadow-Portfolio anzeigen'},
  {name:'stats',description:'Shadow-Performance anzeigen',options:[{type:3,name:'period',description:'Zeitraum',required:false,choices:[{name:'Tag',value:'day'},{name:'Woche',value:'week'},{name:'Monat',value:'month'}]}]},
  {name:'why_not_trade',description:'Warum TCX gerade nicht tradet'},
  {name:'data',description:'Daten- und Providerstatus anzeigen'},
  {name:'intelligence',description:'Intelligence-Status für einen Markt',options:[symbolOption()]},
  {name:'memory',description:'Episode Memory für einen Markt',options:[symbolOption()]},
  {name:'evidence',description:'Evidence-Diagnostik für einen Markt',options:[symbolOption()]},
  {name:'validity',description:'Research-Validity für einen Markt',options:[symbolOption()]},
  {name:'setup',description:'TCX Discord Command Center automatisch einrichten'},
  {name:'terminal',description:'TCX Live-Terminal anzeigen'},
  {name:'system',description:'TCX Systemstatus anzeigen'},
  {name:'report',description:'Aktuellen Tagesreport anzeigen'},
  {name:'academy',description:'BIGGJ Trading Academy öffnen'},
  {name:'lesson',description:'Trading-Lektion öffnen',options:[{type:3,name:'topic',description:'Thema',required:true,choices:[{name:'1 · Grundlagen',value:'basics'},{name:'2 · Marktstruktur',value:'structure'},{name:'3 · Risiko',value:'risk'},{name:'4 · Liquidität & Volumen',value:'liquidity'},{name:'5 · Setups & Invalidation',value:'setup'},{name:'6 · Journal & Replay',value:'journal'}]}]}
];


const SERVER_LAYOUT=Object.freeze([
  {category:'TCX • CONTROL',channels:[
    {name:'start-here',topic:'Startpunkt, Befehle und Sicherheitsstatus von TCX.'},
    {name:'tcx-terminal',topic:'Live Mission Control für TCX/BIGGJ.'}
  ]},
  {category:'TCX • MARKETS',channels:[
    {name:'market-overview',topic:'Übersicht der wichtigsten beobachteten Märkte.'},
    {name:'btc',topic:'BTC/USDT Live-Marktpanel von TCX.'},
    {name:'eth',topic:'ETH/USDT Live-Marktpanel von TCX.'},
    {name:'sol',topic:'SOL/USDT Live-Marktpanel von TCX.'},
    {name:'memecoins',topic:'Memecoin Research und Watchlist. SHADOW_ONLY.'}
  ]},
  {category:'TCX • INTELLIGENCE',channels:[
    {name:'forecasts',topic:'Probabilistische TCX Forecasts und Invalidation.'},
    {name:'global-intel',topic:'Global Events und Markt-Kontext aus TCX.'},
    {name:'anomalies',topic:'Anomalien, Regimewechsel und Research-Hinweise.'},
    {name:'alerts',topic:'Priorisierte TCX System- und Research-Alerts.'},
    {name:'theses',topic:'BIGGJ Living Theses, Ghost Paths und Trade DNA für aktive Shadow-Trades.'}
  ]},
  {category:'TCX • SHADOW',channels:[
    {name:'live-trades',topic:'Offene TCX Shadow-Trades. Keine echten Orders.'},
    {name:'closed-trades',topic:'Abgeschlossene Shadow-Trades mit Ergebnis und Exit-Grund.'},
    {name:'performance',topic:'Tages-, Wochen- und Monatsperformance im Shadow-Modus.'},
    {name:'trade-replay',topic:'Trade-Replays und Post-Trade-Lernen.'}
  ]},
  {category:'BIGGJ • TRADING ACADEMY',channels:[
    {name:'academy-start',topic:'Startpunkt für Trading lernen mit BIGGJ. Paper/Shadow only.'},
    {name:'academy-roadmap',topic:'Klarer Lernpfad von Grundlagen bis Trade Review.'},
    {name:'academy-lessons',topic:'Trading-Lektionen in einfacher Reihenfolge.'},
    {name:'academy-chart-training',topic:'Charts lesen und Struktur üben, ohne echte Orders.'},
    {name:'academy-challenges',topic:'Paper-/Shadow-Challenges und praktische Übungen.'},
    {name:'academy-glossary',topic:'Trading-Begriffe kurz und verständlich erklärt.'},
    {name:'academy-progress',topic:'Lernfortschritt, Meilensteine und Checkliste.'},
    {name:'academy-questions',topic:'Fragen stellen mit sauberem Analyse-Template.'}
  ]},
  {category:'TCX • SYSTEM',channels:[
    {name:'system-status',topic:'Runtime-, Daten- und Sicherheitsstatus.'},
    {name:'data-health',topic:'Provider-, Datenqualitäts- und Pipeline-Status.'},
    {name:'errors',topic:'Technische Warnungen und Fehlerdiagnostik.'}
  ]}
]);
const MARKET_PANELS=Object.freeze([
  {channel:'btc',symbol:'BTCUSDT'},
  {channel:'eth',symbol:'ETHUSDT'},
  {channel:'sol',symbol:'SOLUSDT'}
]);
const MARKERS=Object.freeze({
  start:'TCX_DISCORD_V3_START',
  terminal:'TCX_DISCORD_V3_TERMINAL',
  system:'TCX_DISCORD_V3_SYSTEM',
  performance:'TCX_DISCORD_V3_PERFORMANCE',
  overview:'TCX_DISCORD_V3_MARKET_OVERVIEW',
  data:'TCX_DISCORD_V3_DATA_HEALTH',
  theses:'BIGGJ_DISCORD_V4_THESES',
  academyStart:'BIGGJ_ACADEMY_START_V1',
  academyRoadmap:'BIGGJ_ACADEMY_ROADMAP_V1',
  academyLessons:'BIGGJ_ACADEMY_LESSONS_V1',
  academyChart:'BIGGJ_ACADEMY_CHART_V1',
  academyChallenges:'BIGGJ_ACADEMY_CHALLENGES_V1',
  academyGlossary:'BIGGJ_ACADEMY_GLOSSARY_V1',
  academyProgress:'BIGGJ_ACADEMY_PROGRESS_V1',
  academyQuestions:'BIGGJ_ACADEMY_QUESTIONS_V1'
});
function yesNo(value){return value===true?'● OK':value===false?'● ERROR':'◐ CHECK';}
function money(value){const n=Number(value);return Number.isFinite(n)?n.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' USDT':'—';}
function percent(value){const n=Number(value);return Number.isFinite(n)?(n*100).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';}
function pct0(value){const n=Number(value);return Number.isFinite(n)?Math.round(Math.max(0,Math.min(1,n))*100)+'%':'—';}
function bar10(value){const n=Number(value);if(!Number.isFinite(n))return '░░░░░░░░░░';const x=Math.round(Math.max(0,Math.min(1,n))*10);return '█'.repeat(x)+'░'.repeat(10-x);}
function biggjThesisPayload(position={}){
  const t=buildBiggjTradeThesis(position,{asOf:Date.now()});
  const ghost=t.hypotheses.map(x=>bar10(x.support)+' '+pct0(x.support)+' · '+x.label).join('\n');
  const dna=t.tradeDna.map(x=>bar10(x.value)+' '+pct0(x.value)+' · '+x.label).join('\n');
  const why=t.whyNow.slice(0,6).map(x=>'• **'+x.id+'** · '+x.state+' · '+x.detail).join('\n');
  const levels=t.levels||{};
  const fmtPrice=v=>Number.isFinite(Number(v))?String(Number(v).toFixed(8)).replace(/0+$/,'').replace(/\.$/,''):'—';
  return {embeds:[{
    title:'BIGGJ // LIVING THESIS · '+t.symbol.replace('USDT','/USDT'),
    description:'**'+t.side+' · '+t.status+' · '+t.setupType+'**\nThesis `'+t.thesisId+'`\n\nTHESIS HEALTH  '+bar10(t.thesisHealth)+' **'+pct0(t.thesisHealth)+'**',
    fields:[
      {name:'Ghost Paths',value:(ghost||'No calibrated path support available').slice(0,1024),inline:false},
      {name:'Trade DNA',value:(dna||'No trade DNA inputs available').slice(0,1024),inline:false},
      {name:'Why Now?',value:(why||'No point-in-time thesis inputs available').slice(0,1024),inline:false},
      {name:'Entry',value:fmtPrice(levels.entryPrice),inline:true},
      {name:'Stop',value:fmtPrice(levels.stopPrice),inline:true},
      {name:'Target',value:fmtPrice(levels.takeProfitPrice),inline:true},
      {name:'Known Beliefs',value:String(t.knownBeliefs)+'/6',inline:true},
      {name:'Novelty',value:String(t.novelty),inline:true},
      {name:'Epistemic',value:'Point-in-time shadow state',inline:true}
    ],
    footer:{text:'BIGGJ_THESIS:'+t.positionId},
    timestamp:new Date().toISOString()
  }],components:position?.symbol?marketActionComponents(position.symbol):[],allowedMentions:{parse:[]}};
}

function academyLessonPayload(topic='basics'){
  const lessons={
    basics:{
      title:'LEKTION 1 // GRUNDLAGEN',
      goal:'Verstehen, was du auf einem Chart überhaupt siehst.',
      body:[
        '**1. Candle** · Open, High, Low, Close. Eine Candle zeigt nur, was im gewählten Zeitraum passiert ist.',
        '**2. Bid / Ask** · Käufer bieten, Verkäufer verlangen. Der Abstand heißt Spread.',
        '**3. Market vs. Limit** · Market priorisiert Ausführung; Limit priorisiert deinen Preis.',
        '**4. Long / Short** · Long profitiert von steigenden, Short von fallenden Kursen. Beides kann verlieren.',
        '**5. Hebel** · Verstärkt Gewinn und Verlust. Für die Academy: kein echtes Hebel-Trading.',
        '',
        '**Übung:** Öffne BTC 5m und beschreibe nur Fakten: letzter Preisbereich, letzte Hochs/Tiefs, Trend oder Range. Noch keine Prognose.'
      ]
    },
    structure:{
      title:'LEKTION 2 // MARKTSTRUKTUR',
      goal:'Trend, Range und Strukturbruch sauber unterscheiden.',
      body:[
        '**HH** Higher High · höheres Hoch',
        '**HL** Higher Low · höheres Tief',
        '**LH** Lower High · tieferes Hoch',
        '**LL** Lower Low · tieferes Tief',
        '',
        'Aufwärtstrend: typischerweise HH + HL. Abwärtstrend: LH + LL. Dazwischen kann der Markt einfach seitwärts laufen.',
        '**Wichtig:** Ein einzelner Mini-Bruch ist nicht automatisch ein neuer Trend. Timeframe und Kontext zählen.',
        '',
        '**Übung:** Markiere auf einem 15m-Chart die letzten 2 Swing Highs und 2 Swing Lows. Formuliere danach: Trend / Range / unklar.'
      ]
    },
    risk:{
      title:'LEKTION 3 // RISIKO',
      goal:'Erst Verlust kontrollieren, dann über Gewinn nachdenken.',
      body:[
        '**Invalidation** · Punkt, an dem deine Idee nicht mehr gilt.',
        '**Stop** · technische Umsetzung einer Verlustgrenze; schützt nicht vor jeder Slippage.',
        '**R** · ein standardisiertes Risikomaß. +2R bedeutet das Zweifache des zuvor definierten Risikos.',
        '**R:R** · mögliches Verhältnis von Gewinnziel zu Risiko. Ein hohes R:R macht ein schlechtes Setup nicht automatisch gut.',
        '',
        'Für diese Academy gilt: **Paper/Shadow first.** Keine Challenge verlangt echtes Geld.',
        '',
        '**Übung:** Nimm einen fiktiven Entry und lege zuerst die Invalidation fest. Erst danach ein Ziel. Begründe beide.'
      ]
    },
    liquidity:{
      title:'LEKTION 4 // LIQUIDITÄT & VOLUMEN',
      goal:'Verstehen, wo Orders liegen können und warum Preis dorthin reagiert.',
      body:[
        '**Liquidität** · vereinfacht: Bereiche, in denen viele Orders ausführbar sind.',
        '**Sweep** · Preis handelt kurz durch ein relevantes Hoch/Tief und kehrt zurück.',
        '**Volume** · zeigt Aktivität, nicht automatisch Käufer- oder Verkäuferüberlegenheit.',
        '**Open Interest / Liquidationen** · Derivate-Kontext; kann Bewegungen verstärken, ist aber kein alleiniger Entry-Grund.',
        '',
        '**Übung:** Finde ein markantes vorheriges Hoch/Tief. Beobachte, ob Preis davor reagiert, es bricht oder nur kurz swept.'
      ]
    },
    setup:{
      title:'LEKTION 5 // SETUP & INVALIDATION',
      goal:'Eine überprüfbare These statt Bauchgefühl formulieren.',
      body:[
        'Ein Setup braucht mindestens: **Kontext → Trigger → Entry-Idee → Invalidation → Ziel → Gegenargumente**.',
        '',
        'Beispielstruktur:',
        '• Kontext: 1h bullish, 15m Pullback',
        '• Trigger: lokaler Reclaim',
        '• Invalidation: unter dem relevanten Swing Low',
        '• Ziel: nächster plausibler Liquiditäts-/Widerstandsbereich',
        '• Gegenargument: höherer Timeframe direkt am Widerstand',
        '',
        '**Übung:** Schreibe eine These, ohne Wörter wie safe, muss oder garantiert.'
      ]
    },
    journal:{
      title:'LEKTION 6 // JOURNAL & REPLAY',
      goal:'Entscheidungsqualität von purem Ergebnis trennen.',
      body:[
        'Ein Gewinn kann aus schlechter Entscheidung entstehen. Ein Verlust kann trotz guter Entscheidung auftreten.',
        'Notiere deshalb: Was wusste ich beim Entry? Warum? Was hätte die These invalidiert? Was änderte sich danach?',
        '',
        '**Review-Felder:** Entry-Qualität · Risiko · Thesis · Execution · Exit · Ergebnis · Lernpunkt.',
        '**BIGGJ Replay:** Nutze Trade-Replays, um nur Informationen zu betrachten, die damals bereits verfügbar waren.',
        '',
        '**Übung:** Reviewe einen Shadow-Trade und schreibe 1 Sache, die korrekt war, und 1 Sache, die du beim nächsten Mal anders prüfst.'
      ]
    }
  };
  const x=lessons[topic]||lessons.basics;
  return {embeds:[{title:'BIGGJ ACADEMY // '+x.title,description:['**Ziel:** '+x.goal,'',...x.body,'','**Modus: PAPER / SHADOW ONLY · keine echten Orders**'].join('\n'),footer:{text:'BIGGJ_ACADEMY_LESSON:'+topic},timestamp:new Date().toISOString()}],components:academyLessonComponents(),allowedMentions:{parse:[]}};
}
function academyLessonComponents(){return [
  {type:1,components:[
    {type:2,style:1,label:'1 Grundlagen',custom_id:'dc5:lesson:basics'},
    {type:2,style:2,label:'2 Struktur',custom_id:'dc5:lesson:structure'},
    {type:2,style:2,label:'3 Risiko',custom_id:'dc5:lesson:risk'}
  ]},
  {type:1,components:[
    {type:2,style:2,label:'4 Liquidität',custom_id:'dc5:lesson:liquidity'},
    {type:2,style:2,label:'5 Setup',custom_id:'dc5:lesson:setup'},
    {type:2,style:2,label:'6 Journal',custom_id:'dc5:lesson:journal'}
  ]},
  {type:1,components:[
    {type:2,style:1,label:'BTC 5m Chart',custom_id:'dc3:chart:BTCUSDT:5m'},
    {type:2,style:2,label:'BTC Struktur',custom_id:'dc3:structure:BTCUSDT'},
    {type:2,style:2,label:'BTC Replay',custom_id:'dc3:tradereplay:BTCUSDT'}
  ]}
];}
function academyStaticPayload(kind){
  const base={allowedMentions:{parse:[]}};
  if(kind==='start')return {...base,embeds:[{title:'BIGGJ // TRADING ACADEMY',description:[
    '**Trading lernen, ohne im Profi-System unterzugehen.**',
    '',
    'Reihenfolge: **Grundlagen → Struktur → Risiko → Liquidität → Setup → Journal → Praxis**.',
    'Benutze BIGGJ-Charts zum Beobachten und Üben. In der Academy werden **keine echten Orders** verlangt.',
    '',
    '**So startest du:**',
    '1. Öffne Lektion 1.',
    '2. Mach die Übung.',
    '3. Geh erst weiter, wenn du die Begriffe selbst erklären kannst.',
    '4. Nutze #academy-questions, wenn etwas unklar ist.',
    '',
    'Ziel ist nicht, möglichst viele Trades zu machen. Ziel ist, **saubere Entscheidungen erklären zu können**.'
  ].join('\n'),footer:{text:MARKERS.academyStart},timestamp:new Date().toISOString()}],components:academyLessonComponents()};
  if(kind==='roadmap')return {...base,embeds:[{title:'BIGGJ ACADEMY // ROADMAP',description:[
    '**LEVEL 0 · Orientierung** — Candles, Timeframes, Bid/Ask, Orders',
    '**LEVEL 1 · Structure** — HH/HL/LH/LL, Trend, Range, Break',
    '**LEVEL 2 · Risk** — Invalidation, Stop, R, R:R, Drawdown',
    '**LEVEL 3 · Liquidity** — Sweeps, Volumen, Derivate-Kontext',
    '**LEVEL 4 · Thesis** — Kontext, Trigger, Gegenargumente',
    '**LEVEL 5 · Execution** — nur Paper/Shadow, keine impulsiven Entries',
    '**LEVEL 6 · Review** — Journal, Replay, Fehleranalyse',
    '**LEVEL 7 · BIGGJ** — Ghost Paths, Trade DNA, Evidence, Thesis Health',
    '',
    '**Freigaberegel:** Erst zur nächsten Stufe, wenn du die vorige ohne Spickzettel erklären kannst.'
  ].join('\n'),footer:{text:MARKERS.academyRoadmap},timestamp:new Date().toISOString()}],components:academyLessonComponents()};
  if(kind==='lessons')return {...base,embeds:[{title:'BIGGJ ACADEMY // LEKTIONEN',description:[
    '**1 · Grundlagen** — Was zeigt ein Chart?',
    '**2 · Marktstruktur** — Was macht Preis tatsächlich?',
    '**3 · Risiko** — Wann ist deine Idee falsch?',
    '**4 · Liquidität & Volumen** — Wo kann Bewegung entstehen?',
    '**5 · Setup & Invalidation** — Wie wird aus Beobachtung eine prüfbare These?',
    '**6 · Journal & Replay** — Wie lernst du aus Entscheidungen?',
    '',
    'Benutze die Buttons unten oder den /lesson Command.'
  ].join('\n'),footer:{text:MARKERS.academyLessons},timestamp:new Date().toISOString()}],components:academyLessonComponents()};
  if(kind==='chart')return {...base,embeds:[{title:'BIGGJ ACADEMY // CHART TRAINING',description:[
    '**Immer in derselben Reihenfolge analysieren:**',
    '1. Timeframe nennen.',
    '2. Swing Highs / Swing Lows markieren.',
    '3. Trend / Range / unklar entscheiden.',
    '4. Relevante Levels markieren.',
    '5. Zwei mögliche Szenarien formulieren.',
    '6. Für jedes Szenario sagen, wodurch es ungültig wird.',
    '7. Erst danach Forecast/Flow/Liquidationen ansehen.',
    '',
    '**Anti-Bias-Regel:** BIGGJ nicht zuerst fragen, wohin der Markt geht. Erst eigene Beobachtung schreiben, dann mit BIGGJ vergleichen.'
  ].join('\n'),footer:{text:MARKERS.academyChart},timestamp:new Date().toISOString()}],components:academyLessonComponents()};
  if(kind==='challenges')return {...base,embeds:[{title:'BIGGJ ACADEMY // CHALLENGES',description:[
    '**Challenge 1 · 10 Charts** — nur Trend/Range/unklar klassifizieren.',
    '**Challenge 2 · 20 Strukturen** — HH/HL/LH/LL korrekt markieren.',
    '**Challenge 3 · 10 Thesen** — Kontext + Trigger + Invalidation + Gegenargument.',
    '**Challenge 4 · 20 Shadow-Trades** — kein echtes Geld; jeden Trade vor Entry dokumentieren.',
    '**Challenge 5 · 10 Replays** — Entscheidung und Ergebnis getrennt bewerten.',
    '**Challenge 6 · No-FOMO** — 7 Tage lang keinen Trade erzwingen; ABSTAIN zählt als korrekte Entscheidung.',
    '',
    '**Bestanden heißt:** Regel eingehalten und Review gemacht — nicht möglichst hoher PnL.'
  ].join('\n'),footer:{text:MARKERS.academyChallenges},timestamp:new Date().toISOString()}],components:academyLessonComponents()};
  if(kind==='glossary')return {...base,embeds:[{title:'BIGGJ ACADEMY // GLOSSAR',description:[
    '**OHLC** · Open, High, Low, Close',
    '**HH / HL / LH / LL** · Higher High / Higher Low / Lower High / Lower Low',
    '**Spread** · Abstand zwischen Bid und Ask',
    '**Liquidity** · verfügbare ausführbare Orders in Preisbereichen',
    '**Sweep** · kurzes Durchhandeln eines Levels mit möglicher Rückkehr',
    '**Invalidation** · Punkt, an dem eine These nicht mehr gilt',
    '**R** · standardisierte Risikoeinheit',
    '**R:R** · Verhältnis potenzieller Reward zu Risk',
    '**MFE / MAE** · größter günstiger / ungünstiger Verlauf während eines Trades',
    '**Drawdown** · Rückgang vom vorherigen Kapitalhoch',
    '**Regime** · übergeordneter Marktzustand',
    '**ABSTAIN** · bewusst kein Trade; bei BIGGJ ein vollwertiges Ergebnis'
  ].join('\n'),footer:{text:MARKERS.academyGlossary},timestamp:new Date().toISOString()}]};
  if(kind==='progress')return {...base,embeds:[{title:'BIGGJ ACADEMY // PROGRESS',description:[
    '□ Lektion 1 erklären können',
    '□ Lektion 2 erklären können',
    '□ Lektion 3 erklären können',
    '□ Lektion 4 erklären können',
    '□ Lektion 5 erklären können',
    '□ Lektion 6 erklären können',
    '□ 10 Chart-Klassifikationen',
    '□ 10 vollständige Thesen',
    '□ 20 dokumentierte Shadow-Trades',
    '□ 10 Replays',
    '',
    '**Fortschritt wird an Prozessqualität gemessen, nicht an PnL.**',
    'Du kannst in diesem Channel deine erledigten Punkte und Lernnotizen posten.'
  ].join('\n'),footer:{text:MARKERS.academyProgress},timestamp:new Date().toISOString()}]};
  return {...base,embeds:[{title:'BIGGJ ACADEMY // FRAGEN',description:[
    'Für eine gute Frage benutze dieses Schema:',
    '',
    '**Coin / Timeframe:**',
    '**Was sehe ich objektiv?**',
    '**Meine These:**',
    '**Was spricht dagegen?**',
    '**Wo wäre die These invalidiert?**',
    '**Was verstehe ich nicht?**',
    '',
    'So lernst du Analyse statt nur nach Long oder Short zu fragen.'
  ].join('\n'),footer:{text:MARKERS.academyQuestions},timestamp:new Date().toISOString()}]};
}

function hasMarker(message,marker){return Array.isArray(message?.embeds)&&message.embeds.some(e=>String(e?.footer?.text||'')===marker);}
function startPayload(){return {embeds:[{title:'BIGGJ // TCX COMMAND CENTER',description:['**Research OS für Markt, Forecast, Shadow-Trading und Lernen.**','','**SCHNELLSTART**','\`/dashboard\` · Mission Control','\`/market BTC\` · Markt','\`/forecast BTC\` · Forecast','\`/superchart BTC\` · SuperChart','\`/deep BTC\` · Deep Dive','\`/portfolio\` · Shadow-Portfolio','\`/stats\` · Performance','','Discord = Command Center · Telegram = Mobile Controller','**SHADOW_ONLY · REAL ORDERS BLOCKED**'].join('\n'),footer:{text:MARKERS.start},timestamp:new Date().toISOString()}],components:commandCenterComponents(),allowedMentions:{parse:[]}};}
export function buildDiscordTerminalPayload(snapshot={}){
  const h=snapshot?.health||{},p=snapshot?.portfolio||{},r=h?.operationalReadiness||{},f=h?.institutionalForecastRuntime||{},research=p?.researchActivity||{};
  return {embeds:[{title:'TCX // COMMAND CENTER',description:'**SHADOW_ONLY** · REAL ORDERS BLOCKED',fields:[
    {name:'Runtime',value:yesNo(r?.ready),inline:true},{name:'Primary Open',value:String(p?.openPositions??0),inline:true},{name:'Equity',value:money(p?.equityQuote),inline:true},
    {name:'Primary Closed',value:String(p?.closedTrades??0),inline:true},{name:'Primary PnL',value:money(p?.netPnlQuote),inline:true},{name:'Return',value:percent(p?.returnPct),inline:true},
    {name:'Research Open',value:String(research?.openPositions??0),inline:true},{name:'Research Closed',value:String(research?.closedTrades??0),inline:true},{name:'Research PnL',value:money(research?.netPnlQuote),inline:true},
    {name:'Forecast Runtime',value:yesNo(f?.healthy??(f?.status==='HEALTHY')),inline:true},{name:'Episodes',value:String(h?.episodeMemory?.total??'—'),inline:true},{name:'Evidence',value:String(h?.evidenceHistory?.total??'—'),inline:true},
    {name:'Execution',value:'SHADOW_ONLY',inline:true},{name:'Live Orders',value:'BLOCKED',inline:true}
  ],footer:{text:MARKERS.terminal},timestamp:new Date().toISOString()}],components:commandCenterComponents(),allowedMentions:{parse:[]}};
}
export function buildDiscordSystemPayload(snapshot={}){
  const h=snapshot?.health||{},r=h?.operationalReadiness||{},oms=h?.shadowOms||{},fabric=h?.marketDataFabric||{},tg=h?.telegramPolling||{};
  const rows=[['Runtime',yesNo(r?.ready)],['Audit Ledger',yesNo(h?.institutionalKernel?.ledgerHealthy)],['Market Fabric',yesNo(fabric?.healthy)],['Shadow OMS',yesNo(oms?.healthy)],['Telegram',tg?.lastPollError?'● ERROR':'● OK'],['Discord','● OK']];
  return {embeds:[{title:'TCX // SYSTEM STATUS',description:rows.map(([k,v])=>'\`'+k.padEnd(14)+'\` '+v).join('\n'),fields:[
    {name:'OMS',value:'Active '+String(oms?.active??0)+' · Filled '+String(oms?.filled??0),inline:true},
    {name:'Market Events',value:String(fabric?.events??'—'),inline:true},
    {name:'Safety',value:'ABSTAIN / SHADOW_ONLY',inline:true}
  ],footer:{text:MARKERS.system},timestamp:new Date().toISOString()}],components:commandCenterComponents(),allowedMentions:{parse:[]}};
}

export function buildDiscordPerformancePayload(snapshot={}){
  const p=snapshot?.portfolio||{},research=p?.researchActivity||{};
  return {embeds:[{title:'TCX // SHADOW PERFORMANCE',description:'**Primary Performance getrennt von Research/Probes · keine echten Orders**',fields:[
    {name:'Primary Equity',value:money(p?.equityQuote),inline:true},
    {name:'Primary PnL',value:money(p?.netPnlQuote),inline:true},
    {name:'Primary Return',value:percent(p?.returnPct),inline:true},
    {name:'Primary Open',value:String(p?.openPositions??0),inline:true},
    {name:'Primary Closed',value:String(p?.closedTrades??0),inline:true},
    {name:'Primary Winrate',value:percent(p?.winRate),inline:true},
    {name:'Research Open',value:String(research?.openPositions??0),inline:true},
    {name:'Research Closed',value:String(research?.closedTrades??0),inline:true},
    {name:'Research PnL',value:money(research?.netPnlQuote),inline:true},
    {name:'Profit Factor',value:Number.isFinite(Number(p?.profitFactor))?Number(p.profitFactor).toFixed(2):'—',inline:true},
    {name:'Expectancy',value:money(p?.expectancyQuote),inline:true},
    {name:'Max Drawdown',value:percent(p?.maxDrawdownPct),inline:true}
  ],footer:{text:MARKERS.performance},timestamp:new Date().toISOString()}],components:[
    {type:1,components:[
      {type:2,style:2,label:'Tag',custom_id:'dc3:home:stats_day'},
      {type:2,style:2,label:'Woche',custom_id:'dc3:home:stats_week'},
      {type:2,style:2,label:'Monat',custom_id:'dc3:home:stats_month'},
      {type:2,style:1,label:'Portfolio',custom_id:'dc3:home:portfolio'}
    ]},
    marketSelectRow()
  ],allowedMentions:{parse:[]}};
}
export function buildDiscordMarketOverviewPayload(snapshot={}){
  const p=snapshot?.portfolio||{},h=snapshot?.health||{},research=p?.researchActivity||{};
  return {embeds:[{title:'TCX // MARKET DESK',description:['**17 Märkte · ein Research-Core**','','BTC · ETH · SOL als permanente Live-Panels.','Weitere Coins über Dropdown oder Slash Commands.','','Primary offen: **'+String(p?.openPositions??0)+'**','Research offen: **'+String(research?.openPositions??0)+'**','Market Fabric: **'+(h?.marketDataFabric?.healthy?'HEALTHY':'CHECK')+'**','Forecast Runtime: **'+yesNo(h?.institutionalForecastRuntime?.healthy??(h?.institutionalForecastRuntime?.status==='HEALTHY'))+'**'].join('\n'),footer:{text:MARKERS.overview},timestamp:new Date().toISOString()}],components:commandCenterComponents(),allowedMentions:{parse:[]}};
}
export function buildDiscordDataHealthPayload(snapshot={}){
  const h=snapshot?.health||{},r=h?.operationalReadiness||{},coverage=h?.researchCoverage||{};
  const hard=Array.isArray(r?.hardReasons)?r.hardReasons:[];
  const warnings=Array.isArray(r?.warningReasons)?r.warningReasons:[];
  const topSources=(Array.isArray(coverage?.topBlockedSources)?coverage.topBlockedSources:[])
    .slice(0,6).map(x=>'• '+String(x.id)+' · '+String(x.count)).join('\n')||'none';
  const worst=(Array.isArray(coverage?.worstSymbols)?coverage.worstSymbols:[])
    .slice(0,6).map(x=>'• '+String(x.symbol)+' · '+String(x.status)+' · '+Math.round(Number(x.coverage||0)*100)+'% · '+String(x.blockedFeatures||0)+' blocked').join('\n')||'none';
  return {embeds:[{title:'TCX // DATA HEALTH',description:'Point-in-time Research Pipeline',fields:[
    {name:'Market Fabric',value:yesNo(h?.marketDataFabric?.healthy),inline:true},
    {name:'Episode Memory',value:yesNo(h?.episodeMemory?.healthy),inline:true},
    {name:'Evidence Store',value:yesNo(h?.evidenceHistory?.healthy),inline:true},
    {name:'Forecast Runtime',value:yesNo(h?.institutionalForecastRuntime?.healthy??(h?.institutionalForecastRuntime?.status==='HEALTHY')),inline:true},
    {name:'Research Coverage',value:Number.isFinite(Number(coverage?.averageCoverage))?Math.round(Number(coverage.averageCoverage)*100)+'%':'—',inline:true},
    {name:'Blocked Features',value:String(coverage?.blockedFeatures??'—'),inline:true},
    {name:'Hard Blocks',value:String(hard.length),inline:true},
    {name:'Warnings',value:String(warnings.length),inline:true},
    {name:'Coverage State',value:'Healthy '+String(coverage?.healthy??0)+' · Degraded '+String(coverage?.degraded??0)+' · Blocked '+String(coverage?.blocked??0),inline:false},
    {name:'Top Research Blockers',value:topSources.slice(0,1024),inline:false},
    {name:'Worst Coverage',value:worst.slice(0,1024),inline:false},
    {name:'Current Runtime Blockers',value:(hard.concat(warnings).slice(0,6).join('\n')||'none').slice(0,1024),inline:false}
  ],footer:{text:MARKERS.data},timestamp:new Date().toISOString()}],components:commandCenterComponents(),allowedMentions:{parse:[]}};
}
function closedTradePayload(position={}){
  const pnl=Number(position?.realizedNetPnlQuote),ret=Number(position?.realizedReturnPct);
  return {embeds:[{title:'TCX CLOSED · '+String(position?.symbol||'UNKNOWN').replace('USDT','/USDT')+' · '+String(position?.side||'—').toUpperCase(),description:'**CLOSED · SHADOW_ONLY**',fields:[
    {name:'Entry',value:String(position?.entryPrice??'—'),inline:true},
    {name:'Exit',value:String(position?.exitPrice??position?.lastMark?.price??'—'),inline:true},
    {name:'Net PnL',value:Number.isFinite(pnl)?money(pnl):'—',inline:true},
    {name:'Return',value:Number.isFinite(ret)?percent(ret):'—',inline:true},
    {name:'Reason',value:String(position?.closeReason||'UNKNOWN'),inline:true},
    {name:'Setup',value:String(position?.setupType||'UNKNOWN'),inline:true}
  ],footer:{text:'CLOSED:'+String(position?.positionId||'UNKNOWN')},timestamp:new Date(Number(position?.closedAt)||Date.now()).toISOString()}],components:position?.symbol?marketActionComponents(position.symbol):[],allowedMentions:{parse:[]}};
}
function shadowTradePayload(position={}){
  const symbol=String(position?.symbol||'UNKNOWN').replace('USDT','/USDT'),side=String(position?.side||'—').toUpperCase();
  const pnl=Number(position?.lastMark?.unrealizedNetPnlQuote),ret=Number(position?.lastMark?.unrealizedReturnPct);
  return {embeds:[{title:'TCX SHADOW TRADE · '+symbol+' · '+side,description:'**OPEN · SHADOW_ONLY**',fields:[
    {name:'Entry',value:String(position?.entryPrice??'—'),inline:true},{name:'PnL',value:Number.isFinite(pnl)?money(pnl):'—',inline:true},{name:'Return',value:Number.isFinite(ret)?percent(ret):'—',inline:true},
    {name:'Setup',value:String(position?.setupType||'UNKNOWN'),inline:true},{name:'Horizon',value:String(position?.horizonId||'—'),inline:true},{name:'Mode',value:String(position?.entryMode||'STANDARD'),inline:true}
  ],footer:{text:String(position?.positionId||'TCX_SHADOW_POSITION')},timestamp:new Date(Number(position?.openedAt)||Date.now()).toISOString()}],components:position?.symbol?marketActionComponents(position.symbol):[],allowedMentions:{parse:[]}};
}
function berlinParts(){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const get=k=>p.find(x=>x.type===k)?.value||'';
  return {date:get('year')+'-'+get('month')+'-'+get('day'),hour:Number(get('hour')),minute:Number(get('minute'))};
}

const V3_SYMBOLS=['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','LINK','AVAX','DOT','LTC','TRX','PEPE','SHIB','BONK','WIF','FLOKI'];
function symbolOption(){return {type:3,name:'symbol',description:'z. B. BTC, ETH, SOL',required:true};}
function intervalOption(){return {type:3,name:'interval',description:'Zeitrahmen',required:false,choices:['1m','5m','15m','1h','4h'].map(x=>({name:x,value:x}))};}
function normalizeDiscordSymbol(value=''){const raw=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return raw?(raw.endsWith('USDT')?raw:raw+'USDT'):null;}
function marketSelectRow(){return {type:1,components:[{type:3,custom_id:'dc3:market-select',placeholder:'Markt öffnen …',min_values:1,max_values:1,options:V3_SYMBOLS.map(x=>({label:x+'/USDT',value:x+'USDT',description:'TCX '+x+' Research'}))}]};}
function commandCenterComponents(){return [
  {type:1,components:[
    {type:2,style:1,label:'BTC',custom_id:'dc3:market:BTCUSDT'},
    {type:2,style:1,label:'ETH',custom_id:'dc3:market:ETHUSDT'},
    {type:2,style:1,label:'SOL',custom_id:'dc3:market:SOLUSDT'},
    {type:2,style:2,label:'Super Radar',custom_id:'dc3:terminal:radar'}
  ]},
  {type:1,components:[
    {type:2,style:2,label:'Portfolio',custom_id:'dc3:home:portfolio'},
    {type:2,style:2,label:'Performance',custom_id:'dc3:home:stats_day'},
    {type:2,style:2,label:'Global Intel',custom_id:'dc3:home:news'},
    {type:2,style:2,label:'Data Health',custom_id:'dc3:home:data'}
  ]},
  marketSelectRow()
];}
function marketActionComponents(symbol){
  const s=normalizeDiscordSymbol(symbol)||'BTCUSDT';
  return [
    {type:1,components:[
      {type:2,style:1,label:'SuperChart',custom_id:'dc3:superchart:'+s+':PRO:5m'},
      {type:2,style:2,label:'Forecast',custom_id:'dc3:forecast:'+s},
      {type:2,style:2,label:'Warum?',custom_id:'dc3:why:'+s},
      {type:2,style:2,label:'Deep Dive',custom_id:'dc3:deep:'+s},
      {type:2,style:1,label:'Living Thesis',custom_id:'dc4:thesis:'+s}
    ]},
    {type:1,components:[
      {type:2,style:2,label:'Flow',custom_id:'dc3:flow:'+s},
      {type:2,style:2,label:'Liquidations',custom_id:'dc3:liqmap:'+s+':5m'},
      {type:2,style:2,label:'X-Ray',custom_id:'dc3:xray:'+s},
      {type:2,style:2,label:'Events',custom_id:'dc3:events:'+s},
      {type:2,style:2,label:'Accuracy',custom_id:'dc3:accuracy:'+s}
    ]},
    marketSelectRow()
  ];
}
function fakeChatId(guildId,channelId,userId){return 'discord:'+guildId+':'+channelId+':'+userId;}
export function isDiscordInteractionReplyTarget(ctx,messageId){
  return Boolean(
    ctx?.interaction &&
    ctx?.replyMessageId!=null &&
    String(ctx.replyMessageId)===String(messageId||'')
  );
}
export function parseDiscordChatId(value){
  const m=/^discord:([^:]+):([^:]+):([^:]+)$/.exec(String(value||''));
  return m?{guildId:m[1],channelId:m[2],userId:m[3]}:null;
}
export function isDiscordChatId(value,guildId){
  const x=parseDiscordChatId(value);
  return Boolean(x&&(!guildId||x.guildId===String(guildId)));
}
function clip(value,max){
  const s=String(value==null?'':value);
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function splitText(value,max){
  let rest=String(value==null?'':value);
  if(!rest)return [' '];
  const out=[];
  while(rest.length>max){
    let cut=rest.lastIndexOf('\n',max);
    if(cut<max*0.55)cut=rest.lastIndexOf(' ',max);
    if(cut<max*0.55)cut=max;
    out.push(rest.slice(0,cut));
    rest=rest.slice(cut).replace(/^\s+/, '');
  }
  if(rest)out.push(rest);
  return out;
}
function parseMarkup(markup){
  if(typeof markup==='string'){try{return JSON.parse(markup);}catch{return null;}}
  return markup||null;
}
function commandText(interaction){
  const n=String(interaction.commandName||'').toLowerCase();
  const symbol=interaction.options?.getString('symbol')||'';
  if(n==='market')return '/coin '+symbol;
  if(n==='forecast'||n==='structure'||n==='intelligence'||n==='memory'||n==='evidence'||n==='validity')return '/'+n+' '+symbol;
  if(n==='chart')return '/chart '+symbol+' '+(interaction.options?.getString('interval')||'5m');
  if(n==='stats'){
    const p=interaction.options?.getString('period')||'day';
    return p==='week'?'/weekstats':p==='month'?'/monthstats':'/daystats';
  }
  if(n==='why_not_trade')return '/why_not_trade';
  if(n==='report')return '/daystats';
  if(n==='help'||n==='portfolio'||n==='data')return '/'+n;
  return null;
}
function callbackDataForCommand(interaction){
  const n=String(interaction.commandName||'').toLowerCase();
  const s=normalizeDiscordSymbol(interaction.options?.getString('symbol'));
  if(n==='radar')return 'terminal:radar';
  if(!s)return null;
  if(n==='superchart')return 'superchart:'+s+':PRO:'+(interaction.options?.getString('interval')||'5m');
  if(n==='deep')return 'deep:'+s;
  if(n==='why')return 'why:'+s;
  if(n==='flow')return 'flow:'+s;
  if(n==='liquidations')return 'liqmap:'+s+':5m';
  if(n==='xray')return 'xray:'+s;
  if(n==='events')return 'events:'+s;
  if(n==='accuracy')return 'accuracy:'+s;
  return null;
}

export function createDiscordTelegramBridge({token,applicationId,guildId,handleUpdate,getMissionControlSnapshot=()=>null,autoSetup=true,refreshMs=60000,marketRefreshMs=120000,tradeSyncMs=20000,logger=console}={}){
  token=String(token||'').trim(); applicationId=String(applicationId||'').trim(); guildId=String(guildId||'').trim();
  if(!token||!applicationId||!guildId||typeof handleUpdate!=='function')throw new Error('DISCORD_BRIDGE_CONFIG_INVALID');
  const client=new Client({intents:[GatewayIntentBits.Guilds]});
  const rest=new REST({version:'10'}).setToken(token);
  const contexts=new Map();
  const channelCache=new Map();
  const tradeCards=new Map();
  const thesisCards=new Map();
  const closedPosted=new Set();
  const timers=new Set();
  const visualRefreshQueue=createSerialDedupeQueue({maxSize:64});
  const visualRefreshState=new Map();
  const tradeSyncIntervalMs=Math.max(15000,Number(tradeSyncMs)||20000);
  let schedulerStopped=false;
  let closedFeedInitialized=false;
  let lastHealthDigest=null;
  let lastDailyReportDate=null;
  let tradeSyncRunning=false;
  const state={registered:false,ready:false,botUser:null,lastReadyAt:null,lastInteractionAt:null,lastRefreshAt:null,lastMarketRefreshAt:null,lastTradeSyncAt:null,lastTradeSyncStartedAt:null,lastTradeSyncDurationMs:null,tradeSyncIntervalMs,visualRefreshQueueDepth:0,lastVisualRenderAt:null,lastVisualRenderDurationMs:null,visualRenderErrors:0,lastError:null,commands:COMMANDS.length,v2:true,v3:true,v4:true,autoSetup:Boolean(autoSetup),setupStatus:'PENDING',setupError:null,channels:0,marketPanels:0,tradeCards:0,closedFeedInitialized:false,lastAlertAt:null,academyPanels:0};
  function fail(scope,err){
    const message=err instanceof Error?err.message:String(err);
    state.lastError=scope+': '+message;
    try{
      const detail={
        scope:String(scope),
        message,
        code:err?.code??null,
        status:err?.status??null,
        apiErrors:err?.rawError?.errors??null
      };
      logger.error('[TCX_DISCORD]',JSON.stringify(detail));
    }catch{}
  }
  async function channelFor(chatId){const p=parseDiscordChatId(chatId);if(!p)throw new Error('INVALID_DISCORD_CHAT_ID');const c=await client.channels.fetch(p.channelId);if(!c||!c.isTextBased())throw new Error('DISCORD_CHANNEL_NOT_TEXT');return {p,c};}
  async function sendText(chatId,body){
    const ctx=contexts.get(String(chatId)); const chunks=splitText(body.text,2000); let first=null;
    const panelChat=parseDiscordChatId(chatId)?.userId==='panel';
    for(let i=0;i<chunks.length;i++){
      const payload={content:chunks[i],allowedMentions:{parse:[]}};
      if(i===0&&!panelChat){const comps=discordComponents(body.reply_markup);if(comps.length)payload.components=comps;}
      let msg;
      if(ctx&&!ctx.responded){msg=await ctx.interaction.editReply(payload);ctx.responded=true;}
      else if(ctx)msg=await ctx.interaction.followUp(payload);
      else{const x=await channelFor(chatId);msg=await x.c.send(payload);}
      if(!first)first=msg;
    }
    return {message_id:first?.id||null,chat:{id:chatId},text:String(body.text||'')};
  }
  async function editText(chatId,body){
    const ctx=contexts.get(String(chatId));
    const panelChat=parseDiscordChatId(chatId)?.userId==='panel';
    const payload={content:clip(body.text,2000),components:panelChat?[]:discordComponents(body.reply_markup),allowedMentions:{parse:[]}};
    if(isDiscordInteractionReplyTarget(ctx,body.message_id)){
      const edited=await ctx.interaction.editReply(payload);
      ctx.responded=true;
      return {message_id:edited?.id||String(body.message_id),chat:{id:chatId},text:String(body.text||'')};
    }
    const x=await channelFor(chatId);
    const msg=await x.c.messages.fetch(String(body.message_id));
    const edited=await msg.edit(payload);
    return {message_id:edited.id,chat:{id:chatId},text:String(body.text||'')};
  }
  async function sendPhoto(chatId,fields,fileName,fileBuffer,mime){
    const ctx=contexts.get(String(chatId)); const caption=fields.caption??fields.media?.caption??'';
    const attachment=new AttachmentBuilder(fileBuffer,{name:fileName||'chart.png',description:'TCX chart'});
    const payload={content:clip(caption,2000),files:[attachment],components:discordComponents(fields.reply_markup),allowedMentions:{parse:[]}};
    let msg;
    if(ctx&&!ctx.responded){msg=await ctx.interaction.editReply(payload);ctx.responded=true;}
    else if(ctx)msg=await ctx.interaction.followUp(payload);
    else{const x=await channelFor(chatId);msg=await x.c.send(payload);}
    return {message_id:msg?.id||null,chat:{id:chatId},photo:[{}],caption:String(caption)};
  }
  async function editPhoto(chatId,fields,fileName,fileBuffer,mime){
    const ctx=contexts.get(String(chatId));
    const caption=fields.caption??fields.media?.caption??'';
    const attachment=new AttachmentBuilder(fileBuffer,{name:fileName||'chart.png',description:'TCX chart'});
    const payload={content:clip(caption,2000),attachments:[],files:[attachment],components:discordComponents(fields.reply_markup),allowedMentions:{parse:[]}};
    if(isDiscordInteractionReplyTarget(ctx,fields.message_id)){
      const edited=await ctx.interaction.editReply(payload);
      ctx.responded=true;
      return {message_id:edited?.id||String(fields.message_id),chat:{id:chatId},photo:[{}],caption:String(caption)};
    }
    const x=await channelFor(chatId);
    const msg=await x.c.messages.fetch(String(fields.message_id));
    const edited=await msg.edit(payload);
    return {message_id:edited.id,chat:{id:chatId},photo:[{}],caption:String(caption)};
  }
  function handlesTelegramCall(method,body){
    if(method==='answerCallbackQuery')return String(body?.callback_query_id||'').startsWith('discordcb:');
    return isDiscordChatId(body?.chat_id,guildId);
  }
  async function telegramCall(method,body={}){
    if(method==='answerCallbackQuery')return true;
    if(method==='sendMessage')return sendText(body.chat_id,body);
    if(method==='editMessageText')return editText(body.chat_id,body);
    if(method==='deleteMessage'){const x=await channelFor(body.chat_id);const m=await x.c.messages.fetch(String(body.message_id));await m.delete();return true;}
    throw new Error('DISCORD_TELEGRAM_METHOD_UNSUPPORTED:'+method);
  }
  async function telegramMultipart(method,fields,fileField,fileName,fileBuffer,mime='image/png'){
    if(method==='sendPhoto')return sendPhoto(fields.chat_id,fields,fileName,fileBuffer,mime);
    if(method==='editMessageMedia')return editPhoto(fields.chat_id,fields,fileName,fileBuffer,mime);
    throw new Error('DISCORD_TELEGRAM_MULTIPART_UNSUPPORTED:'+method);
  }

  async function safeMissionSnapshot(){try{return await Promise.resolve(getMissionControlSnapshot())||{};}catch(err){fail('mission-snapshot',err);return {};}}
  async function getGuild(){return client.guilds.fetch(guildId);}
  async function ensureLayout(){
    const g=await getGuild(); await g.channels.fetch();
    const member=g.members.me||await g.members.fetchMe().catch(()=>null);
    const canManage=Boolean(member?.permissions?.has(PermissionFlagsBits.ManageChannels));
    const created=[]; channelCache.clear();
    for(const section of SERVER_LAYOUT){
      let category=g.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===section.category);
      if(!category){if(!canManage)throw new Error('MANAGE_CHANNELS_REQUIRED');category=await g.channels.create({name:section.category,type:ChannelType.GuildCategory,reason:'TCX Discord V2 setup'});created.push(section.category);}
      for(const spec of section.channels){
        let channel=g.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===spec.name);
        if(!channel){if(!canManage)throw new Error('MANAGE_CHANNELS_REQUIRED');channel=await g.channels.create({name:spec.name,type:ChannelType.GuildText,parent:category.id,topic:spec.topic,reason:'TCX Discord V2 setup'});created.push('#'+spec.name);}
        channelCache.set(spec.name,channel);
      }
    }
    state.channels=channelCache.size; state.setupStatus='READY'; state.setupError=null;
    return {ok:true,created,channels:channelCache.size};
  }
  async function findMarked(channel,marker){try{const messages=await channel.messages.fetch({limit:50});return messages.find(m=>m.author?.id===client.user?.id&&hasMarker(m,marker))||null;}catch{return null;}}
  async function upsertMarked(channel,marker,payload){let m=await findMarked(channel,marker);return m?m.edit(payload):channel.send(payload);}
  async function ensureStart(){const c=channelCache.get('start-here');return c?upsertMarked(c,MARKERS.start,startPayload()):null;}
  async function ensureAcademy(){
    const specs=[
      ['academy-start',MARKERS.academyStart,'start'],
      ['academy-roadmap',MARKERS.academyRoadmap,'roadmap'],
      ['academy-lessons',MARKERS.academyLessons,'lessons'],
      ['academy-chart-training',MARKERS.academyChart,'chart'],
      ['academy-challenges',MARKERS.academyChallenges,'challenges'],
      ['academy-glossary',MARKERS.academyGlossary,'glossary'],
      ['academy-progress',MARKERS.academyProgress,'progress'],
      ['academy-questions',MARKERS.academyQuestions,'questions']
    ];
    let ready=0;
    for(const [name,marker,kind] of specs){
      const c=channelCache.get(name);
      if(!c)continue;
      await upsertMarked(c,marker,academyStaticPayload(kind));
      ready++;
    }
    state.academyPanels=ready;
    return ready;
  }

  async function refreshTerminal(){const c=channelCache.get('tcx-terminal');if(!c)return null;const m=await upsertMarked(c,MARKERS.terminal,buildDiscordTerminalPayload(await safeMissionSnapshot()));state.lastRefreshAt=Date.now();return m;}
  async function refreshSystem(){const c=channelCache.get('system-status');return c?upsertMarked(c,MARKERS.system,buildDiscordSystemPayload(await safeMissionSnapshot())):null;}
  async function refreshPerformance(){const c=channelCache.get('performance');return c?upsertMarked(c,MARKERS.performance,buildDiscordPerformancePayload(await safeMissionSnapshot())):null;}
  async function refreshOverview(){const c=channelCache.get('market-overview');return c?upsertMarked(c,MARKERS.overview,buildDiscordMarketOverviewPayload(await safeMissionSnapshot())):null;}
  async function refreshDataHealth(){const c=channelCache.get('data-health');return c?upsertMarked(c,MARKERS.data,buildDiscordDataHealthPayload(await safeMissionSnapshot())):null;}
  async function latestBotMessage(channel){try{const messages=await channel.messages.fetch({limit:20});return messages.find(m=>m.author?.id===client.user?.id)||null;}catch{return null;}}
  async function renderCoreIntoMessage(channel,msg,callbackData,{forcePhoto=false}={}){
    const chatId=fakeChatId(guildId,channel.id,'panel');
    await handleUpdate({update_id:'discord:auto:'+Date.now()+':'+channel.id,callback_query:{id:'discordcb:auto:'+Date.now()+':'+channel.id,from:{id:client.user?.id||'system',username:client.user?.username||'TCX'},data:String(callbackData),message:{message_id:String(msg.id),chat:{id:chatId},text:String(msg.content||''),...((forcePhoto||msg.attachments?.size)?{photo:[{}]}:{})}}});
    try{
      const refreshed=await channel.messages.fetch(String(msg.id));
      const symbol=/:(\w+USDT)(?::|$)/.exec(String(callbackData||''))?.[1]||null;
      const components=symbol?marketActionComponents(symbol):commandCenterComponents();
      await refreshed.edit({components,allowedMentions:{parse:[]}});
      return refreshed;
    }catch(err){fail('panel-components',err);return null;}
  }
  function tradeVisualDue(key,now=Date.now()){
    const row=visualRefreshState.get(String(key||''))||null;
    return !row?.queuedAt&&(!row?.lastRenderedAt||Number(now)-Number(row.lastRenderedAt)>120000);
  }
  function queueTradeVisual({key,channel,message,callbackData}={}){
    const k=String(key||'');
    if(!k||!channel||!message)return false;
    const prior=visualRefreshState.get(k)||{};
    if(prior.queuedAt)return false;
    const queuedAt=Date.now();
    visualRefreshState.set(k,{...prior,queuedAt,lastError:null});
    const queued=visualRefreshQueue.enqueue(k,async()=>{
      const startedAt=Date.now();
      let ok=false;
      let error=null;
      try{
        await renderCoreIntoMessage(channel,message,callbackData,{forcePhoto:true});
        ok=true;
      }catch(err){
        error=err instanceof Error?err.message:String(err);
        state.visualRenderErrors++;
        fail('trade-visual:'+k,err);
      }finally{
        const finishedAt=Date.now();
        state.lastVisualRenderAt=finishedAt;
        state.lastVisualRenderDurationMs=Math.max(0,finishedAt-startedAt);
        if(visualRefreshState.has(k)){
          const current=visualRefreshState.get(k)||{};
          visualRefreshState.set(k,{
            ...current,
            queuedAt:null,
            lastRenderedAt:ok?finishedAt:(current.lastRenderedAt||null),
            lastError:error
          });
        }
      }
    });
    if(!queued){
      if(Object.keys(prior).length)visualRefreshState.set(k,prior);
      else visualRefreshState.delete(k);
    }
    state.visualRefreshQueueDepth=visualRefreshQueue.snapshot().depth;
    return queued;
  }
  async function drainVisualRefreshQueue(){
    const result=await visualRefreshQueue.drainOne();
    state.visualRefreshQueueDepth=visualRefreshQueue.snapshot().depth;
    return result;
  }

  async function refreshCorePanel(channel,callbackData){
    let msg=await latestBotMessage(channel); if(!msg)msg=await channel.send({content:'TCX // PANEL\nInitialisierung …',allowedMentions:{parse:[]}});
    return renderCoreIntoMessage(channel,msg,callbackData,{forcePhoto:Boolean(msg.attachments?.size)});
  }
  async function refreshMarketPanels(){
    let count=0; for(const panel of MARKET_PANELS){const c=channelCache.get(panel.channel);if(!c)continue;try{await refreshCorePanel(c,'refresh:'+panel.symbol);count++;}catch(err){fail('market-panel:'+panel.symbol,err);}}
    state.marketPanels=count; state.lastMarketRefreshAt=Date.now(); return count;
  }
  async function refreshGlobalIntel(){const c=channelCache.get('global-intel');if(c)try{await refreshCorePanel(c,'home:news');}catch(err){fail('global-intel',err);}}
  async function dispatchReadCommand(channelName,text){
    const c=channelCache.get(channelName); if(!c)return false; const chatId=fakeChatId(guildId,c.id,'panel');
    await handleUpdate({update_id:'discord:auto-command:'+Date.now(),message:{message_id:'auto:'+Date.now(),chat:{id:chatId},from:{id:client.user?.id||'system',username:client.user?.username||'TCX'},text:String(text)}}); return true;
  }
  function healthDigest(snapshot={}){
    const h=snapshot?.health||{},r=h?.operationalReadiness||{},f=h?.institutionalForecastRuntime||{};
    return JSON.stringify({
      ready:r?.ready===true,
      fabric:h?.marketDataFabric?.healthy===true,
      oms:h?.shadowOms?.healthy===true,
      forecast:f?.healthy===true||f?.status==='HEALTHY',
      telegram:!h?.telegramPolling?.lastPollError
    });
  }
  async function syncHealthAlerts(){
    const snapshot=await safeMissionSnapshot();
    const digest=healthDigest(snapshot);
    if(lastHealthDigest==null){lastHealthDigest=digest;return;}
    if(digest===lastHealthDigest)return;
    const previous=lastHealthDigest;lastHealthDigest=digest;
    const c=channelCache.get('alerts');if(!c)return;
    const now=JSON.parse(digest),before=JSON.parse(previous);
    const changes=Object.keys(now).filter(k=>now[k]!==before[k]).map(k=>k+': '+(before[k]?'OK':'CHECK')+' → '+(now[k]?'OK':'CHECK'));
    await c.send({embeds:[{title:'TCX // STATUS CHANGE',description:(changes.join('\n')||'System state changed').slice(0,1800),footer:{text:'TCX_DISCORD_V3_ALERT'},timestamp:new Date().toISOString()}],components:commandCenterComponents(),allowedMentions:{parse:[]}});
    state.lastAlertAt=Date.now();
  }
  async function upsertThesisChannelCard(position){
    const channel=channelCache.get('theses'); if(!channel)return null;
    const id=String(position?.positionId||''); if(!id)return null;
    let msg=null;
    const cached=thesisCards.get(id);
    if(cached) msg=await channel.messages.fetch(cached).catch(()=>null);
    if(!msg){
      const recent=await channel.messages.fetch({limit:50}).catch(()=>null);
      msg=recent?.find(m=>m.author?.id===client.user?.id&&m.embeds?.some(e=>String(e?.footer?.text||'')==='BIGGJ_THESIS:'+id))||null;
    }
    if(msg) await msg.edit(biggjThesisPayload(position));
    else msg=await channel.send(biggjThesisPayload(position));
    thesisCards.set(id,msg.id);
    return msg;
  }
  async function ensureTradeThreadVisual(thread,position,prior={}){
    if(!thread||!thread.isTextBased())return prior;
    const id=String(position?.positionId||'');
    const recent=await thread.messages.fetch({limit:50}).catch(()=>null);
    let thesisMsg=recent?.find(m=>m.author?.id===client.user?.id&&m.embeds?.some(e=>String(e?.footer?.text||'')==='BIGGJ_THESIS:'+id))||null;
    if(thesisMsg) await thesisMsg.edit(biggjThesisPayload(position));
    else thesisMsg=await thread.send(biggjThesisPayload(position));

    let visualMsg=prior?.visualMessageId?await thread.messages.fetch(prior.visualMessageId).catch(()=>null):null;
    if(!visualMsg) visualMsg=recent?.find(m=>m.author?.id===client.user?.id&&String(m.content||'').includes('TCX SUPERCHART'))||null;
    if(!visualMsg){
      visualMsg=await thread.send({content:'BIGGJ // TRADE VISUAL\nRendering live market state …',allowedMentions:{parse:[]}});
    }
    const next={...prior,thesisMessageId:thesisMsg?.id||null,visualMessageId:visualMsg?.id||null};
    const visualKey='thread:'+id;
    if(visualMsg&&tradeVisualDue(visualKey)){
      queueTradeVisual({
        key:visualKey,
        channel:thread,
        message:visualMsg,
        callbackData:'superchart:'+String(position.symbol)+':FULL:5m'
      });
    }
    return next;
  }
  async function syncThesisDashboard(positions){
    const active=new Set();
    for(const p of (positions||[]).slice(0,20)){
      const id=String(p?.positionId||''); if(!id)continue; active.add(id);
      await upsertThesisChannelCard(p).catch(err=>fail('thesis-card:'+id,err));
    }
    for(const [id,messageId] of [...thesisCards])if(!active.has(id)){
      const channel=channelCache.get('theses');
      if(channel){
        const msg=await channel.messages.fetch(messageId).catch(()=>null);
        if(msg)await msg.edit({content:'',embeds:[...(msg.embeds||[])].map(e=>{const x=e.toJSON();x.description=(x.description||'')+'\n\n**THESIS CLOSED / ARCHIVED**';return x;}),components:[],allowedMentions:{parse:[]}}).catch(()=>null);
      }
      thesisCards.delete(id);
    }
  }
  async function syncTradeCards(){
    const c=channelCache.get('live-trades'); if(!c)return;
    if(tradeSyncRunning){
      try{logger.warn?.('[TCX_DISCORD_TRADE_SYNC_SKIPPED] previous sync still running');}catch{}
      return;
    }
    const syncStartedAt=Date.now();
    state.lastTradeSyncStartedAt=syncStartedAt;
    tradeSyncRunning=true;
    try{
    const snapshot=await safeMissionSnapshot();
    const positions=Array.isArray(snapshot?.portfolio?.positions)?snapshot.portfolio.positions:[];
    const recentClosed=Array.isArray(snapshot?.portfolio?.recentClosed)?snapshot.portfolio.recentClosed:[];
    await syncThesisDashboard(positions);
    const active=new Set();
    const perms=c.permissionsFor(client.user),canThreads=Boolean(perms?.has(PermissionFlagsBits.CreatePublicThreads)&&perms?.has(PermissionFlagsBits.SendMessagesInThreads));
    for(const p of positions.slice(0,20)){
      const id=String(p?.positionId||''); if(!id)continue;
      active.add(id);
      let card=tradeCards.get(id)||{};
      try{
        let starter=card.messageId?await c.messages.fetch(card.messageId).catch(()=>null):null;
        if(!starter){
          const recent=await c.messages.fetch({limit:50});
          starter=recent.find(m=>m.author?.id===client.user?.id&&m.embeds?.some(e=>String(e?.footer?.text||'')===id))||null;
        }
        if(starter)await starter.edit(shadowTradePayload(p));
        else starter=await c.send(shadowTradePayload(p));

        let feedVisual=card.feedVisualMessageId?await c.messages.fetch(card.feedVisualMessageId).catch(()=>null):null;
        if(!feedVisual){
          feedVisual=await c.send({content:'BIGGJ // LIVE TRADE VISUAL\nRendering market state …',allowedMentions:{parse:[]}});
          card.feedVisualMessageId=feedVisual.id;
        }
        const feedVisualKey='feed:'+id;
        if(feedVisual&&tradeVisualDue(feedVisualKey)){
          queueTradeVisual({
            key:feedVisualKey,
            channel:c,
            message:feedVisual,
            callbackData:'superchart:'+String(p.symbol)+':FULL:5m'
          });
        }

        let thread=card.threadId?await client.channels.fetch(card.threadId).catch(()=>null):null;
        if(canThreads&&!thread){
          const activeThreads=await c.threads.fetchActive().catch(()=>null);
          thread=activeThreads?.threads?.find(t=>String(t.name).includes(id.slice(-8)))||null;
          if(!thread){
            thread=await starter.startThread({name:clip(String(p.symbol||'TRADE').replace('USDT','')+'-'+String(p.side||'').toUpperCase()+'-'+id.slice(-8),90),autoArchiveDuration:1440,reason:'BIGGJ shadow trade intelligence lifecycle'});
            await thread.send({content:'BIGGJ // TRADE ROOM\nPoint-in-time Living Thesis + Visual Intelligence. **SHADOW_ONLY**.',components:marketActionComponents(p.symbol),allowedMentions:{parse:[]}});
          }
        }
        card={...card,messageId:starter.id,threadId:thread?.id||card.threadId||null};
        if(thread)card=await ensureTradeThreadVisual(thread,p,card);
        tradeCards.set(id,card);
      }catch(err){fail('trade-card:'+id,err);}
    }
    for(const [id,card] of [...tradeCards])if(!active.has(id)){
      try{
        const msg=await c.messages.fetch(card.messageId);
        const embed=msg.embeds?.[0]?.toJSON?.()||{};
        embed.description='**CLOSED · SHADOW_ONLY**';embed.timestamp=new Date().toISOString();
        await msg.edit({embeds:[embed],components:[],allowedMentions:{parse:[]}});
      }catch{}
      if(card.threadId){
        const thread=await client.channels.fetch(card.threadId).catch(()=>null);
        if(thread?.isTextBased())await thread.send({content:'BIGGJ // POSITION CLOSED\nFinal replay wird im Closed-Trade-Feed archiviert.',allowedMentions:{parse:[]}}).catch(()=>null);
      }
      visualRefreshQueue.cancel('feed:'+id);
      visualRefreshQueue.cancel('thread:'+id);
      visualRefreshState.delete('feed:'+id);
      visualRefreshState.delete('thread:'+id);
      state.visualRefreshQueueDepth=visualRefreshQueue.snapshot().depth;
      tradeCards.delete(id);
    }
    if(!closedFeedInitialized){
      for(const p of recentClosed)if(p?.positionId)closedPosted.add(String(p.positionId));
      closedFeedInitialized=true;state.closedFeedInitialized=true;
    }else{
      const closedChannel=channelCache.get('closed-trades');
      if(closedChannel){
        for(const p of [...recentClosed].reverse()){
          const id=String(p?.positionId||'');if(!id||closedPosted.has(id))continue;
          await closedChannel.send(closedTradePayload(p));
          const visual=await closedChannel.send({content:'BIGGJ // FINAL TRADE REPLAY\nRendering point-in-time lifecycle …',allowedMentions:{parse:[]}});
          await renderCoreIntoMessage(closedChannel,visual,'tradereplay:'+String(p.symbol),{forcePhoto:true}).catch(err=>fail('closed-visual:'+id,err));
          closedPosted.add(id);
        }
      }
    }
    if(closedPosted.size>300){
      const keep=new Set(recentClosed.slice(0,100).map(p=>String(p?.positionId||'')).filter(Boolean));
      closedPosted.clear();for(const id of keep)closedPosted.add(id);
    }
    state.tradeCards=tradeCards.size;
    }finally{
      state.lastTradeSyncAt=Date.now();
      state.lastTradeSyncDurationMs=Math.max(0,state.lastTradeSyncAt-syncStartedAt);
      tradeSyncRunning=false;
    }
  }
  async function maybeDailyReport(){const t=berlinParts();if(t.hour===23&&t.minute>=55&&lastDailyReportDate!==t.date){lastDailyReportDate=t.date;try{await dispatchReadCommand('performance','/daystats');}catch(err){fail('daily-report',err);}}}
  function addTimer(fn,ms){const timer=setInterval(()=>void Promise.resolve().then(fn).catch(err=>fail('timer',err)),ms);timer.unref?.();timers.add(timer);}
  function addSerialTimer(fn,ms){
    const schedule=()=>{
      if(schedulerStopped)return;
      const timer=setTimeout(()=>{
        timers.delete(timer);
        void Promise.resolve()
          .then(fn)
          .catch(err=>fail('timer',err))
          .finally(schedule);
      },ms);
      timer.unref?.();
      timers.add(timer);
    };
    schedule();
  }
  function startSchedulers(){
    if(timers.size)return;
    schedulerStopped=false;
    addTimer(refreshTerminal,Math.max(30000,Number(refreshMs)||60000));
    addTimer(refreshSystem,Math.max(30000,Number(refreshMs)||60000));
    addTimer(refreshPerformance,60000);
    addTimer(refreshOverview,90000);
    addTimer(refreshDataHealth,60000);
    addTimer(refreshMarketPanels,Math.max(60000,Number(marketRefreshMs)||120000));
    addTimer(refreshGlobalIntel,180000);
    addSerialTimer(syncTradeCards,tradeSyncIntervalMs);
    addSerialTimer(drainVisualRefreshQueue,250);
    addTimer(syncHealthAlerts,30000);
    addTimer(maybeDailyReport,60000);
  }
  async function bootstrapV2(){
    try{const setup=await ensureLayout();await ensureStart();await ensureAcademy();await Promise.allSettled([refreshTerminal(),refreshSystem(),refreshPerformance(),refreshOverview(),refreshDataHealth(),refreshMarketPanels(),refreshGlobalIntel(),syncTradeCards(),syncHealthAlerts()]);startSchedulers();return setup;}
    catch(err){state.setupStatus='NEEDS_PERMISSION';state.setupError=err instanceof Error?err.message:String(err);fail('setup',err);return {ok:false,error:state.setupError};}
  }
  async function setupCommand(interaction){
    await interaction.deferReply({ephemeral:true});
    if(!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)){await interaction.editReply('Für \`/setup\` brauchst du **Server verwalten**.');return;}
    const result=await bootstrapV2();
    if(!result.ok){await interaction.editReply(result.error==='MANAGE_CHANNELS_REQUIRED'?'Gib dem Bot **Kanäle verwalten** und führe \`/setup\` erneut aus.':'Setup fehlgeschlagen: '+result.error);return;}
    const g=await getGuild(),member=g.members.me||await g.members.fetchMe().catch(()=>null),threads=Boolean(member?.permissions?.has(PermissionFlagsBits.CreatePublicThreads));
    await interaction.editReply('BIGGJ Discord V4 eingerichtet: '+result.channels+' Channels'+(result.created.length?' · '+result.created.length+' neu':'')+'.\n'+(threads?'Trade-Threads: bereit.':'Für Trade-Threads zusätzlich **Öffentliche Threads erstellen** aktivieren.'));
  }
  async function thesisCommand(interaction){
    const symbol=normalizeDiscordSymbol(interaction.options?.getString('symbol'));
    await interaction.deferReply();
    const snapshot=await safeMissionSnapshot();
    const rows=Array.isArray(snapshot?.portfolio?.positions)?snapshot.portfolio.positions:[];
    const p=[...rows].filter(x=>x?.symbol===symbol&&x?.status==='OPEN').sort((a,b)=>Number(b?.openedAt||0)-Number(a?.openedAt||0))[0]||null;
    if(!p){await interaction.editReply('Für '+String(symbol||'diesen Markt')+' gibt es gerade keine aktive primäre Shadow-Position.');return;}
    await interaction.editReply(biggjThesisPayload(p));
  }
  async function academyCommand(interaction){
    await interaction.deferReply();
    await interaction.editReply(academyStaticPayload('start'));
  }
  async function lessonCommand(interaction){
    const topic=String(interaction.options?.getString('topic')||'basics');
    await interaction.deferReply();
    await interaction.editReply(academyLessonPayload(topic));
  }
  async function terminalCommand(interaction){await interaction.deferReply();await interaction.editReply(buildDiscordTerminalPayload(await safeMissionSnapshot()));}
  async function systemCommand(interaction){await interaction.deferReply();await interaction.editReply(buildDiscordSystemPayload(await safeMissionSnapshot()));}
  async function startCommand(interaction){await interaction.deferReply();await interaction.editReply(startPayload());}

  async function runCoreCallback(interaction,data){
    await interaction.deferReply();
    const placeholder=await interaction.editReply({content:'TCX lädt Analyse …',allowedMentions:{parse:[]}});
    const chatId=fakeChatId(interaction.guildId,interaction.channelId,interaction.user.id);
    const ctx={interaction:interaction,responded:false,replyMessageId:String(placeholder.id)};
    contexts.set(chatId,ctx);
    try{
      await handleUpdate({
        update_id:'discord:'+interaction.id,
        callback_query:{
          id:'discordcb:'+interaction.id,
          from:{id:interaction.user.id,username:interaction.user.username},
          data:String(data||''),
          message:{message_id:String(placeholder.id),chat:{id:chatId},text:String(placeholder.content||'')}
        }
      });
      if(!ctx.responded){
        const current=await interaction.fetchReply().catch(()=>null);
        if(current&&String(current.content||'').includes('TCX lädt Analyse')){
          try{logger.warn?.('[TCX_DISCORD_NO_OUTPUT] '+String(data||'UNKNOWN'));}catch{}
          await interaction.editReply({content:'TCX konnte für diese Aktion keine sichtbare Ausgabe erzeugen. Bitte erneut versuchen.',components:[],allowedMentions:{parse:[]}});
        }
      }
    }catch(err){
      fail('v3-callback',err);
      try{await interaction.editReply('TCX konnte diese Analyse gerade nicht laden.');}catch{}
    }finally{contexts.delete(chatId);}
  }

  async function onCommand(interaction){
    if(String(interaction.guildId)!==guildId){await interaction.reply({content:'Dieser TCX-Bot ist für einen anderen Server konfiguriert.',ephemeral:true});return;}
    const name=String(interaction.commandName||'').toLowerCase();
    if(name==='setup'){await setupCommand(interaction);return;}
    if(name==='start'){await startCommand(interaction);return;}
    if(name==='dashboard'||name==='terminal'){await terminalCommand(interaction);return;}
    if(name==='system'){await systemCommand(interaction);return;}
    if(name==='thesis'){await thesisCommand(interaction);return;}
    if(name==='academy'){await academyCommand(interaction);return;}
    if(name==='lesson'){await lessonCommand(interaction);return;}
    const callback=callbackDataForCommand(interaction);
    if(callback){await runCoreCallback(interaction,callback);return;}
    const text=commandText(interaction); if(!text){await interaction.reply({content:'Unbekannter TCX-Befehl.',ephemeral:true});return;}
    await interaction.deferReply();
    const chatId=fakeChatId(interaction.guildId,interaction.channelId,interaction.user.id); const ctx={interaction:interaction,responded:false}; contexts.set(chatId,ctx);
    try{await handleUpdate({update_id:'discord:'+interaction.id,message:{message_id:interaction.id,chat:{id:chatId},from:{id:interaction.user.id,username:interaction.user.username},text:text}});if(!ctx.responded)await interaction.editReply('TCX hat keine Ausgabe erzeugt.');}
    catch(err){fail('command',err);try{await interaction.editReply('TCX Discord konnte den Befehl gerade nicht ausführen.');}catch{}}
    finally{contexts.delete(chatId);}
  }
  async function onButton(interaction){
    if(String(interaction.guildId)!==guildId)return;
    const customId=decodeDiscordCallbackCustomId(interaction.customId);
    if(customId.startsWith('dc5:lesson:')){
      const topic=String(customId.split(':')[2]||'basics');
      await interaction.deferReply();
      await interaction.editReply(academyLessonPayload(topic));
      return;
    }
    if(customId.startsWith('dc4:thesis:')){
      const symbol=normalizeDiscordSymbol(customId.split(':')[2]);
      await interaction.deferReply();
      const snapshot=await safeMissionSnapshot();
      const rows=Array.isArray(snapshot?.portfolio?.positions)?snapshot.portfolio.positions:[];
      const p=[...rows].filter(x=>x?.symbol===symbol&&x?.status==='OPEN').sort((a,b)=>Number(b?.openedAt||0)-Number(a?.openedAt||0))[0]||null;
      if(!p){await interaction.editReply('Keine aktive primäre Shadow-Position für '+String(symbol||'diesen Markt')+'.');return;}
      await interaction.editReply(biggjThesisPayload(p));
      return;
    }
    if(customId.startsWith('dc3:')){
      await runCoreCallback(interaction,customId.slice(4));
      return;
    }
    await interaction.deferUpdate();
    const chatId=fakeChatId(interaction.guildId,interaction.channelId,interaction.user.id); contexts.set(chatId,{interaction:interaction,responded:true});
    try{await handleUpdate({update_id:'discord:'+interaction.id,callback_query:{id:'discordcb:'+interaction.id,from:{id:interaction.user.id,username:interaction.user.username},data:customId,message:{message_id:String(interaction.message.id),chat:{id:chatId},text:String(interaction.message.content||''),...(interaction.message.attachments?.size?{photo:[{}]}:{})}}});}
    catch(err){fail('button',err);try{await interaction.followUp({content:'TCX konnte diese Aktion gerade nicht ausführen.',ephemeral:true});}catch{}}
    finally{contexts.delete(chatId);}
  }
  async function onSelect(interaction){
    if(String(interaction.guildId)!==guildId)return;
    if(String(interaction.customId||'')!=='dc3:market-select'){await interaction.reply({content:'Unbekannte Auswahl.',ephemeral:true});return;}
    const symbol=normalizeDiscordSymbol(interaction.values?.[0]);
    if(!symbol){await interaction.reply({content:'Ungültiger Markt.',ephemeral:true});return;}
    await runCoreCallback(interaction,'market:'+symbol);
  }
  client.on(Events.ClientReady,function(readyClient){state.ready=true;state.botUser=readyClient.user?.tag||readyClient.user?.id||null;state.lastReadyAt=Date.now();state.lastError=null;});
  client.on(Events.Error,function(err){fail('client',err);});
  client.on(Events.InteractionCreate,function(interaction){
    state.lastInteractionAt=Date.now();
    if(interaction.isChatInputCommand())void onCommand(interaction);
    else if(interaction.isButton())void onButton(interaction);
    else if(interaction.isStringSelectMenu())void onSelect(interaction);
  });
  async function start(){
    await rest.put(Routes.applicationGuildCommands(applicationId,guildId),{body:COMMANDS});state.registered=true;await client.login(token);
    if(!client.isReady())await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('DISCORD_READY_TIMEOUT')),15000);client.once(Events.ClientReady,()=>{clearTimeout(timeout);resolve();});});
    if(autoSetup)await bootstrapV2();
    return snapshot();
  }
  async function stop(){schedulerStopped=true;for(const timer of timers){clearInterval(timer);clearTimeout(timer);}timers.clear();client.destroy();state.ready=false;}
  function snapshot(){return Object.freeze({version:DISCORD_TELEGRAM_BRIDGE_VERSION,...state,guildId:guildId,applicationId:applicationId,contexts:contexts.size,channels:channelCache.size,marketPanels:state.marketPanels,tradeCards:tradeCards.size,thesisCards:thesisCards.size,academyPanels:state.academyPanels});}
  return Object.freeze({start,stop,snapshot,telegramCall,telegramMultipart,handlesTelegramCall,setup:bootstrapV2,isChatId:function(v){return isDiscordChatId(v,guildId);}});
}
