function simpleHash(text) {
  let h1 = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h1 ^= text.charCodeAt(i);
    h1 = Math.imul(h1, 16777619);
  }
  return (h1 >>> 0).toString(16);
}

function parseSeenDate(value) {
  if (!value) return Date.now();
  if (/^\d{14}$/.test(value)) {
    const y = Number(value.slice(0,4));
    const m = Number(value.slice(4,6)) - 1;
    const d = Number(value.slice(6,8));
    const hh = Number(value.slice(8,10));
    const mm = Number(value.slice(10,12));
    const ss = Number(value.slice(12,14));
    return Date.UTC(y,m,d,hh,mm,ss);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function classifyHeadline(title = "") {
  const t = title.toLowerCase();
  const has = (...xs) => xs.some(x => t.includes(x));
  if (has("bitcoin","crypto","ethereum","stablecoin","coinbase","binance","digital asset")) return "crypto";
  if (has("federal reserve","fed ","ecb","central bank","interest rate","rate cut","rate hike")) return "central_bank";
  if (has("inflation","cpi","producer price","jobs report","payroll","employment","unemployment")) return "inflation_jobs";
  if (has("bank failure","bank run","liquidity crisis","credit suisse","deutsche bank")) return "banking";
  if (has("war","invasion","missile","attack","ceasefire","sanction","nuclear")) return "geopolitics";
  if (has("tariff","trade war","export ban","import ban")) return "trade";
  if (has("oil","opec","natural gas","energy price")) return "energy";
  if (has("election","president","prime minister","parliament")) return "politics";
  if (has("stock market","nasdaq","s&p","dow jones","recession","gdp")) return "markets_macro";
  return "other";
}

export function isCriticalHeadline(title = "", category = "") {
  const t = title.toLowerCase();
  if (category === "central_bank" && /(emergency|decision|rate cut|rate hike|unexpected)/.test(t)) return true;
  if (category === "banking" && /(failure|collapse|bank run|insolvent|bailout)/.test(t)) return true;
  if (category === "geopolitics" && /(attack|missile|invasion|nuclear|war begins|airstrike)/.test(t)) return true;
  if (category === "crypto" && /(hack|exploit|etf|ban|sec |liquidat|bankrupt|outage)/.test(t)) return true;
  if (category === "markets_macro" && /(crash|circuit breaker|recession|emergency)/.test(t)) return true;
  return false;
}

export async function fetchGlobalMarketNews() {
  const query = [
    "bitcoin","cryptocurrency","Federal Reserve","inflation","interest rate",
    "recession","bank failure","sanctions","war","invasion","missile",
    "tariff","oil","stock market"
  ].map(x => x.includes(" ") ? `"${x}"` : x).join(" OR ");

  const url = "https://api.gdeltproject.org/api/v2/doc/doc?" + new URLSearchParams({
    query: `(${query})`,
    mode: "artlist",
    format: "json",
    maxrecords: "25",
    timespan: "15min",
    sort: "datedesc"
  }).toString();

  const r = await fetch(url, { headers: { "user-agent": "BTC-Trading-Center/1.0" } });
  if (!r.ok) throw new Error(`GDELT HTTP ${r.status}`);
  const data = await r.json();
  const articles = Array.isArray(data?.articles) ? data.articles : [];

  return articles.map(a => {
    const title = String(a.title || "").trim();
    const articleUrl = String(a.url || "").trim();
    return {
      fingerprint: simpleHash(title + "|" + articleUrl),
      publishedTs: parseSeenDate(a.seendate || a.seenDate || a.date),
      title,
      url: articleUrl,
      domain: a.domain || null,
      country: a.sourcecountry || a.sourceCountry || null,
      category: classifyHeadline(title),
      critical: isCriticalHeadline(title, classifyHeadline(title))
    };
  }).filter(x => x.title);
}
