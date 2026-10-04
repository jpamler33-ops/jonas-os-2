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
import {
  BIGGJ_DISCORD_MARKET_SCIENCE_LAYOUT,
  buildBiggjDiscordMarketSciencePanelMap,
  buildBiggjDiscordMarketSciencePayload
} from './biggj-discord-market-science.mjs';
import { BIGGJ_CHANNEL_OPERATIONS_VERSION, createBiggjChannelManagerRuntime } from './biggj-channel-operations.mjs';
import { createGermanTranslationProvider } from './biggj-german-translation.mjs';
import { renderBiggjProofFeed } from './biggj-signal-lab.mjs';

export const DISCORD_TELEGRAM_BRIDGE_VERSION='BIGGJ_DISCORD_MARKET_SCIENCE_V7';
export const BIGGJ_DISCORD_CHANNEL_UX_VERSION='BIGGJ_DISCORD_CHANNEL_UX_V13_FOCUSED';

const COMMANDS=[
  {name:'start',description:'TCX Command Center öffnen'},
  {name:'help',description:'TCX Befehle anzeigen'},
  {name:'dashboard',description:'TCX Mission Control öffnen'},
  {name:'market',description:'Marktübersicht öffnen',options:[symbolOption()]},
  {name:'forecast',description:'TCX Forecast anzeigen',options:[symbolOption()]},
  {name:'signal',description:'BIGGJ Signal Lab öffnen',options:[symbolOption(),signalHorizonOption(),signalModeOption()]},
  {name:'proof',description:'BIGGJ Forecast Proof Feed öffnen',options:[optionalSymbolOption()]},
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
  {name:'science',description:'BIGGJ Market Science Home öffnen'},
  {name:'worldmodel',description:'BIGGJ World Model öffnen'},
  {name:'lab',description:'BIGGJ Scientific Lab öffnen'},
  {name:'decision_intel',description:'BIGGJ Decision Intelligence öffnen'},
  {name:'autopilot',description:'BIGGJ Autopilot Supervisor öffnen'},
  {name:'executive',description:'BIGGJ Executive State öffnen'},
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
  {name:'longterm',description:'BIGGJ Long-Term Investment Research öffnen'},
  {name:'app',description:'BIGGJ Mobile Command Center öffnen'},
  {name:'progress',description:'BIGGJ Lernfortschritt öffnen'},
  {name:'evidence_log',description:'BIGGJ Evidence Ledger öffnen'},
  {name:'decisions',description:'BIGGJ Decision Trace öffnen'},
  {name:'supervisor',description:'Channel-Manager Supervisor öffnen'},
  {name:'improvements',description:'Channel-Verbesserungsliste öffnen'},
  {name:'rulebook',description:'BIGGJ internes Rulebook und aktuelle Verstöße öffnen'},
  {name:'setup',description:'TCX Discord Command Center automatisch einrichten'},
  {name:'terminal',description:'TCX Live-Terminal anzeigen'},
  {name:'system',description:'TCX Systemstatus anzeigen'},
  {name:'report',description:'Aktuellen Tagesreport anzeigen'},
  {name:'academy',description:'BIGGJ Trading Academy öffnen'},
  {name:'lesson',description:'Trading-Lektion öffnen',options:[{type:3,name:'topic',description:'Thema',required:true,choices:[{name:'1 · Grundlagen',value:'basics'},{name:'2 · Marktstruktur',value:'structure'},{name:'3 · Risiko',value:'risk'},{name:'4 · Liquidität & Volumen',value:'liquidity'},{name:'5 · Setups & Invalidation',value:'setup'},{name:'6 · Journal & Replay',value:'journal'}]}]}
];


const SERVER_LAYOUT=Object.freeze([
  {category:'BIGGJ • HOME',channels:[
    {name:'start-here',topic:'Startpunkt: aktueller Zustand, wichtigste Aktionen und nur das, was du wirklich brauchst.'},
    {name:'progress',topic:'Messbarer BIGGJ-Fortschritt: Evidence, Forecast-Kalibrierung, Learning, Revisionen und nächste Research-Gates.'},
    {name:'market-overview',topic:'Kompakter Marktüberblick mit direktem Einstieg in BIGGJ SuperCharts und Signal-Deep-Dives.'},
    {name:'news-feed',topic:'Nur relevante Live-News und Markt-/Welt-Events, dedupliziert und deutsch.'}
  ]},
  {category:'BIGGJ • INTELLIGENCE',channels:[
    {name:'memecoins',topic:'Memecoin Intelligence: DEX-Radar, Liquidität, Risiko, frühe Muster und Rugpull-Warnsignale.'},
    {name:'longterm-investing',topic:'Langfristige Investment-Research: Zukunftsnutzen, Adoption, Nachfrage, Bewertung, Bilanz, Wettbewerb, Regulierung, Rohstoffe, Supply Chain und technologische Risiken. Kein Buy-Signal.'},
    {name:'trader-watch',topic:'Öffentlich belegbare Trader-/Wallet-Beobachtungen als Research-Evidence. Keine erfundenen PnL-Rankings.'},
    {name:'academy',topic:'Eine einzige BIGGJ Trading Academy: Lektionen, Übungen, Chart-Training und Lernfortschritt ohne Channel-Wildwuchs.'}
  ]},
  {category:'BIGGJ • TRADING',channels:[
    {name:'trade-cockpit',topic:'Offene Shadow-Trades, Thesis, Risiko, Performance-Kontext und schneller Chart-Zugriff.'},
    {name:'live-trades',topic:'Neue und laufende PRIMARY Shadow-Trades. Keine echten Orders.'},
    {name:'closed-trades',topic:'Abgeschlossene PRIMARY Shadow-Trades mit Ergebnis, Exit-Grund und Replay-Kontext.'}
  ]}
]);

const BIGGJ_LEGACY_TECH_ARCHIVE_CATEGORY='BIGGJ • ARCHIVE · TECH';
const DESIRED_DISCORD_CHANNEL_NAMES=new Set(SERVER_LAYOUT.flatMap(section=>section.channels.map(x=>x.name)));
const DESIRED_DISCORD_CATEGORY_NAMES=new Set(SERVER_LAYOUT.map(section=>section.category));
const LEGACY_MANAGED_CHANNEL_NAMES=new Set([
  ...BIGGJ_DISCORD_MARKET_SCIENCE_LAYOUT.flatMap(section=>section.channels.map(x=>x.name)),
  ...BIGGJ_DISCORD_OBSERVABILITY_LAYOUT.flatMap(section=>section.channels.map(x=>x.name)),
  ...BIGGJ_EXPERIENCE_LAYOUT.flatMap(section=>section.channels.map(x=>x.name)),
  'market-overview','btc','eth','sol','memecoins',
  'tcx-terminal','signal-lab','proof-feed','forecasts','anomalies','global-intel','theses',
  'live-trades','closed-trades','performance','trade-replay',
  'academy-start','academy-roadmap','academy-lessons','academy-chart-training','academy-challenges','academy-glossary','academy-progress','academy-questions',
  'alerts','channel-supervisor','channel-improvements','system-status','data-health','errors','rulebook'
]);
const LEGACY_MANAGED_CATEGORY_NAMES=new Set([
  ...BIGGJ_DISCORD_MARKET_SCIENCE_LAYOUT.map(section=>section.category),
  ...BIGGJ_DISCORD_OBSERVABILITY_LAYOUT.map(section=>section.category),
  ...BIGGJ_EXPERIENCE_LAYOUT.map(section=>section.category),
  'BIGGJ • MARKET INPUTS','BIGGJ • DECISION APPLICATIONS','BIGGJ • SHADOW TRADING',
  'BIGGJ • TRADING ACADEMY','BIGGJ • OPERATIONS','BIGGJ • SYSTEM',
  'BIGGJ • DASHBOARD',BIGGJ_LEGACY_TECH_ARCHIVE_CATEGORY
]);

export function isBiggjDiscordManagedCategoryNamespace(name){
  const value=String(name||'').trim();
  return /^(?:TCX|BIGGJ)\s*•\s*/i.test(value);
}

const CHANNEL_PROFILE_GROUPS=Object.freeze({
  HOME:new Set(['start-here']),
  LIVE_60:new Set([
    'science-home','world-model','science-lab','decision-intelligence','autopilot-supervisor',
    'tcx-terminal','signal-lab','proof-feed','performance','system-status','data-health',
    'biggj-needs','learned-playbook','trader-watch','trade-cockpit','chart-desk','mobile-app',
    'forecasts','anomalies','trade-replay','errors','channel-supervisor','channel-improvements','rulebook'
  ]),
  LIVE_90:new Set(['market-overview']),
  LIVE_120:new Set([
    'executive-state','brain-pulse','knowledge','research-queue','hypotheses','changes','experiments','skill-tree',
    'review-queue','learning-timeline','progress','evidence-ledger','decision-trace',
    'btc','eth','sol','memecoins','longterm-investing','global-intel'
  ]),
  ACADEMY_120:new Set([
    'academy','academy-start','academy-roadmap','academy-lessons','academy-chart-training',
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
  signalLab:'BIGGJ_SIGNAL_LAB_DESK_V2',
  proofFeed:'BIGGJ_PROOF_FEED_DESK_V2',
  intelHub:'BIGGJ_CHANNEL_INTEL_HUB_V7',
  anomalies:'BIGGJ_CHANNEL_ANOMALY_WATCH_V7',
  replay:'BIGGJ_CHANNEL_REPLAY_DESK_V7',
  errors:'BIGGJ_CHANNEL_ERROR_DESK_V7',
  rulebook:'BIGGJ_RULEBOOK_PANEL_V1',
  memecoinResearch:'BIGGJ_MEMECOIN_CONTRARIAN_OVERVIEW_V1',
  longterm:'BIGGJ_LONGTERM_INVESTING_V1'
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
    '4. Nutze die Buttons oder /lesson für das nächste Thema; Fragen bleiben direkt in #academy.',
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

function hasMarker(message,marker){return Array.isArray(message?.embeds)&&message.embeds.some(e=>{const x=String(e?.footer?.text||'');return x===marker||x.startsWith(String(marker)+' · ');});}
function startPayload(){return {embeds:[{title:'BIGGJ // USER COMMAND CENTER · V13',description:[
  '**10 permanente User-Channels. Kein technisches Channel-Labyrinth mehr.** Science-, Debug-, System- und Spezialansichten bleiben per Slash-Command/Buttons erreichbar, laufen aber nicht mehr als eigene Dauer-Channels.',
  '',
  '**HOME**',
  '#progress · was BIGGJ messbar gelernt, kalibriert und verbessert hat',
  '#market-overview · Marktstatus + Einstieg in SuperCharts und Deep Dives',
  '#news-feed · relevante Markt- und Welt-Events',
  '',
  '**INTELLIGENCE**',
  '#memecoins · DEX-/Memecoin-Radar und Risiko',
  '#trader-watch · öffentlich belegbare Trader-/Wallet-Evidence',
  '#academy · eine einzige Lernoberfläche statt acht Academy-Channels',
  '',
  '**TRADING**',
  '#trade-cockpit · aktueller Zustand, Risiko und Performance-Kontext',
  '#live-trades · laufende PRIMARY Shadow-Trades',
  '#closed-trades · abgeschlossene PRIMARY Shadow-Trades',
  '',
  '**DEEP DIVE BEI BEDARF**',
  '/science · /worldmodel · /lab · /research · /evidence_log · /system · /rulebook',
  'SuperCharts, Performance und Mobile-Webapp bleiben über die vorhandenen Buttons/Commands erreichbar.',
  '',
  '**SHADOW_ONLY · ABSTAIN IST GÜLTIG · ECHTE ORDERS BLOCKIERT**'
].join('\n'),footer:{text:MARKERS.start+' · '+BIGGJ_DISCORD_CHANNEL_UX_VERSION},timestamp:new Date().toISOString()}],components:commandCenterComponents(),allowedMentions:{parse:[]}};}

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
  const h=snapshot?.health||{},r=h?.operationalReadiness||{},oms=h?.shadowOms||{},fabric=h?.marketDataFabric||{},tg=h?.telegramPolling||{},rb=h?.biggjRulebook?.runtime||{};
  const world=h?.biggjWorldModel||{},memeGate=h?.memecoinRadar?.signalController||{},gateCounts=memeGate?.counts||{};
  const rulebookState=String(rb?.state||'UNKNOWN').toUpperCase();
  const worldMode=String(world?.refreshMode||'UNKNOWN').toUpperCase();
  const worldState=worldMode==='FULL'?'● FULL':worldMode==='COMPACT'?'◐ COMPACT':worldMode==='DEFERRED'?'○ DEFERRED':'· '+worldMode;
  const rows=[['Runtime',yesNo(r?.ready)],['World Model',worldState],['Rulebook',rulebookState==='PASS'?'● OK':rulebookState==='CAUTION'?'◐ CAUTION':'● '+rulebookState],['Audit Ledger',yesNo(h?.institutionalKernel?.ledgerHealthy)],['Market Fabric',yesNo(fabric?.healthy)],['Shadow OMS',yesNo(oms?.healthy)],['Telegram',tg?.lastPollError?'● ERROR':'● OK'],['Discord','● OK']];
  return {embeds:[{title:'TCX // SYSTEM STATUS',description:rows.map(([k,v])=>'\`'+k.padEnd(14)+'\` '+v).join('\n'),fields:[
    {name:'OMS',value:'Active '+String(oms?.active??0)+' · Filled '+String(oms?.filled??0),inline:true},
    {name:'Market Events',value:String(fabric?.events??'—'),inline:true},
    {name:'Meme Entry Gate',value:'BUY '+String(gateCounts?.BUY??0)+' · READY '+String(gateCounts?.READY??0)+' · WATCH '+String(gateCounts?.WATCH??0)+' · BLOCKED '+String(gateCounts?.BLOCKED??0),inline:false},
    {name:'Safety',value:'W4 öffnet nur bei BUY · ABSTAIN / SHADOW_ONLY',inline:false}
  ],footer:{text:MARKERS.system},timestamp:new Date().toISOString()}],components:commandCenterComponents(),allowedMentions:{parse:[]}};
}

export function buildDiscordPerformancePayload(snapshot={}){
  const p=snapshot?.portfolio||{};
  return {embeds:[{title:'BIGGJ // SHADOW PERFORMANCE',description:'**Das Ergebnis auf einen Blick.** Research-/Probe-Trades bleiben aus diesen PRIMARY-Zahlen getrennt.',fields:[
    {name:'Equity',value:money(p?.equityQuote),inline:true},
    {name:'Net PnL',value:money(p?.netPnlQuote),inline:true},
    {name:'Return',value:percent(p?.returnPct),inline:true},
    {name:'Offen',value:String(p?.openPositions??0),inline:true},
    {name:'Geschlossen',value:String(p?.closedTrades??0),inline:true},
    {name:'Winrate',value:percent(p?.winRate),inline:true},
    {name:'Profit Factor',value:Number.isFinite(Number(p?.profitFactor))?Number(p.profitFactor).toFixed(2):'—',inline:true},
    {name:'Expectancy',value:money(p?.expectancyQuote),inline:true},
    {name:'Max Drawdown',value:percent(p?.maxDrawdownPct),inline:true},
    {name:'Safety',value:'SHADOW_ONLY · keine echten Orders',inline:false}
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

export function buildDiscordMemecoinResearchPayload(snapshot={}){
  const h=snapshot?.health||{},radar=h?.memecoinRadar||{},learning=radar?.learning?.wallet4||{},contra=learning?.contrarian||{},g=contra?.global||{};
  const world=h?.biggjWorldModel||{},signalController=radar?.signalController||{},signalCounts=signalController?.counts||{};
  const wallet=h?.specialistWallets?.wallets?.W4_MEME_SCOUT||{};
  const user99=h?.specialistWallets?.wallets?.W6_USER_99K_60S||{};
  const user99Exit=radar?.user99k60s?.exitLearning||{};
  const user99Results=radar?.user99k60s?.results||{};
  const user99Funnel=user99Results?.entryFunnel||{};
  const user99Ultra=radar?.user99k60s?.ultraFeed||{};
  const user99LaunchStats=user99Ultra?.launchStats||{};
  const user99Blockers=radar?.user99k60s?.results?.entryBlockers||{};
  const user99BlockerText=Object.entries(user99Blockers).filter(([,v])=>Number(v)>0).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,3).map(([k,v])=>String(k).replaceAll('_',' ')+' '+String(v)).join(' · ')||'keine';
  const user99Active=Array.isArray(user99?.active)?user99.active:[];
  const active=Array.isArray(wallet?.active)?wallet.active:[];
  const openContrarian=active.filter(x=>String(x?.entryResearchLane||'').toUpperCase()==='CONTRARIAN_PROBE');
  const radarRows=Array.isArray(radar?.rows)?radar.rows:[];
  const actions={BLOCK:0,THROTTLE:0,BOOST:0,NEUTRAL:0};
  for(const row of radarRows){
    const a=String(row?.memeLearning?.action||'NEUTRAL').toUpperCase();
    actions[a]=(actions[a]||0)+1;
  }
  const ruleName=k=>({
    LEARNED_BLOCK_WOULD_ABSTAIN:'Learner-BLOCK ignoriert',
    TAIL_RISK_FILTER_WOULD_BLOCK:'Soft Tail-Risk ignoriert',
    SCORE_BELOW_NORMAL_MIN:'Score unter Normalgrenze',
    LIQUIDITY_BELOW_NORMAL_MIN:'Liquidität unter Normalgrenze',
    STAGE_OUTSIDE_NORMAL_SCOUT:'Stage außerhalb Normal-Scout'
  }[String(k)]||String(k).replaceAll('_',' '));
  const hasData=Number(contra?.samples||0)>0;
  const pctMaybe=v=>hasData&&Number.isFinite(Number(v))?percent(v):'—';
  const ruleRows=Object.entries(contra?.byViolation||{})
    .sort((a,b)=>Number(b?.[1]?.samples||0)-Number(a?.[1]?.samples||0))
    .slice(0,5)
    .map(([k,v])=>'• **'+ruleName(k)+'** · '+String(v?.samples||0)+' Tests · WR '+percent(v?.rawWinRate)+' · Edge '+percent(v?.shrinkedMeanReturn));
  const openRows=openContrarian.slice(0,4).map(p=>
    '• **'+String(p?.symbol||'MEME')+'** · '+ruleName((p?.entryContrarianViolations||[])[0]||'SOFT_RULE')+
    ' · '+money(p?.unrealizedNetPnlQuote)+' · '+percent(p?.unrealizedReturnPct)
  );
  const state=hasData?'DATA LIVE':openContrarian.length?'PROBES RUNNING':'WARTE AUF ERSTE PROBE';
  const signalRank={BUY:0,READY:1,WATCH:2,BLOCKED:3};
  const signalRows=radarRows.slice().sort((a,b)=>(signalRank[String(a?.memeSignal?.action||'BLOCKED').toUpperCase()]??9)-(signalRank[String(b?.memeSignal?.action||'BLOCKED').toUpperCase()]??9)).slice(0,7).map(row=>{
    const sig=row?.memeSignal||{},action=String(sig?.action||'WATCH').toUpperCase();
    const label=sig?.label||({BUY:'🟢 KAUFEN',READY:'⏳ READY',WATCH:'👀 WATCH',BLOCKED:'⛔ BLOCKIERT'}[action]||action);
    const readiness=Math.round(Number(sig?.entryReadinessScore||0)*100);
    const why=(sig?.blockers?.length?sig.blockers:sig?.missing?.length?sig.missing:sig?.reasons||[]).slice(0,2).join(' · ')||'kein Detail';
    return '• **'+String(row?.symbol||row?.name||'MEME')+'** · '+label+' · '+readiness+'/100 · '+why;
  });
  const worldMode=String(world?.refreshMode||'UNKNOWN').toUpperCase();
  return {embeds:[{
    title:'BIGGJ // MEMECOIN RESEARCH',
    description:[
      '**'+state+'**',
      'World Model: **'+worldMode+'** · Meme Gate: **BUY '+String(signalCounts?.BUY??0)+' · READY '+String(signalCounts?.READY??0)+' · WATCH '+String(signalCounts?.WATCH??0)+' · BLOCKED '+String(signalCounts?.BLOCKED??0)+'**',
      '**W4 Entry-Regel: Nur 🟢 KAUFEN darf einen neuen Papertrade öffnen.**',
      'Wallet 4: **'+money(wallet?.netPnlQuote)+' PnL** · '+money(wallet?.cumulativeMarginUsedQuote)+' kumulierter Einsatz · '+String(wallet?.openPositions??0)+' offen',
      'Learner: BLOCK '+actions.BLOCK+' · THROTTLE '+actions.THROTTLE+' · BOOST '+actions.BOOST+' · NEUTRAL '+actions.NEUTRAL,
      '',
      '**CONTRARIAN** · 1 Soft-Regel absichtlich brechen · 5% Shadow-Size · Hard Guards bleiben aktiv'
    ].join('\n'),
    fields:[
      {name:'Entry Gate · aktuelle Kandidaten',value:(signalRows.join('\n')||'Keine Radar-Kandidaten vorhanden.').slice(0,1024),inline:false},
      {name:'W6 · 99K IN 60S · USER V1',value:[
        'Regel: **≤60s alt + ≥$99k MC → sofortiger Shadow-Entry**',
        'Open **'+String(user99?.openPositions??0)+'** · Closed **'+String(user99?.closedTrades??0)+'** · WR **'+percent(user99?.winRate)+'**',
        'Funnel: **'+String(user99Funnel?.rowsSeen??0)+' gesehen → '+String(user99Funnel?.ageWithinLimit??0)+' ≤60s → '+String(user99Funnel?.marketCapQualifiedAfterAge??0)+' ≥99k → '+String(user99Funnel?.dataCompleteAfterThreshold??0)+' Daten OK → '+String(user99Funnel?.eligible??0)+' Match → '+String(user99Funnel?.opened??0)+' opened** · Exact GMGN '+String(user99Results?.openedExactGmgn??0)+' / Proxy '+String(user99Results?.openedTrendProxy??0),
        'Ultra: **~'+(Number(user99Ultra?.pollMs||0)/1000).toFixed(1)+'s** · Hot **'+String(user99Ultra?.candidateBookSize??0)+'** · ≤60s entdeckt **'+String(user99LaunchStats?.discoveredWithin60??0)+'** · ≥99k≤60s **'+String(user99LaunchStats?.first99kObservedWithin60??0)+'** · ≥99k erst >60s **'+String(user99LaunchStats?.first99kObservedAfter60??0)+'**',
        'Blocker: '+user99BlockerText+' · Varianten gestartet: **'+String(user99Funnel?.capitalVariantsStarted??0)+' Size / '+String(user99Funnel?.holdVariantsStarted??0)+' Hold**',
        'Sizing parallel: **0.5 / 1 / 2 / 3 / 5 / 10 / 20 / 40 / 60 / 80 SOL** auf demselben Entry · Liquiditäts-Impact wird heuristisch berücksichtigt.',
        'Hold-Lab: **3 Min Verlustschutz** · danach **5m / 10m / Runner** bis max. 60m vergleichen.',
        user99Active[0]?.holdLabSummary?.entrySizingGuide?.normalMaxEntrySol
          ?'Entry-Cap: **~'+Number(user99Active[0].holdLabSummary.entrySizingGuide.normalMaxEntrySol).toFixed(2)+' SOL bei ~3% Impact** · aggressiv **~'+Number(user99Active[0].holdLabSummary.entrySizingGuide.aggressiveMaxEntrySol).toFixed(2)+' SOL bei ~5%**'
          :'Entry-Cap: wartet auf SOL-Preis + Pool-Liquidität.',
        'Exit-Lernen: **'+String(user99Exit?.samples??0)+'/20** markiert · Regelvorschlag **'+(user99Exit?.ruleProposalReady?'BEREIT ZUR PRÜFUNG':'GESPERRT')+'**.',
        user99Active[0]?.holdLabSummary?.best
          ?'Bestes Preis/Leistungs-Szenario: **'+String(user99Active[0].holdLabSummary.best.policyId||'—')+'** · Effizienz **'+percent(user99Active[0].holdLabSummary.best.capitalEfficiency)+'** · ~**'+(Number(user99Active[0].holdLabSummary.best.estimatedSolNeededFor10SolReference||0).toFixed(1))+' SOL** für +10 SOL Referenz'
          :user99Active[0]?.profitTargetScenarios?.length
            ?user99Active[0].profitTargetScenarios.map(s=>'`'+String(s.entryNotionalSol)+' SOL` '+(s.targetHit?'✅ Referenz erreicht':'→ '+(Number(s.targetPriceReturnApprox||0)*100).toFixed(1)+'% bis +10 SOL Ref.')).join(' · ')
            :'Noch kein aktiver W6-Trade.'
      ].join('\n').slice(0,1024),inline:false},
      {name:'Probes',value:'Offen **'+openContrarian.length+'** · abgeschlossen **'+String(contra?.samples??0)+'** · Normal-Learner **'+String(learning?.samples??0)+'**',inline:false},
      {name:'Outcome',value:'WR **'+pctMaybe(g?.rawWinRate)+'** · Ø **'+pctMaybe(g?.rawMeanReturn)+'** · Median **'+pctMaybe(g?.medianReturn)+'** · Severe **'+pctMaybe(g?.severeLossRate)+'** · Moonshot **'+pctMaybe(g?.moonshotRate)+'**',inline:false},
      {name:'Aktive Contrarian-Probes',value:(openRows.join('\n')||'Noch keine aktive Probe.').slice(0,1024),inline:false},
      {name:'Was wurde absichtlich anders getestet?',value:(ruleRows.join('\n')||'Noch keine abgeschlossenen Contrarian-Probes.').slice(0,1024),inline:false},
      {name:'Auswertung',value:hasData?'Contrarian-Evidence ist getrennt vom normalen Learner. Wiederholbare Edge muss erst robust bestätigt werden.':'Noch keine Performance-Aussage möglich — 0 abgeschlossene Contrarian-Samples.',inline:false},
      {name:'Safety',value:'SHADOW_ONLY · canExecute:false · canExecuteLive:false · keine Hard-Security-Bypasses',inline:false}
    ],
    footer:{text:MARKERS.memecoinResearch},
    timestamp:new Date().toISOString()
  }],components:commandCenterComponents(),allowedMentions:{parse:[]}};
}

export function buildDiscordLongTermInvestingPayload(snapshot={}){
  const intel=snapshot?.health?.globalIntel||{};
  const events=Array.isArray(intel?.recent)?intel.recent:[];
  const themes=[
    {id:'AI_COMPUTE',label:'AI Compute & Halbleiter',horizon:'5–15J',use:'Training, Inference, Edge-AI, Rechenzentren',keys:['ai','artificial intelligence','chip','semiconductor','gpu','accelerator','hbm','foundry','rechenzentrum','halbleiter'],risks:['Bewertung','Exportkontrollen','Capex-Zyklus','Technologiesprünge']},
    {id:'GRID',label:'Stromnetze & Elektrifizierung',horizon:'10–25J',use:'Netzausbau, Lastwachstum, EVs, Industrie, Rechenzentren',keys:['grid','electricity','power demand','transmission','transformer','electrification','stromnetz','transformator','netzausbau'],risks:['Regulierung','Zinsen','Projektverzögerungen','Capex']},
    {id:'DC_POWER',label:'Data-Center Power & Cooling',horizon:'5–15J',use:'Stromversorgung, Kühlung und Infrastruktur für Compute',keys:['data center','datacenter','cooling','liquid cooling','ups','power supply','rechenzentrum','kühlung'],risks:['Überkapazität','Kommoditisierung','Kundenkonzentration']},
    {id:'ROBOTICS',label:'Robotik & Automation',horizon:'7–20J',use:'Produktivität, Fachkräftemangel, Fertigung, Logistik',keys:['robot','robotics','automation','industrial automation','humanoid','warehouse automation','robotik','automatisierung'],risks:['Industriezyklus','Wettbewerb','Hardware-Margen']},
    {id:'CYBER',label:'Cybersecurity',horizon:'5–20J',use:'Cloud, Identität, Infrastruktur- und KI-Sicherheit',keys:['cybersecurity','cyber security','ransomware','zero trust','identity security','cyberangriff','cybersicherheit'],risks:['Hohe Bewertung','Wettbewerb','Plattform-Konsolidierung']},
    {id:'NUCLEAR',label:'Kernenergie & Uran',horizon:'10–30J',use:'Grundlast, CO₂-arme Energie, hoher Strombedarf',keys:['nuclear','uranium','reactor','smr','nuclear power','kernenergie','uran','reaktor'],risks:['Genehmigung','Projektkosten','Politik','Rohstoffzyklus']},
    {id:'STORAGE',label:'Energiespeicher & Power Electronics',horizon:'5–20J',use:'Netzstabilität, Speicher, EVs, Leistungselektronik',keys:['battery','energy storage','inverter','power electronics','batterie','energiespeicher','wechselrichter'],risks:['Preisdruck','Chemiewechsel','China-Exposure','Rohstoffe']},
    {id:'COPPER',label:'Kupfer & kritische Elektro-Materialien',horizon:'7–20J',use:'Netze, Motoren, Rechenzentren, Elektrifizierung',keys:['copper','critical minerals','mine','mining','kupfer','kritische rohstoffe'],risks:['Commodity-Zyklus','Neue Minen','China-Nachfrage','Substitution']},
    {id:'WATER',label:'Wasser-Infrastruktur',horizon:'10–30J',use:'Alternde Netze, Aufbereitung, Industrie, Knappheit',keys:['water infrastructure','water treatment','desalination','wastewater','wasser','wasseraufbereitung'],risks:['Langsame Projekte','Kommunalbudgets','Regulierung']},
    {id:'BIOTECH',label:'Biotech Tools & Präzisionsmedizin',horizon:'7–20J',use:'Diagnostik, Drug Discovery, Genomik, personalisierte Medizin',keys:['biotech','genomics','gene therapy','precision medicine','drug discovery','diagnostics','genomik','präzisionsmedizin'],risks:['Binäre Forschung','Regulierung','Kapitalbedarf','Patentrisiko']}
  ];
  const norm=x=>String(x||'').toLowerCase();
  const verified=e=>e?.verified===true||Number(e?.independentConfirmation||0)>=.45;
  const scored=themes.map(theme=>{
    const matched=events.filter(e=>{
      const hay=norm([e?.title,e?.family,(e?.affectedAssets||[]).join(' ')].join(' '));
      return theme.keys.some(k=>hay.includes(norm(k)));
    });
    const sources=new Set(matched.map(e=>String(e?.source||'')).filter(Boolean));
    const verifiedCount=matched.filter(verified).length;
    const latest=[...matched].sort((a,b)=>Number(b?.availableAt||0)-Number(a?.availableAt||0))[0]||null;
    const evidence=matched.length>=4&&verifiedCount>=2&&sources.size>=2?'MULTI_SOURCE'
      :matched.length>=2?'DEVELOPING'
      :matched.length===1?'EARLY':'NO_RECENT_EVIDENCE';
    return {...theme,matched:matched.length,verified:verifiedCount,sources:sources.size,latest,evidence};
  }).sort((a,b)=>
    (b.verified-a.verified)||(b.matched-a.matched)||a.label.localeCompare(b.label)
  );
  const themeLines=scored.slice(0,8).map((x,i)=>
    '**'+(i+1)+'. '+x.label+'** · '+x.horizon+' · '+x.evidence+
    '\nUse: '+x.use+
    '\nEvidence: '+x.matched+' Events · '+x.verified+' bestätigt · '+x.sources+' Quellen'+
    '\nRisiken: '+x.risks.join(' · ')
  ).join('\n\n');
  const evidenceReady=scored.filter(x=>x.evidence==='MULTI_SOURCE').length;
  const developing=scored.filter(x=>x.evidence==='DEVELOPING'||x.evidence==='EARLY').length;
  return {embeds:[{
    title:'BIGGJ // LONG-TERM INVESTING',
    description:[
      '**Langfristige Zukunfts-Research statt Hype-Listen.**',
      'Ein Thema kann strukturell stark sein und trotzdem aktuell zu teuer oder überlaufen sein. Deshalb trennt BIGGJ **Future Use** von **Investment Timing**.'
    ].join('\n'),
    fields:[
      {name:'FUTURE THEME WATCH',value:themeLines.slice(0,1024),inline:false},
      {name:'EVIDENCE STATUS',value:'Multi-Source **'+evidenceReady+'** · Developing/Early **'+developing+'** · News-Quelle **'+(intel?.sourceReady?'LIVE':'DEGRADED')+'**',inline:false},
      {name:'WAS BIGGJ BERÜCKSICHTIGT',value:[
        'Zukunftsnutzen & reale Use-Cases',
        'Adoption / Nachfrage / Capex-Richtung',
        'Wettbewerb, Moat & Margendruck',
        'Bewertung & erwartetes Wachstum',
        'Bilanz, Cashflow, Verschuldung & Verwässerung',
        'Rohstoffe, Energie & Supply Chain',
        'Regulierung, Politik & geopolitische Exponierung',
        'Zyklizität, Zinsen & Konjunktur',
        'Technologische Verdrängung / Obsoleszenz',
        'Diversifikation & Konzentrationsrisiko'
      ].map(x=>'• '+x).join('\n'),inline:false},
      {name:'INVESTMENT GATE',value:'**THEME ≠ BUY.** Bevor ein konkretes Unternehmen/ETF als Kandidat gilt, müssen Bewertung, Bilanz, Cashflow, Marktposition, Verwässerung, Konzentration und Preisrisiko separat geprüft werden. Fehlende Fundamentals → **NO BUY TIMING**.',inline:false},
      {name:'MODE',value:'Research / Beobachtung · keine Renditegarantie · keine automatische Order · canExecuteLive:false',inline:false}
    ],
    footer:{text:MARKERS.longterm},
    timestamp:new Date().toISOString()
  }],components:commandCenterComponents(),allowedMentions:{parse:[]}};
}

export function buildDiscordMarketOverviewPayload(snapshot={}){
  const p=snapshot?.portfolio||{},h=snapshot?.health||{},research=p?.researchActivity||{},radar=h?.marketRadar?.rows||[];
  const top=radar.slice(0,5).map(x=>'• **'+String(x.symbol||'—').replace('USDT','/USDT')+'** · '+String(x.regime||x.status||'WATCH')+' · '+Math.round(Number(x.score??x.witnessAgreement??0)*100)+'/100').join('\n')||'Radar sammelt gerade neue Marktstates.';
  return {embeds:[{title:'BIGGJ // MARKET OVERVIEW',description:['**Märkte beobachten ohne Informationsmüll.**','',''+top,'','Offene PRIMARY Shadow-Trades: **'+String(p?.openPositions??0)+'**','Research/Probes offen: **'+String(research?.openPositions??0)+'**','Market Fabric: **'+(h?.marketDataFabric?.healthy?'HEALTHY':'CHECK')+'**','Forecast Runtime: **'+yesNo(h?.institutionalForecastRuntime?.healthy??(h?.institutionalForecastRuntime?.status==='HEALTHY'))+'**','','SuperChart öffnen → Struktur + Forecast + Liquidität + Confluence + Events.'].join('\n'),footer:{text:MARKERS.overview},timestamp:new Date().toISOString()}],components:commandCenterComponents(),allowedMentions:{parse:[]}};
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

function buildSignalLabDeskPayload(snapshot={}){
  const lab=snapshot?.health?.biggjSignalLab||{};
  return {embeds:[{
    title:'BIGGJ // SIGNAL LAB',
    description:'**3 Klicks: Markt → Horizont → Evidence-Linse.**\nFULL / STRUCTURE / FLOW / LIQUIDITY / MACRO ändern nur die Sicht auf Evidenz — niemals den kanonischen Forecast. Wahrscheinlichkeiten erscheinen nur nach Calibration-Gates.',
    fields:[
      {name:'Safety',value:'SHADOW_ONLY · ACTION ABSTAIN · REAL ORDERS BLOCKED',inline:false},
      {name:'Probability Policy',value:'Keine rohe Modell-Confidence. Bei fehlender Kalibrierung wird die Zahl unterdrückt.',inline:false},
      {name:'Runtime',value:String(lab.version||'—')+' · Proof '+String(lab.proofVersion||'—'),inline:false},
      {name:'Evidence Lenses',value:(Array.isArray(lab.modes)?lab.modes:['FULL','STRUCTURE','FLOW','LIQUIDITY','MACRO']).join(' · ')+' · view-only',inline:false}
    ],
    footer:{text:MARKERS.signalLab},
    timestamp:new Date().toISOString()
  }],components:[
    {type:1,components:[
      {type:2,style:1,label:'BTC · 1H',custom_id:'dc3:signallab:BTCUSDT:1h:FULL'},
      {type:2,style:1,label:'ETH · 1H',custom_id:'dc3:signallab:ETHUSDT:1h:FULL'},
      {type:2,style:1,label:'SOL · 1H',custom_id:'dc3:signallab:SOLUSDT:1h:FULL'}
    ]},
    {type:1,components:[
      {type:2,style:2,label:'Proof Feed',custom_id:'dc3:proof:ALL'},
      {type:2,style:2,label:'Super Radar',custom_id:'dc3:terminal:radar'}
    ]}
  ],allowedMentions:{parse:[]}};
}

function buildProofFeedDeskPayload(snapshot={}){
  const feed=snapshot?.health?.biggjProofFeed||{};
  return {embeds:[{
    title:'BIGGJ // PROOF FEED',
    description:String(renderBiggjProofFeed(feed)||'Noch keine Proof-Daten.').slice(0,3900),
    fields:[],
    footer:{text:MARKERS.proofFeed},
    timestamp:new Date().toISOString()
  }],components:[
    {type:1,components:[
      {type:2,style:2,label:'BTC',custom_id:'dc3:proof:BTCUSDT'},
      {type:2,style:2,label:'ETH',custom_id:'dc3:proof:ETHUSDT'},
      {type:2,style:2,label:'SOL',custom_id:'dc3:proof:SOLUSDT'},
      {type:2,style:1,label:'ALLE',custom_id:'dc3:proof:ALL'}
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

function buildRulebookPayload(snapshot={}){
  const rb=snapshot?.health?.biggjRulebook||{};
  const runtime=rb?.runtime||{};
  const verification=rb?.verification||{};
  const violations=Array.isArray(runtime?.violations)?runtime.violations:[];
  const top=violations.slice(0,10).map(v=>
    '• **'+String(v.ruleId||'UNKNOWN')+' · '+String(v.severity||'—')+'**\n  '+String(v.title||v.reason||'Regelverletzung')+' → '+String(v.response||'PRÜFEN')
  ).join('\n')||'Keine aktuell erkannten Rulebook-Verstöße.';
  const missing=Array.isArray(runtime?.coverage?.coreFactsMissing)?runtime.coverage.coreFactsMissing:[];
  return {embeds:[{
    title:'BIGGJ // INTERNES RULEBOOK',
    description:'**Feste Soll- und Nicht-Soll-Regeln für alle BIGGJ/TCX-Subsysteme.**\nHARD-Regeln blockieren; HIGH-Regeln degradieren oder erzwingen Repair. Nicht geprüft bedeutet niemals automatisch bestanden.',
    fields:[
      {name:'Rulebook',value:String(rb?.version||'—')+' · '+String(rb?.rules||0)+' Regeln · '+String(rb?.domains||0)+' Domänen · '+String(rb?.hardRules||0)+' HARD',inline:false},
      {name:'Definition gültig',value:verification?.ok===true?'● OK':'● FEHLER',inline:true},
      {name:'Runtime',value:String(runtime?.state||'UNKNOWN')+' · Aktion '+String(runtime?.action||'—'),inline:true},
      {name:'Machine Coverage',value:String(runtime?.counts?.checked||0)+' Core-Fakten geprüft · '+String(runtime?.counts?.missingCoreFacts||0)+' unbewiesen',inline:false},
      {name:'Aktuelle Verstöße',value:top.slice(0,1024),inline:false},
      {name:'Unbewiesene Core-Fakten',value:(missing.slice(0,8).map(x=>'• '+String(x.ruleId)+' / '+String(x.key)).join('\n')||'Keine').slice(0,1024),inline:false},
      {name:'Fixe Grenze',value:'SHADOW_ONLY · canExecute:false · canExecuteLive:false · ABSTAIN ist vollwertig · Point-in-Time Pflicht.',inline:false}
    ],
    footer:{text:MARKERS.rulebook},
    timestamp:new Date().toISOString()
  }],allowedMentions:{parse:[]}};
}

function buildChannelSupervisorPayload(managerState={},translationHealth=null,rulebookRuntime=null,outcomeSupervisor=null){
  const counts=managerState?.counts||{};
  const problems=(managerState?.topProblems||[]).slice(0,10).map(x=>
    '• **#'+String(x.name)+'** · '+String(x.status)+' → '+String(x.decision)+'\n  '+String(x.reason)
  ).join('\n')||'Alle Channel-Manager melden einen gesunden bzw. erwarteten Zustand.';
  const domains=(managerState?.domainSupervisors||[]).map(x=>
    '• **'+String(x.category)+'** · '+String(x.status)+' · '+String(x.healthy)+'/'+String(x.managers)+' gesund'
  ).join('\n')||'Keine Domain-Supervisoren verfügbar.';
  const director=managerState?.operationsDirector||{};
  return {embeds:[{
    title:'BIGGJ // CHANNEL OPERATIONS',
    description:'**Channel-Manager → Domain-Supervisor → Operations-Director → Meta-Supervisor.**\nJede Ebene überwacht die Ebene darunter; Reparaturrechte bleiben auf UI, Layout und Refresh begrenzt.',
    fields:[
      {name:'Channel-Manager',value:String(managerState?.supervisor?.status||'—')+' · '+String(managerState?.healthy||0)+' gesund / '+String(managerState?.managers||0)+' Manager',inline:false},
      {name:'Domain-Supervisoren',value:domains.slice(0,1024),inline:false},
      {name:'Operations-Director',value:String(director?.status||'—')+' · '+String(director?.healthyDomains||0)+'/'+String(director?.domains||0)+' Domains gesund',inline:true},
      {name:'Meta-Supervisor',value:String(managerState?.metaSupervisor?.status||'—')+' · Coverage '+Math.round(Number(managerState?.metaSupervisor?.managerCoverage||0)*100)+'% · Blindspots '+String(managerState?.metaSupervisor?.unprofiledManagers||0),inline:true},
      {name:'Statusverteilung',value:'Healthy '+String(counts.HEALTHY||0)+' · Idle '+String(counts.IDLE_OK||0)+' · Stale '+String(counts.STALE||0)+' · Empty '+String(counts.EMPTY||0)+' · Degraded '+String(counts.DEGRADED||0)+' · Broken '+String(counts.BROKEN||0),inline:false},
      {name:'Outcome-Supervisor',value:outcomeSupervisor?String(outcomeSupervisor.status||'UNKNOWN')+' · Research '+String(outcomeSupervisor?.outcomeHealth?.researchEvidence||0)+' → Validation '+String(outcomeSupervisor?.outcomeHealth?.validationEvidence||0)+' → Forward '+String(outcomeSupervisor?.outcomeHealth?.forwardShadow||0)+' · stalled '+String(outcomeSupervisor?.outcomeHealth?.stalledResearchTasks||0):'—',inline:false},
      {name:'Aktuelle Probleme / Entscheidungen',value:problems.slice(0,1024),inline:false},
      {name:'News-Übersetzer',value:translationHealth?(translationHealth.ok?'OK':'DEGRADED')+' · Cache '+String(translationHealth.cacheSize)+' · Fehler '+String(translationHealth.failures):'—',inline:true},
      {name:'Rulebook',value:rulebookRuntime?String(rulebookRuntime.state||'UNKNOWN')+' · Verstöße '+String(rulebookRuntime?.counts?.failed||0)+' · HARD '+String(rulebookRuntime?.counts?.hard||0):'—',inline:true},
      {name:'Sicherheitsgrenze',value:'Keine Live-Orders · keine stillen PRIMARY-Policy-Änderungen · keine wissenschaftlichen Guards lockern · HARD-Rulebook-Verstöße bleiben fail-closed.',inline:false}
    ],
    footer:{text:'BIGGJ_CHANNEL_SUPERVISOR_V2'},
    timestamp:new Date().toISOString()
  }],allowedMentions:{parse:[]}};
}

function buildChannelImprovementsPayload(managerState={},translationHealth=null,rulebookRuntime=null){
  const actions=(managerState?.supervisor?.nextActions||[]).slice(0,12).map((x,i)=>
    '**'+(i+1)+'. #'+String(x.channel)+' · '+String(x.decision)+'**\n'+String(x.suggestion)
  ).join('\n\n')||'Aktuell keine zwingende Channel-Verbesserung offen.';
  const ruleIssues=Array.isArray(rulebookRuntime?.violations)?rulebookRuntime.violations.slice(0,6).map(v=>'• **'+String(v.ruleId)+'** · '+String(v.reason||v.title||'Regelverletzung')).join('\n'):'';
  const translationSuggestion=translationHealth&&!translationHealth.ok
    ?'\n\n**Übersetzung:** Dienst ist gestört. Deutsche News im Strict-Mode werden lieber zurückgehalten als ungeprüft englisch gepostet.'
    :'';
  return {embeds:[{
    title:'BIGGJ // CHANNEL-VERBESSERUNGEN',
    description:'**Priorisierte Verbesserungsliste aus den einzelnen Channel-Managern.**'+translationSuggestion,
    fields:[
      {name:'Nächste Verbesserungen',value:actions.slice(0,1024),inline:false},
      {name:'Rulebook-Verstöße',value:(ruleIssues||'Keine aktuell erkannten Regelverstöße.').slice(0,1024),inline:false},
      {name:'Entscheidungslogik',value:'BROKEN → Layout reparieren · DEGRADED → Ursache isolieren/retry · STALE/EMPTY → Refresh · HARD-Rule → blockieren · HEALTHY → nichts ändern.',inline:false}
    ],
    footer:{text:'BIGGJ_CHANNEL_IMPROVEMENTS_V1'},
    timestamp:new Date().toISOString()
  }],allowedMentions:{parse:[]}};
}

function tradeContextLabel(position={}){
  const setup=String(position?.setupType||'').trim().toUpperCase();
  if(setup&&setup!=='UNKNOWN') return setup;
  const mode=String(position?.entryMode||'').trim().toUpperCase();
  if(mode&&mode!=='UNKNOWN'&&mode!=='STANDARD') return mode;
  const strategy=String(position?.strategyId||'').trim().toUpperCase();
  if(strategy&&strategy!=='UNKNOWN') return strategy;
  return mode==='STANDARD'?'PRIMARY_UNCLASSIFIED':'UNCLASSIFIED';
}
function tradeLaneLabel(position={}){
  const mode=String(position?.entryMode||'STANDARD').trim().toUpperCase();
  return ['CHALLENGER','ABSTAIN_PROBE','COVERAGE_PROBE','EXPLORATION'].includes(mode)?'RESEARCH':'PRIMARY';
}
function virtualTradeSize(position={}){
  const n=Number(position?.entryQuote??position?.notionalQuote);
  return Number.isFinite(n)?money(n):'—';
}
function closedTradePayload(position={}){
  const pnl=Number(position?.realizedNetPnlQuote),ret=Number(position?.realizedReturnPct);
  const symbol=String(position?.symbol||'UNKNOWN').replace('USDT','/USDT');
  const side=String(position?.side||'—').toUpperCase();
  const result=Number.isFinite(pnl)?(pnl>0?'WIN':pnl<0?'LOSS':'FLAT'):'CLOSED';
  return {embeds:[{
    title:'BIGGJ // TRADE REVIEW · '+symbol,
    description:'**'+side+' · '+result+' · '+tradeLaneLabel(position)+' · SHADOW_ONLY**',
    fields:[
      {name:'RESULT',value:(Number.isFinite(pnl)?money(pnl):'—')+' · '+(Number.isFinite(ret)?percent(ret):'—'),inline:false},
      {name:'VIRTUAL SIZE',value:virtualTradeSize(position),inline:true},
      {name:'ENTRY → EXIT',value:String(position?.entryPrice??'—')+' → '+String(position?.exitPrice??position?.lastMark?.price??'—'),inline:false},
      {name:'WHY CLOSED',value:String(position?.closeReason||position?.exitReason||'UNKNOWN'),inline:true},
      {name:'SETUP / LANE',value:tradeContextLabel(position),inline:true},
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
    description:'**'+side+' · OPEN · '+tradeLaneLabel(position)+' · SHADOW_ONLY**\n'+tradeContextLabel(position)+(tradeContextLabel(position)===String(position?.entryMode||'STANDARD').toUpperCase()?'':' · '+String(position?.entryMode||'STANDARD')),
    fields:[
      {name:'LIVE PnL',value:(Number.isFinite(pnl)?money(pnl):'—')+' · '+(Number.isFinite(ret)?percent(ret):'—'),inline:false},
      {name:'VIRTUAL SIZE',value:virtualTradeSize(position),inline:true},
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
function optionalSymbolOption(){return {type:3,name:'symbol',description:'Optional: BTC, ETH, SOL oder leer für alle',required:false};}
function signalHorizonOption(){return {type:3,name:'horizon',description:'Forecast-Horizont',required:false,choices:['5m','15m','1h','4h'].map(x=>({name:x,value:x}))};}
function signalModeOption(){return {type:3,name:'mode',description:'Evidence-Linse; ändert den kanonischen Forecast nicht',required:false,choices:[{name:'Full BIGGJ',value:'FULL'},{name:'Structure',value:'STRUCTURE'},{name:'Flow',value:'FLOW'},{name:'Liquidity',value:'LIQUIDITY'},{name:'Macro',value:'MACRO'}]};}
function intervalOption(){return {type:3,name:'interval',description:'Zeitrahmen',required:false,choices:['1m','5m','15m','1h','4h'].map(x=>({name:x,value:x}))};}
function normalizeDiscordSymbol(value=''){const raw=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return raw?(raw.endsWith('USDT')?raw:raw+'USDT'):null;}
function marketSelectRow(){return {type:1,components:[{type:3,custom_id:'dc3:market-select',placeholder:'Markt öffnen …',min_values:1,max_values:1,options:V3_SYMBOLS.map(x=>({label:x+'/USDT',value:x+'USDT',description:'TCX '+x+' Research'}))}]};}
function commandCenterComponents(){return [
  {type:1,components:[
    {type:2,style:1,label:'BTC SuperChart',custom_id:'dc3:superchart:BTCUSDT:FULL:5m'},
    {type:2,style:1,label:'ETH SuperChart',custom_id:'dc3:superchart:ETHUSDT:FULL:5m'},
    {type:2,style:1,label:'SOL SuperChart',custom_id:'dc3:superchart:SOLUSDT:FULL:5m'}
  ]},
  {type:1,components:[
    {type:2,style:2,label:'Portfolio',custom_id:'dc3:home:portfolio'},
    {type:2,style:2,label:'Performance',custom_id:'dc3:home:stats_day'},
    {type:2,style:2,label:'News',custom_id:'dc3:home:news'},
    {type:2,style:2,label:'Radar',custom_id:'dc3:terminal:radar'}
  ]},
  marketSelectRow()
];}
function marketActionComponents(symbol){
  const s=normalizeDiscordSymbol(symbol)||'BTCUSDT';
  return [
    {type:1,components:[
      {type:2,style:1,label:'Signal Lab',custom_id:'dc3:signallab:'+s+':1h:FULL'},
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
  if(n==='proof')return 'proof:'+(s||'ALL');
  if(!s)return null;
  if(n==='superchart')return 'superchart:'+s+':PRO:'+(interaction.options?.getString('interval')||'5m');
  if(n==='deep')return 'deep:'+s;
  if(n==='why')return 'why:'+s;
  if(n==='flow')return 'flow:'+s;
  if(n==='liquidations')return 'liqmap:'+s+':5m';
  if(n==='xray')return 'xray:'+s;
  if(n==='events')return 'events:'+s;
  if(n==='accuracy')return 'accuracy:'+s;
  if(n==='signal')return 'signallab:'+s+':'+(interaction.options?.getString('horizon')||'1h')+':'+(interaction.options?.getString('mode')||'FULL');
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
  const newsTranslationConcurrency=Math.max(1,Math.min(6,Math.floor(Number(process.env.TCX_DISCORD_NEWS_TRANSLATION_CONCURRENCY||4)||4)));
  const newsTranslationAttemptLimit=Math.max(12,Math.min(36,Math.floor(Number(process.env.TCX_DISCORD_NEWS_TRANSLATION_ATTEMPT_LIMIT||18)||18)));
  const contexts=new Map();
  const channelCache=new Map();
  const tradeCards=new Map();
  const thesisCards=new Map();
  const observabilityPanelDigests=new Map();
  const experiencePanelDigests=new Map();
  const marketSciencePanelDigests=new Map();
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
  const state={registered:false,ready:false,botUser:null,lastReadyAt:null,lastInteractionAt:null,lastRefreshAt:null,lastMarketRefreshAt:null,lastTradeSyncAt:null,lastTradeSyncStartedAt:null,lastTradeSyncDurationMs:null,tradeSyncIntervalMs,tradeSyncConcurrency,tradeCardRefreshMs,thesisRefreshMs,starterRefreshBudget,thesisRefreshBudget,threadThesisRefreshBudget,lastTradeSyncStats:null,visualRefreshQueueDepth:0,lastVisualRenderAt:null,lastVisualRenderDurationMs:null,visualRenderErrors:0,lastError:null,recentErrors:0,channelUxVersion:BIGGJ_DISCORD_CHANNEL_UX_VERSION,channelManagers:channelManagers.names.length,channelManagerProblems:null,channelSupervisorStatus:'PENDING',channelMetaSupervisorStatus:'PENDING',translationHealth:null,strictGermanNews,newsTranslationConcurrency,newsTranslationAttemptLimit,commands:COMMANDS.length,v2:true,v3:true,v4:true,v5:true,v6:true,v7:true,autoSetup:Boolean(autoSetup),setupStatus:'PENDING',setupError:null,channels:0,marketPanels:0,tradeCards:0,closedFeedInitialized:false,lastAlertAt:null,academyPanels:0,observabilityPanels:0,lastObservabilityRefreshAt:null,experiencePanels:0,lastExperienceRefreshAt:null,marketSciencePanels:0,lastMarketScienceRefreshAt:null,academyLastRefreshAt:null};
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
    state.channelMetaSupervisorStatus=snap.metaSupervisor?.status||'UNKNOWN';
    state.translationHealth=germanTranslator.health();
    return snap;
  }

  function snowflakeTime(id){
    try{return Number((BigInt(String(id))>>22n)+1420070400000n);}catch{return null;}
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
      if(!category){if(!canManage)throw new Error('MANAGE_CHANNELS_REQUIRED');category=await g.channels.create({name:section.category,type:ChannelType.GuildCategory,reason:'BIGGJ Discord V13 focused user setup'});created.push(section.category);}
      for(const spec of section.channels){
        const desiredTopic=decoratedChannelTopic(spec);
        let channel=g.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===spec.name);
        if(!channel){if(!canManage)throw new Error('MANAGE_CHANNELS_REQUIRED');channel=await g.channels.create({name:spec.name,type:ChannelType.GuildText,parent:category.id,topic:desiredTopic,reason:'BIGGJ Discord V13 focused user setup'});created.push('#'+spec.name);}
        else if(canManage){
          if(channel.parentId!==category.id)await channel.setParent(category.id,{lockPermissions:false,reason:'BIGGJ Discord V13 focused reconciliation'});
          if(String(channel.topic||'')!==String(desiredTopic||''))await channel.setTopic(desiredTopic||null,'BIGGJ Discord V13 focused topic');
        }
        channelCache.set(spec.name,channel);
        channelManagers.observe(spec.name,{
          exists:true,
          parentMatches:String(channel.parentId||'')===String(category.id||''),
          topicMatches:String(channel.topic||'')===String(desiredTopic||'')
        });
      }
    }

    let prunedLegacyChannels=0,removedLegacyCategories=0;
    if(canManage){
      await g.channels.fetch();
      const deprecated=[...g.channels.cache.values()].filter(c=>
        c?.type===ChannelType.GuildText &&
        LEGACY_MANAGED_CHANNEL_NAMES.has(String(c.name||'')) &&
        !DESIRED_DISCORD_CHANNEL_NAMES.has(String(c.name||''))
      );
      for(const channel of deprecated){
        try{
          await channel.delete('BIGGJ Discord V13 prune obsolete managed Discord surface; backend state remains canonical');
          prunedLegacyChannels++;
        }catch(err){
          fail('legacy-prune:'+String(channel?.name||channel?.id||'unknown'),err);
        }
      }

      await g.channels.fetch();
      for(const category of [...g.channels.cache.values()].filter(c=>c?.type===ChannelType.GuildCategory)){
        const name=String(category.name||'');
        if(DESIRED_DISCORD_CATEGORY_NAMES.has(name))continue;
        const managedLegacyCategory=
          LEGACY_MANAGED_CATEGORY_NAMES.has(name) ||
          name===BIGGJ_LEGACY_TECH_ARCHIVE_CATEGORY ||
          isBiggjDiscordManagedCategoryNamespace(name);
        if(!managedLegacyCategory)continue;
        const hasChildren=[...g.channels.cache.values()].some(c=>String(c?.parentId||'')===String(category.id||''));
        if(!hasChildren){
          try{
            await category.delete('BIGGJ Discord V13 remove empty legacy category after managed-channel prune');
            removedLegacyCategories++;
          }catch(err){
            fail('legacy-category-prune:'+name,err);
          }
        }
      }
    }
    state.channels=channelCache.size;
    state.archivedChannels=0;
    state.prunedLegacyChannels=prunedLegacyChannels;
    state.removedLegacyCategories=removedLegacyCategories;
    state.setupStatus='READY';state.setupError=null;
    return {ok:true,created,channels:channelCache.size,archivedChannels:0,prunedLegacyChannels,removedLegacyCategories};
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
    const c=channelCache.get('academy');
    if(!c){state.academyPanels=0;return 0;}
    await managed('academy',()=>upsertMarkedAtBottom(c,MARKERS.academyStart,academyStaticPayload('start')),{detail:'Academy Single-Surface bereit'});
    state.academyPanels=1;
    state.academyLastRefreshAt=Date.now();
    return 1;
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
  async function refreshMarketSciencePanels(){
    const snapshot=await safeMissionSnapshot();
    let count=0;
    for(const row of buildBiggjDiscordMarketSciencePanelMap(snapshot)){
      const channel=channelCache.get(row.channel);
      if(!channel)continue;
      const digest=observabilityDigest(row.payload);
      if(marketSciencePanelDigests.get(row.channel)===digest){channelManagers.success(row.channel,'Market-Science Panel unverändert und aktuell');count++;continue;}
      await managed(row.channel,()=>upsertMarked(channel,row.marker,row.payload),{detail:'Market-Science Panel aktualisiert'});
      marketSciencePanelDigests.set(row.channel,digest);
      count++;
    }
    state.marketSciencePanels=count;
    state.lastMarketScienceRefreshAt=Date.now();
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
  function newsEventPayload(event,{world=false,translatedTitle=null,translationSourceLanguage='unknown',translationOk=true}={}){
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
          {name:'Übersetzung',value:translationOk?(translationSourceLanguage==='de'?'Original bereits Deutsch':'Automatisch ins Deutsche übersetzt'):'Übersetzung fehlgeschlagen · Original beibehalten',inline:false}
        ],
        footer:{text:'BIGGJ_NEWS_EVENT:'+key+' · '+(verified?'VERIFIED/CORROBORATED':'DISCOVERY_ONLY')+' · DE_V1'},
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
    const existingByKey=new Map();
    if(messages){
      for(const m of messages.values()){
        for(const e of m.embeds||[]){
          const footer=String(e?.footer?.text||'');
          const hit=/BIGGJ_NEWS_EVENT:([A-Za-z0-9_-]+)/.exec(footer);
          if(hit&&!existingByKey.has(hit[1]))existingByKey.set(hit[1],{
            message:m,
            germanized:footer.includes('DE_V1')||(e?.fields||[]).some(f=>String(f?.name||'')==='Übersetzung')
          });
        }
      }
    }
    const candidates=rows
      .map(event=>{
        const existing=existingByKey.get(newsEventKey(event))||null;
        return {event,existing,migration:Boolean(existing&&!existing.germanized)};
      })
      .filter(row=>!row.existing||row.migration)
      .sort((a,b)=>
        Number(a.migration)-Number(b.migration)||
        Number(b.event?.availableAt||b.event?.timestamp||0)-Number(a.event?.availableAt||a.event?.timestamp||0)
      )
      .slice(0,newsTranslationAttemptLimit);

    const translatedRows=await mapWithConcurrency(candidates,newsTranslationConcurrency,async candidate=>{
      const event=candidate.event;
      const rawTitle=String(event?.title||event?.headline||'Ereignis');
      const translation=await germanTranslator.translate(rawTitle);
      if(!translation.ok&&strictGermanNews)return {...candidate,translation,skip:true};
      return {...candidate,translation,skip:false,germanTitle:translation.ok?translation.text:rawTitle};
    });

    let posted=0,migrated=0,translationFailures=0,translated=0;
    const ready=translatedRows
      .filter(row=>{
        if(row?.translation?.ok!==true)translationFailures++;
        if(row?.translation?.ok===true&&row.translation.sourceLanguage!=='de')translated++;
        return row&&!row.skip;
      })
      .sort((a,b)=>
        Number(a.migration)-Number(b.migration)||
        Number(a.event?.availableAt||a.event?.timestamp||0)-Number(b.event?.availableAt||b.event?.timestamp||0)
      )
      .slice(0,12);

    for(const row of ready){
      const event=row.event;
      const key=newsEventKey(event);
      const payload=newsEventPayload(event,{
        world,
        translatedTitle:row.germanTitle,
        translationSourceLanguage:row.translation?.ok?row.translation.sourceLanguage:'unknown',
        translationOk:row.translation?.ok===true
      });
      if(row.existing?.message){
        await row.existing.message.edit(payload);
        migrated++;
      }else{
        await c.send(payload);
        posted++;
      }
      existingByKey.set(key,{message:row.existing?.message||null,germanized:true});
    }

    const mutations=posted+migrated;
    const detail='News '+posted+' neu · '+migrated+' Bestand germanisiert · Kandidaten '+candidates.length+' · übersetzt '+translated+' · Übersetzungsfehler '+translationFailures;
    if(mutations===0&&candidates.length>0&&translationFailures>0&&strictGermanNews){
      channelManagers.failure(channelName,'GERMAN_TRANSLATION_BLOCKED_FEED',detail);
    }else{
      channelManagers.success(channelName,detail);
    }
    try{logger.info?.('[BIGGJ_GERMAN_NEWS] '+JSON.stringify({
      channel:channelName,
      posted,
      migrated,
      candidates:candidates.length,
      translated,
      translationFailures,
      strictGermanNews,
      translationConcurrency:newsTranslationConcurrency,
      attemptLimit:newsTranslationAttemptLimit,
      translation:germanTranslator.health()
    }));}catch{}
    return mutations;
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
    const snapshot=await safeMissionSnapshot();
    return managed('memecoins',()=>upsertMarkedAtBottom(c,MARKERS.memecoinResearch,buildDiscordMemecoinResearchPayload(snapshot)),{detail:'Memecoin + Contrarian Übersicht aktualisiert',rethrow:false});
  }
  async function refreshLongTermInvesting(){
    const c=channelCache.get('longterm-investing');
    if(!c)return null;
    const snapshot=await safeMissionSnapshot();
    return managed('longterm-investing',()=>upsertMarkedAtBottom(c,MARKERS.longterm,buildDiscordLongTermInvestingPayload(snapshot)),{detail:'Long-Term Investment Research aktualisiert',rethrow:false});
  }
  async function experienceCommand(interaction,channelName){
    await interaction.deferReply();
    const snapshot=await safeMissionSnapshot();
    const row=buildBiggjExperiencePanelMap(snapshot,{mobileUrl:publicMobileUrl()}).find(x=>x.channel===channelName);
    if(!row){await interaction.editReply('BIGGJ Experience Panel ist gerade nicht verfügbar.');return;}
    await interaction.editReply(row.payload);
  }
  async function memecoinResearchCommand(interaction){
    await interaction.deferReply();
    await interaction.editReply(buildDiscordMemecoinResearchPayload(await safeMissionSnapshot()));
  }
  async function marketScienceCommand(interaction,view){
    const component=typeof interaction.isButton==='function'&&interaction.isButton();
    if(component)await interaction.deferUpdate();else await interaction.deferReply();
    const snapshot=await safeMissionSnapshot();
    await interaction.editReply(buildBiggjDiscordMarketSciencePayload(view,snapshot));
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

  async function refreshRulebookPanel(){
    return refreshStableManagedPanel('rulebook',MARKERS.rulebook,buildRulebookPayload(await safeMissionSnapshot()));
  }
  async function refreshForecastDesk(){
    return refreshStableManagedPanel('forecasts',MARKERS.forecasts,buildForecastDeskPayload(await safeMissionSnapshot()));
  }
  async function refreshSignalLabDesk(){
    return refreshStableManagedPanel('signal-lab',MARKERS.signalLab,buildSignalLabDeskPayload(await safeMissionSnapshot()));
  }
  async function refreshProofFeedDesk(){
    return refreshStableManagedPanel('proof-feed',MARKERS.proofFeed,buildProofFeedDeskPayload(await safeMissionSnapshot()));
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
    const out=await Promise.allSettled([refreshSignalLabDesk(),refreshProofFeedDesk(),refreshForecastDesk(),refreshAnomalyDesk(),refreshReplayDesk(),refreshErrorDesk()]);
    return out.filter(x=>x.status==='fulfilled').length;
  }
  function managerRepairGroup(name){
    if(BIGGJ_DISCORD_MARKET_SCIENCE_LAYOUT.some(s=>s.channels.some(x=>x.name===name)))return 'MARKET_SCIENCE';
    if(BIGGJ_DISCORD_OBSERVABILITY_LAYOUT.some(s=>s.channels.some(x=>x.name===name)))return 'OBSERVABILITY';
    if(BIGGJ_EXPERIENCE_LAYOUT.some(s=>s.channels.some(x=>x.name===name)))return 'EXPERIENCE';
    if(name.startsWith('academy-'))return 'ACADEMY';
    if(['btc','eth','sol'].includes(name))return 'MARKETS';
    if(['live-trades','theses','closed-trades'].includes(name))return 'TRADES';
    return name;
  }

  async function repairManagerProblem(problem){
    const name=String(problem?.name||'');
    if(!name||['channel-supervisor','channel-improvements'].includes(name))return false;
    if(problem?.decision==='REPAIR_LAYOUT'){
      await ensureLayout();
      return true;
    }
    const group=managerRepairGroup(name);
    if(group==='MARKET_SCIENCE'){if(name==='start-here')await ensureStart();else await refreshMarketSciencePanels();return true;}
    if(group==='OBSERVABILITY'){await refreshBiggjObservabilityPanels();return true;}
    if(group==='EXPERIENCE'){await refreshExperiencePanels();return true;}
    if(group==='ACADEMY'){await ensureAcademy();return true;}
    if(group==='MARKETS'){await refreshMarketPanels();return true;}
    if(group==='TRADES'){await syncTradeCards();return true;}
    if(name==='start-here'){await ensureStart();return true;}
    if(name==='tcx-terminal'){await refreshTerminal();return true;}
    if(name==='market-overview'){await refreshOverview();return true;}
    if(name==='performance'){await refreshPerformance();return true;}
    if(name==='system-status'){await refreshSystem();return true;}
    if(name==='data-health'){await refreshDataHealth();return true;}
    if(name==='global-intel'){await refreshGlobalIntel();return true;}
    if(name==='news-feed'){await refreshNewsFeed();return true;}
    if(name==='world-watch'){await refreshWorldWatch();return true;}
    if(name==='memecoins'){await refreshMemecoinLab();return true;}
    if(name==='longterm-investing'){await refreshLongTermInvesting();return true;}
    if(name==='signal-lab'){await refreshSignalLabDesk();return true;}
    if(name==='proof-feed'){await refreshProofFeedDesk();return true;}
    if(name==='forecasts'){await refreshForecastDesk();return true;}
    if(name==='anomalies'){await refreshAnomalyDesk();return true;}
    if(name==='trade-replay'){await refreshReplayDesk();return true;}
    if(name==='errors'){await refreshErrorDesk();return true;}
    if(name==='rulebook'){await refreshRulebookPanel();return true;}
    return false;
  }

  async function refreshChannelSupervisor({autoRepair=true}={}){
    channelManagers.success('channel-supervisor','Supervisor-Zyklus gestartet');
    channelManagers.success('channel-improvements','Verbesserungsanalyse gestartet');
    channelManagers.success('rulebook','Rulebook-Zustand wird geprüft');
    let before=managerSnapshot();
    const repaired=[];
    if(autoRepair){
      const groups=new Set();
      for(const problem of before.topProblems||[]){
        if(repaired.length>=4)break;
        const group=managerRepairGroup(problem.name);
        if(groups.has(group)||['channel-supervisor','channel-improvements'].includes(problem.name))continue;
        groups.add(group);
        try{
          if(await repairManagerProblem(problem))repaired.push({channel:problem.name,decision:problem.decision});
        }catch(err){
          channelManagers.failure(problem.name,err,'Auto-Reparatur fehlgeschlagen');
          fail('channel-supervisor:'+problem.name,err);
        }
      }
    }
    const after=managerSnapshot();
    const translation=germanTranslator.health();
    const mission=await safeMissionSnapshot();
    const rulebookRuntime=mission?.health?.biggjRulebook?.runtime||null;
    await refreshStableManagedPanel('channel-supervisor','BIGGJ_CHANNEL_SUPERVISOR_V1',buildChannelSupervisorPayload(after,translation,rulebookRuntime,mission?.health?.biggjObservability?.outcomeSupervisor||null));
    await refreshStableManagedPanel('channel-improvements','BIGGJ_CHANNEL_IMPROVEMENTS_V1',buildChannelImprovementsPayload(after,translation,rulebookRuntime));
    await refreshStableManagedPanel('rulebook',MARKERS.rulebook,buildRulebookPayload(mission));
    const finalState=managerSnapshot();
    try{logger.info?.('[BIGGJ_CHANNEL_SUPERVISOR] '+JSON.stringify({
      status:finalState.supervisor.status,
      director:finalState.operationsDirector?.status||'UNKNOWN',
      meta:finalState.metaSupervisor?.status||'UNKNOWN',
      domains:finalState.domainSupervisors?.length||0,
      managers:finalState.managers,
      healthy:finalState.healthy,
      problems:finalState.problems,
      repaired,
      translation:translation.ok?'OK':'DEGRADED',
      rulebook:rulebookRuntime?.state||'UNKNOWN',
      rulebookViolations:rulebookRuntime?.counts?.failed||0
    }));}catch{}
    return finalState;
  }

  async function dispatchReadCommand(channelName,text){
    const c=channelCache.get(channelName); if(!c)return false; const chatId=fakeChatId(guildId,c.id,'panel');
    await handleUpdate({update_id:'discord:auto-command:'+Date.now(),message:{message_id:'auto:'+Date.now(),chat:{id:chatId},from:{id:client.user?.id||'system',username:client.user?.username||'TCX'},text:String(text)}}); return true;
  }
  function healthDigest(snapshot={}){
    const a=snapshot?.health?.biggjAutopilotSupervisor||{};
    return JSON.stringify({
      state:String(a?.state||'UNKNOWN'),
      humanActionRequired:a?.humanActionRequired===true,
      criticalCount:Array.isArray(a?.critical)?a.critical.length:0
    });
  }
  async function syncHealthAlerts(){
    const snapshot=await safeMissionSnapshot();
    const digest=healthDigest(snapshot);
    if(lastHealthDigest==null){lastHealthDigest=digest;return;}
    if(digest===lastHealthDigest)return;
    const previous=lastHealthDigest;lastHealthDigest=digest;
    const c=channelCache.get('start-here');if(!c)return;
    const now=JSON.parse(digest),before=JSON.parse(previous);
    const enteredCritical=now.humanActionRequired===true&&before.humanActionRequired!==true;
    const recovered=now.humanActionRequired!==true&&before.humanActionRequired===true;
    if(!enteredCritical&&!recovered)return;
    const a=snapshot?.health?.biggjAutopilotSupervisor||{};
    const title=enteredCritical?'BIGGJ // AUTOPILOT EXCEPTION':'BIGGJ // AUTOPILOT RECOVERED';
    const description=enteredCritical
      ?['**Menschliche Aktion erforderlich.**',(a.critical||[]).join('\n')||'Unbekannte kritische Ausnahme.',a.recommendation||''].filter(Boolean).join('\n\n')
      :'**BIGGJ kann wieder autonom weiterlaufen.**\nKeine menschliche Aktion erforderlich.';
    await managed('start-here',()=>upsertMarked(c,'BIGGJ_AUTOPILOT_ALERT_V1',{embeds:[{title,description:description.slice(0,1800),footer:{text:'BIGGJ_AUTOPILOT_ALERT_V1'},timestamp:new Date().toISOString()}],components:buildBiggjDiscordMarketSciencePayload('autopilot',snapshot).components,allowedMentions:{parse:[]}}),{detail:'Autopilot-Exception/Recovery im Home-Panel aktualisiert',rethrow:false});
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
    channelManagers.success('live-trades','Trade-Sync '+positions.length+' Positionen');
    channelManagers.success('theses','Thesis-Sync '+positions.length+' Positionen');
    channelManagers.success('closed-trades','Closed-Trade Feed überwacht');
    }catch(err){
      channelManagers.failure('live-trades',err,'Trade-Sync fehlgeschlagen');
      channelManagers.failure('theses',err,'Trade-Sync fehlgeschlagen');
      throw err;
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
    addTimer(refreshMarketSciencePanels,60000);
    addTimer(refreshBiggjObservabilityPanels,120000);
    addTimer(refreshExperiencePanels,60000);
    addTimer(ensureAcademy,120000);
    addTimer(refreshMarketPanels,Math.max(60000,Number(marketRefreshMs)||120000));
    addTimer(refreshGlobalIntel,180000);
    addTimer(refreshNewsFeed,120000);
    addTimer(refreshWorldWatch,120000);
    addTimer(refreshMemecoinLab,30000);
    addTimer(refreshLongTermInvesting,120000);
    addTimer(refreshAuxiliaryDesks,60000);
    addTimer(refreshRulebookPanel,60000);
    addTimer(()=>refreshChannelSupervisor({autoRepair:true}),60000);
    addSerialTimer(syncTradeCards,tradeSyncIntervalMs);
    addSerialTimer(drainVisualRefreshQueue,250);
    addTimer(syncHealthAlerts,30000);
    addTimer(maybeDailyReport,60000);
  }
  async function bootstrapV2(){
    try{
      const setup=await ensureLayout();
      await ensureStart();
      await ensureAcademy();
      await Promise.allSettled([
        refreshTerminal(),refreshSystem(),refreshPerformance(),refreshOverview(),refreshDataHealth(),
        refreshMarketSciencePanels(),refreshBiggjObservabilityPanels(),refreshExperiencePanels(),refreshMarketPanels(),refreshGlobalIntel(),
        refreshNewsFeed(),refreshWorldWatch(),refreshMemecoinLab(),refreshLongTermInvesting(),refreshRulebookPanel(),syncTradeCards(),syncHealthAlerts()
      ]);
      await refreshAuxiliaryDesks();
      await refreshChannelSupervisor({autoRepair:true});
      startSchedulers();
      return setup;
    }catch(err){
      state.setupStatus='NEEDS_PERMISSION';
      state.setupError=err instanceof Error?err.message:String(err);
      fail('setup',err);
      return {ok:false,error:state.setupError};
    }
  }
  async function setupCommand(interaction){
    await interaction.deferReply({ephemeral:true});
    if(!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)){await interaction.editReply('Für \`/setup\` brauchst du **Server verwalten**.');return;}
    const result=await bootstrapV2();
    if(!result.ok){await interaction.editReply(result.error==='MANAGE_CHANNELS_REQUIRED'?'Gib dem Bot **Kanäle verwalten** und führe \`/setup\` erneut aus.':'Setup fehlgeschlagen: '+result.error);return;}
    const g=await getGuild(),member=g.members.me||await g.members.fetchMe().catch(()=>null),threads=Boolean(member?.permissions?.has(PermissionFlagsBits.CreatePublicThreads));
    const managers=managerSnapshot();
    await interaction.editReply('BIGGJ Discord V13 eingerichtet: '+result.channels+' permanente User-Channels · '+(result.prunedLegacyChannels||0)+' alte BIGGJ-Channels entfernt · '+managers.managers+' Channel-Manager · Supervisor '+managers.supervisor.status+' · Meta '+managers.metaSupervisor.status+'.\n'+(threads?'Trade-Threads: bereit.':'Für Trade-Threads zusätzlich **Öffentliche Threads erstellen** aktivieren.'));
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
    if(String(interaction.guildId)!==guildId){await interaction.reply({content:'Dieser BIGGJ-Bot ist für einen anderen Server konfiguriert.',ephemeral:true});return;}
    const name=String(interaction.commandName||'').toLowerCase();
    if(name==='setup'){await setupCommand(interaction);return;}
    if(name==='start'){await startCommand(interaction);return;}
    if(name==='dashboard'||name==='terminal'){await terminalCommand(interaction);return;}
    if(name==='system'){await systemCommand(interaction);return;}
    if(name==='thesis'){await thesisCommand(interaction);return;}
    if(name==='academy'){await academyCommand(interaction);return;}
    if(name==='lesson'){await lessonCommand(interaction);return;}
    const scienceViews={science:'science',worldmodel:'world',lab:'lab',decision_intel:'decisions',autopilot:'autopilot'};
    if(scienceViews[name]){await marketScienceCommand(interaction,scienceViews[name]);return;}
    if(name==='supervisor'){
      await interaction.deferReply();
      const mission=await safeMissionSnapshot();
      await interaction.editReply(buildChannelSupervisorPayload(managerSnapshot(),germanTranslator.health(),mission?.health?.biggjRulebook?.runtime||null,mission?.health?.biggjObservability?.outcomeSupervisor||null));
      return;
    }
    if(name==='improvements'){
      await interaction.deferReply();
      const mission=await safeMissionSnapshot();
      await interaction.editReply(buildChannelImprovementsPayload(managerSnapshot(),germanTranslator.health(),mission?.health?.biggjRulebook?.runtime||null));
      return;
    }
    if(name==='rulebook'){
      await interaction.deferReply();
      await interaction.editReply(buildRulebookPayload(await safeMissionSnapshot()));
      return;
    }
    const operatorViews={executive:'executive',brain:'pulse',knowledge:'knowledge',research:'research',hypotheses:'hypotheses',changes:'changes',experiments:'experiments',skills:'skills',reviews:'reviews',timeline:'timeline',progress:'progress',evidence_log:'evidence',decisions:'decisions'};
    if(operatorViews[name]){await operatorCommand(interaction,operatorViews[name]);return;}
    const experienceViews={needs:'biggj-needs',learned:'learned-playbook',traders:'trader-watch',cockpit:'trade-cockpit',charts:'chart-desk',app:'mobile-app'};
    if(experienceViews[name]){await experienceCommand(interaction,experienceViews[name]);return;}
    if(name==='memecoins'){await memecoinResearchCommand(interaction);return;}
    if(name==='longterm'){
      await interaction.deferReply();
      await interaction.editReply(buildDiscordLongTermInvestingPayload(await safeMissionSnapshot()));
      return;
    }
    const liveSurfaceCallbacks={news:'news:all',world:'news:geopolitics'};
    if(liveSurfaceCallbacks[name]){await runCoreCallback(interaction,liveSurfaceCallbacks[name]);return;}
    const callback=callbackDataForCommand(interaction);
    if(callback){await runCoreCallback(interaction,callback);return;}
    const text=commandText(interaction); if(!text){await interaction.reply({content:'Unbekannter BIGGJ-Befehl.',ephemeral:true});return;}
    await interaction.deferReply();
    const chatId=fakeChatId(interaction.guildId,interaction.channelId,interaction.user.id); const ctx={interaction:interaction,responded:false}; contexts.set(chatId,ctx);
    try{await handleUpdate({update_id:'discord:'+interaction.id,message:{message_id:interaction.id,chat:{id:chatId},from:{id:interaction.user.id,username:interaction.user.username},text:text}});if(!ctx.responded)await interaction.editReply('TCX hat keine Ausgabe erzeugt.');}
    catch(err){fail('command',err);try{await interaction.editReply('TCX Discord konnte den Befehl gerade nicht ausführen.');}catch{}}
    finally{contexts.delete(chatId);}
  }
  async function onButton(interaction){
    if(String(interaction.guildId)!==guildId)return;
    const customId=decodeDiscordCallbackCustomId(interaction.customId);
    if(customId.startsWith('dc7:science:')){
      const view=String(customId.split(':')[2]||'science');
      await marketScienceCommand(interaction,view);
      return;
    }
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
  function snapshot(){
    const managers=managerSnapshot();
    return Object.freeze({
      version:DISCORD_TELEGRAM_BRIDGE_VERSION,
      ...state,
      guildId,
      applicationId,
      contexts:contexts.size,
      channels:channelCache.size,
      marketPanels:state.marketPanels,
      tradeCards:tradeCards.size,
      thesisCards:thesisCards.size,
      academyPanels:state.academyPanels,
      marketSciencePanels:state.marketSciencePanels,
      lastMarketScienceRefreshAt:state.lastMarketScienceRefreshAt,
      observabilityPanels:state.observabilityPanels,
      experiencePanels:state.experiencePanels,
      lastExperienceRefreshAt:state.lastExperienceRefreshAt,
      academyLastRefreshAt:state.academyLastRefreshAt,
      channelManagerStatus:managers.supervisor.status,
      channelManagerMetaStatus:managers.metaSupervisor?.status||'UNKNOWN',
      channelManagerCoverage:managers.metaSupervisor?.managerCoverage??null,
      channelManagerHealthy:managers.healthy,
      channelManagerProblems:managers.problems,
      translation:germanTranslator.health()
    });
  }
  return Object.freeze({start,stop,snapshot,telegramCall,telegramMultipart,handlesTelegramCall,setup:bootstrapV2,isChatId:function(v){return isDiscordChatId(v,guildId);}});
}
