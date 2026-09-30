
export const BIGGJ_MOBILE_WEBAPP_VERSION='BIGGJ_MARKET_SCIENCE_APP_V1';

const jsonForScript=value=>JSON.stringify(value??{}).replace(/</g,'\\u003c');

export function biggjWebManifest(){
  return JSON.stringify({
    name:'BIGGJ Market Science OS',
    short_name:'BIGGJ',
    description:'Mobile control plane for BIGGJ Autonomous Market Science & Decision Intelligence.',
    start_url:'/mission-control',
    scope:'/',
    display:'standalone',
    orientation:'portrait',
    background_color:'#05070a',
    theme_color:'#070a0f',
    categories:['finance','productivity','utilities'],
    icons:[{src:'/biggj-icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]
  });
}

export function biggjAppIconSvg(){
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#5ef2d6"/><stop offset="1" stop-color="#6d7cff"/></linearGradient></defs><rect width="512" height="512" rx="116" fill="#05070a"/><rect x="38" y="38" width="436" height="436" rx="94" fill="#0b1018" stroke="#202c3d" stroke-width="6"/><path d="M119 352V160h113c66 0 108 31 108 83 0 27-12 49-34 63 31 13 47 37 47 70 0 62-47 96-126 96H119zm76-116h28c25 0 37-10 37-29 0-18-12-27-37-27h-28v56zm0 94h35c29 0 43-12 43-34 0-21-14-32-43-32h-35v66z" fill="#f4f7fb"/><circle cx="384" cy="141" r="27" fill="url(#g)"/><path d="M356 390h63" stroke="url(#g)" stroke-width="16" stroke-linecap="round"/></svg>`;
}

export function biggjServiceWorker(){
  return `const CACHE='biggj-v3';const SHELL=['/mission-control','/app.webmanifest','/biggj-icon.svg'];self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{})));self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;if(['/mission-control.json','/signal-lab.json','/proof-feed.json'].includes(u.pathname)){e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('/mission-control')));return;}e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r;}).catch(()=>caches.match(e.request)));});`;
}

export function renderBiggjMobileApp(snapshot={}){
  const boot=jsonForScript(snapshot);
  const html=`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="#070a0f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="BIGGJ">
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="/app.webmanifest">
<link rel="icon" href="/biggj-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/biggj-icon.svg">
<title>BIGGJ // Market Science OS</title>
<style>
:root{
  --bg:#05070a;--bg2:#080c12;--surface:#0b1018;--surface2:#0e1520;--surface3:#111a27;
  --line:#1d2938;--line2:#26364a;--text:#f5f7fa;--soft:#c5ced9;--muted:#718096;
  --cyan:#5ef2d6;--blue:#6d7cff;--green:#62e6a8;--amber:#f5c76d;--red:#ff7d8a;
  --shadow:0 24px 80px rgba(0,0,0,.34);--radius:22px;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{background:var(--bg);color-scheme:dark;scroll-behavior:smooth}
body{
  margin:0;min-height:100vh;color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",Inter,"Segoe UI",sans-serif;
  background:
    radial-gradient(900px 500px at 10% -10%,rgba(94,242,214,.08),transparent 58%),
    radial-gradient(800px 500px at 100% 0%,rgba(109,124,255,.10),transparent 54%),
    linear-gradient(180deg,#070a0f 0%,#05070a 70%);
  padding-bottom:calc(92px + env(safe-area-inset-bottom));
  -webkit-font-smoothing:antialiased;
}
body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.17;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:36px 36px;mask-image:linear-gradient(to bottom,black,transparent 62%)}
button{font:inherit;color:inherit}
.shell{width:min(100%,1120px);margin:0 auto;padding:calc(14px + env(safe-area-inset-top)) 14px 32px}
.topbar{position:sticky;top:0;z-index:30;margin:0 -4px 18px;padding:6px 4px 10px;background:linear-gradient(180deg,rgba(5,7,10,.94),rgba(5,7,10,.72),transparent);backdrop-filter:blur(16px)}
.topline{display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:11px;min-width:0}
.mark{width:42px;height:42px;border-radius:14px;background:linear-gradient(145deg,#101722,#090d14);border:1px solid var(--line2);box-shadow:inset 0 1px rgba(255,255,255,.05),0 8px 26px rgba(0,0,0,.28);display:grid;place-items:center;position:relative;overflow:hidden}
.mark:after{content:"";position:absolute;width:18px;height:18px;border-radius:50%;right:-6px;top:-6px;background:linear-gradient(135deg,var(--cyan),var(--blue));filter:blur(1px)}
.mark svg{width:25px;height:25px}
.brandText{min-width:0}.brandTitle{font-size:17px;font-weight:850;letter-spacing:.01em;line-height:1}.brandSub{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-top:5px;white-space:nowrap}
.topActions{display:flex;align-items:center;gap:8px}
.sync{display:flex;align-items:center;gap:7px;height:34px;padding:0 10px;border:1px solid var(--line);background:rgba(11,16,24,.76);border-radius:999px;color:var(--soft);font-size:10px;font-weight:750;letter-spacing:.06em}
.syncDot{width:7px;height:7px;border-radius:99px;background:var(--green);box-shadow:0 0 0 4px rgba(98,230,168,.08)}
.sync.stale .syncDot{background:var(--amber)}.sync.offline .syncDot{background:var(--red)}
.iconBtn{width:34px;height:34px;border-radius:11px;border:1px solid var(--line);background:rgba(11,16,24,.76);display:grid;place-items:center;padding:0}
.iconBtn svg{width:16px;height:16px;stroke:var(--soft)}
.statusStrip{display:flex;align-items:center;gap:7px;margin-top:10px;overflow:auto;scrollbar-width:none}
.statusStrip::-webkit-scrollbar{display:none}
.chip{flex:0 0 auto;padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:rgba(11,16,24,.62);font-size:9px;font-weight:750;letter-spacing:.05em;color:var(--muted);white-space:nowrap}
.chip strong{color:var(--soft);font-weight:800}.chip.good strong{color:var(--green)}.chip.warn strong{color:var(--amber)}.chip.bad strong{color:var(--red)}
.refreshError{display:none;margin:0 0 12px;padding:10px 12px;border:1px solid rgba(255,125,138,.24);background:rgba(255,125,138,.07);border-radius:14px;color:#ffb0b8;font-size:11px}.refreshError.show{display:block}
.view{display:none;animation:rise .22s ease both}.view.active{display:block}
@keyframes rise{from{opacity:.4;transform:translateY(5px)}to{opacity:1;transform:none}}
.hero{position:relative;overflow:hidden;border:1px solid var(--line2);background:linear-gradient(145deg,rgba(17,26,39,.94),rgba(8,12,18,.98));border-radius:26px;padding:19px;box-shadow:var(--shadow)}
.hero:before{content:"";position:absolute;inset:-40% -20% auto 44%;height:240px;background:radial-gradient(circle,rgba(94,242,214,.14),rgba(109,124,255,.05) 38%,transparent 67%);pointer-events:none}
.heroGrid{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start;position:relative}
.overline{font-size:9px;text-transform:uppercase;letter-spacing:.18em;font-weight:800;color:var(--muted)}
.heroMode{font-size:30px;line-height:.95;font-weight:900;letter-spacing:-.045em;margin-top:7px;max-width:280px}
.heroCopy{font-size:12px;line-height:1.55;color:var(--soft);margin-top:11px;max-width:540px}
.orb{width:54px;height:54px;border-radius:18px;border:1px solid var(--line2);background:linear-gradient(145deg,rgba(94,242,214,.10),rgba(109,124,255,.10));display:grid;place-items:center;box-shadow:inset 0 0 32px rgba(94,242,214,.03)}
.orb svg{width:25px;height:25px;stroke:var(--cyan)}
.heroFooter{display:flex;gap:8px;flex-wrap:wrap;margin-top:17px;position:relative}
.badge{padding:7px 9px;border-radius:10px;background:#0b111a;border:1px solid var(--line);font-size:9px;font-weight:760;color:var(--muted);letter-spacing:.04em}.badge b{color:var(--soft)}
.sectionHead{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:22px 2px 10px}.sectionHead h2{font-size:11px;letter-spacing:.15em;text-transform:uppercase;margin:0;color:#9eabbb}.sectionHead span{font-size:9px;color:#566579}
.metricGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.metric{min-width:0;border:1px solid var(--line);background:linear-gradient(150deg,rgba(14,21,32,.92),rgba(9,14,21,.96));border-radius:18px;padding:13px;box-shadow:inset 0 1px rgba(255,255,255,.025)}
.metricLabel{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:760}.metricValue{font-size:21px;font-weight:880;letter-spacing:-.035em;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.metricHint{font-size:10px;color:#7e8b9e;margin-top:6px;line-height:1.35}
.good{color:var(--green)!important}.warn{color:var(--amber)!important}.bad{color:var(--red)!important}.cyan{color:var(--cyan)!important}.blue{color:#94a2ff!important}
.stack{display:flex;flex-direction:column;gap:8px}
.panel{border:1px solid var(--line);background:linear-gradient(155deg,rgba(13,19,29,.95),rgba(8,12,18,.98));border-radius:18px;padding:13px;min-width:0}
.rowTop{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.rowTitle{font-size:12px;font-weight:790;line-height:1.35;min-width:0}.rowMeta{font-size:9px;font-weight:760;letter-spacing:.04em;color:var(--muted);white-space:nowrap;text-transform:uppercase}
.rowBody{font-size:10.5px;color:#929fb0;line-height:1.5;margin-top:5px;word-break:break-word}
.priority{display:inline-flex;align-items:center;gap:6px}.priority:before{content:"";width:7px;height:7px;border-radius:99px;background:var(--muted)}.priority.p1:before{background:var(--red);box-shadow:0 0 0 4px rgba(255,125,138,.07)}.priority.p2:before{background:var(--amber)}.priority.p3:before{background:#607087}
.marketRail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(164px,46%);gap:8px;overflow-x:auto;padding-bottom:2px;scroll-snap-type:x proximity;scrollbar-width:none}.marketRail::-webkit-scrollbar{display:none}.market{scroll-snap-align:start;border:1px solid var(--line);background:linear-gradient(160deg,#0e1520,#090e15);border-radius:18px;padding:13px;min-height:132px}.marketSymbol{font-size:15px;font-weight:880;letter-spacing:-.02em}.marketStatus{font-size:9px;color:var(--muted);margin-top:3px}.marketScore{font-size:25px;font-weight:900;letter-spacing:-.045em;margin-top:14px}.bar{height:5px;border-radius:99px;background:#172130;overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--cyan),var(--blue));width:0}.marketFoot{display:flex;justify-content:space-between;gap:8px;font-size:9px;color:#657488;margin-top:9px}
.researchCard{border-left:2px solid #30425a}.researchCard.required{border-left-color:var(--amber)}.researchCard .iv{font-size:16px;font-weight:850;color:var(--cyan)}
.trade{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}.tradeSymbol{font-size:14px;font-weight:850}.tradeSide{font-size:9px;color:var(--muted);margin-top:3px;text-transform:uppercase}.tradePnl{text-align:right;font-size:14px;font-weight:850}.tradeInfo{font-size:9px;color:#68778c;margin-top:4px}
.newsTitle{font-size:12px;font-weight:750;line-height:1.4}.newsMeta{font-size:9px;color:var(--muted);margin-top:6px}.sourceTag{display:inline-flex;padding:4px 7px;border:1px solid var(--line);border-radius:7px;font-size:8px;font-weight:780;letter-spacing:.05em;color:#7f8da0;margin-right:5px}
.empty{padding:20px;border:1px dashed #26364a;background:rgba(9,14,21,.35);border-radius:18px;text-align:center;color:#637287;font-size:11px;line-height:1.5}
.safety{border:1px solid rgba(94,242,214,.18);background:linear-gradient(145deg,rgba(94,242,214,.055),rgba(109,124,255,.03));border-radius:18px;padding:14px}.safetyTitle{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan)}.safetyBody{font-size:10px;line-height:1.55;color:#93a2b4;margin-top:6px}
.systemRow{display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(38,54,74,.55)}.systemRow:last-child{border-bottom:0}.systemName{font-size:11px;color:var(--soft)}.systemValue{font-size:10px;font-weight:800;color:var(--muted)}
.bottomNav{position:fixed;z-index:50;left:50%;bottom:max(8px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(calc(100% - 18px),720px);display:grid;grid-template-columns:repeat(6,1fr);gap:3px;padding:6px;border:1px solid rgba(38,54,74,.9);border-radius:23px;background:rgba(8,12,18,.88);box-shadow:0 22px 70px rgba(0,0,0,.55);backdrop-filter:blur(24px) saturate(140%)}
.bottomNav button{border:0;background:transparent;min-width:0;height:54px;border-radius:16px;color:#5f6d80;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:8px;font-weight:780;letter-spacing:.03em}
.bottomNav button svg{width:19px;height:19px;stroke:currentColor;stroke-width:1.8;fill:none}.bottomNav button.active{background:linear-gradient(145deg,#131d2b,#0d141e);color:var(--text);box-shadow:inset 0 0 0 1px rgba(94,242,214,.10)}.bottomNav button.active svg{stroke:var(--cyan)}
.signalSelectors{display:flex;flex-direction:column;gap:8px;margin-top:12px}.selectorRow{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.selectorRow::-webkit-scrollbar{display:none}.selectorBtn{flex:0 0 auto;border:1px solid var(--line);background:#0b111a;border-radius:11px;padding:8px 10px;font-size:9px;font-weight:800;color:#718096}.selectorBtn.active{border-color:rgba(94,242,214,.34);background:rgba(94,242,214,.08);color:var(--cyan)}.proofHash{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#75869b;font-size:9px}.proofStage{font-size:9px;font-weight:850;letter-spacing:.08em}.signalState{font-size:34px;font-weight:920;letter-spacing:-.05em;line-height:1}.signalBias{font-size:13px;color:var(--soft);margin-top:8px}.signalGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.installCard{margin-top:9px;border:1px solid var(--line);background:#0a1018;border-radius:18px;padding:14px}.installCard b{font-size:11px}.installCard p{margin:6px 0 0;color:#78879a;font-size:10px;line-height:1.5}
.loadingLine{height:2px;position:fixed;left:0;top:0;width:0;background:linear-gradient(90deg,var(--cyan),var(--blue));z-index:100;transition:width .25s,opacity .25s}.loadingLine.on{width:72%;opacity:1}.loadingLine.done{width:100%;opacity:0}
@media(min-width:700px){.shell{padding-left:22px;padding-right:22px}.metricGrid{grid-template-columns:repeat(4,minmax(0,1fr))}.marketRail{grid-auto-columns:minmax(190px,24%)}.twoCol{display:grid;grid-template-columns:1.15fr .85fr;gap:10px}.hero{padding:23px}.heroMode{font-size:38px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
</style>
</head>
<body>
<div class="loadingLine" id="loadingLine"></div>
<main class="shell">
<header class="topbar">
  <div class="topline">
    <div class="brand">
      <div class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M6 4h7.2c3 0 4.8 1.5 4.8 3.8 0 1.4-.7 2.5-1.9 3.1 1.7.6 2.6 1.8 2.6 3.6 0 3-2.3 4.5-5.9 4.5H6V4Zm4 5.1h2.4c1 0 1.5-.4 1.5-1.2 0-.7-.5-1.1-1.5-1.1H10v2.3Zm0 6.1h2.8c1.2 0 1.8-.5 1.8-1.4 0-.9-.6-1.3-1.8-1.3H10v2.7Z" fill="currentColor"/></svg></div>
      <div class="brandText"><div class="brandTitle">BIGGJ</div><div class="brandSub">Autonomous Market Science OS</div></div>
    </div>
    <div class="topActions">
      <div class="sync" id="syncBadge"><span class="syncDot"></span><span id="syncText">LIVE</span></div>
      <button class="iconBtn" id="refreshBtn" aria-label="Daten aktualisieren"><svg viewBox="0 0 24 24" fill="none"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>
  </div>
  <div class="statusStrip" id="statusStrip"></div>
</header>
<div class="refreshError" id="refreshError">Live-Daten konnten gerade nicht aktualisiert werden. Letzter gültiger Stand bleibt sichtbar.</div>
<div id="root"></div>
</main>

<nav class="bottomNav" id="nav" aria-label="BIGGJ Navigation">
  <button data-tab="science" class="active" aria-label="Science"><svg viewBox="0 0 24 24"><path d="M9 3h6m-5 0v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3"/><path d="M7.5 15h9"/></svg><span>Science</span></button>
  <button data-tab="world" aria-label="World Model"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.4 2.2 3.6 4.9 3.6 8S14.4 17.8 12 20c-2.4-2.2-3.6-4.9-3.6-8S9.6 6.2 12 4Z"/></svg><span>World</span></button>
  <button data-tab="lab" aria-label="Laboratory"><svg viewBox="0 0 24 24"><path d="M9 3h6m-5 0v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3"/><path d="M8 15h8M8.7 12h6.6"/></svg><span>Lab</span></button>
  <button data-tab="decisions" aria-label="Decision Intelligence"><svg viewBox="0 0 24 24"><path d="M4 17 9 12l3 3 8-9"/><path d="M16 6h4v4"/></svg><span>Decide</span></button>
  <button data-tab="trading" aria-label="Trading Application"><svg viewBox="0 0 24 24"><path d="M5 19V9m7 10V5m7 14v-7"/><path d="M3 19h18"/></svg><span>Trading</span></button>
  <button data-tab="system" aria-label="System"><svg viewBox="0 0 24 24"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg><span>System</span></button>
</nav>

<script>
let S=__BIGGJ_BOOT__;
let TAB='science';
let refreshing=false;
let lastGoodAt=Date.now();
let SIGNAL={
  symbol:'BTCUSDT',
  horizon:'1h',
  mode:'FULL',
  lab:null,
  proof:(S.health||{}).biggjProofFeed||null,
  loading:false,
  error:null,
  lastFetchedAt:0,
  lastKey:null
};

const root=document.getElementById('root');
const nav=document.getElementById('nav');
const errorBox=document.getElementById('refreshError');
const loadLine=document.getElementById('loadingLine');

const E=x=>String(x??'—').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const N=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const CLAMP=(v,a=0,b=1)=>Math.max(a,Math.min(b,N(v)));
const P=v=>Math.round(CLAMP(v)*100)+'%';
const MONEY=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' USDT':'—';
const PRICE=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('de-DE',{maximumFractionDigits:Number(v)<1?6:2}):'—';
const AGE=t=>{const d=Math.max(0,Date.now()-N(t,Date.now()));if(d<60000)return Math.floor(d/1000)+'s';if(d<3600000)return Math.floor(d/60000)+'m';return Math.floor(d/3600000)+'h'};
const cls=v=>/READY|HEALTHY|HANDS_OFF|NORMAL|PASS|ONLINE|VALID|SUPPORTED|true/i.test(String(v))?'good':/ERROR|BLOCK|ESCALATION|UNHEALTHY|FAILED|INVALID|false/i.test(String(v))?'bad':'warn';
const statusDE=v=>{
  const s=String(v||'UNKNOWN');
  const map={HANDS_OFF:'AUTONOM',WAITING_FOR_DATA:'WARTET AUF DATEN',SELF_HEALING:'SELBSTREPARATUR',ESCALATION_REQUIRED:'AKTION NÖTIG',RESEARCH_STALLED:'RESEARCH WARTET',DATA_COLLECTION_ONLY:'DATENSAMMLUNG',AUTONOMOUS_RESEARCH_ACTIVE:'RESEARCH AKTIV',IDLE_MONITORING:'MONITORING',RESEARCH_REQUIRED:'RESEARCH NÖTIG',COLLECT_MORE_PERSISTENCE:'MEHR EVIDENZ',WATCH_FLICKER:'BEOBACHTEN'};
  return map[s]||s.replaceAll('_',' ');
};

function sectionHead(title,right=''){return '<div class="sectionHead"><h2>'+E(title)+'</h2><span>'+E(right)+'</span></div>'}
function metric(label,value,hint='',tone=''){return '<div class="metric"><div class="metricLabel">'+E(label)+'</div><div class="metricValue '+tone+'">'+E(value)+'</div>'+(hint?'<div class="metricHint">'+hint+'</div>':'')+'</div>'}
function panel(title,body='',meta='',extra=''){return '<div class="panel '+extra+'"><div class="rowTop"><div class="rowTitle">'+title+'</div>'+(meta?'<div class="rowMeta">'+E(meta)+'</div>':'')+'</div>'+(body?'<div class="rowBody">'+body+'</div>':'')+'</div>'}
function empty(text){return '<div class="empty">'+E(text)+'</div>'}
function pnlTone(v){const n=Number(v);return Number.isFinite(n)?(n>0?'good':n<0?'bad':''):''}
const SPCT=v=>Number.isFinite(Number(v))?(Number(v)>=0?'+':'')+(Number(v)*100).toFixed(2)+'%':'—';
const DIR=v=>{const x=String(v||'UNKNOWN').toUpperCase();return x==='UP'?'↗ UP':x==='DOWN'?'↘ DOWN':/FLAT|SIDEWAYS|NEUTRAL/.test(x)?'→ SIDEWAYS':'—'};
function selectorRow(values,current,attr,label=x=>x){
  return '<div class="selectorRow">'+values.map(x=>'<button class="selectorBtn '+(String(current)===String(x)?'active':'')+'" '+attr+'="'+E(x)+'">'+E(label(x))+'</button>').join('')+'</div>';
}
async function loadSignalLab(force=false){
  const key=[SIGNAL.symbol,SIGNAL.horizon,SIGNAL.mode].join('|');
  if(SIGNAL.loading)return;
  if(!force&&SIGNAL.lastKey===key&&Date.now()-SIGNAL.lastFetchedAt<30000)return;
  SIGNAL.loading=true;SIGNAL.error=null;render();
  try{
    const qs=new URLSearchParams({symbol:SIGNAL.symbol,horizon:SIGNAL.horizon,mode:SIGNAL.mode});
    const proofQs=new URLSearchParams({symbol:SIGNAL.symbol});
    const [lr,pr]=await Promise.all([
      fetch('/signal-lab.json?'+qs.toString(),{cache:'no-store'}),
      fetch('/proof-feed.json?'+proofQs.toString(),{cache:'no-store'})
    ]);
    if(!lr.ok)throw new Error('Signal HTTP '+lr.status);
    if(!pr.ok)throw new Error('Proof HTTP '+pr.status);
    SIGNAL.lab=await lr.json();
    SIGNAL.proof=await pr.json();
    SIGNAL.lastFetchedAt=Date.now();
    SIGNAL.lastKey=key;
  }catch(err){
    SIGNAL.error=String(err?.message||err||'SIGNAL_LAB_UNAVAILABLE');
  }finally{
    SIGNAL.loading=false;
    render();
  }
}

function operatorCopy(op,factory){
  const mode=String(op?.mode||'UNKNOWN');
  if(mode==='HANDS_OFF')return 'BIGGJ arbeitet autonom. Aktuell ist keine menschliche Aktion erforderlich.';
  if(mode==='WAITING_FOR_DATA')return 'Kein Fehler: BIGGJ wartet kontrolliert auf neue Point-in-Time-Evidence und greift nicht unnötig ein.';
  if(mode==='SELF_HEALING')return 'BIGGJ behebt gerade einen reversiblen Runtime- oder Research-Blocker selbstständig.';
  if(mode==='ESCALATION_REQUIRED')return 'Eine explizite Entscheidung oder ein nicht automatisch lösbarer Blocker braucht Aufmerksamkeit.';
  if(String(factory?.mode)==='RESEARCH_STALLED')return 'Research benötigt neue belastbare Evidenz, bevor der nächste wissenschaftliche Schritt möglich ist.';
  return 'BIGGJ überwacht Runtime, Research, Märkte und Shadow-Execution kontinuierlich.';
}

function buildStatusStrip(){
  const h=S.health||{},os=S.biggj||h.biggjMarketScienceOs||{},frontier=os.science?.frontier||{},ready=h.operationalReadiness||{},cov=h.researchCoverage||{};
  const rows=[
    ['BIGGJ','MARKET SCIENCE','cyan'],
    ['Theories',N(frontier.total),N(frontier.broken)>0?'warn':'good'],
    ['Evidence',N(frontier.evidence),'good'],
    ['Coverage',P(cov.averageCoverage),N(cov.blocked)>0?'warn':'good'],
    ['Runtime',ready.ready?'READY':ready.status||'CHECK',ready.ready?'good':'warn'],
    ['Mode','SHADOW_ONLY','good']
  ];
  document.getElementById('statusStrip').innerHTML=rows.map(x=>'<div class="chip '+x[2]+'">'+E(x[0])+' <strong>'+E(x[1])+'</strong></div>').join('');
}

function renderOverview(){
  const h=S.health||{},op=h.autonomousOperator||{},factory=h.autonomousResearchFactory||{},lr=h.biggjLivingResearch||{},cov=h.researchCoverage||{},brain=h.biggjObservability||{},p=S.portfolio||{};
  const needs=(h.experienceNeeds||[]).slice(0,6);
  const radar=(h.marketRadar?.rows||[]).slice(0,5);
  const latest=(h.globalIntel?.recent||[]).slice().sort((a,b)=>N(b.availableAt||b.timestamp)-N(a.availableAt||a.timestamp))[0];
  const mode=statusDE(op.mode);
  let html='<section class="view '+(TAB==='overview'?'active':'')+'">';
  html+='<div class="hero"><div class="heroGrid"><div><div class="overline">System posture</div><div class="heroMode '+cls(op.mode)+'">'+E(mode)+'</div><div class="heroCopy">'+E(operatorCopy(op,factory))+'</div></div><div class="orb"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg></div></div>';
  html+='<div class="heroFooter"><div class="badge">Mensch <b class="'+(op.operatorNeeded?'bad':'good')+'">'+(op.operatorNeeded?'NÖTIG':'NICHT NÖTIG')+'</b></div><div class="badge">Factory <b>'+E(statusDE(factory.mode))+'</b></div><div class="badge">Sync <b>'+AGE(S.generatedAt||lastGoodAt)+'</b></div></div></div>';
  html+=sectionHead('Live Pulse','10s Sync');
  html+='<div class="metricGrid">'+metric('Automation',P(op.automationCoverage),E(op.humanJobRemaining||'EXCEPTIONS_ONLY'),'cyan')+metric('Research Required',N(lr.researchRequired),N(lr.activeAgendaItems)+' aktive Agenda Items',N(lr.researchRequired)>0?'warn':'good')+metric('Coverage',P(cov.averageCoverage),N(cov.blocked)+' blockiert',N(cov.blocked)>0?'warn':'good')+metric('Shadow PnL',MONEY(p.netPnlQuote),N(p.openPositions)+' offene Positionen',pnlTone(p.netPnlQuote))+'</div>';
  html+=sectionHead('Was BIGGJ braucht',needs.length+' Punkte');
  html+='<div class="stack">'+(needs.length?needs.map(x=>panel('<span class="priority p'+E(x.priority)+'">'+E(x.label)+'</span>',E(x.detail),x.priority===1?'JETZT':x.priority===2?'NÄCHSTER HEBEL':'BEOBACHTEN')).join(''):empty('Aktuell keine harte Runtime-, Source- oder Operator-Lücke erkannt.'))+'</div>';
  html+=sectionHead('Markt Pulse',radar.length+' Märkte');
  html+='<div class="marketRail">'+(radar.length?radar.map(x=>{const score=Number.isFinite(Number(x.score))?CLAMP(Number(x.score),0,1):CLAMP(x.witnessAgreement,0,1);return '<div class="market"><div class="marketSymbol">'+E(String(x.symbol||'').replace('USDT','/USDT'))+'</div><div class="marketStatus">'+E(statusDE(x.status))+' · '+E(x.regime||'UNKNOWN')+'</div><div class="marketScore">'+Math.round(score*100)+'</div><div class="bar"><i style="width:'+Math.round(score*100)+'%"></i></div><div class="marketFoot"><span>Witness '+P(x.witnessAgreement)+'</span><span>'+N(x.support)+' support</span></div></div>'}).join(''):empty('Radar sammelt gerade neue Marktstates.'))+'</div>';
  html+=sectionHead('Letztes relevantes Signal');
  html+=latest?panel('<div class="newsTitle">'+E(latest.title||latest.headline||latest.eventType||'Event')+'</div>','<span class="sourceTag">'+E(latest.family||latest.eventFamily||'OTHER')+'</span>'+E(latest.marketStatus||latest.status||'WATCH')+' · '+(latest.verified?'verifiziert':'noch nicht unabhängig bestätigt'),AGE(latest.availableAt||latest.timestamp)+' alt'):empty('Noch kein aktuelles Intelligence-Event im Snapshot.');
  return html+'</section>';
}

function renderMarkets(){
  const h=S.health||{},radar=(h.marketRadar?.rows||[]),intel=h.globalIntel||{},events=(intel.recent||[]).slice().sort((a,b)=>N(b.availableAt||b.timestamp)-N(a.availableAt||a.timestamp)).slice(0,18),meme=h.memecoinRadar||{},coins=(meme.rows||[]).slice(0,10),tw=h.traderWatch||{};
  let html='<section class="view '+(TAB==='markets'?'active':'')+'">';
  html+=sectionHead('Market Radar',radar.length+' beobachtet');
  html+='<div class="stack">'+(radar.length?radar.map(x=>{const score=Number.isFinite(Number(x.score))?CLAMP(Number(x.score),0,1):CLAMP(x.witnessAgreement,0,1);return panel(E(String(x.symbol||'').replace('USDT','/USDT'))+' <span class="'+cls(x.status)+'">· '+E(statusDE(x.status))+'</span>','Regime '+E(x.regime||'UNKNOWN')+' · Witness '+P(x.witnessAgreement)+' · Support '+N(x.support)+'<div class="bar"><i style="width:'+Math.round(score*100)+'%"></i></div>',Math.round(score*100)+'/100')}).join(''):empty('Noch keine Radar-Daten verfügbar.'))+'</div>';
  html+=sectionHead('Live Intelligence',events.length+' Events');
  html+='<div class="stack">'+(events.length?events.map(x=>panel('<div class="newsTitle">'+E(x.title||x.headline||x.eventType||'Event')+'</div>','<span class="sourceTag">'+E(x.family||x.eventFamily||'OTHER')+'</span>'+E(x.marketStatus||x.status||'WATCH')+' · '+(x.verified?'verifiziert':'nicht unabhängig bestätigt'),AGE(x.availableAt||x.timestamp)+' alt')).join(''):empty('Keine relevanten Live-Events im aktuellen Fenster.'))+'</div>';
  html+=sectionHead('Memecoin Radar',coins.length+' Rows');
  html+='<div class="stack">'+(coins.length?coins.map(x=>{const p=x.pair||{},chg=N(p.priceChangeH1);return panel(E(p.symbol||p.name||'TOKEN')+' <span class="'+pnlTone(chg)+'">· '+(chg>=0?'+':'')+chg.toFixed(1)+'%</span>','Preis $'+E(PRICE(p.priceUsd))+' · Liquidity $'+Math.round(N(p.liquidityUsd)).toLocaleString('de-DE')+' · Buys/Sells '+N(p.buysH1)+'/'+N(p.sellsH1),x.chainId||'DEX')}).join(''):empty('Dex-Radar hat aktuell keine verwertbaren Token-Rows.'))+'</div>';
  html+=sectionHead('Trader Intelligence');
  html+=panel(tw.sourceReady?'<span class="good">PIT-Quelle verbunden</span>':'<span class="warn">Performance-Quelle fehlt</span>',tw.sourceReady?'Öffentliche Point-in-Time Trader-Evidence ist verfügbar.':E(tw.nextNeed||'Keine belastbare öffentliche realisierte PnL-Quelle verbunden.'),tw.privacy||'PUBLIC_DATA_ONLY');
  return html+'</section>';
}

function renderSignals(){
  const lab=SIGNAL.lab||{},proof=SIGNAL.proof||(S.health||{}).biggjProofFeed||{},p=lab.probability||{},f=lab.forecast||{},d=lab.diagnostics||{};
  const state=SIGNAL.loading&&!SIGNAL.lab?'LOADING':String(lab.state||'SELECT');
  const confidence=p.displayAllowed===true&&Number.isFinite(Number(p.calibrated))?P(p.calibrated):'SUPPRESSED';
  const live=(proof.liveRows||[]).slice(0,5);
  const resolved=(proof.rows||[]).slice(0,8);
  let html='<section class="view '+(TAB==='decisions'?'active':'')+'">';
  html+='<div class="hero"><div class="heroGrid"><div><div class="overline">DECISION INTELLIGENCE · TCX APPLICATION</div><div class="signalState '+cls(state)+'">'+E(statusDE(state))+'</div><div class="signalBias">'+E(String(SIGNAL.symbol).replace('USDT','/USDT'))+' · '+E(SIGNAL.horizon.toUpperCase())+' · '+E(SIGNAL.mode)+' · '+E(DIR(lab.bias))+'</div><div class="heroCopy">TCX konsumiert den validierten Science-/World-Model-Stand. Dieser Layer trifft Entscheidungen, besitzt aber keine wissenschaftliche Autorität.</div></div><div class="orb"><svg viewBox="0 0 24 24" fill="none"><path d="M4 17 9 12l3 3 8-9M16 6h4v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>';
  html+='<div class="signalSelectors">'+selectorRow(['BTCUSDT','ETHUSDT','SOLUSDT'],SIGNAL.symbol,'data-signal-symbol',x=>x.replace('USDT',''))+selectorRow(['5m','15m','1h','4h'],SIGNAL.horizon,'data-signal-horizon',x=>x.toUpperCase())+selectorRow(['FULL','STRUCTURE','FLOW','LIQUIDITY','MACRO'],SIGNAL.mode,'data-signal-mode',x=>x==='STRUCTURE'?'STRUCT':x==='LIQUIDITY'?'LIQ':x)+'</div>';
  html+='<div class="heroFooter"><div class="badge">Confidence <b>'+E(confidence)+'</b></div><div class="badge">Forecast <b>'+E(lab.forecastGate||'—')+'</b></div><div class="badge">Risk <b>'+E(d.riskStatus||'—')+'</b></div></div></div>';
  if(SIGNAL.error)html+='<div class="refreshError show" style="margin-top:10px">'+E(SIGNAL.error)+' · letzter gültiger Signal-State bleibt sichtbar.</div>';
  html+=sectionHead('Signal','gleicher Forecast-Kern');
  html+='<div class="metricGrid">'+metric('Bias',DIR(lab.bias),'canonical direction',cls(lab.state))+metric('Confidence',confidence,p.displayAllowed?'kalibriert':'Zahl bewusst unterdrückt',p.displayAllowed?'good':'warn')+metric('Expected',SPCT(f.expectedReturn),'Range '+SPCT(f.intervalQ10)+' → '+SPCT(f.intervalQ90))+metric('Evidence',d.evidenceScore==null?'—':Math.round(N(d.evidenceScore)*100)+'/100','diagnostic, keine Wahrscheinlichkeit')+'</div>';
  html+=sectionHead('Warum / Dagegen');
  const supports=(lab.supportReasons||[]).slice(0,5),counters=(lab.counterReasons||[]).slice(0,5);
  html+='<div class="twoCol">'+panel('Dafür',supports.length?supports.map(x=>'• '+E(x)).join('<br>'):'Keine zusätzliche Support-Evidenz freigegeben.')+panel('Dagegen',counters.length?counters.map(x=>'• '+E(x)).join('<br>'):'Keine zusätzliche Gegen-Evidenz im kompakten View.')+'</div>';
  html+=sectionHead('Proof Pipeline',(proof.counts?.resolved||0)+' resolved');
  html+='<div class="metricGrid">'+metric('Live',N(proof.counts?.live),N(proof.counts?.awaitingOutcome)+' awaiting')+metric('Committed',N(proof.counts?.committed),N(proof.counts?.legacy)+' legacy',N(proof.counts?.invalid)>0?'warn':'good')+metric('Hit / Miss',N(proof.counts?.hits)+' / '+N(proof.counts?.misses),'beide werden gezeigt')+metric('Learned',N(proof.counts?.learned),'im Learning-Aggregat, keine Promotion')+'</div>';
  html+=sectionHead('Live Commitments');
  html+='<div class="stack">'+(live.length?live.map(x=>panel('<span class="proofStage '+(x.commitmentState==='VERIFIED'?'good':'warn')+'">'+E(x.currentStage)+'</span> · '+E(String(x.symbol||'').replace('USDT','/USDT'))+' · '+E(String(x.horizonId||'').toUpperCase()),'Before '+E(DIR(x.predictedDirection))+' · Expected '+E(SPCT(x.expectedReturn))+' · Range '+E(SPCT(x.intervalQ10))+' → '+E(SPCT(x.intervalQ90))+(x.beforeHash?'<br><span class="proofHash">'+E(String(x.beforeHash).slice(0,20))+'…</span>':''),x.commitmentState==='VERIFIED'?'LOCKED':'LEGACY')).join(''):empty('Keine offenen Forecast-Commitments für diesen Markt.'))+'</div>';
  html+=sectionHead('Resolved Proofs');
  html+='<div class="stack">'+(resolved.length?resolved.map(x=>panel('<span class="'+(x.directionalHit?'good':'bad')+'">'+(x.directionalHit?'HIT':'MISS')+'</span> · '+E(String(x.horizonId||'').toUpperCase()),'Before '+E(DIR(x.predictedDirection))+' '+E(SPCT(x.expectedReturn))+' → After '+E(DIR(x.actualDirection))+' '+E(SPCT(x.actualReturn))+' · Range '+(x.intervalHit?'HIT':'MISS')+(x.beforeHash&&x.outcomeHash?'<br><span class="proofHash">'+E(String(x.beforeHash).slice(0,12))+'… → '+E(String(x.outcomeHash).slice(0,12))+'…</span>':''),x.currentStage||'RESOLVED')).join(''):empty('Noch keine aufgelösten Proofs für diesen Markt.'))+'</div>';
  html+='<div class="safety" style="margin-top:12px"><div class="safetyTitle">Proof & Execution Boundary</div><div class="safetyBody">Forecast-Time-Hashes sind interne deterministische Commitments, keine externe Beglaubigung. Treffer und Fehler bleiben sichtbar. WATCH ist keine Order-Autorisierung. SHADOW_ONLY · ABSTAIN · canExecuteLive:false.</div></div>';
  return html+'</section>';
}

function renderResearch(){
  const h=S.health||{},lr=h.biggjLivingResearch||{},brain=h.biggjObservability||{},factory=h.autonomousResearchFactory||{};
  const bottlenecks=(lr.topResearchBottlenecks||lr.topAgenda||[]).slice(0,10);
  const knowledge=(brain.knowledge||[]).slice(0,10);
  const queue=(brain.researchQueue||[]).slice(0,8);
  const timeline=(brain.learningTimeline?.events||[]).slice(0,8);
  let html='<section class="view '+(TAB==='research'?'active':'')+'">';
  html+='<div class="hero"><div class="heroGrid"><div><div class="overline">Living Research</div><div class="heroMode">'+N(lr.researchRequired)+' <span class="warn">REQUIRED</span></div><div class="heroCopy">Persistente Thesis-Schwächen werden zu Research-Agenda, Protocols und Research-only Skills. Keine automatische Promotion.</div></div><div class="orb"><svg viewBox="0 0 24 24" fill="none"><path d="M9 3h6m-5 0v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3" stroke="currentColor" stroke-width="1.7"/><path d="M7.5 15h9" stroke="currentColor" stroke-width="1.7"/></svg></div></div><div class="heroFooter"><div class="badge">Protocols <b>'+N(lr.researchProtocols?.total)+'</b></div><div class="badge">Reviews <b>'+N(lr.researchReviews?.open)+'</b></div><div class="badge">Skills <b>'+N(lr.discoveredResearchOnlySkills)+'</b></div></div></div>';
  html+=sectionHead('Top Bottlenecks',bottlenecks.length+' aktiv');
  html+='<div class="stack">'+(bottlenecks.length?bottlenecks.map(x=>panel(E(x.assumptionId||'ASSUMPTION'),'<span class="iv">'+Math.round(N(x.informationValue)*100)+'</span> IV · '+E(x.primaryCapabilityId||'—')+' · '+N(x.distinctPersistentForecasts)+' persistente Forecasts',statusDE(x.status),'researchCard '+(x.status==='RESEARCH_REQUIRED'?'required':''))).join(''):empty('Keine aktiven persistenten Thesis-Bottlenecks.'))+'</div>';
  html+=sectionHead('Skill Tree',N(brain.trustedSkills)+' trusted');
  html+='<div class="stack">'+(knowledge.length?knowledge.map(x=>panel(E(x.title||x.skillId),E(statusDE(x.status))+' · Unsicherheit '+P(x.uncertainty),x.capabilityId||'SKILL')).join(''):empty('Noch kein Knowledge-State im Observability Snapshot.'))+'</div>';
  html+=sectionHead('Research Queue',queue.length+' Tasks');
  html+='<div class="stack">'+(queue.length?queue.map(x=>panel(E(x.title||x.skillId),'<span class="cyan">Next:</span> '+E(x.nextGate||'—')+' · Unsicherheit '+P(x.uncertainty),Number.isFinite(Number(x.priority))?'P '+P(x.priority):'QUEUE')).join(''):empty('Keine offenen Research-Gates.'))+'</div>';
  html+=sectionHead('Factory','Rev '+N(factory.revision));
  html+=panel(E(statusDE(factory.mode)),'Automatic '+N(factory.automatic)+' · Manual '+N(factory.manual)+' · Data-only '+N(factory.dataOnly)+' · Unowned '+N(factory.unowned),(factory.dataNeeds||[]).slice(0,3).join(' · ')||'keine Data Needs');
  if(timeline.length){html+=sectionHead('Learning Timeline');html+='<div class="stack">'+timeline.map(x=>panel(E(x.title||x.kind||'Learning Event'),E(x.detail||''),AGE(x.at)+' alt')).join('')+'</div>'}
  return html+'</section>';
}

function renderTrades(){
  const p=S.portfolio||{},open=(p.positions||[]).filter(x=>String(x.status||'OPEN').toUpperCase()==='OPEN'),closed=(p.recentClosed||[]).slice(0,12),research=p.researchActivity||{};
  let html='<section class="view '+(TAB==='trading'?'active':'')+'">';
  html+=sectionHead('Trading Application','Downstream von Science & Decisions');
  html+=panel('<span class="cyan">TCX / RIFT → SHADOW TRADING</span>','PnL und Trade-Ergebnisse fließen nur als Evidence zurück. Sie dürfen niemals wissenschaftliche Wahrheit oder Theorie-Promotion erzwingen.','APPLICATION');
  html+=sectionHead('Shadow Portfolio','keine Real-Money-Orders');
  html+='<div class="metricGrid">'+metric('Equity',MONEY(p.equityQuote),'Shadow Equity')+metric('Net PnL',MONEY(p.netPnlQuote),N(p.closedTrades)+' closed',pnlTone(p.netPnlQuote))+metric('Open',N(p.openPositions),'aktive Shadow-Positionen')+metric('Research',N(research.openPositions||0)+' / '+N(research.closedTrades||0),'open / closed')+'</div>';
  html+=sectionHead('Offene Trades',open.length+' Positionen');
  html+='<div class="stack">'+(open.length?open.map(x=>{const pnl=N(x.lastMark?.unrealizedNetPnlQuote??x.unrealizedPnlQuote??x.pnlQuote);return '<div class="panel trade"><div><div class="tradeSymbol">'+E(String(x.symbol||'').replace('USDT','/USDT'))+'</div><div class="tradeSide">'+E(x.side||'—')+' · '+E(x.entryMode||x.strategyId||'SHADOW')+'</div><div class="tradeInfo">Entry '+E(PRICE(x.entryPrice??x.avgEntryPrice))+' · Mark '+E(PRICE(x.lastMark?.price??x.markPrice))+'</div></div><div><div class="tradePnl '+pnlTone(pnl)+'">'+E(MONEY(pnl))+'</div><div class="tradeInfo">unrealized</div></div></div>'}).join(''):empty('Keine offenen Shadow-Positionen.'))+'</div>';
  html+=sectionHead('Zuletzt geschlossen');
  html+='<div class="stack">'+(closed.length?closed.map(x=>{const pnl=N(x.netPnlQuote??x.realizedNetPnlQuote??x.pnlQuote);return panel(E(String(x.symbol||'').replace('USDT','/USDT'))+' · '+E(x.side||'—'),'<span class="'+pnlTone(pnl)+'">'+E(MONEY(pnl))+'</span> · '+E(x.exitReason||'closed'),x.closedAt?AGE(x.closedAt)+' alt':'CLOSED')}).join(''):empty('Noch keine kürzlich geschlossenen Trades.'))+'</div>';
  html+='<div class="safety" style="margin-top:12px"><div class="safetyTitle">Execution Boundary</div><div class="safetyBody">SHADOW_ONLY · canExecute:false · canExecuteLive:false. Diese Oberfläche zeigt Research-/Shadow-Zustände und besitzt keine Live-Order-Autorität.</div></div>';
  return html+'</section>';
}


function renderScience(){
  const h=S.health||{},os=S.biggj||h.biggjMarketScienceOs||{},science=os.science||{},frontier=science.frontier||{},director=science.director||{},next=director.nextResearchQuestion||null;
  const agenda=(director.topAgenda||[]).slice(0,8),requests=(director.topDataRequests||[]).slice(0,6);
  let html='<section class="view '+(TAB==='science'?'active':'')+'">';
  html+='<div class="hero"><div class="heroGrid"><div><div class="overline">BIGGJ CORE</div><div class="heroMode">MARKET<br><span class="cyan">SCIENCE</span></div><div class="heroCopy">BIGGJ baut überprüfbares Marktwissen. Trading ist eine nachgelagerte Anwendung und besitzt keine Autorität über wissenschaftliche Wahrheit.</div></div><div class="orb"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg></div></div>';
  html+='<div class="heroFooter"><div class="badge">Home <b>SCIENCE</b></div><div class="badge">Execution <b class="good">SHADOW_ONLY</b></div><div class="badge">Unknown <b class="cyan">VALID STATE</b></div></div></div>';
  html+=sectionHead('Knowledge Frontier','kanonischer Wissensstand');
  html+='<div class="metricGrid">'+metric('Theorien',N(frontier.total),N(frontier.robust)+' robust · '+N(frontier.broken)+' broken','cyan')+metric('Evidence',N(frontier.evidence),'PIT + Provenance')+metric('Experimente',N(frontier.experiments),'wissenschaftliche Tests')+metric('Surprises',N(frontier.surprises),'Fehler werden Forschungsinput',N(frontier.surprises)>0?'warn':'good')+'</div>';
  html+=sectionHead('Nächste Forschungsfrage');
  html+=next?panel('<span class="cyan">'+E(next.kind||'QUESTION')+'</span> · '+E(next.title||'BIGGJ Research'),E(next.question||next.nextExperimentPurpose||'—'),'P '+Math.round(N(next.priority)*100)):empty('Noch keine priorisierte Forschungsfrage vorhanden.');
  html+=sectionHead('Science Agenda',agenda.length+' Fragen');
  html+='<div class="stack">'+(agenda.length?agenda.map(x=>panel(E(x.question||x.title||x.kind||'Research Question'),'Status '+E(x.derivedStatus||'UNKNOWN')+' · Next '+E(x.nextExperimentType||'—')+' · Information Gain '+P(x.expectedInformationGainProxy),E(x.kind||'RESEARCH'),'researchCard '+(x.kind==='BROKEN_THEORY'||x.kind==='CONTRADICTION'?'required':''))).join(''):empty('Science Director hat aktuell keine Agenda erzeugt.'))+'</div>';
  html+=sectionHead('Data Requests',requests.length+' Hypothesen');
  html+='<div class="stack">'+(requests.length?requests.map(x=>panel(E(x.variable||'UNKNOWN_VARIABLE'),E(x.question||'')+' · Surprise-Cluster '+N(x.surpriseCount),'P '+Math.round(N(x.priority)*100),'researchCard')).join(''):empty('Keine wiederkehrende fehlende Variable erkannt.'))+'</div>';
  html+='<div class="safety" style="margin-top:12px"><div class="safetyTitle">Epistemic Firewall</div><div class="safetyBody">Realität schlägt Modelle. Prediction ist nicht Erklärung. Synthetische Evidenz ist keine reale Evidenz. PnL kann keine Theorie promoten. Jede Theorie muss widerlegbar bleiben.</div></div>';
  return html+'</section>';
}

function renderWorld(){
  const h=S.health||{},os=S.biggj||h.biggjMarketScienceOs||{},world=os.worldModel||{},markets=(world.markets||[]),regimes=(world.regimeDistribution||[]),events=(world.latestIntelligence||[]).slice(0,12);
  let html='<section class="view '+(TAB==='world'?'active':'')+'">';
  html+='<div class="hero"><div class="heroGrid"><div><div class="overline">WORLD MODEL</div><div class="heroMode">'+N(world.marketsObserved)+' <span class="cyan">MARKETS</span></div><div class="heroCopy">Die Weltmodell-Schicht beschreibt, was BIGGJ aktuell über Marktstates behaupten darf. Nicht implementierte verborgene Zustände bleiben ausdrücklich UNKNOWN statt erfunden zu werden.</div></div><div class="orb"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M4 12h16M12 4c2.4 2.2 3.6 4.9 3.6 8S14.4 17.8 12 20c-2.4-2.2-3.6-4.9-3.6-8S9.6 6.2 12 4Z" stroke="currentColor" stroke-width="1.4"/></svg></div></div></div>';
  html+=sectionHead('Observed / Inferred Market State',markets.length+' States');
  html+='<div class="marketRail">'+(markets.length?markets.map(x=>{const score=Number.isFinite(Number(x.score))?CLAMP(x.score):CLAMP(x.witnessAgreement);return '<div class="market"><div class="marketSymbol">'+E(String(x.symbol||'').replace('USDT','/USDT'))+'</div><div class="marketStatus">'+E(x.epistemicClass||'INFERRED')+' · '+E(x.regime||'UNKNOWN')+'</div><div class="marketScore">'+Math.round(score*100)+'</div><div class="bar"><i style="width:'+Math.round(score*100)+'%"></i></div><div class="marketFoot"><span>'+E(statusDE(x.status))+'</span><span>'+N(x.support)+' support</span></div></div>'}).join(''):empty('Noch keine kanonischen Marktstates verfügbar.'))+'</div>';
  html+=sectionHead('Regime Distribution',regimes.length+' Zustände');
  html+='<div class="stack">'+(regimes.length?regimes.map(x=>panel(E(x.regime),N(x.count)+' Märkte','INFERRED')).join(''):empty('Keine Regime-Verteilung verfügbar.'))+'</div>';
  html+=sectionHead('Ungeklärte World-Model-Schichten');
  for(const item of [['Latent State',world.latentStateDiscovery],['Information Flow',world.informationFlowGraph],['Predictability Field',world.predictabilityField]]){
    const v=item[1]||{};html+=panel(E(item[0])+' · <span class="warn">'+E(v.status||'UNKNOWN')+'</span>',E(v.reason||'Keine kanonische Aussage.'),'NO FABRICATION');
  }
  html+=sectionHead('Reality Feed',events.length+' Events');
  html+='<div class="stack">'+(events.length?events.map(x=>panel(E(x.title||x.eventType||'Event'),'<span class="sourceTag">'+E(x.family||'OTHER')+'</span>'+E(x.marketStatus||x.status||'WATCH')+' · '+(x.verified?'verifiziert':'noch nicht unabhängig bestätigt'),x.availableAt?AGE(x.availableAt)+' alt':'LIVE')).join(''):empty('Noch kein Intelligence-Event im aktuellen Snapshot.'))+'</div>';
  return html+'</section>';
}

function renderLab(){
  const h=S.health||{},os=S.biggj||h.biggjMarketScienceOs||{},lab=os.laboratory||{},agenda=(lab.agenda||[]).slice(0,10),requests=(lab.dataRequests||[]).slice(0,8);
  let html='<section class="view '+(TAB==='lab'?'active':'')+'">';
  html+='<div class="hero"><div class="heroGrid"><div><div class="overline">SCIENTIFIC LABORATORY</div><div class="heroMode">'+N(lab.experimentCount)+' <span class="cyan">EXPERIMENTS</span></div><div class="heroCopy">Hier versucht BIGGJ seine eigenen Ideen zu zerstören: OOS, Placebos, Ablations, Gegenwelten, Cross-Market- und Cross-Regime-Tests. Kein Lab-Ergebnis darf direkt PRIMARY verändern.</div></div><div class="orb"><svg viewBox="0 0 24 24" fill="none"><path d="M9 3h6m-5 0v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3M8 15h8" stroke="currentColor" stroke-width="1.7"/></svg></div></div>';
  html+='<div class="heroFooter"><div class="badge">Factory <b>'+E(statusDE(lab.factoryMode||'UNKNOWN'))+'</b></div><div class="badge">Auto <b>'+N(lab.automaticResearchTasks)+'</b></div><div class="badge">Manual <b>'+N(lab.manualResearchTasks)+'</b></div></div></div>';
  html+=sectionHead('Experiment Queue',agenda.length+' Prioritäten');
  html+='<div class="stack">'+(agenda.length?agenda.map(x=>panel(E(x.nextExperimentType||x.kind||'EXPERIMENT'),E(x.question||x.nextExperimentPurpose||'')+' · Replication gap '+P(x.replicationGap)+' · Generalization gap '+P(x.generalizationGap),E(x.derivedStatus||'HYPOTHESIS'),'researchCard '+(x.kind==='CONTRADICTION'||x.kind==='BROKEN_THEORY'?'required':''))).join(''):empty('Keine Experiment-Priorität vorhanden.'))+'</div>';
  html+=sectionHead('Missing Variables',requests.length+' Requests');
  html+='<div class="stack">'+(requests.length?requests.map(x=>panel(E(x.variable||'UNKNOWN'),E(x.question||'')+' · max divergence '+N(x.maxDivergence).toFixed(2),N(x.surpriseCount)+' surprises')).join(''):empty('Keine wiederkehrenden Missing-Variable-Cluster.'))+'</div>';
  html+=sectionHead('Lab Boundary');
  html+='<div class="safety"><div class="safetyTitle">Research ≠ Authority</div><div class="safetyBody">Synthetic worlds dürfen Hypothesen erzeugen und stressen, zählen aber nicht als reale Evidence. Experimente werden nicht automatisch zu Trading-Regeln. Primary mutation bleibt gesperrt.</div></div>';
  return html+'</section>';
}

function renderSystem(){
  const h=S.health||{},ready=h.operationalReadiness||{},op=h.autonomousOperator||{},factory=h.autonomousResearchFactory||{},fabric=h.marketDataFabric||{},oms=h.shadowOms||{},fr=h.institutionalForecastRuntime||{},dc=h.discordBridge||{},tg=h.telegramPolling||{},st=S.storage||{},lr=h.biggjLivingResearch||{};
  const rows=[
    ['Operational Readiness',ready.ready?'READY':ready.status||'CHECK'],
    ['Autonomous Operator',statusDE(op.mode)],
    ['Research Factory',statusDE(factory.mode)],
    ['Living Research',lr.integrity||'UNKNOWN'],
    ['Market Fabric',fabric.healthy?'HEALTHY':'CHECK'],
    ['Forecast Runtime',fr.healthy===true||fr.status==='HEALTHY'?'HEALTHY':fr.status||'CHECK'],
    ['Shadow OMS',oms.healthy?'HEALTHY':'CHECK'],
    ['Discord',dc.ready===true?'READY':dc.enabled===false?'OFF':'CHECK'],
    ['Telegram',tg.lastPollError?'DEGRADED':'READY'],
    ['Persistent Storage',st.persistentStorageMounted?'MOUNTED':'CHECK']
  ];
  let html='<section class="view '+(TAB==='system'?'active':'')+'">';
  html+=sectionHead('Runtime Health');
  html+='<div class="panel">'+rows.map(x=>'<div class="systemRow"><div class="systemName">'+E(x[0])+'</div><div class="systemValue '+cls(x[1])+'">'+E(x[1])+'</div></div>').join('')+'</div>';
  html+=sectionHead('Autonomy');
  html+='<div class="metricGrid">'+metric('Automation',P(op.automationCoverage),op.operatorNeeded?'Human action offen':'kein Human-Task',op.operatorNeeded?'bad':'good')+metric('Self Healing',N(op.selfHealing),'geplante Recovery Actions')+metric('Incidents',N(op.activeIncidents),'aktive Incidents',N(op.activeIncidents)>0?'warn':'good')+metric('Research Rev',N(lr.revision),N(lr.activeAgendaItems)+' Agenda Items')+'</div>';
  const os=S.biggj||h.biggjMarketScienceOs||{};
  html+=sectionHead('Canonical Architecture');
  html+='<div class="panel">'+((os.architecture?.layerOrder||[]).map((x,i)=>'<div class="systemRow"><div class="systemName">'+(i+1)+'. '+E(x)+'</div><div class="systemValue">'+(i<5?'CORE':'APPLICATION')+'</div></div>').join('')||'<div class="empty">Architecture snapshot unavailable.</div>')+'</div>';
  html+=sectionHead('Safety Contract');
  html+='<div class="safety"><div class="safetyTitle">Unveränderliche Grenze</div><div class="safetyBody">SHADOW_ONLY · ABSTAIN ist vollwertig · canExecute:false · canExecuteLive:false · keine automatische Trading-Policy-Mutation · keine automatische Promotion · keine stille PRIMARY-Mutation.</div></div>';
  html+='<div class="installCard"><b>Als iPhone-App installieren</b><p>Safari → Teilen → <strong>Zum Home-Bildschirm</strong>. BIGGJ startet danach im Standalone-Modus und nutzt diese Oberfläche als Command Center.</p></div>';
  html+='<div class="installCard"><b>Live Diagnose</b><p>Alle Ansichten lesen denselben kanonischen <strong>/mission-control.json</strong>-Snapshot. Bei einem Sync-Fehler bleibt der letzte gültige Stand sichtbar und wird als stale/offline markiert.</p></div>';
  return html+'</section>';
}

function render(){
  buildStatusStrip();
  root.innerHTML=renderScience()+renderWorld()+renderLab()+renderSignals()+renderTrades()+renderSystem();
  const gen=N(S.generatedAt||lastGoodAt,lastGoodAt);
  const age=Date.now()-gen;
  const badge=document.getElementById('syncBadge');
  const txt=document.getElementById('syncText');
  badge.classList.toggle('stale',age>30000&&navigator.onLine);
  badge.classList.toggle('offline',!navigator.onLine);
  txt.textContent=!navigator.onLine?'OFFLINE':age>30000?'STALE '+AGE(gen):'LIVE '+AGE(gen);
}

async function refresh(){
  if(refreshing)return;
  refreshing=true;loadLine.className='loadingLine on';
  try{
    const r=await fetch('/mission-control.json',{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    S=await r.json();lastGoodAt=Date.now();errorBox.classList.remove('show');render();
    if(TAB==='decisions')loadSignalLab(false);
  }catch(err){
    errorBox.classList.add('show');render();
  }finally{
    refreshing=false;loadLine.className='loadingLine done';setTimeout(()=>{loadLine.className='loadingLine'},300);
  }
}
nav.addEventListener('click',e=>{
  const b=e.target.closest('button[data-tab]');if(!b)return;
  TAB=b.dataset.tab;
  for(const x of nav.querySelectorAll('button'))x.classList.toggle('active',x===b);
  render();window.scrollTo({top:0,behavior:'smooth'});
  if(TAB==='decisions')loadSignalLab(false);
});
root.addEventListener('click',e=>{
  const symbol=e.target.closest('[data-signal-symbol]');if(symbol){SIGNAL.symbol=symbol.getAttribute('data-signal-symbol');SIGNAL.lab=null;SIGNAL.proof=null;render();loadSignalLab(true);return;}
  const horizon=e.target.closest('[data-signal-horizon]');if(horizon){SIGNAL.horizon=horizon.getAttribute('data-signal-horizon');SIGNAL.lab=null;render();loadSignalLab(true);return;}
  const mode=e.target.closest('[data-signal-mode]');if(mode){SIGNAL.mode=mode.getAttribute('data-signal-mode');SIGNAL.lab=null;render();loadSignalLab(true);return;}
});
document.getElementById('refreshBtn').addEventListener('click',()=>{refresh();if(TAB==='decisions')loadSignalLab(true)});
window.addEventListener('online',()=>{render();refresh()});
window.addEventListener('offline',render);
render();
setInterval(refresh,10000);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
</script>
</body>
</html>`;
  return html.replace('__BIGGJ_BOOT__',boot);
}
