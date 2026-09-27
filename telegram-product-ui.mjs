export const TCX_TELEGRAM_PRODUCT_UI_VERSION = "v4-autolearn";

export const PRODUCT_STATUS = Object.freeze([
  "VALID",
  "CAUTION",
  "ABSTAIN",
  "SAFE_STOP",
  "DATA_STALE",
  "OUT_OF_DISTRIBUTION",
  "INSUFFICIENT_SUPPORT",
  "PROVIDER_CONFLICT"
]);

const HARD_SAFETY = Object.freeze({
  execution:"SHADOW_ONLY",
  action:"ABSTAIN",
  canExecute:false
});

function finite(v) {
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

function clamp01(v) {
  const n=finite(v);
  return n==null ? null : Math.max(0,Math.min(1,n));
}

function safeText(v,fallback="—") {
  const s=String(v ?? "").trim();
  return s || fallback;
}

function fmt(v,d=2) {
  const n=finite(v);
  if(n==null) return "—";
  return n.toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
}

export function normalizeProductStatus(input={}) {
  const reasons=[];
  const safety=String(input?.safetyState||input?.status||"").toUpperCase();
  if(safety==="SAFE_STOP") return {status:"SAFE_STOP",reasons:["institutional safety stop"]};

  if(input?.dataStale===true) reasons.push("data stale");
  if(input?.providerConflict===true) reasons.push("provider conflict");
  if(input?.outOfDistribution===true) reasons.push("out of distribution");
  if(input?.insufficientSupport===true) reasons.push("insufficient historical support");
  if(input?.caution===true) reasons.push("degraded evidence");

  if(reasons.includes("data stale")) return {status:"DATA_STALE",reasons};
  if(reasons.includes("provider conflict")) return {status:"PROVIDER_CONFLICT",reasons};
  if(reasons.includes("out of distribution")) return {status:"OUT_OF_DISTRIBUTION",reasons};
  if(reasons.includes("insufficient historical support")) return {status:"INSUFFICIENT_SUPPORT",reasons};
  if(input?.abstain===true || safety==="ABSTAIN") return {status:"ABSTAIN",reasons};
  if(reasons.length) return {status:"CAUTION",reasons};
  return {status:"VALID",reasons:[]};
}

export function buildMarketViewModel({
  symbol,
  snapshot={},
  dashboard={},
  structure={},
  witness={},
  memory={},
  safety={},
  generatedAt=Date.now()
}={}) {
  if(!symbol) throw new Error("symbol required");
  const product=normalizeProductStatus({
    safetyState:safety?.state,
    dataStale:safety?.dataStale,
    providerConflict:safety?.providerConflict,
    outOfDistribution:safety?.outOfDistribution,
    insufficientSupport:safety?.insufficientSupport,
    caution:safety?.caution,
    abstain:true
  });

  return Object.freeze({
    schemaVersion:"tcx.market-view.v1",
    symbol:String(symbol).toUpperCase(),
    generatedAt:Number(generatedAt),
    market:Object.freeze({
      price:finite(snapshot?.price),
      change24hPct:finite(snapshot?.changePct),
      bid:finite(snapshot?.bid),
      ask:finite(snapshot?.ask),
      spreadBps:finite(snapshot?.spreadBps),
      high24h:finite(snapshot?.high),
      low24h:finite(snapshot?.low),
      quoteVolume:finite(snapshot?.volumeQuote)
    }),
    state:Object.freeze({
      regime:safeText(dashboard?.regime),
      mtfBias:safeText(dashboard?.bias),
      structure:safeText(structure?.state||structure?.bias),
      liquidity:safeText(dashboard?.liquidity),
      flow:safeText(dashboard?.flow),
      pressure:finite(dashboard?.pressureScore)
    }),
    evidence:Object.freeze({
      witnessAgreement:clamp01(witness?.agreement ?? witness?.totalAgreement),
      witnessUsable:Boolean(witness?.usable ?? witness?.independentWitnessSatisfied),
      memorySupport:finite(memory?.supportCount ?? memory?.count),
      novelty:finite(memory?.novelty),
      contradiction:finite(memory?.contradiction),
      dataQuality:finite(safety?.dataQuality)
    }),
    safety:Object.freeze({
      status:product.status,
      reasons:Object.freeze([...(safety?.reasons||[]),...product.reasons].map(String)),
      ...HARD_SAFETY
    }),
    provenance:Object.freeze({
      timestamp:finite(snapshot?.timestamp),
      availableAt:finite(snapshot?.availableAt),
      source:safeText(snapshot?.source),
      version:safeText(snapshot?.version)
    })
  });
}

export function homeText({marketCount=0,systemStatus="ONLINE"}={}) {
  const online=String(systemStatus).toUpperCase()==="ONLINE";
  return [
    "⚡ TCX · MARKT- & PROGNOSE-SYSTEM",
    "",
    "TCX analysiert Kryptomärkte, vergleicht mehrere Datenquellen",
    "und lernt aus früheren Marktsituationen.",
    "",
    (online?"🟢":"🟡")+" System: "+safeText(systemStatus),
    "📊 Beobachtete Märkte: "+(Number(marketCount)||0),
    "",
    "Wichtig: TCX führt keine echten Käufe oder Verkäufe aus.",
    "Es bewertet den Markt und zeigt Unsicherheit sichtbar an.",
    "",
    "Was möchtest du machen?"
  ].join("\n");
}

export function homeKeyboard() {
  return {inline_keyboard:[
    [
      {text:"🔮 Kursprognose",callback_data:"cmd:forecast"},
      {text:"📊 Coin analysieren",callback_data:"home:markets"}
    ],
    [
      {text:"🎯 Auffällige Bewegungen",callback_data:"home:radar"},
      {text:"🐸 Memecoin-Radar",callback_data:"home:memecoins"}
    ],
    [
      {text:"🧭 Stimmung & Trends",callback_data:"home:trends"},
      {text:"⭐ Watchlist",callback_data:"home:watchlist"}
    ],
    [
      {text:"🔔 Alerts",callback_data:"home:alerts"},
      {text:"🧪 TCX Lernzentrum",callback_data:"home:performance"}
    ],
    [
      {text:"💼 Shadow-Portfolio",callback_data:"home:portfolio"},
      {text:"📈 Trade-Statistik",callback_data:"home:stats_day"}
    ],
    [
      {text:"🏆 Capital Academy",callback_data:"home:academy"},
      {text:"🧠 Training Coach",callback_data:"home:coach"}
    ],
    [
      {text:"🖥 System",callback_data:"home:system"},
      {text:"⚙️ Alle Funktionen",callback_data:"commands"}
    ]
  ]};
}

export function marketsKeyboard(markets=[],favoritesCount=0) {
  const rows=[];
  for(let i=0;i<markets.length;i+=2) {
    rows.push(markets.slice(i,i+2).map(m=>({
      text:safeText(m.icon,"•")+" "+safeText(m.label,m.symbol),
      callback_data:"market:"+m.symbol
    })));
  }
  rows.push([
    {text:"⭐ Favoriten"+(favoritesCount?" ("+favoritesCount+")":""),callback_data:"favorites"},
    {text:"🔎 Suche",callback_data:"searchhelp"}
  ]);
  rows.push([{text:"🏠 Home",callback_data:"home"}]);
  return {inline_keyboard:rows};
}

export function marketCardText(vm,{live=false,detailMode="SIMPLE"}={}) {
  if(!vm?.market || !vm?.state || !vm?.safety) throw new Error("invalid MarketViewModel");
  const p=vm.market;
  const sign=(p.change24hPct??0)>=0?"+":"";
  const rawBias=String(vm.state.mtfBias||"").toUpperCase();
  const rawFlow=String(vm.state.flow||"").toUpperCase();
  const rawRegime=String(vm.state.regime||"").toUpperCase();
  const direction=rawBias.includes("BULL")||rawBias.includes("UP")
    ?"🟢 eher steigend"
    :rawBias.includes("BEAR")||rawBias.includes("DOWN")
      ?"🔴 eher fallend"
      :"🟡 keine klare Richtung";
  const pressure=rawFlow.includes("BID")||rawFlow.includes("BUY")
    ?"🟢 Käufer stärker"
    :rawFlow.includes("ASK")||rawFlow.includes("SELL")
      ?"🔴 Verkäufer stärker"
      :rawFlow.includes("BALANC")
        ?"⚪ ausgeglichen"
        :"⚪ noch unklar";
  const phase=rawRegime.includes("TREND")
    ?"Trendmarkt"
    :rawRegime.includes("RANGE")||rawRegime.includes("SIDE")
      ?"Seitwärtsmarkt"
      :rawRegime.includes("VOL")
        ?"stark schwankender Markt"
        :safeText(vm.state.regime,"noch unklar");
  const risk=vm.safety.status==="VALID"
    ?"🟢 normal"
    :vm.safety.status==="CAUTION"
      ?"🟡 erhöht"
      :"🔴 hoch / Aussage eingeschränkt";
  const simpleSummary=direction.includes("steigend")
    ?"Mehr Signale zeigen aktuell nach oben, aber die Lage kann sich ändern."
    :direction.includes("fallend")
      ?"Mehr Signale zeigen aktuell nach unten, aber die Lage kann sich ändern."
      :"TCX sieht gerade keinen eindeutigen Vorteil für steigende oder fallende Kurse.";

  const lines=[
    "📊 "+vm.symbol.replace("USDT","/USDT")+" · MARKTCHECK",
    "",
    "Preis: "+fmt(p.price,p.price!=null&&Math.abs(p.price)<1?6:2)+" USDT",
    "24 Stunden: "+(p.change24hPct==null?"—":sign+fmt(p.change24hPct,2)+" %"),
    "",
    "TCX EINSCHÄTZUNG",
    "Richtung: "+direction,
    "Marktphase: "+phase,
    "Kauf-/Verkaufsdruck: "+pressure,
    "Risiko: "+risk,
    "",
    "EINFACH GESAGT",
    simpleSummary
  ];

  if(detailMode!=="SIMPLE") {
    lines.push(
      "",
      "PROFI-DETAILS",
      "Regime: "+vm.state.regime,
      "MTF-Bias: "+vm.state.mtfBias,
      "Liquidität: "+vm.state.liquidity,
      "Flow: "+vm.state.flow,
      "Spread: "+fmt(p.spreadBps,3)+" bps",
      "Quellen-Übereinstimmung: "+(vm.evidence.witnessAgreement==null?"—":fmt(vm.evidence.witnessAgreement*100,0)+" %"),
      "Historische Vergleichsfälle: "+(vm.evidence.memorySupport??"—"),
      "Datenqualität: "+(vm.evidence.dataQuality==null?"—":fmt(vm.evidence.dataQuality,1))
    );
  }
  if(detailMode==="RESEARCH") {
    lines.push(
      "",
      "FORSCHUNGSDATEN",
      "availableAt: "+(vm.provenance.availableAt?new Date(vm.provenance.availableAt).toISOString():"—"),
      "source: "+vm.provenance.source,
      "version: "+vm.provenance.version
    );
  }

  lines.push(
    "",
    live?"⚡ Live-Aktualisierung aktiv":"⏸ Einmalige Ansicht",
    "Systemmodus: ABSTAIN / SHADOW_ONLY"
  );
  return lines.join("\n");
}

export function marketProductKeyboard(symbol,{live=false,isFavorite=false}={}) {
  const s=String(symbol||"").toUpperCase();
  if(!s) throw new Error("symbol required");
  return {inline_keyboard:[
    [
      {text:"🔮 Prognose",callback_data:"forecast:"+s},
      {text:"🔎 Warum?",callback_data:"why:"+s}
    ],
    [
      {text:"📈 Chart",callback_data:"chart:"+s+":5m"},
      {text:"🧭 Marktstruktur",callback_data:"regime:"+s}
    ],
    [
      {text:"🔔 Alert",callback_data:"alerthelp:"+s},
      {text:isFavorite?"★ Beobachtet":"☆ Beobachten",callback_data:"fav:"+s}
    ],
    [
      {text:"🧠 Profi-Details",callback_data:"tcx:"+s},
      {text:"🔄 Aktualisieren",callback_data:"refresh:"+s}
    ],
    [
      {text:live?"⏸ Live aus":"⚡ Live an",callback_data:"live:"+s+":"+(live?"off":"on")},
      {text:"🏠 Start",callback_data:"home"}
    ]
  ]};
}

export function parseProductCallback(data="") {
  const raw=String(data);
  if(raw==="home") return {kind:"HOME"};
  if(raw.startsWith("home:")) return {kind:"HOME_SECTION",section:raw.slice(5).toUpperCase()};
  const p=raw.split(":");
  if(p[0]==="forecast"&&p[1]) return {kind:"FORECAST",symbol:p[1]};
  if(p[0]==="why"&&p[1]) return {kind:"WHY",symbol:p[1]};
  if(p[0]==="regime"&&p[1]) return {kind:"REGIME",symbol:p[1]};
  if(p[0]==="oms"&&p[1]) return {kind:"OMS",symbol:p[1]};
  if(p[0]==="sor"&&p[1]) return {kind:"SOR",symbol:p[1]};
  if(p[0]==="vqm"&&p[1]) return {kind:"VQM",symbol:p[1]};
  if(p[0]==="erl"&&p[1]) return {kind:"ERL",symbol:p[1]};
  if(p[0]==="evidence"&&p[1]) return {kind:"EVIDENCE",symbol:p[1]};
  if(p[0]==="lineage"&&p[1]) return {kind:"LINEAGE",symbol:p[1]};
  if(p[0]==="history"&&p[1]) return {kind:"HISTORY",symbol:p[1]};
  if(p[0]==="validity"&&p[1]) return {kind:"VALIDITY",symbol:p[1]};
  if(p[0]==="replaymenu"&&p[1]) return {kind:"REPLAY_MENU",symbol:p[1]};
  return {kind:"UNKNOWN"};
}

export function assertTelegramKeyboardSafe(kb) {
  const rows=kb?.inline_keyboard;
  if(!Array.isArray(rows)) throw new Error("inline_keyboard required");
  for(const row of rows) {
    if(!Array.isArray(row)||row.length===0) throw new Error("empty keyboard row");
    for(const button of row) {
      if(typeof button?.text!=="string"||!button.text) throw new Error("button text required");
      if(button.callback_data && Buffer.byteLength(button.callback_data,"utf8")>64) {
        throw new Error("callback_data too long: "+button.callback_data);
      }
    }
  }
  return true;
}
