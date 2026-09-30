import { AttachmentBuilder, ChannelType, Client, Events, GatewayIntentBits, PermissionFlagsBits, REST, Routes } from 'discord.js';
import { buildBiggjTradeThesis } from './biggj-visual-intelligence.mjs';
import { discordComponents, decodeDiscordCallbackCustomId } from './discord-component-ids.mjs';
import { createSerialDedupeQueue, mapWithConcurrency, refreshDueFromTimestamps } from './discord-serial-dedupe-queue.mjs';
import {
  BIGGJ_DISCORD_OBSERVABILITY_LAYOUT,
  biggjObservabilityNavComponents,
  buildBiggjDiscordObservabilityPanelMap,
  buildBiggjDiscordObservabilityPayload
} from './biggj-discord-observability.mjs';
import {
  BIGGJ_EXPERIENCE_LAYOUT,
  buildBiggjExperiencePanelMap
} from './biggj-experience-center.mjs';
import { createBiggjChannelManagerRuntime } from './biggj-channel-operations.mjs';
import { createGermanTranslationProvider } from './biggj-german-translation.mjs';

export const DISCORD_TELEGRAM_BRIDGE_VERSION='BIGGJ_DISCORD_COMMAND_CENTER_V6';
export const BIGGJ_DISCORD_CHANNEL_UX_VERSION='BIGGJ_DISCORD_CHANNEL_UX_V7';

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
  {name:'brain',description:'BIGGJ Brain Pulse öffnen'},
  {name:'knowledge',description:'BIGGJ Wissens- und Capability-Map öffnen'},
  {name:'research',description:'BIGGJ Research Queue öffnen'},
  {name:'hypotheses',description:'BIGGJ Hypothesen und Falsifier öffnen'},
  {name:'changes',description:'BIGGJ Revisionen und Änderungen öffnen'},
  {name:'experiments',description:'BIGGJ Research Experimente öffnen'},
  {name:'skills',description:'BIGGJ Skill Tree öffnen'},
  {name:'reviews',description:'BIGGJ Research Review Queue öffnen'},
  {name:'timeline',description:'BIGGJ Learning Timeline öffnen'},
  {name:'needs',description:'Was BIGGJ aktuell für maximale Effizienz braucht'},
  {name:'learned',description:'BIGGJ Learned Playbook öffnen'},
  {name:'traders',description:'BIGGJ Profit Trader Watch öffnen'},
  {name:'cockpit',description:'BIGGJ Trade Cockpit öffnen'},
  {name:'charts',description:'BIGGJ One-Tap Chart Desk öffnen'},
  {name:'news',description:'BIGGJ relevanten Live-News-Feed öffnen'},
  {name:'world',description:'BIGGJ Weltlage öffnen'},
  {name:'memecoins',description:'BIGGJ Memecoin Live-Radar öffnen'},
  {name:'app',description:'BIGGJ Mobile Command Center öffnen'},
  {name:'progress',description:'BIGGJ Lernfortschritt öffnen'},
  {name:'evidence_log',description:'BIGGJ Evidence Ledger öffnen'},
  {name:'decisions',description:'BIGGJ Decision Trace öffnen'},
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
  ...BIGGJ_DISCORD_OBSERVABILITY_LAYOUT,
  ...BIGGJ_EXPERIENCE_LAYOUT,
  {category:'TCX • MARKETS',channels:[
    {name:'market-overview',topic:'Übersicht der wichtigsten beobachteten Märkte.'},
    {name:'btc',topic:'BTC/USDT Live-Marktpanel von TCX.'},
    {name:'eth',topic:'ETH/USDT Live-Marktpanel von TCX.'},
    {name:'sol',topic:'SOL/USDT Live-Marktpanel von TCX.'},
    {name:'memecoins',topic:'Memecoin Intelligence Lab: Live DEX Trends, Liquidität, Risikoindikatoren, Datenlücken und Research. SHADOW_ONLY.'}
  ]},
  {category:'TCX • INTELLIGENCE',channels:[
    {name:'forecasts',topic:'Probabilistische TCX Forecasts und Invalidation.'},
    {name:'global-intel',topic:'Legacy Global-Intel Oberfläche; neue Nutzerflächen sind #news-feed und #world-watch.'},
    {name:'anomalies',topic:'Anomalien, Regimewechsel und Research-Hinweise.'},
    {name:'alerts',topic:'Priorisierte TCX System- und Research-Alerts.'},
    {name:'theses',topic:'BIGGJ Living Theses, Ghost Paths und Trade DNA für aktive Shadow-Trades.'}
  ]},
  {category:'TCX • SHADOW',channels:[
    {name:'live-trades',topic:'Offene BIGGJ Shadow-Trades mit kompakter Thesis, Risiko, PnL und Live-Chart-Thread. Keine echten Orders.'},
    {name:'closed-trades',topic:'Abgeschlossene Shadow-Trades mit Ergebnis und Exit-Grund.'},
    {name:'performance',topic:'Tages-, Wochen- und Monatsperformance im Shadow-Modus.'},
    {name:'trade-replay',topic:'Trade-Replays und Post-Trade-Lernen mit Point-in-Time Kontext.'}
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
  {category:'BIGGJ • OPERATIONS',channels:[
    {name:'channel-supervisor',topic:'Meta-Überwachung aller Channel-Manager: Zustand, Freshness, Fehler, Entscheidungen und Auto-Reparaturen.'},
    {name:'channel-improvements',topic:'Priorisierte Verbesserungsvorschläge der Channel-Manager mit Ursache, Handlung und Status.'}
  ]},
  {category:'TCX • SYSTEM',channels:[
    {name:'system-status',topic:'Runtime-, Daten- und Sicherheitsstatus.'},
    {name:'data-health',topic:'Provider-, Datenqualitäts- und Pipeline-Status.'},
    {name:'errors',topic:'Technische Warnungen und Fehlerdiagnostik.'}
  ]}
]);

const CHANNEL_PROFILE_GROUPS=Object.freeze({
  HOME:new Set(['start-here']),
  LIVE_60:new Set([
    'tcx-terminal','performance','system-status','data-health',
    'biggj-needs','learned-playbook','trader-watch','trade-cockpit','chart-desk','mobile-app',
    'forecasts','anomalies','trade-replay','errors','channel-supervisor','channel-improvements'
  ]),
  LIVE_90:new Set(['market-overview']),
  LIVE_120:new Set([
    'brain-pulse','knowledge','research-queue','hypotheses','changes','experiments','skill-tree',
    'review-queue','learning-timeline','progress','evidence-ledger','decision-trace',
    'btc','eth','sol','memecoins','global-intel'
  ]),
  ACADEMY_120:new Set([
    'academy-start','academy-roadmap','academy-lessons','academy-chart-training',
    'academy-challenges','academy-glossary','academy-progress','academy-questions'
  ]),
  FEED_120:new Set(['news-feed','world-watch']),
  TRADE_STREAM:new Set(['live-trades','theses']),
  EVENT_FEED:new Set(['closed-trades','alerts'])
});

export function biggjChannelExperienceProfile(name){
  const key=String(name||'');
  if(CHANNEL_PROFILE_GROUPS.HOME.has(key))return {mode:'HOME',cadence:'STARTUP + ON DEMAND',cadenceMs:null,requiresContent:true};
  if(CHANNEL_PROFILE_GROUPS.LIVE_60.has(key))return {mode:'LIVE PANEL',cadence:'~60s',cadenceMs:60_000,requiresContent:true};
  if(CHANNEL_PROFILE_GROUPS.LIVE_90.has(key))return {mode:'LIVE PANEL',cadence:'~90s',cadenceMs:90_000,requiresContent:true};
  if(CHANNEL_PROFILE_GROUPS.LIVE_120.has(key))return {mode:'LIVE PANEL',cadence:'~120s',cadenceMs:120_000,requiresContent:true};
  if(CHANNEL_PROFILE_GROUPS.ACADEMY_120.has(key))return {mode:'LEARNING PANEL',cadence:'~120s · kept at bottom',cadenceMs:120_000,requiresContent:true};
  if(CHANNEL_PROFILE_GROUPS.FEED_120.has(key))return {mode:'DEDUPED LIVE FEED',cadence:'~120s',cadenceMs:120_000,requiresContent:false};
  if(CHANNEL_PROFILE_GROUPS.TRADE_STREAM.has(key))return {mode:'TRADE STREAM',cadence:'~20–120s',cadenceMs:120_000,requiresContent:false};
  if(CHANNEL_PROFILE_GROUPS.EVENT_FEED.has(key))return {mode:'EVENT FEED',cadence:'on change',cadenceMs:null,requiresContent:false,eventDriven:true};
  return null;
}

function decoratedChannelTopic(spec={}){
  const base=String(spec?.topic||'').trim();
  const profile=biggjChannelExperienceProfile(spec?.name);
  if(!profile)return base;
  return (base+' · '+profile.mode+' · '+profile.cadence).slice(0,1024);
}

export function auditBiggjDiscordChannelLayout(){
  const names=SERVER_LAYOUT.flatMap(section=>section.channels.map(x=>x.name));
  const duplicates=names.filter((name,index)=>names.indexOf(name)!==index);
  const missingProfiles=names.filter(name=>!biggjChannelExperienceProfile(name));
  return Object.freeze({
    version:BIGGJ_DISCORD_CHANNEL_UX_VERSION,
    channels:names.length,
    uniqueChannels:new Set(names).size,
    duplicateChannels:[...new Set(duplicates)],
    missingProfiles,
    complete:duplicates.length===0&&missingProfiles.length===0
  });
}

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
  academyQuestions:'BIGGJ_ACADEMY_QUESTIONS_V1',
  forecasts:'BIGGJ_CHANNEL_FORECAST_DESK_V7',
  intelHub:'BIGGJ_CHANNEL_INTEL_HUB_V7',
  anomalies:'BIGGJ_CHANNEL_ANOMALY_WATCH_V7',
  replay:'BIGGJ_CHANNEL_REPLAY_DESK_V7',
  errors:'BIGGJ_CHANNEL_ERROR_DESK_V7'
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
  return {embeds:[{title:'BIGGJ ACADEMY // '+x.title,description:['**Ziel:** '+x.goal,'',...x.body,'','**Modus: PAPER / SHADOW ONLY · keine echten Orders**'].join('\n'),footer:{text:'BIGGJ_ACADEMY_LESSON:'+topic},timestamp:new Date().toISOString()}],components:academyLessonComponents(topic),allowedMentions:{parse:[]}};
}
function academyLessonComponents(topic=null){
  const rows=[
    {type:1,components:[
      {type:2,style:1,label:'1 Grundlagen',custom_id:'dc5:lesson:basics'},
      {type:2,style:2,label:'2 Struktur',custom_id:'dc5:lesson:structure'},
      {type:2,style:2,label:'3 Risiko',custom_id:'dc5:lesson:risk'}
    ]},
    {type:1,components:[
      {type:2,style:2,label:'4 Liquidität',custom_id:'dc5:lesson:liquidity'},
      {type:2,style:2,label:'5 Setup',custom_id:'dc5:lesson:setup'},
      {type:2,style:2,label:'6 Journal',custom_id:'dc5:lesson:journal'}
    ]}
  ];
  const practical={
    structure:[
      {type:2,style:1,label:'BTC Chart',custom_id:'dc3:chart:BTCUSDT:5m'},
      {type:2,style:2,label:'Struktur prüfen',custom_id:'dc3:structure:BTCUSDT'}
    ],
    risk:[
      {type:2,style:1,label:'BTC SuperChart',custom_id:'dc3:superchart:BTCUSDT:PRO:5m'},
      {type:2,style:2,label:'Risiko prüfen',custom_id:'dc3:terminal:risk:BTCUSDT'}
    ],
    liquidity:[
      {type:2,style:1,label:'BTC SuperChart',custom_id:'dc3:superchart:BTCUSDT:PRO:5m'},
      {type:2,style:2,label:'Deep Dive',custom_id:'dc3:deep:BTCUSDT'}
    ],
    setup:[
      {type:2,style:1,label:'BTC SuperChart',custom_id:'dc3:superchart:BTCUSDT:PRO:5m'},
      {type:2,style:2,label:'Warum?',custom_id:'dc3:why:BTCUSDT'}
    ],
    journal:[
      {type:2,style:1,label:'BTC Replay',custom_id:'dc3:tradereplay:BTCUSDT'}
    ]
  };
  const actions=practical[String(topic||'').toLowerCase()]||null;
  if(actions?.length)rows.push({type:1,components:actions});
  return rows;
}
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
function startPayload(){return {embeds:[{title:'BIGGJ // COMMAND CENTER · CHANNEL UX V7',description:[
  '**Ein Einstiegspunkt für das komplette BIGGJ Research OS — ohne durch alle Channels scrollen zu müssen.**',
  '',
  '**90%-PFAD · täglich relevant**',
  '#trade-cockpit → aktive Shadow-Trades',
  '#chart-desk → Charts / Radar / Forecast',
  '#news-feed + #world-watch → deutsche Live-News',
  '#biggj-needs → aktuelle Lücken und höchste Hebel',
  '#performance → Ergebnis und Drawdown',
  '',
  '**CHANNEL OPERATIONS**',
  '#channel-supervisor → überwacht jeden Channel-Manager',
  '#channel-improvements → priorisierte Reparaturen/Verbesserungen',
  '#errors → technische Fehler und Warnungen',
  '',
  '**DEEP RESEARCH**',
  '#brain-pulse → aktueller Research-State',
  '#research-queue → nächste Tests',
  '#evidence-ledger → Belege / Coverage',
  '#decision-trace → strukturierte Entscheidungsgründe',
  '',
  '**SHADOW_ONLY · REAL ORDERS BLOCKED**'
].join('\n'),footer:{text:MARKERS.start+' · '+BIGGJ_DISCORD_CHANNEL_UX_VERSION},timestamp:new Date().toISOString()}],components:[...commandCenterComponents(),...biggjObservabilityNavComponents()].slice(0,5),allowedMentions:{parse:[]}};}
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

function buildForecastDeskPayload(snapshot={}){
  const h=snapshot?.health||{};
  const f=h?.institutionalForecastRuntime||{};
  return {embeds:[{
    title:'BIGGJ // FORECAST DESK',
    description:'**Probabilistische Forecasts, Unsicherheit und Invalidation — kein Kursversprechen.**',
    fields:[
      {name:'Forecast-Runtime',value:yesNo(f?.healthy??(f?.status==='HEALTHY')),inline:true},
      {name:'Status',value:String(f?.status||'—'),inline:true},
      {name:'Modus',value:'SHADOW_ONLY · Point-in-Time',inline:true},
      {name:'Arbeitsweg',value:'1. Forecast öffnen · 2. Unsicherheit prüfen · 3. Gegenargumente/Invalidation · 4. Accuracy später gegen Outcome prüfen.',inline:false}
    ],
    footer:{text:MARKERS.forecasts},
    timestamp:new Date().toISOString()
  }],components:[
    {type:1,components:[
      {type:2,style:1,label:'BTC Forecast',custom_id:'dc3:forecast:BTCUSDT'},
      {type:2,style:1,label:'ETH Forecast',custom_id:'dc3:forecast:ETHUSDT'},
      {type:2,style:1,label:'SOL Forecast',custom_id:'dc3:forecast:SOLUSDT'}
    ]},
    {type:1,components:[
      {type:2,style:2,label:'BTC Accuracy',custom_id:'dc3:accuracy:BTCUSDT'},
      {type:2,style:2,label:'Super Radar',custom_id:'dc3:terminal:radar'}
    ]}
  ],allowedMentions:{parse:[]}};
}

function buildAnomalyWatchPayload(snapshot={}){
  const discovery=snapshot?.discovery||{};
  const h=snapshot?.health||{};
  const warnings=Array.isArray(h?.operationalReadiness?.warningReasons)?h.operationalReadiness.warningReasons:[];
  const candidates=(Array.isArray(discovery?.topCandidates)?discovery.topCandidates:Array.isArray(discovery?.candidates)?discovery.candidates:[])
    .slice(0,8)
    .map(x=>'• **'+String(x?.symbol||x?.asset||'UNBEKANNT')+'** · '+String(x?.status||x?.reason||'BEOBACHTEN'))
    .join('\n')||'Aktuell keine priorisierten Anomalie-Kandidaten im Serving-State.';
  return {embeds:[{
    title:'BIGGJ // ANOMALIE-WATCH',
    description:'**Regimewechsel, ungewöhnliche Marktstruktur und Research-Hinweise.** Ein Signal ist noch kein Trade.',
    fields:[
      {name:'Aktuelle Kandidaten',value:candidates.slice(0,1024),inline:false},
      {name:'Runtime-Warnungen',value:(warnings.slice(0,6).join('\n')||'Keine aktuellen Runtime-Warnungen.').slice(0,1024),inline:false},
      {name:'Regel',value:'Anomalie → Kontext → Evidenz → Gegenargument → Invalidation. Erst danach darf sie in eine Shadow-These einfließen.',inline:false}
    ],
    footer:{text:MARKERS.anomalies},
    timestamp:new Date().toISOString()
  }],components:[
    {type:1,components:[
      {type:2,style:1,label:'Super Radar',custom_id:'dc3:terminal:radar'},
      {type:2,style:2,label:'BTC X-Ray',custom_id:'dc3:xray:BTCUSDT'},
      {type:2,style:2,label:'ETH X-Ray',custom_id:'dc3:xray:ETHUSDT'},
      {type:2,style:2,label:'SOL X-Ray',custom_id:'dc3:xray:SOLUSDT'}
    ]}
  ],allowedMentions:{parse:[]}};
}

function buildReplayDeskPayload(snapshot={}){
  const recent=Array.isArray(snapshot?.portfolio?.recentClosed)?snapshot.portfolio.recentClosed:[];
  const rows=recent.slice(0,8).map(x=>{
    const pnl=Number(x?.realizedNetPnlQuote??x?.netPnlQuote??x?.pnlQuote);
    return '• **'+String(x?.symbol||'UNBEKANNT')+'** · '+String(x?.side||'—')+' · '+(Number.isFinite(pnl)?money(pnl):'—')+' · '+String(x?.exitReason||x?.closeReason||'geschlossen');
  }).join('\n')||'Noch keine abgeschlossenen Shadow-Trades für Replay.';
  const symbols=[];
  for(const x of recent){
    const s=normalizeDiscordSymbol(x?.symbol);
    if(s&&!symbols.includes(s))symbols.push(s);
    if(symbols.length>=3)break;
  }
  const components=symbols.length?[{type:1,components:symbols.map(s=>({type:2,style:2,label:s.replace('USDT','')+' Replay',custom_id:'dc3:tradereplay:'+s}))}]:[];
  return {embeds:[{
    title:'BIGGJ // TRADE-REPLAY DESK',
    description:'**Vergangene Shadow-Trades Point-in-Time nachprüfen statt Ergebnis-Hindsight.**',
    fields:[
      {name:'Letzte Abschlüsse',value:rows.slice(0,1024),inline:false},
      {name:'Review-Reihenfolge',value:'These beim Entry → damals verfügbare Daten → Invalidation → Ausführung → Exit → Lernpunkt. Gewinn ≠ automatisch gute Entscheidung.',inline:false}
    ],
    footer:{text:MARKERS.replay},
    timestamp:new Date().toISOString()
  }],components,allowedMentions:{parse:[]}};
}

function buildErrorDeskPayload(snapshot={},recentErrors=[],translationHealth=null,managerState=null){
  const h=snapshot?.health||{};
  const hard=Array.isArray(h?.operationalReadiness?.hardReasons)?h.operationalReadiness.hardReasons:[];
  const warnings=Array.isArray(h?.operationalReadiness?.warningReasons)?h.operationalReadiness.warningReasons:[];
  const errors=(Array.isArray(recentErrors)?recentErrors:[]).slice(0,8).map(x=>
    '• '+new Date(Number(x?.at)||Date.now()).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin'})+' · **'+String(x?.scope||'SYSTEM')+'** · '+String(x?.message||'UNBEKANNT')
  ).join('\n')||'Keine aktuellen Discord-/Channel-Manager-Fehler.';
  return {embeds:[{
    title:'BIGGJ // FEHLER & DIAGNOSE',
    description:'**Technische Fehler, Datenwarnungen und Manager-Probleme an einer Stelle.**',
    fields:[
      {name:'Letzte Fehler',value:errors.slice(0,1024),inline:false},
      {name:'Runtime-Blocker',value:(hard.concat(warnings).slice(0,8).join('\n')||'Keine aktuellen Blocker.').slice(0,1024),inline:false},
      {name:'Channel-Manager',value:managerState?'Probleme '+String(managerState.problems)+' / '+String(managerState.managers)+' · Supervisor '+String(managerState.supervisor?.status||'—'):'—',inline:true},
      {name:'Deutsch-Übersetzung',value:translationHealth?(translationHealth.ok?'OK':'FEHLER')+' · Erfolge '+String(translationHealth.successes)+' · Fehler '+String(translationHealth.failures):'—',inline:true}
    ],
    footer:{text:MARKERS.errors},
    timestamp:new Date().toISOString()
  }],components:[{type:1,components:[
    {type:2,style:2,label:'Datenstatus',custom_id:'dc3:home:data'},
    {type:2,style:2,label:'Brain Pulse',custom_id:'dc6:brain:pulse'},
    {type:2,style:2,label:'Entscheidungen',custom_id:'dc6:brain:decisions'}
  ]}],allowedMentions:{parse:[]}};
}

function buildChannelSupervisorPayload(managerState={},translationHealth=null){
  const counts=managerState?.counts||{};
  const problems=(managerState?.topProblems||[]).slice(0,10).map(x=>
    '• **#'+String(x.name)+'** · '+String(x.status)+' → '+String(x.decision)+'\n  '+String(x.reason)
  ).join('\n')||'Alle Channel-Manager melden einen gesunden bzw. erwarteten Zustand.';
  return {embeds:[{
    title:'BIGGJ // CHANNEL-MANAGER SUPERVISOR',
    description:'**Jeder Channel hat einen eigenen Manager. Dieser Supervisor überwacht wiederum alle Manager.**\nManager prüfen Zweck, Freshness, Fehler, Layout und nächsten Handlungsbedarf.',
    fields:[
      {name:'Gesamtzustand',value:String(managerState?.supervisor?.status||'—')+' · '+String(managerState?.healthy||0)+' gesund / '+String(managerState?.managers||0)+' Manager',inline:false},
      {name:'Statusverteilung',value:'Healthy '+String(counts.HEALTHY||0)+' · Idle '+String(counts.IDLE_OK||0)+' · Stale '+String(counts.STALE||0)+' · Empty '+String(counts.EMPTY||0)+' · Degraded '+String(counts.DEGRADED||0)+' · Broken '+String(counts.BROKEN||0),inline:false},
      {name:'Aktuelle Probleme / Entscheidungen',value:problems.slice(0,1024),inline:false},
      {name:'News-Übersetzer',value:translationHealth?(translationHealth.ok?'OK':'DEGRADED')+' · Cache '+String(translationHealth.cacheSize)+' · Fehler '+String(translationHealth.failures):'—',inline:true},
      {name:'Sicherheitsgrenze',value:'Auto-Reparatur nur für UI/Refresh/Layout. Keine Live-Orders, keine stillen PRIMARY-Policy-Änderungen.',inline:false}
    ],
    footer:{text:'BIGGJ_CHANNEL_SUPERVISOR_V1'},
    timestamp:new Date().toISOString()
  }],allowedMentions:{parse:[]}};
}

function buildChannelImprovementsPayload(managerState={},translationHealth=null){
  const actions=(managerState?.supervisor?.nextActions||[]).slice(0,12).map((x,i)=>
    '**'+(i+1)+'. #'+String(x.channel)+' · '+String(x.decision)+'**\n'+String(x.suggestion)
  ).join('\n\n')||'Aktuell keine zwingende Channel-Verbesserung offen.';
  const translationSuggestion=translationHealth&&!translationHealth.ok
    ?'\n\n**Übersetzung:** Dienst ist gestört. Deutsche News im Strict-Mode werden lieber zurückgehalten als ungeprüft englisch gepostet.'
    :'';
  return {embeds:[{
    title:'BIGGJ // CHANNEL-VERBESSERUNGEN',
    description:'**Priorisierte Verbesserungsliste aus den einzelnen Channel-Managern.**'+translationSuggestion,
    fields:[
      {name:'Nächste Verbesserungen',value:actions.slice(0,1024),inline:false},
      {name:'Entscheidungslogik',value:'BROKEN → Layout reparieren · DEGRADED → Ursache isolieren/retry · STALE/EMPTY → Refresh · HEALTHY → nichts ändern.',inline:false}
    ],
    footer:{text:'BIGGJ_CHANNEL_IMPROVEMENTS_V1'},
    timestamp:new Date().toISOString()
  }],allowedMentions:{parse:[]}};
}

function closedTradePayload(position={}){
  const pnl=Number(position?.realizedNetPnlQuote),ret=Number(position?.realizedReturnPct);
  const symbol=String(position?.symbol||'UNKNOWN').replace('USDT','/USDT');
  const side=String(position?.side||'—').toUpperCase();
  const result=Number.isFinite(pnl)?(pnl>0?'WIN':pnl<0?'LOSS':'FLAT'):'CLOSED';
  return {embeds:[{
    title:'BIGGJ // TRADE REVIEW · '+symbol,
    description:'**'+side+' · '+result+' · SHADOW_ONLY**',
    fields:[
      {name:'RESULT',value:(Number.isFinite(pnl)?money(pnl):'—')+' · '+(Number.isFinite(ret)?percent(ret):'—'),inline:false},
      {name:'ENTRY → EXIT',value:String(position?.entryPrice??'—')+' → '+String(position?.exitPrice??position?.lastMark?.price??'—'),inline:false},
      {name:'WHY CLOSED',value:String(position?.closeReason||position?.exitReason||'UNKNOWN'),inline:true},
      {name:'SETUP',value:String(position?.setupType||position?.strategyId||'UNKNOWN'),inline:true},
      {name:'LEARNING',value:'Replay the Point-in-Time thesis before judging the result. Good process and profitable outcome are separate.',inline:false}
    ],
    footer:{text:'CLOSED:'+String(position?.positionId||'UNKNOWN')},
    timestamp:new Date(Number(position?.closedAt)||Date.now()).toISOString()
  }],components:position?.symbol?marketActionComponents(position.symbol):[],allowedMentions:{parse:[]}};
}
function shadowTradePayload(position={}){
  const symbol=String(position?.symbol||'UNKNOWN').replace('USDT','/USDT');
  const side=String(position?.side||'—').toUpperCase();
  const pnl=Number(position?.lastMark?.unrealizedNetPnlQuote),ret=Number(position?.lastMark?.unrealizedReturnPct);
  const stop=position?.stopPrice??position?.risk?.stopPrice??position?.metadata?.stopPrice;
  const target=position?.takeProfitPrice??position?.targetPrice??position?.risk?.takeProfitPrice??position?.metadata?.takeProfitPrice;
  const thesis=position?.thesisHealth??position?.metadata?.thesisHealth;
  return {embeds:[{
    title:'BIGGJ // LIVE TRADE · '+symbol,
    description:'**'+side+' · OPEN · SHADOW_ONLY**\n'+String(position?.setupType||position?.strategyId||'UNKNOWN')+' · '+String(position?.entryMode||'STANDARD'),
    fields:[
      {name:'LIVE PnL',value:(Number.isFinite(pnl)?money(pnl):'—')+' · '+(Number.isFinite(ret)?percent(ret):'—'),inline:false},
      {name:'ENTRY',value:String(position?.entryPrice??'—'),inline:true},
      {name:'STOP',value:String(stop??'—'),inline:true},
      {name:'TARGET',value:String(target??'—'),inline:true},
      {name:'THESIS',value:Number.isFinite(Number(thesis))?pct0(thesis):'Use Living Thesis',inline:true},
      {name:'HORIZON',value:String(position?.horizonId||'—'),inline:true},
      {name:'NEXT',value:'Chart → Thesis → Why → Risk. Deep tools remain available through commands.',inline:false}
    ],
    footer:{text:String(position?.positionId||'TCX_SHADOW_POSITION')},
    timestamp:new Date(Number(position?.openedAt)||Date.now()).toISOString()
  }],components:position?.symbol?marketActionComponents(position.symbol):[],allowedMentions:{parse:[]}};
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
      {type:2,style:1,label:'Chart',custom_id:'dc3:superchart:'+s+':PRO:5m'},
      {type:2,style:1,label:'Thesis',custom_id:'dc4:thesis:'+s},
      {type:2,style:2,label:'Forecast',custom_id:'dc3:forecast:'+s}
    ]},
    {type:1,components:[
      {type:2,style:2,label:'Why',custom_id:'dc3:why:'+s},
      {type:2,style:2,label:'Risk',custom_id:'dc3:terminal:risk:'+s},
      {type:2,style:2,label:'Deep Dive',custom_id:'dc3:deep:'+s}
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
  const channelManagers=createBiggjChannelManagerRuntime({sections:SERVER_LAYOUT,profileFor:biggjChannelExperienceProfile});
  const germanTranslator=createGermanTranslationProvider({
    fetchImpl:globalThis.fetch,
    timeoutMs:Math.max(2000,Math.min(12000,Number(process.env.TCX_GERMAN_TRANSLATION_TIMEOUT_MS||4500)))
  });
  const strictGermanNews=String(process.env.TCX_DISCORD_STRICT_GERMAN_NEWS||'1')!=='0';
  const contexts=new Map();
  const channelCache=new Map();
  const tradeCards=new Map();
  const thesisCards=new Map();
  const observabilityPanelDigests=new Map();
  const experiencePanelDigests=new Map();
  const corePanelDigests=new Map();
  const recentErrors=[];
  const closedPosted=new Set();
  const timers=new Set();
  const visualRefreshQueue=createSerialDedupeQueue({maxSize:64});
  const visualRefreshState=new Map();
  const tradeSyncIntervalMs=Math.max(15000,Number(tradeSyncMs)||20000);
  const tradeSyncConcurrency=Math.max(1,Math.min(4,Math.floor(Number(process.env.TCX_DISCORD_TRADE_SYNC_CONCURRENCY||3)||3)));
  const tradeCardRefreshMs=Math.max(30000,Number(process.env.TCX_DISCORD_TRADE_CARD_REFRESH_MS||60000));
  const thesisRefreshMs=Math.max(60000,Number(process.env.TCX_DISCORD_THESIS_REFRESH_MS||120000));
  const starterRefreshBudget=Math.max(1,Math.min(8,Math.floor(Number(process.env.TCX_DISCORD_STARTER_REFRESH_BUDGET||4)||4)));
  const thesisRefreshBudget=Math.max(1,Math.min(6,Math.floor(Number(process.env.TCX_DISCORD_THESIS_REFRESH_BUDGET||2)||2)));
  const threadThesisRefreshBudget=Math.max(1,Math.min(8,Math.floor(Number(process.env.TCX_DISCORD_THREAD_THESIS_REFRESH_BUDGET||4)||4)));
  let schedulerStopped=false;
  let closedFeedInitialized=false;
  let lastHealthDigest=null;
  let lastDailyReportDate=null;
  let tradeSyncRunning=false;
  const state={registered:false,ready:false,botUser:null,lastReadyAt:null,lastInteractionAt:null,lastRefreshAt:null,lastMarketRefreshAt:null,lastTradeSyncAt:null,lastTradeSyncStartedAt:null,lastTradeSyncDurationMs:null,tradeSyncIntervalMs,tradeSyncConcurrency,tradeCardRefreshMs,thesisRefreshMs,starterRefreshBudget,thesisRefreshBudget,threadThesisRefreshBudget,lastTradeSyncStats:null,visualRefreshQueueDepth:0,lastVisualRenderAt:null,lastVisualRenderDurationMs:null,visualRenderErrors:0,lastError:null,recentErrors:0,channelUxVersion:BIGGJ_DISCORD_CHANNEL_UX_VERSION,channelManagers:channelManagers.names.length,channelManagerProblems:null,channelSupervisorStatus:'PENDING',translationHealth:null,strictGermanNews,commands:COMMANDS.length,v2:true,v3:true,v4:true,v5:true,v6:true,autoSetup:Boolean(autoSetup),setupStatus:'PENDING',setupError:null,channels:0,marketPanels:0,tradeCards:0,closedFeedInitialized:false,lastAlertAt:null,academyPanels:0,observabilityPanels:0,lastObservabilityRefreshAt:null,experiencePanels:0,lastExperienceRefreshAt:null,academyLastRefreshAt:null};
  function fail(scope,err){
    const message=err instanceof Error?err.message:String(err);
    state.lastError=scope+': '+message;
    recentErrors.unshift({at:Date.now(),scope:String(scope),message});
    if(recentErrors.length>20)recentErrors.length=20;
    state.recentErrors=recentErrors.length;
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
  async function managed(name,fn,{detail=null,rethrow=true}={}){
    try{
      const result=await fn();
      channelManagers.success(name,detail);
      return result;
    }catch(err){
      channelManagers.failure(name,err,detail);
      fail('channel:'+name,err);
      if(rethrow)throw err;
      return null;
    }
  }
  function managerSnapshot(){
    const snap=channelManagers.snapshot();
    state.channelManagerProblems=snap.problems;
    state.channelSupervisorStatus=snap.supervisor.status;
    state.translationHealth=germanTranslator.health();
    return snap;
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
        const desiredTopic=decoratedChannelTopic(spec);
        let channel=g.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===spec.name);
        if(!channel){if(!canManage)throw new Error('MANAGE_CHANNELS_REQUIRED');channel=await g.channels.create({name:spec.name,type:ChannelType.GuildText,parent:category.id,topic:desiredTopic,reason:'BIGGJ Discord V7 channel UX setup'});created.push('#'+spec.name);}
        else if(canManage){
          if(channel.parentId!==category.id)await channel.setParent(category.id,{lockPermissions:false,reason:'BIGGJ Discord V7 layout reconciliation'});
          if(String(channel.topic||'')!==String(desiredTopic||''))await channel.setTopic(desiredTopic||null,'BIGGJ Discord V7 topic reconciliation');
        }
        channelCache.set(spec.name,channel);
        channelManagers.observe(spec.name,{
          exists:true,
          parentMatches:String(channel.parentId||'')===String(category.id||''),
          topicMatches:String(channel.topic||'')===String(desiredTopic||'')
        });
      }
    }
    state.channels=channelCache.size; state.setupStatus='READY'; state.setupError=null;
    return {ok:true,created,channels:channelCache.size};
  }
  async function findMarked(channel,marker){try{const messages=await channel.messages.fetch({limit:50});return messages.find(m=>m.author?.id===client.user?.id&&hasMarker(m,marker))||null;}catch{return null;}}
  async function upsertMarked(channel,marker,payload){let m=await findMarked(channel,marker);return m?m.edit(payload):channel.send(payload);}
  async function upsertMarkedAtBottom(channel,marker,payload){
    try{
      const messages=await channel.messages.fetch({limit:50});
      const marked=messages.find(m=>m.author?.id===client.user?.id&&hasMarker(m,marker))||null;
      const latest=messages.first?.()||null;
      if(marked&&latest&&String(marked.id)===String(latest.id))return marked.edit(payload);
      if(marked)await marked.delete().catch(()=>{});
      for(const m of messages.values()){
        if(marked&&String(m.id)===String(marked.id))continue;
        if(m.author?.id===client.user?.id&&hasMarker(m,marker))await m.delete().catch(()=>{});
      }
      return channel.send(payload);
    }catch{
      return upsertMarked(channel,marker,payload);
    }
  }
  async function ensureStart(){
    const c=channelCache.get('start-here');
    if(!c){channelManagers.failure('start-here','CHANNEL_NOT_FOUND');return null;}
    return managed('start-here',()=>upsertMarked(c,MARKERS.start,startPayload()),{detail:'Startpanel bereit'});
  }
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
      await managed(name,()=>upsertMarkedAtBottom(c,marker,academyStaticPayload(kind)),{detail:'Academy-Panel '+kind});
      ready++;
    }
    state.academyPanels=ready;
    state.academyLastRefreshAt=Date.now();
    return ready;
  }

  async function refreshTerminal(){
    const c=channelCache.get('tcx-terminal');if(!c)return null;
    const m=await managed('tcx-terminal',async()=>upsertMarked(c,MARKERS.terminal,buildDiscordTerminalPayload(await safeMissionSnapshot())),{detail:'Mission Control aktualisiert'});
    state.lastRefreshAt=Date.now();return m;
  }
  async function refreshSystem(){const c=channelCache.get('system-status');return c?managed('system-status',async()=>upsertMarked(c,MARKERS.system,buildDiscordSystemPayload(await safeMissionSnapshot())),{detail:'Systemstatus aktualisiert'}):null;}
  async function refreshPerformance(){const c=channelCache.get('performance');return c?managed('performance',async()=>upsertMarked(c,MARKERS.performance,buildDiscordPerformancePayload(await safeMissionSnapshot())),{detail:'Performance aktualisiert'}):null;}
  async function refreshOverview(){const c=channelCache.get('market-overview');return c?managed('market-overview',async()=>upsertMarked(c,MARKERS.overview,buildDiscordMarketOverviewPayload(await safeMissionSnapshot())),{detail:'Marktübersicht aktualisiert'}):null;}
  async function refreshDataHealth(){const c=channelCache.get('data-health');return c?managed('data-health',async()=>upsertMarked(c,MARKERS.data,buildDiscordDataHealthPayload(await safeMissionSnapshot())),{detail:'Datenstatus aktualisiert'}):null;}
  function observabilityDigest(payload){
    const embeds=(payload?.embeds||[]).map(embed=>{
      const copy={...embed};
      delete copy.timestamp;
      return copy;
    });
    return JSON.stringify({embeds,components:payload?.components||[]});
  }
  async function refreshBiggjObservabilityPanels(){
    const snapshot=await safeMissionSnapshot();
    const brain=snapshot?.health?.biggjObservability;
    if(!brain)return 0;
    let count=0;
    for(const row of buildBiggjDiscordObservabilityPanelMap(brain)){
      const channel=channelCache.get(row.channel);
      if(!channel)continue;
      const digest=observabilityDigest(row.payload);
      if(observabilityPanelDigests.get(row.channel)===digest){channelManagers.success(row.channel,'Observability unverändert und aktuell');count++;continue;}
      await managed(row.channel,()=>upsertMarked(channel,row.marker,row.payload),{detail:'Observability-Panel aktualisiert'});
      observabilityPanelDigests.set(row.channel,digest);
      count++;
    }
    state.observabilityPanels=count;
    state.lastObservabilityRefreshAt=Date.now();
    return count;
  }
  function publicMobileUrl(){
    const explicit=String(process.env.TCX_PUBLIC_DASHBOARD_URL||'').trim();
    if(explicit)return explicit;
    const domain=String(process.env.RAILWAY_PUBLIC_DOMAIN||'').trim();
    return domain?'https://'+domain+'/mission-control':'';
  }
  async function refreshExperiencePanels(){
    const snapshot=await safeMissionSnapshot();
    let count=0;
    for(const row of buildBiggjExperiencePanelMap(snapshot,{mobileUrl:publicMobileUrl()})){
      const channel=channelCache.get(row.channel);
      if(!channel)continue;
      const digest=observabilityDigest(row.payload);
      if(experiencePanelDigests.get(row.channel)===digest){channelManagers.success(row.channel,'Experience-Panel unverändert und aktuell');count++;continue;}
      await managed(row.channel,()=>upsertMarked(channel,row.marker,row.payload),{detail:'Experience-Panel aktualisiert'});
      experiencePanelDigests.set(row.channel,digest);
      count++;
    }
    state.experiencePanels=count;
    state.lastExperienceRefreshAt=Date.now();
    return count;
  }
  function newsEventKey(event){
    const raw=String(event?.id||event?.url||[event?.title,event?.availableAt].join('|')||'event');
    return Buffer.from(raw).toString('base64url').slice(0,72);
  }
  function newsEventPayload(event,{world=false,translatedTitle=null,translationSourceLanguage='unknown'}={}){
    const verified=event?.verified===true||Number(event?.independentConfirmation||0)>=.45;
    const source=String(event?.source||'ÖFFENTLICHE_NEWS');
    const familyRaw=String(event?.family||event?.eventFamily||'OTHER').toUpperCase();
    const statusRaw=String(event?.status||'WATCH').toUpperCase();
    const familyMap={CRYPTO:'KRYPTO',GEOPOLITICS:'GEOPOLITIK',MACRO:'MAKRO',TECHNOLOGY:'TECHNOLOGIE',CORPORATE:'UNTERNEHMEN',COMMODITIES:'ROHSTOFFE',OTHER:'SONSTIGES'};
    const statusMap={HIGH_IMPACT:'HOHE RELEVANZ',DEVELOPING:'ENTWICKLUNG',WATCH:'BEOBACHTEN'};
    const marketMap={AWAITING_MARKET_DATA:'WARTE AUF MARKTDATEN',NONE:'KEINE'};
    const assets=(Array.isArray(event?.affectedAssets)?event.affectedAssets:[]).slice(0,8);
    const rawUrl=String(event?.url||'').trim();
    const url=/^https?:\/\//i.test(rawUrl)?rawUrl:undefined;
    const observedAt=Number(event?.availableAt||event?.timestamp||Date.now());
    const key=newsEventKey(event);
    const headline=String(translatedTitle||event?.title||event?.headline||'Ereignis').slice(0,220);
    const title=(world?'WELTLAGE // ':'NEWS // ')+headline;
    const epistemic=verified?'VERIFIZIERT / KORROBORIERT':'ENTDECKUNG · NOCH NICHT UNABHÄNGIG VERIFIZIERT';
    return {
      embeds:[{
        title,
        ...(url?{url}:{}),
        description:[
          '**'+(statusMap[statusRaw]||statusRaw.replaceAll('_',' '))+'** · '+(familyMap[familyRaw]||familyRaw.replaceAll('_',' ')),
          verified?'✓ unabhängig bestätigt/verifiziert':'◐ entdeckt · noch nicht unabhängig verifiziert',
          assets.length?'Betroffene Märkte: '+assets.join(' · '):'Betroffene Märkte: noch nicht belastbar bestimmt'
        ].join('\n').slice(0,4096),
        fields:[
          {name:'Quelle',value:source.slice(0,1024),inline:true},
          {name:'Marktreaktion',value:(marketMap[String(event?.marketStatus||'').toUpperCase()]||String(event?.marketStatus||'WARTE AUF MARKTDATEN').replaceAll('_',' ')).slice(0,1024),inline:true},
          {name:'Evidenzstatus',value:epistemic.slice(0,1024),inline:false},
          {name:'Übersetzung',value:translationSourceLanguage==='de'?'Original bereits Deutsch':'Automatisch ins Deutsche übersetzt',inline:false}
        ],
        footer:{text:'BIGGJ_NEWS_EVENT:'+key+' · '+(verified?'VERIFIED/CORROBORATED':'DISCOVERY_ONLY')},
        timestamp:new Date(Number.isFinite(observedAt)?observedAt:Date.now()).toISOString()
      }],
      allowedMentions:{parse:[]}
    };
  }
  async function syncNewsChannel(channelName,{world=false}={}){
    const c=channelCache.get(channelName);
    if(!c)return 0;
    const snapshot=await safeMissionSnapshot();
    const recent=Array.isArray(snapshot?.health?.globalIntel?.recent)?snapshot.health.globalIntel.recent:[];
    const rows=recent
      .filter(x=>!world||['GEOPOLITICS','MACRO','COMMODITIES'].includes(String(x?.family||x?.eventFamily||'').toUpperCase()))
      .sort((a,b)=>Number(a?.availableAt||a?.timestamp||0)-Number(b?.availableAt||b?.timestamp||0));
    let messages;
    try{messages=await c.messages.fetch({limit:100});}catch(err){fail(channelName+'-history',err);messages=null;}
    const seen=new Set();
    if(messages){
      for(const m of messages.values()){
        for(const e of m.embeds||[]){
          const footer=String(e?.footer?.text||'');
          const hit=/BIGGJ_NEWS_EVENT:([A-Za-z0-9_-]+)/.exec(footer);
          if(hit)seen.add(hit[1]);
        }
      }
    }
    let posted=0,translationFailures=0,translated=0;
    for(const event of rows){
      const key=newsEventKey(event);
      if(seen.has(key))continue;
      const rawTitle=String(event?.title||event?.headline||'Ereignis');
      const translation=await germanTranslator.translate(rawTitle);
      if(!translation.ok){
        translationFailures++;
        if(strictGermanNews)continue;
      }
      const germanTitle=translation.ok?translation.text:rawTitle;
      if(translation.ok&&translation.sourceLanguage!=='de')translated++;
      await c.send(newsEventPayload(event,{
        world,
        translatedTitle:germanTitle,
        translationSourceLanguage:translation.ok?translation.sourceLanguage:'unknown'
      }));
      seen.add(key);
      posted++;
      if(posted>=12)break;
    }
    const detail='News '+posted+' gepostet · übersetzt '+translated+' · Übersetzungsfehler '+translationFailures;
    if(translationFailures>0&&strictGermanNews)channelManagers.failure(channelName,'GERMAN_TRANSLATION_FAILED_'+translationFailures,detail);
    else channelManagers.success(channelName,detail);
    try{logger.info?.('[BIGGJ_GERMAN_NEWS] '+JSON.stringify({channel:channelName,posted,translated,translationFailures,strictGermanNews,translation:germanTranslator.health()}));}catch{}
    return posted;
  }
  async function refreshNewsFeed(){
    try{return await syncNewsChannel('news-feed',{world:false});}
    catch(err){channelManagers.failure('news-feed',err);fail('news-feed',err);return 0;}
  }
  async function refreshWorldWatch(){
    try{return await syncNewsChannel('world-watch',{world:true});}
    catch(err){channelManagers.failure('world-watch',err);fail('world-watch',err);return 0;}
  }
  async function refreshMemecoinLab(){
    const c=channelCache.get('memecoins');
    if(!c)return null;
    return managed('memecoins',()=>refreshCorePanel(c,'home:memecoins',{components:[]}),{detail:'Memecoin-Radar aktualisiert',rethrow:false});
  }
  async function experienceCommand(interaction,channelName){
    await interaction.deferReply();
    const snapshot=await safeMissionSnapshot();
    const row=buildBiggjExperiencePanelMap(snapshot,{mobileUrl:publicMobileUrl()}).find(x=>x.channel===channelName);
    if(!row){await interaction.editReply('BIGGJ Experience Panel ist gerade nicht verfügbar.');return;}
    await interaction.editReply(row.payload);
  }
  async function operatorCommand(interaction,view){
    const component=typeof interaction.isButton==='function'&&interaction.isButton();
    if(component)await interaction.deferUpdate();else await interaction.deferReply();
    const snapshot=await safeMissionSnapshot();
    const brain=snapshot?.health?.biggjObservability;
    if(!brain){await interaction.editReply('BIGGJ Observability ist gerade nicht verfügbar.');return;}
    await interaction.editReply(buildBiggjDiscordObservabilityPayload(view,brain));
  }
  async function latestBotMessage(channel){try{const messages=await channel.messages.fetch({limit:20});return messages.find(m=>m.author?.id===client.user?.id)||null;}catch{return null;}}
  async function renderCoreIntoMessage(channel,msg,callbackData,{forcePhoto=false,components=null}={}){
    const chatId=fakeChatId(guildId,channel.id,'panel');
    await handleUpdate({update_id:'discord:auto:'+Date.now()+':'+channel.id,callback_query:{id:'discordcb:auto:'+Date.now()+':'+channel.id,from:{id:client.user?.id||'system',username:client.user?.username||'TCX'},data:String(callbackData),message:{message_id:String(msg.id),chat:{id:chatId},text:String(msg.content||''),...((forcePhoto||msg.attachments?.size)?{photo:[{}]}:{})}}});
    try{
      const refreshed=await channel.messages.fetch(String(msg.id));
      const symbol=/:(\w+USDT)(?::|$)/.exec(String(callbackData||''))?.[1]||null;
      const finalComponents=components??(symbol?marketActionComponents(symbol):commandCenterComponents());
      await refreshed.edit({components:finalComponents,allowedMentions:{parse:[]}});
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

  async function refreshCorePanel(channel,callbackData,{components=null}={}){
    let msg=await latestBotMessage(channel); if(!msg)msg=await channel.send({content:'BIGGJ // PANEL\nInitialisierung …',allowedMentions:{parse:[]}});
    return renderCoreIntoMessage(channel,msg,callbackData,{forcePhoto:Boolean(msg.attachments?.size),components});
  }
  async function refreshMarketPanels(){
    let count=0;
    for(const panel of MARKET_PANELS){
      const c=channelCache.get(panel.channel);if(!c)continue;
      const out=await managed(panel.channel,()=>refreshCorePanel(c,'refresh:'+panel.symbol),{detail:panel.symbol+' Marktpanel',rethrow:false});
      if(out)count++;
    }
    state.marketPanels=count; state.lastMarketRefreshAt=Date.now(); return count;
  }
  async function refreshGlobalIntel(){
    const c=channelCache.get('global-intel');if(!c)return null;
    return managed('global-intel',()=>refreshCorePanel(c,'home:news'),{detail:'Legacy Global Intel aktualisiert',rethrow:false});
  }

  async function refreshStableManagedPanel(name,marker,payload){
    const channel=channelCache.get(name);
    if(!channel){channelManagers.failure(name,'CHANNEL_NOT_FOUND');return null;}
    const digest=observabilityDigest(payload);
    if(corePanelDigests.get(name)===digest){
      channelManagers.success(name,'Panel unverändert und aktuell');
      return findMarked(channel,marker);
    }
    const msg=await managed(name,()=>upsertMarked(channel,marker,payload),{detail:'Managed Panel aktualisiert',rethrow:false});
    if(msg)corePanelDigests.set(name,digest);
    return msg;
  }

  async function refreshForecastDesk(){
    return refreshStableManagedPanel('forecasts',MARKERS.forecasts,buildForecastDeskPayload(await safeMissionSnapshot()));
  }
  async function refreshAnomalyDesk(){
    return refreshStableManagedPanel('anomalies',MARKERS.anomalies,buildAnomalyWatchPayload(await safeMissionSnapshot()));
  }
  async function refreshReplayDesk(){
    return refreshStableManagedPanel('trade-replay',MARKERS.replay,buildReplayDeskPayload(await safeMissionSnapshot()));
  }
  async function refreshErrorDesk(){
    return refreshStableManagedPanel('errors',MARKERS.errors,buildErrorDeskPayload(
      await safeMissionSnapshot(),
      recentErrors,
      germanTranslator.health(),
      managerSnapshot()
    ));
  }
  async function refreshAuxiliaryDesks(){
    const out=await Promise.allSettled([refreshForecastDesk(),refreshAnomalyDesk(),refreshReplayDesk(),refreshErrorDesk()]);
    return out.filter(x=>x.status==='fulfilled').length;
  }
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
    const labels={ready:'Runtime',fabric:'Marktdaten',oms:'Shadow OMS',forecast:'Forecast',telegram:'Telegram'};
    const changes=Object.keys(now).filter(k=>now[k]!==before[k]).map(k=>(labels[k]||k)+': '+(before[k]?'OK':'PRÜFEN')+' → '+(now[k]?'OK':'PRÜFEN'));
    await managed('alerts',()=>c.send({embeds:[{title:'TCX // STATUSÄNDERUNG',description:(changes.join('\n')||'Systemzustand hat sich geändert.').slice(0,1800),footer:{text:'TCX_DISCORD_V3_ALERT'},timestamp:new Date().toISOString()}],components:commandCenterComponents(),allowedMentions:{parse:[]}}),{detail:'Statusänderung gepostet',rethrow:false});
    state.lastAlertAt=Date.now();
  }
  function cachedMessage(channel,messageId){
    if(!channel||!messageId)return null;
    return channel.messages?.cache?.get?.(String(messageId))||null;
  }
  async function resolveMessage(channel,messageId){
    const cached=cachedMessage(channel,messageId);
    if(cached)return cached;
    if(!channel||!messageId)return null;
    return channel.messages.fetch(String(messageId)).catch(()=>null);
  }
  async function resolveChannel(channelId){
    if(!channelId)return null;
    return client.channels.cache?.get?.(String(channelId))||client.channels.fetch(String(channelId)).catch(()=>null);
  }
  function footerId(message){
    return String(message?.embeds?.[0]?.footer?.text||'');
  }
  function referencedStarterId(message){
    return String(message?.reference?.messageId||'');
  }
  function messageRefreshDue(message,lastRefreshedAt,intervalMs,now=Date.now()){
    return refreshDueFromTimestamps({
      now,
      intervalMs,
      lastRefreshedAt,
      messageEditedAt:message?.editedTimestamp,
      messageCreatedAt:message?.createdTimestamp
    });
  }
  function claimRefreshBudget(stats,key,limit){
    if(!stats)return true;
    const usedKey=key+'BudgetUsed';
    const used=Math.max(0,Number(stats[usedKey]||0));
    if(used>=Math.max(1,Number(limit)||1))return false;
    stats[usedKey]=used+1;
    return true;
  }
  async function upsertThesisChannelCard(position,{recentByFooter=null,stats=null}={}){
    const channel=channelCache.get('theses'); if(!channel)return null;
    const id=String(position?.positionId||''); if(!id)return null;
    let msg=null;
    const knownId=thesisCards.get(id);
    if(knownId)msg=cachedMessage(channel,knownId);
    if(!msg&&recentByFooter)msg=recentByFooter.get('BIGGJ_THESIS:'+id)||null;
    if(!msg&&knownId)msg=await resolveMessage(channel,knownId);
    const now=Date.now();
    if(msg){
      if(messageRefreshDue(msg,null,thesisRefreshMs,now)){
        if(claimRefreshBudget(stats,'thesis',thesisRefreshBudget)){
          await msg.edit(biggjThesisPayload(position));
          if(stats)stats.thesisEdits++;
        }else if(stats)stats.thesisBudgetDeferred++;
      }else if(stats)stats.thesisSkips++;
    }else{
      msg=await channel.send(biggjThesisPayload(position));
      if(stats)stats.thesisCreates++;
    }
    thesisCards.set(id,msg.id);
    return msg;
  }
  async function ensureTradeThreadVisual(thread,position,prior={},stats=null){
    if(!thread||!thread.isTextBased())return prior;
    const id=String(position?.positionId||'');
    let thesisMsg=prior?.thesisMessageId?cachedMessage(thread,prior.thesisMessageId):null;
    let visualMsg=prior?.visualMessageId?cachedMessage(thread,prior.visualMessageId):null;
    if(!thesisMsg&&prior?.thesisMessageId)thesisMsg=await resolveMessage(thread,prior.thesisMessageId);
    if(!visualMsg&&prior?.visualMessageId)visualMsg=await resolveMessage(thread,prior.visualMessageId);
    if(!thesisMsg||!visualMsg){
      const recent=await thread.messages.fetch({limit:50}).catch(()=>null);
      if(!thesisMsg)thesisMsg=recent?.find(m=>m.author?.id===client.user?.id&&footerId(m)==='BIGGJ_THESIS:'+id)||null;
      if(!visualMsg)visualMsg=recent?.find(m=>m.author?.id===client.user?.id&&String(m.content||'').includes('TCX SUPERCHART'))||null;
    }
    const thesisNow=Date.now();
    if(thesisMsg){
      if(messageRefreshDue(thesisMsg,prior?.lastThreadThesisEditAt,thesisRefreshMs,thesisNow)){
        if(claimRefreshBudget(stats,'threadThesis',threadThesisRefreshBudget)){
          await thesisMsg.edit(biggjThesisPayload(position));
          prior={...prior,lastThreadThesisEditAt:thesisNow};
          if(stats)stats.threadThesisEdits++;
        }else if(stats)stats.threadThesisBudgetDeferred++;
      }else if(stats)stats.threadThesisSkips++;
    }else{
      thesisMsg=await thread.send(biggjThesisPayload(position));
      prior={...prior,lastThreadThesisEditAt:thesisNow};
      if(stats)stats.threadThesisCreates++;
    }

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
  async function syncThesisDashboard(positions,stats=null){
    const channel=channelCache.get('theses');
    const active=new Set();
    const rows=(positions||[]).slice(0,20);
    const recent=channel?await channel.messages.fetch({limit:50}).catch(()=>null):null;
    const recentByFooter=new Map();
    for(const msg of recent?.values?.()||[]){
      if(msg.author?.id!==client.user?.id)continue;
      const footer=footerId(msg);
      if(footer&&!recentByFooter.has(footer))recentByFooter.set(footer,msg);
    }
    await mapWithConcurrency(rows,tradeSyncConcurrency,async p=>{
      const id=String(p?.positionId||''); if(!id)return;
      active.add(id);
      await upsertThesisChannelCard(p,{recentByFooter,stats}).catch(err=>fail('thesis-card:'+id,err));
    });
    for(const [id,messageId] of [...thesisCards])if(!active.has(id)){
      if(channel){
        const msg=cachedMessage(channel,messageId)||await resolveMessage(channel,messageId);
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
    const syncStats={
      positions:Math.min(20,positions.length),
      thesisEdits:0,thesisCreates:0,thesisSkips:0,thesisBudgetDeferred:0,thesisBudgetUsed:0,
      starterEdits:0,starterCreates:0,starterSkips:0,starterBudgetDeferred:0,starterBudgetUsed:0,
      threadThesisEdits:0,threadThesisCreates:0,threadThesisSkips:0,threadThesisBudgetDeferred:0,threadThesisBudgetUsed:0,
      feedVisualCreates:0,threadCreates:0
    };
    await syncThesisDashboard(positions,syncStats);
    const active=new Set();
    const perms=c.permissionsFor(client.user),canThreads=Boolean(perms?.has(PermissionFlagsBits.CreatePublicThreads)&&perms?.has(PermissionFlagsBits.SendMessagesInThreads));
    const recentLive=await c.messages.fetch({limit:100}).catch(()=>null);
    const liveByFooter=new Map();
    const feedByStarter=new Map();
    for(const msg of recentLive?.values?.()||[]){
      if(msg.author?.id!==client.user?.id)continue;
      const footer=footerId(msg);
      if(footer&&!liveByFooter.has(footer))liveByFooter.set(footer,msg);
      const starterId=referencedStarterId(msg);
      if(starterId&&!feedByStarter.has(starterId))feedByStarter.set(starterId,msg);
    }
    let activeThreadsPromise=null;
    const findActiveThread=async id=>{
      if(!canThreads)return null;
      if(!activeThreadsPromise)activeThreadsPromise=c.threads.fetchActive().catch(()=>null);
      const rows=await activeThreadsPromise;
      return rows?.threads?.find(t=>String(t.name).includes(String(id).slice(-8)))||null;
    };
    await mapWithConcurrency(positions.slice(0,20),tradeSyncConcurrency,async p=>{
      const id=String(p?.positionId||''); if(!id)return;
      active.add(id);
      let card=tradeCards.get(id)||{};
      try{
        let starter=card.messageId?cachedMessage(c,card.messageId):null;
        if(!starter)starter=liveByFooter.get(id)||null;
        if(!starter&&card.messageId)starter=await resolveMessage(c,card.messageId);
        const starterNow=Date.now();
        if(starter){
          if(messageRefreshDue(starter,card.lastStarterEditAt,tradeCardRefreshMs,starterNow)){
            if(claimRefreshBudget(syncStats,'starter',starterRefreshBudget)){
              await starter.edit(shadowTradePayload(p));
              card.lastStarterEditAt=starterNow;
              syncStats.starterEdits++;
            }else syncStats.starterBudgetDeferred++;
          }else syncStats.starterSkips++;
        }else{
          starter=await c.send(shadowTradePayload(p));
          card.lastStarterEditAt=starterNow;
          syncStats.starterCreates++;
        }

        let feedVisual=card.feedVisualMessageId?cachedMessage(c,card.feedVisualMessageId):null;
        if(!feedVisual)feedVisual=feedByStarter.get(String(starter.id))||null;
        if(!feedVisual&&card.feedVisualMessageId)feedVisual=await resolveMessage(c,card.feedVisualMessageId);
        if(!feedVisual){
          feedVisual=await c.send({
            content:'BIGGJ // LIVE TRADE VISUAL\nRendering market state …',
            reply:{messageReference:starter.id,failIfNotExists:false},
            allowedMentions:{parse:[]}
          });
          syncStats.feedVisualCreates++;
        }
        card.feedVisualMessageId=feedVisual.id;
        const feedVisualKey='feed:'+id;
        if(tradeVisualDue(feedVisualKey)){
          queueTradeVisual({
            key:feedVisualKey,
            channel:c,
            message:feedVisual,
            callbackData:'superchart:'+String(p.symbol)+':FULL:5m'
          });
        }

        let thread=card.threadId?await resolveChannel(card.threadId):null;
        if(canThreads&&!thread){
          thread=await findActiveThread(id);
          if(!thread){
            thread=await starter.startThread({name:clip(String(p.symbol||'TRADE').replace('USDT','')+'-'+String(p.side||'').toUpperCase()+'-'+id.slice(-8),90),autoArchiveDuration:1440,reason:'BIGGJ shadow trade intelligence lifecycle'});
            await thread.send({content:'BIGGJ // TRADE ROOM\nPoint-in-time Living Thesis + Visual Intelligence. **SHADOW_ONLY**.',components:marketActionComponents(p.symbol),allowedMentions:{parse:[]}});
            syncStats.threadCreates++;
          }
        }
        card={...card,messageId:starter.id,threadId:thread?.id||card.threadId||null};
        if(thread)card=await ensureTradeThreadVisual(thread,p,card,syncStats);
        tradeCards.set(id,card);
      }catch(err){fail('trade-card:'+id,err);}
    });
    for(const [id,card] of [...tradeCards])if(!active.has(id)){
      try{
        const msg=cachedMessage(c,card.messageId)||await resolveMessage(c,card.messageId);
        const embed=msg.embeds?.[0]?.toJSON?.()||{};
        embed.description='**CLOSED · SHADOW_ONLY**';embed.timestamp=new Date().toISOString();
        await msg.edit({embeds:[embed],components:[],allowedMentions:{parse:[]}});
      }catch{}
      if(card.threadId){
        const thread=await resolveChannel(card.threadId);
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
    state.lastTradeSyncStats={...syncStats};
    }finally{
      state.lastTradeSyncAt=Date.now();
      state.lastTradeSyncDurationMs=Math.max(0,state.lastTradeSyncAt-syncStartedAt);
      try{
        logger.info?.('[TCX_DISCORD_TRADE_SYNC] '+JSON.stringify({
          durationMs:state.lastTradeSyncDurationMs,
          intervalMs:tradeSyncIntervalMs,
          concurrency:tradeSyncConcurrency,
          tradeCards:tradeCards.size,
          ...(state.lastTradeSyncStats||{})
        }));
      }catch{}
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
    addTimer(refreshBiggjObservabilityPanels,120000);
    addTimer(refreshExperiencePanels,60000);
    addTimer(ensureAcademy,120000);
    addTimer(refreshMarketPanels,Math.max(60000,Number(marketRefreshMs)||120000));
    addTimer(refreshGlobalIntel,180000);
    addTimer(refreshNewsFeed,120000);
    addTimer(refreshWorldWatch,120000);
    addTimer(refreshMemecoinLab,120000);
    addSerialTimer(syncTradeCards,tradeSyncIntervalMs);
    addSerialTimer(drainVisualRefreshQueue,250);
    addTimer(syncHealthAlerts,30000);
    addTimer(maybeDailyReport,60000);
  }
  async function bootstrapV2(){
    try{const setup=await ensureLayout();await ensureStart();await ensureAcademy();await Promise.allSettled([refreshTerminal(),refreshSystem(),refreshPerformance(),refreshOverview(),refreshDataHealth(),refreshBiggjObservabilityPanels(),refreshExperiencePanels(),refreshMarketPanels(),refreshGlobalIntel(),refreshNewsFeed(),refreshWorldWatch(),refreshMemecoinLab(),syncTradeCards(),syncHealthAlerts()]);startSchedulers();return setup;}
    catch(err){state.setupStatus='NEEDS_PERMISSION';state.setupError=err instanceof Error?err.message:String(err);fail('setup',err);return {ok:false,error:state.setupError};}
  }
  async function setupCommand(interaction){
    await interaction.deferReply({ephemeral:true});
    if(!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)){await interaction.editReply('Für \`/setup\` brauchst du **Server verwalten**.');return;}
    const result=await bootstrapV2();
    if(!result.ok){await interaction.editReply(result.error==='MANAGE_CHANNELS_REQUIRED'?'Gib dem Bot **Kanäle verwalten** und führe \`/setup\` erneut aus.':'Setup fehlgeschlagen: '+result.error);return;}
    const g=await getGuild(),member=g.members.me||await g.members.fetchMe().catch(()=>null),threads=Boolean(member?.permissions?.has(PermissionFlagsBits.CreatePublicThreads));
    await interaction.editReply('BIGGJ Discord V6 eingerichtet: '+result.channels+' Channels · '+(state.observabilityPanels+state.experiencePanels)+' Live-Panels'+(result.created.length?' · '+result.created.length+' neu':'')+'.\n'+(threads?'Trade-Threads: bereit.':'Für Trade-Threads zusätzlich **Öffentliche Threads erstellen** aktivieren.'));
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
    const operatorViews={brain:'pulse',knowledge:'knowledge',research:'research',hypotheses:'hypotheses',changes:'changes',experiments:'experiments',skills:'skills',reviews:'reviews',timeline:'timeline',progress:'progress',evidence_log:'evidence',decisions:'decisions'};
    if(operatorViews[name]){await operatorCommand(interaction,operatorViews[name]);return;}
    const experienceViews={needs:'biggj-needs',learned:'learned-playbook',traders:'trader-watch',cockpit:'trade-cockpit',charts:'chart-desk',app:'mobile-app'};
    if(experienceViews[name]){await experienceCommand(interaction,experienceViews[name]);return;}
    const liveSurfaceCallbacks={news:'news:all',world:'news:geopolitics',memecoins:'home:memecoins'};
    if(liveSurfaceCallbacks[name]){await runCoreCallback(interaction,liveSurfaceCallbacks[name]);return;}
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
    if(customId.startsWith('dc6:brain:')){
      const view=String(customId.split(':')[2]||'pulse');
      await operatorCommand(interaction,view);
      return;
    }
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
  function snapshot(){return Object.freeze({version:DISCORD_TELEGRAM_BRIDGE_VERSION,...state,guildId:guildId,applicationId:applicationId,contexts:contexts.size,channels:channelCache.size,marketPanels:state.marketPanels,tradeCards:tradeCards.size,thesisCards:thesisCards.size,academyPanels:state.academyPanels,observabilityPanels:state.observabilityPanels,experiencePanels:state.experiencePanels,lastExperienceRefreshAt:state.lastExperienceRefreshAt,academyLastRefreshAt:state.academyLastRefreshAt});}
  return Object.freeze({start,stop,snapshot,telegramCall,telegramMultipart,handlesTelegramCall,setup:bootstrapV2,isChatId:function(v){return isDiscordChatId(v,guildId);}});
}
