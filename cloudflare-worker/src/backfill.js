const BYBIT_REST = "https://api.bybit.com";

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "user-agent": "BTC-Trading-Center-Backfill/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (Number(data?.retCode || 0) !== 0) {
    throw new Error(`Bybit ${data?.retCode}: ${data?.retMsg || "error"}`);
  }
  return data?.result || {};
}

async function get(path, params) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([,v]) => v !== undefined && v !== null)
      .map(([k,v]) => [k, String(v)])
  );
  return fetchJson(`${BYBIT_REST}${path}?${qs.toString()}`);
}

export async function fetch5mPage(start, end, limit = 1000) {
  const result = await get("/v5/market/kline", {
    category: "spot",
    symbol: "BTCUSDT",
    interval: "5",
    start,
    end,
    limit
  });
  const rows = Array.isArray(result?.list) ? result.list : [];
  return rows.map(k => ({
    t: Number(k[0]),
    o: Number(k[1]),
    h: Number(k[2]),
    l: Number(k[3]),
    c: Number(k[4]),
    v: Number(k[5])
  })).filter(x => Number.isFinite(x.t)).sort((a,b) => a.t-b.t);
}

export async function fetchOpenInterestPage(start, end, limit = 200) {
  const result = await get("/v5/market/open-interest", {
    category: "linear",
    symbol: "BTCUSDT",
    intervalTime: "5min",
    startTime: start,
    endTime: end,
    limit
  });
  const rows = Array.isArray(result?.list) ? result.list : [];
  return rows.map(x => ({
    ts: Number(x.timestamp),
    value: Number(x.openInterest)
  })).filter(x => Number.isFinite(x.ts) && Number.isFinite(x.value))
    .sort((a,b) => a.ts-b.ts);
}

export async function fetchLongShortPage(start, end, limit = 500) {
  const result = await get("/v5/market/account-ratio", {
    category: "linear",
    symbol: "BTCUSDT",
    period: "5min",
    startTime: start,
    endTime: end,
    limit
  });
  const rows = Array.isArray(result?.list) ? result.list : [];
  return rows.map(x => ({
    ts: Number(x.timestamp),
    longRatio: Number(x.buyRatio),
    shortRatio: Number(x.sellRatio)
  })).filter(x =>
    Number.isFinite(x.ts) &&
    Number.isFinite(x.longRatio) &&
    Number.isFinite(x.shortRatio)
  ).sort((a,b) => a.ts-b.ts);
}

export async function fetchFundingPage(start, end, limit = 200) {
  const result = await get("/v5/market/funding/history", {
    category: "linear",
    symbol: "BTCUSDT",
    startTime: start,
    endTime: end,
    limit
  });
  const rows = Array.isArray(result?.list) ? result.list : [];
  return rows.map(x => ({
    ts: Number(x.fundingRateTimestamp),
    rate: Number(x.fundingRate)
  })).filter(x => Number.isFinite(x.ts) && Number.isFinite(x.rate))
    .sort((a,b) => a.ts-b.ts);
}

export async function fetchHourlyCrossAssetPage(symbol, start, end, limit = 1000) {
  const result = await get("/v5/market/kline", {
    category: "spot",
    symbol,
    interval: "60",
    start,
    end,
    limit
  });
  const rows = Array.isArray(result?.list) ? result.list : [];
  const candles = rows.map(k => ({
    ts: Number(k[0]),
    close: Number(k[4])
  })).filter(x => Number.isFinite(x.ts) && Number.isFinite(x.close))
    .sort((a,b) => a.ts-b.ts);

  return candles.map((x,i) => ({
    ts: x.ts,
    symbol,
    close: x.close,
    ret5m: null,
    ret60m: i > 0 && candles[i-1].close ? x.close / candles[i-1].close - 1 : null
  }));
}

export function freshBackfillState(days = 90) {
  const now = Date.now();
  const end = Math.floor(now / (5*60_000)) * 5*60_000 - 1;
  const start = end - days * 24 * 60 * 60 * 1000;
  return {
    version: 1,
    active: true,
    completed: false,
    days,
    startedAt: now,
    finishedAt: null,
    stage: "candles",
    start,
    end,
    cursor: end,
    pages: 0,
    rows: {
      candles: 0,
      patterns: 0,
      openInterest: 0,
      longShort: 0,
      funding: 0,
      crossAssets: 0
    },
    writesToday: 0,
    writeDay: new Date(now).toISOString().slice(0,10),
    pauseUntil: null,
    futureOverlap: [],
    crossSymbolIndex: 0,
    lastError: null,
    lastStepAt: null
  };
}
