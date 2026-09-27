export const TCX_TELEGRAM_PRODUCT_UI_VERSION = "v1";

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
  return [
    "🧠 TCX v2 · COMMAND CENTER",
    "",
    "System: "+safeText(systemStatus),
    "Mode: SHADOW_ONLY",
    "Action: ABSTAIN",
    "Markets: "+(Number(marketCount)||0),
    "",
    "Market intelligence · no order execution"
  ].join("\n");
}

export function homeKeyboard() {
  return {inline_keyboard:[
    [
      {text:"📊 Märkte",callback_data:"home:markets"},
      {text:"🧠 TCX Radar",callback_data:"home:radar"}
    ],
    [
      {text:"⭐ Watchlist",callback_data:"home:watchlist"},
      {text:"🔔 Alerts",callback_data:"home:alerts"}
    ],
    [
      {text:"📈 Performance",callback_data:"home:performance"},
      {text:"🩺 System",callback_data:"home:system"}
    ],
    [{text:"⚙️ Einstellungen",callback_data:"home:settings"}]
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
  const lines=[
    "📊 "+vm.symbol.replace("USDT","/USDT"),
    "",
    "Preis: "+fmt(p.price,p.price!=null&&Math.abs(p.price)<1?6:2)+" USDT",
    "24h: "+(p.change24hPct==null?"—":sign+fmt(p.change24hPct,2)+" %"),
    "Spread: "+fmt(p.spreadBps,3)+" bps",
    "",
    "Regime: "+vm.state.regime,
    "MTF: "+vm.state.mtfBias,
    "Liquidity: "+vm.state.liquidity,
    "Flow: "+vm.state.flow,
    "",
    "TCX Status: "+vm.safety.status,
    "Action: "+vm.safety.action+" / "+vm.safety.execution
  ];

  if(detailMode!=="SIMPLE") {
    lines.push(
      "",
      "Witness agreement: "+(vm.evidence.witnessAgreement==null?"—":fmt(vm.evidence.witnessAgreement*100,0)+" %"),
      "Memory support: "+(vm.evidence.memorySupport??"—"),
      "Data quality: "+(vm.evidence.dataQuality==null?"—":fmt(vm.evidence.dataQuality,1))
    );
  }
  if(detailMode==="RESEARCH") {
    lines.push(
      "",
      "availableAt: "+(vm.provenance.availableAt?new Date(vm.provenance.availableAt).toISOString():"—"),
      "source: "+vm.provenance.source,
      "version: "+vm.provenance.version
    );
  }

  lines.push("",live?"⚡ LIVE":"⏸ Live aus");
  return lines.join("\n");
}

export function marketProductKeyboard(symbol,{live=false,isFavorite=false}={}) {
  const s=String(symbol||"").toUpperCase();
  if(!s) throw new Error("symbol required");
  return {inline_keyboard:[
    [
      {text:"📈 Chart",callback_data:"chart:"+s+":5m"},
      {text:"🧠 TCX",callback_data:"tcx:"+s}
    ],
    [
      {text:"❓ Warum?",callback_data:"why:"+s},
      {text:"🧬 Regime",callback_data:"regime:"+s}
    ],
    [
      {text:"🧬 Memory",callback_data:"memory:"+s},
      {text:"🛰 Witness",callback_data:"witness:"+s}
    ],
    [
      {text:"🔔 Alert",callback_data:"alerthelp:"+s},
      {text:isFavorite?"★ Favorit":"☆ Favorit",callback_data:"fav:"+s}
    ],
    [
      {text:live?"⏸ Live aus":"⚡ Live an",callback_data:"live:"+s+":"+(live?"off":"on")},
      {text:"🔄 Update",callback_data:"refresh:"+s}
    ],
    [{text:"🏠 Home",callback_data:"home"}]
  ]};
}

export function parseProductCallback(data="") {
  const raw=String(data);
  if(raw==="home") return {kind:"HOME"};
  if(raw.startsWith("home:")) return {kind:"HOME_SECTION",section:raw.slice(5).toUpperCase()};
  const p=raw.split(":");
  if(p[0]==="why"&&p[1]) return {kind:"WHY",symbol:p[1]};
  if(p[0]==="regime"&&p[1]) return {kind:"REGIME",symbol:p[1]};
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
