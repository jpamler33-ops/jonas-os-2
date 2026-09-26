import { DurableObject } from "cloudflare:workers";
import { TradingCenter, renderTradingCenter } from "./trading_center.js";
import { fetchGlobalMarketNews } from "./news_radar.js";
import {
  fetch5mPage,
  fetchOpenInterestPage,
  fetchLongShortPage,
  fetchFundingPage,
  fetchHourlyCrossAssetPage,
  freshBackfillState
} from "./backfill.js";
import { evaluateReplaySetup, simulateOutcome } from "./replay_engine.js";
import { fetchOfficialMacroEvents } from "./macro_calendar.js";
import { fetchKrakenMicrostructure } from "./kraken_analytics.js";
import { fetchMacroMarketContext } from "./macro_market_context.js";

const SYMBOL = "BTCUSDT";
const WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@kline_1m";
const BYBIT_REST = "https://api.bybit.com";
const BYBIT_WS_LINEAR = "wss://stream.bybit.com/v5/public/linear";
const REST_BASES = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api.binance.us"
];

const EMA_FAST = 20;
const EMA_SLOW = 50;
const PIVOT_WINDOW = 2;
const RETEST_TOL = 0.0012;
const STOP_BUFFER = 0.0005;
const MIN_RR = 2.0;

const RADAR_DISTANCE = 0.0060;
const PREPARE_DISTANCE = 0.0035;
const GET_READY_DISTANCE = 0.0015;
const DO_NOT_CHASE_DISTANCE = 0.0020;
const HEARTBEAT_MS = 12 * 60 * 60 * 1000;

function ema(values, period) {
  if (!values.length) return [];
  const a = 2 / (period + 1);
  const out = [values[0]];
  for (const value of values.slice(1)) {
    out.push(a * value + (1 - a) * out[out.length - 1]);
  }
  return out;
}

function pivots(candles, window = PIVOT_WINDOW) {
  const out = [];
  for (let i = window; i < candles.length - window; i++) {
    const slice = candles.slice(i - window, i + window + 1);
    const hs = slice.map(x => x.h);
    const ls = slice.map(x => x.l);
    const maxH = Math.max(...hs);
    const minL = Math.min(...ls);
    if (candles[i].h === maxH && hs.filter(x => x === maxH).length === 1) {
      out.push({ i, price: candles[i].h, kind: "H" });
    }
    if (candles[i].l === minL && ls.filter(x => x === minL).length === 1) {
      out.push({ i, price: candles[i].l, kind: "L" });
    }
  }
  return out.sort((a, b) => a.i - b.i);
}

function marketTrend(candles) {
  const ps = pivots(candles);
  const highs = ps.filter(p => p.kind === "H").slice(-2);
  const lows = ps.filter(p => p.kind === "L").slice(-2);
  if (highs.length < 2 || lows.length < 2) return "NEUTRAL";
  if (highs[1].price > highs[0].price && lows[1].price > lows[0].price) return "BULLISH";
  if (highs[1].price < highs[0].price && lows[1].price < lows[0].price) return "BEARISH";
  return "NEUTRAL";
}

function biasScore(trends) {
  let score = 0;
  for (const [tf, weight] of [["4h", 2], ["1h", 2], ["15m", 1]]) {
    if (trends[tf] === "BULLISH") score += weight;
    else if (trends[tf] === "BEARISH") score -= weight;
  }
  return score;
}

function nearestLevels(candles, price) {
  const ps = pivots(candles.slice(-120));
  const lows = [...new Set(ps.filter(p => p.kind === "L" && p.price < price).map(p => p.price))]
    .sort((a, b) => b - a);
  const highs = [...new Set(ps.filter(p => p.kind === "H" && p.price > price).map(p => p.price))]
    .sort((a, b) => a - b);
  return {
    support: lows.length ? lows[0] : null,
    resistance: highs.length ? highs[0] : null
  };
}

function rr(entry, stop, target, side) {
  const risk = side === "LONG" ? entry - stop : stop - entry;
  const reward = side === "LONG" ? target - entry : entry - target;
  if (risk <= 0 || reward <= 0) return 0;
  return reward / risk;
}

function findBreakRetest(c, side, retestTol = RETEST_TOL) {
  const n = c.length;
  if (n < 40) return null;

  for (let b = Math.max(20, n - 9); b < n - 1; b++) {
    const history = c.slice(Math.max(0, b - 16), b);
    if (history.length < 10) continue;

    if (side === "LONG") {
      const level = Math.max(...history.map(x => x.h));
      if (c[b].c <= level) continue;
      if ((c[b].c - level) / level < 0.00015) continue;

      for (let r = b + 1; r < Math.min(n, b + 7); r++) {
        const touched = c[r].l <= level * (1 + retestTol);
        const held = c[r].c >= level * (1 - retestTol);
        if (touched && held && c[n - 1].c >= level) {
          return { side, level, break_i: b, retest_i: r, retest_low: c[r].l };
        }
      }
    } else {
      const level = Math.min(...history.map(x => x.l));
      if (c[b].c >= level) continue;
      if ((level - c[b].c) / level < 0.00015) continue;

      for (let r = b + 1; r < Math.min(n, b + 7); r++) {
        const touched = c[r].h >= level * (1 - retestTol);
        const held = c[r].c <= level * (1 + retestTol);
        if (touched && held && c[n - 1].c <= level) {
          return { side, level, break_i: b, retest_i: r, retest_high: c[r].h };
        }
      }
    }
  }
  return null;
}

function stageKey(stage, side, level) {
  const bucket = level ? Math.round(level / 25) * 25 : 0;
  return `${stage}|${side || "-"}|${bucket}`;
}

function fmt(x) {
  return typeof x === "number"
    ? x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
}

async function fetchJson(url, init = {}) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function bybitJson(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const data = await fetchJson(`${BYBIT_REST}${path}?${qs}`);
  if (Number(data?.retCode || 0) !== 0) {
    throw new Error(`Bybit ${data?.retCode}: ${data?.retMsg || "error"}`);
  }
  return data?.result || {};
}

async function fetchVenueSnapshot(binanceSpot) {
  const [spot,linear]=await Promise.all([
    bybitJson("/v5/market/tickers",{category:"spot",symbol:"BTCUSDT"}),
    bybitJson("/v5/market/tickers",{category:"linear",symbol:"BTCUSDT"})
  ]);
  const s=Array.isArray(spot?.list)?spot.list[0]:null;
  const p=Array.isArray(linear?.list)?linear.list[0]:null;
  return {
    ts:Date.now(),
    binanceSpot:Number(binanceSpot),
    bybitSpot:Number(s?.lastPrice),
    bybitPerp:Number(p?.lastPrice),
    bybitMark:Number(p?.markPrice),
    bybitIndex:Number(p?.indexPrice)
  };
}

async function fetchDerivativesData() {
  const [oi, funding, ratio] = await Promise.all([
    bybitJson("/v5/market/open-interest", {
      category: "linear",
      symbol: "BTCUSDT",
      intervalTime: "5min",
      limit: "2"
    }),
    bybitJson("/v5/market/funding/history", {
      category: "linear",
      symbol: "BTCUSDT",
      limit: "1"
    }),
    bybitJson("/v5/market/account-ratio", {
      category: "linear",
      symbol: "BTCUSDT",
      period: "5min",
      limit: "2"
    })
  ]);

  const oiRows = Array.isArray(oi?.list) ? oi.list : [];
  const fundRows = Array.isArray(funding?.list) ? funding.list : [];
  const ratioRows = Array.isArray(ratio?.list) ? ratio.list : [];

  return {
    openInterest: oiRows.map(x => ({
      ts: Number(x.timestamp),
      value: Number(x.openInterest)
    })).filter(x => Number.isFinite(x.ts) && Number.isFinite(x.value)),
    funding: fundRows.map(x => ({
      ts: Number(x.fundingRateTimestamp),
      rate: Number(x.fundingRate)
    })).filter(x => Number.isFinite(x.ts) && Number.isFinite(x.rate)),
    ratios: ratioRows.map(x => ({
      ts: Number(x.timestamp),
      longRatio: Number(x.buyRatio),
      shortRatio: Number(x.sellRatio)
    })).filter(x => Number.isFinite(x.ts) && Number.isFinite(x.longRatio) && Number.isFinite(x.shortRatio))
  };
}

async function fetchCrossAssets() {
  const symbols = ["ETHUSDT", "SOLUSDT", "BNBUSDT"];
  const now = Date.now();
  const out = [];

  for (const symbol of symbols) {
    const result = await bybitJson("/v5/market/kline", {
      category: "spot",
      symbol,
      interval: "5",
      limit: "20"
    });
    const rows = Array.isArray(result?.list) ? result.list : [];
    const candles = rows
      .map(k => ({
        ts: Number(k[0]),
        close: Number(k[4])
      }))
      .filter(x => Number.isFinite(x.ts) && Number.isFinite(x.close) && x.ts + 5*60_000 <= now)
      .sort((a,b) => a.ts-b.ts);

    if (candles.length < 13) continue;
    const last = candles.at(-1);
    const prev = candles.at(-2);
    const hourAgo = candles.at(-13);
    out.push({
      ts: last.ts,
      symbol,
      close: last.close,
      ret5m: prev?.close ? last.close/prev.close - 1 : null,
      ret60m: hourAgo?.close ? last.close/hourAgo.close - 1 : null
    });
  }
  return out;
}

async function getCandles(interval, limit = 260) {
  let lastError;
  for (const base of REST_BASES) {
    try {
      const raw = await fetchJson(
        `${base}/api/v3/klines?symbol=${SYMBOL}&interval=${interval}&limit=${limit}`
      );
      return raw.slice(0, -1).map(k => ({
        t: Number(k[0]),
        o: Number(k[1]),
        h: Number(k[2]),
        l: Number(k[3]),
        c: Number(k[4]),
        v: Number(k[5])
      }));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("market data unavailable");
}

async function fetchBookTicker() {
  let lastError;
  for (const base of REST_BASES) {
    try {
      const x = await fetchJson(`${base}/api/v3/ticker/bookTicker?symbol=${SYMBOL}`);
      const bid=Number(x.bidPrice), ask=Number(x.askPrice);
      const bidQty=Number(x.bidQty), askQty=Number(x.askQty);
      const mid=(bid+ask)/2;
      return {
        ts:Date.now(),
        bid,ask,bidQty,askQty,
        spreadBps:mid>0 ? (ask-bid)/mid*10000 : null,
        imbalance:(bidQty+askQty)>0 ? (bidQty-askQty)/(bidQty+askQty) : null
      };
    } catch (e) {
      lastError=e;
    }
  }
  throw lastError || new Error("book ticker unavailable");
}

async function buildContext() {
  const [c5, c15, c1h, c4h] = await Promise.all([
    getCandles("5m"),
    getCandles("15m"),
    getCandles("1h"),
    getCandles("4h")
  ]);

  const trends = {
    "5m": marketTrend(c5),
    "15m": marketTrend(c15),
    "1h": marketTrend(c1h),
    "4h": marketTrend(c4h)
  };
  const score = biasScore(trends);
  const price = c5[c5.length - 1].c;
  const closes = c5.map(x => x.c);
  const ema20 = ema(closes, EMA_FAST).at(-1);
  const ema50 = ema(closes, EMA_SLOW).at(-1);
  const { support, resistance } = nearestLevels(c15, price);

  return {
    updatedAt: Date.now(),
    price,
    trends,
    score,
    ema20,
    ema50,
    support,
    resistance,
    c5
  };
}

function evaluateConfirmed(ctx, opts = {}) {
  const { c5, price, ema20, ema50, resistance, support, trends } = ctx;
  const retestTol = Number(opts.retestTol ?? RETEST_TOL);
  const stopBuffer = Number(opts.stopBuffer ?? STOP_BUFFER);
  const minRR = Number(opts.minRR ?? MIN_RR);
  const maxExtension = Number(opts.maxExtension ?? DO_NOT_CHASE_DISTANCE);
  const longPattern = findBreakRetest(c5, "LONG", retestTol);
  const shortPattern = findBreakRetest(c5, "SHORT", retestTol);

  const fresh = p => p && p.retest_i >= c5.length - 2 &&
    Math.abs(price - p.level) / Math.max(1e-9, p.level) <= maxExtension;

  const macroLong = trends?.["4h"] === "BULLISH" &&
    trends?.["1h"] === "BULLISH" &&
    trends?.["15m"] !== "BEARISH";
  const macroShort = trends?.["4h"] === "BEARISH" &&
    trends?.["1h"] === "BEARISH" &&
    trends?.["15m"] !== "BULLISH";

  if (fresh(longPattern) && macroLong && price > ema20 && price > ema50) {
    const lows = pivots(c5.slice(-80))
      .filter(p => p.kind === "L" && p.price < price)
      .map(p => p.price);
    let baseStop = lows.slice(-3).length ? Math.max(...lows.slice(-3)) : longPattern.retest_low;
    baseStop = Math.min(baseStop, longPattern.retest_low);
    const stop = baseStop * (1 - stopBuffer);
    if (resistance && resistance > price) {
      const ratio = rr(price, stop, resistance, "LONG");
      if (ratio >= minRR) {
        return {
          decision: "LONG SETUP",
          side: "LONG",
          entry: price,
          stop,
          target: resistance,
          rr: ratio,
          level: longPattern.level
        };
      }
    }
  }

  if (fresh(shortPattern) && macroShort && price < ema20 && price < ema50) {
    const highs = pivots(c5.slice(-80))
      .filter(p => p.kind === "H" && p.price > price)
      .map(p => p.price);
    let baseStop = highs.slice(-3).length ? Math.min(...highs.slice(-3)) : shortPattern.retest_high;
    baseStop = Math.max(baseStop, shortPattern.retest_high);
    const stop = baseStop * (1 + stopBuffer);
    if (support && support < price) {
      const ratio = rr(price, stop, support, "SHORT");
      if (ratio >= minRR) {
        return {
          decision: "SHORT SETUP",
          side: "SHORT",
          entry: price,
          stop,
          target: support,
          rr: ratio,
          level: shortPattern.level
        };
      }
    }
  }

  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const stub = env.RADAR.getByName("btc");
    const adminToken=env.ADMIN_TOKEN;
    const supplied=request.headers.get("x-admin-token") ||
      (request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    const isAdmin=Boolean(adminToken && supplied===adminToken);
    const destructiveBackfill =
      url.pathname==="/backfill/step" ||
      (url.pathname==="/backfill/start" && url.searchParams.get("force")==="1");
    if(destructiveBackfill && !isAdmin) {
      return Response.json({ok:false,error:"admin_required"},{status:403});
    }

    if (url.pathname === "/health") {
      return stub.fetch("https://radar/health");
    }
    if (url.pathname === "/start") {
      return stub.fetch("https://radar/start");
    }
    if (url.pathname === "/status") {
      return stub.fetch("https://radar/status");
    }
    if (url.pathname === "/test-telegram") {
      return stub.fetch("https://radar/test-telegram");
    }
    if (
      url.pathname === "/center" ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/backfill/") ||
      url.pathname.startsWith("/replay/") ||
      url.pathname.startsWith("/genome-backfill/")
    ) {
      return stub.fetch("https://radar" + url.pathname + url.search);
    }
    return new Response(
      "BTC Live Radar v2.1\n\n/center = Trading Center\n/start = start/reconnect\n/status = current state\n/health = health check\n/backfill/status = 90-day importer status\n/replay/status = no-lookahead replay status\n",
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  },

  async scheduled(controller, env, ctx) {
    const stub = env.RADAR.getByName("btc");
    ctx.waitUntil(stub.fetch("https://radar/tick"));
  }
};

export class RadarDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.ws = null;
    this.liqWs = null;
    this.context = null;
    this.center = new TradingCenter(ctx.storage.sql);
    this.mem = {
      lastStageKey: null,
      lastHeartbeat: 0,
      lastTelegramChat: null,
      lastNewsPoll: 0,
      lastNewsError: null,
      backfill: null,
      flow5m: null,
      bookTicker: null,
      replay: null,
      genomeBackfill: null,
      lastMacroPoll: 0,
      lastMacroError: null,
      lastKrakenAnalyticsAt: 0,
      lastKrakenAnalyticsError: null,
      lastMacroMarketPoll: 0,
      lastMacroMarketError: null
    };

    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("state");
      if (saved && typeof saved === "object") this.mem = { ...this.mem, ...saved };
      const context = await ctx.storage.get("context");
      if (context && typeof context === "object") this.context = context;
    });
  }

  async persist() {
    await this.ctx.storage.put("state", this.mem);
    if (this.context) await this.ctx.storage.put("context", this.context);
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;

    if (path === "/health") {
      // Self-healing health check: after a deploy or Durable Object restart,
      // immediately restore both market WebSockets instead of waiting for cron/alarm.
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        await this.ensureConnected();
      }
      if (!this.liqWs || this.liqWs.readyState !== WebSocket.OPEN) {
        await this.ensureLiquidationConnected();
      }

      // Give newly-created sockets a short moment to transition from CONNECTING -> OPEN.
      if (
        this.ws?.readyState === WebSocket.CONNECTING ||
        this.liqWs?.readyState === WebSocket.CONNECTING
      ) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }

      return Response.json({
        ok: true,
        connected: this.ws?.readyState === WebSocket.OPEN,
        liquidationConnected: this.liqWs?.readyState === WebSocket.OPEN,
        contextUpdatedAt: this.context?.updatedAt || null,
        lastStageKey: this.mem.lastStageKey || null,
        lastContextError: this.mem.lastContextError || null,
        lastContextAttempt: this.mem.lastContextAttempt || null,
        telegramConfigured: Boolean(this.env.TELEGRAM_BOT_TOKEN),
        lastTelegramOkAt: this.mem.lastTelegramOkAt || null,
        lastTelegramError: this.mem.lastTelegramError || null,
        backfill: this.backfillPublicState(),
        dataQuality: this.context ? this.center.dataQuality(this.context) : null,
        genomeRows: this.center.summary().genomeRows,
        orderflow5mRows: this.center.summary().orderflow5mRows,
        orderflowMode: "BINANCE_KLINE_TAKER_VOLUME_PLUS_BOOK_SNAPSHOT",
        venue: this.center.latestVenueSnapshot(),
        secondaryMicrostructure: this.center.latestSecondaryMicrostructure(),
        krakenAnalytics: {
          lastOkAt: this.mem.lastKrakenAnalyticsAt || null,
          lastError: this.mem.lastKrakenAnalyticsError || null
        },
        macroMarket: {
          health: this.center.macroMarketHealth(),
          summary: this.center.macroMarketSummary(),
          lastPoll: this.mem.lastMacroMarketPoll || null,
          lastError: this.mem.lastMacroMarketError || null
        },
        replay: this.replayPublicState(),
        genomeBackfill: this.genomeBackfillPublicState(),
        macro: {
          risk: this.center.macroRiskState(),
          calendar: this.center.macroCalendarHealth(),
          lastPoll: this.mem.lastMacroPoll || null,
          lastError: this.mem.lastMacroError || null
        },
        selfHealing: true
      });
    }

    if (path === "/status") {
      return Response.json({
        connected: this.ws?.readyState === WebSocket.OPEN,
        context: this.context,
        state: this.mem
      });
    }

    if (path === "/test-telegram") {
      const now=Date.now();
      if(now-Number(this.mem.lastTelegramTestAt||0)<60_000) {
        return Response.json({ok:false,error:"rate_limited",retryAfterSec:60},{status:429});
      }
      this.mem.lastTelegramTestAt=now;
      await this.persist();
      const ok = await this.sendTelegram(
        "BTC LIVE-RADAR — TEST\nTelegram-Verbindung funktioniert. Der Live-Radar ist aktiv."
      );
      return Response.json({
        ok,
        telegramConfigured: Boolean(this.env.TELEGRAM_BOT_TOKEN),
        hasCachedChatId: Boolean(this.mem.lastTelegramChat),
        lastTelegramError: this.mem.lastTelegramError || null,
        lastTelegramOkAt: this.mem.lastTelegramOkAt || null,
        lastNewsPoll: this.mem.lastNewsPoll || null,
        lastNewsError: this.mem.lastNewsError || null,
        database: this.center.summary(),
        externalMarket: this.center.externalMarketSummary(),
        macro: {
          risk:this.center.macroRiskState(),
          calendar:this.center.macroCalendarHealth(),
          lastError:this.mem.lastMacroError||null
        },
        secondaryMicrostructure: {
          summary:this.center.secondaryMicrostructureSummary(),
          lastOkAt:this.mem.lastKrakenAnalyticsAt||null,
          lastError:this.mem.lastKrakenAnalyticsError||null
        }
      });
    }

    if (path === "/center") {
      return new Response(renderTradingCenter(this.center.exportSnapshot()), {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
    if (path === "/api/center") {
      return Response.json(this.center.exportSnapshot());
    }
    if (path === "/api/setups") {
      return Response.json(this.center.recentSetups(100));
    }
    if (path === "/api/patterns") {
      return Response.json({
        stats: this.center.patternStats(),
        recent: this.center.recentPatterns(100)
      });
    }
    if (path === "/api/news") {
      return Response.json({
        stats: this.center.newsStats(),
        recent: this.center.recentNews(100)
      });
    }
    if (path === "/api/times") {
      return Response.json(this.center.setupTimeStats());
    }
    if (path === "/api/intelligence") {
      return Response.json({
        factorEdges: this.center.factorEdgeStats(),
        factorSnapshots: this.center.factorSnapshotStats(),
        alertFunnel: this.center.alertFunnel(),
        currentFactors: this.context ? this.center.factorsFromContext(this.context) : null,
        genome: this.context ? this.center.currentGenomeIntelligence(this.context, 20) : null,
        coverage: this.center.coverageReport(this.context)
      });
    }
    if (path === "/api/genome" || path === "/api/twins") {
      return Response.json(this.context
        ? this.center.currentGenomeIntelligence(this.context, 30)
        : {error:"context_not_ready"});
    }
    if (path === "/api/coverage" || path === "/api/data-quality") {
      return Response.json(this.center.coverageReport(this.context));
    }
    if (path === "/api/timeline") {
      return Response.json(this.center.recentTimeline(200));
    }
    if (path === "/api/research") {
      return Response.json(this.center.fullResearchReport(this.context));
    }

    if (path === "/api/macro") {
      return Response.json({
        risk:this.center.macroRiskState(),
        upcoming:this.center.upcomingMacro(30),
        stats:this.center.macroStats(),
        health:this.center.macroCalendarHealth(),
        lastPoll:this.mem.lastMacroPoll||null,
        lastError:this.mem.lastMacroError||null
      });
    }

    if (path === "/api/venues") {
      return Response.json(this.center.venueStats());
    }

    if (path === "/api/microstructure") {
      return Response.json({
        summary:this.center.secondaryMicrostructureSummary(),
        lastOkAt:this.mem.lastKrakenAnalyticsAt||null,
        lastError:this.mem.lastKrakenAnalyticsError||null
      });
    }

    if (path === "/api/macro-market") {
      return Response.json({
        summary:this.center.macroMarketSummary(),
        health:this.center.macroMarketHealth(),
        lastPoll:this.mem.lastMacroMarketPoll||null,
        lastError:this.mem.lastMacroMarketError||null
      });
    }

    if (path === "/api/risk") {
      return Response.json({
        policy:this.center.riskPolicyState(),
        equity:this.center.equityResearch()
      });
    }

    if (path === "/api/calibration") {
      return Response.json(this.center.probabilityCalibrationReport());
    }

    if (path === "/api/shadows") {
      return Response.json(this.center.shadowStrategyStats());
    }

    if (path === "/genome-backfill/status") {
      return Response.json({
        ok:true,
        genomeBackfill:this.genomeBackfillPublicState(),
        historicalGenomeRows:this.center.historicalGenomeCount()
      });
    }

    if (path === "/replay/status") {
      return Response.json({
        ok:true,
        replay:this.replayPublicState(),
        replayStats:this.center.replayStats(),
        parameterStability:this.center.parameterStabilityReport()
      });
    }

    if (path === "/backfill/status") {
      return Response.json({
        ok: true,
        backfill: this.backfillPublicState(),
        database: this.center.summary()
      });
    }
    if (path === "/backfill/start") {
      const url = new URL(request.url);
      const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days") || 90)));
      const force=url.searchParams.get("force")==="1";
      await this.ensureBackfillStarted(days, force);
      await this.runBackfillStep();
      return Response.json({ ok: true, backfill: this.backfillPublicState() });
    }
    if (path === "/backfill/step") {
      await this.ensureBackfillStarted(90, false);
      await this.runBackfillStep(true);
      return Response.json({ ok: true, backfill: this.backfillPublicState() });
    }

    if (path === "/start" || path === "/tick") {
      await this.refreshContext(path.slice(1));
      await this.ensureConnected();
      await this.ensureLiquidationConnected();
      await this.ensureHeartbeat();
      await this.ensureBackfillStarted(90, false);
      await this.runBackfillStep();
      await this.ensureGenomeBackfillStarted();
      await this.runGenomeBackfillStep();
      await this.ensureReplayStarted();
      await this.runReplayStep();
      await this.scheduleNextAlarm();
      return new Response("ok");
    }

    return new Response("not found", { status: 404 });
  }

  async alarm() {
    try {
      if (!this.context || Date.now() - (this.context.updatedAt || 0) > 5 * 60 * 1000) {
        await this.refreshContext("alarm");
      }
      await this.ensureConnected();
      await this.ensureLiquidationConnected();
      await this.ensureHeartbeat();
      await this.ensureBackfillStarted(90, false);
      await this.runBackfillStep();
      await this.ensureGenomeBackfillStarted();
      await this.runGenomeBackfillStep();
      await this.ensureReplayStarted();
      await this.runReplayStep();
    } finally {
      await this.scheduleNextAlarm();
    }
  }

  genomeBackfillPublicState() {
    const g=this.mem.genomeBackfill;
    if(!g) return {active:false,completed:false,stage:"WAITING_FOR_HISTORY"};
    return {...g};
  }

  async ensureGenomeBackfillStarted() {
    if(!this.mem.backfill?.completed) return;
    if(this.mem.genomeBackfill && (this.mem.genomeBackfill.active || this.mem.genomeBackfill.completed)) return;
    const b=this.center.historicalBounds();
    const min=Number(b.min_ts),max=Number(b.max_ts);
    if(!Number.isFinite(min)||!Number.isFinite(max)||Number(b.n||0)<1500) return;
    this.mem.genomeBackfill={
      active:true,
      completed:false,
      stage:"HISTORICAL_GENOMES_15M",
      startedAt:Date.now(),
      finishedAt:null,
      start:min+12*60*60_000,
      end:max-4*60*60_000,
      cursor:min+12*60*60_000,
      processed:0,
      written:0,
      lastStepAt:null,
      lastError:null
    };
    await this.persist();
  }

  async runGenomeBackfillStep() {
    const g=this.mem.genomeBackfill;
    if(!g?.active||g.completed) return;
    try {
      if(Number(g.cursor)>=Number(g.end)) {
        g.active=false;
        g.completed=true;
        g.stage="DONE";
        g.finishedAt=Date.now();
        await this.persist();
        await this.notifyOnce(
          "historical-genomes-complete-v1",
          [
            "BTC RESEARCH LAB — HISTORICAL GENOMES COMPLETE",
            `Historische Market-DNA Samples: ${this.center.historicalGenomeCount()}`,
            "Twin-Suche kann jetzt Live-Zustände mit der importierten Historie vergleichen.",
            "Historische Samples ohne damaliges Tick-Orderflow werden als PARTIAL behandelt und im Distanzmodell bestraft."
          ].join("\n")
        );
        return;
      }
      const chunkEnd=Math.min(Number(g.end),Number(g.cursor)+12*60*60_000);
      const result=this.center.bootstrapHistoricalGenomeChunk(Number(g.cursor),chunkEnd);
      g.processed=Number(g.processed||0)+Number(result.processed||0);
      g.written=Number(g.written||0)+Number(result.written||0);
      g.cursor=chunkEnd;
      g.lastStepAt=Date.now();
      g.lastError=null;
      await this.persist();
    } catch(e) {
      g.lastError=e?.message||String(e);
      g.lastStepAt=Date.now();
      await this.persist();
    }
  }

  replayPublicState() {
    const r=this.mem.replay;
    if(!r) return {active:false,completed:false,stage:"WAITING_FOR_BACKFILL"};
    return {...r,variants:undefined};
  }

  async ensureReplayStarted() {
    if(!this.mem.backfill?.completed) return;
    if(!this.mem.genomeBackfill?.completed) return;
    if(this.mem.replay && (this.mem.replay.active || this.mem.replay.completed)) return;
    const bounds=this.center.historicalBounds();
    const min=Number(bounds.min_ts),max=Number(bounds.max_ts);
    if(!Number.isFinite(min)||!Number.isFinite(max)||Number(bounds.n||0)<1500) return;

    const variants=this.center.replayParameterSet();
    const warmup=8*24*60*60_000;
    this.mem.replay={
      active:true,
      completed:false,
      stage:"CHAMPION_AND_STABILITY",
      startedAt:Date.now(),
      finishedAt:null,
      minTs:min,
      maxTs:max,
      cursor:min+warmup,
      variantIndex:0,
      variants,
      processedBars:0,
      setupsFound:0,
      lastStepAt:null,
      lastError:null
    };
    await this.persist();
  }

  async runReplayStep() {
    const r=this.mem.replay;
    if(!r?.active||r.completed) return;

    try{
      const params=r.variants?.[Number(r.variantIndex||0)];
      if(!params){
        r.active=false;r.completed=true;r.stage="DONE";r.finishedAt=Date.now();
        await this.persist();
        await this.notifyOnce(
          "replay-complete-v1",
          "BTC RESEARCH LAB — REPLAY COMPLETE\nNo-lookahead Champion + Parameter-Stability-Replay ist abgeschlossen. Ergebnisse liegen unter /api/research."
        );
        return;
      }

      const maxUsable=Number(r.maxTs)-24*60*60_000;
      if(Number(r.cursor)>=maxUsable){
        r.variantIndex=Number(r.variantIndex||0)+1;
        if(r.variantIndex>=r.variants.length){
          r.active=false;r.completed=true;r.stage="DONE";r.finishedAt=Date.now();
          await this.persist();
          return;
        }
        r.cursor=Number(r.minTs)+8*24*60*60_000;
        await this.persist();
        return;
      }

      const CHUNK_BARS=30;
      const chunkStart=Number(r.cursor);
      const chunkEnd=Math.min(maxUsable,chunkStart+CHUNK_BARS*5*60_000);
      const windowStart=Math.max(Number(r.minTs),chunkStart-30*24*60*60_000);
      const windowEnd=Math.min(Number(r.maxTs),chunkEnd+30*60*60_000);
      const candles=this.center.historicalReplayWindow(windowStart,windowEnd);

      let processed=0,found=0;
      for(let i=0;i<candles.length;i++){
        const ts=Number(candles[i].t);
        if(ts<chunkStart||ts>=chunkEnd) continue;
        processed++;
        const setup=evaluateReplaySetup(candles,i,params);
        if(!setup) continue;
        const outcome=simulateOutcome(candles,i,setup,288);
        if(!outcome) continue;
        found+=this.center.recordReplayResult(setup,outcome,params)>0?1:0;
      }

      r.processedBars=Number(r.processedBars||0)+processed;
      r.setupsFound=Number(r.setupsFound||0)+found;
      r.cursor=chunkEnd;
      r.lastStepAt=Date.now();
      r.lastError=null;
      await this.persist();
    }catch(e){
      r.lastError=e?.message||String(e);
      r.lastStepAt=Date.now();
      await this.persist();
    }
  }

  backfillPublicState() {
    const b = this.mem.backfill;
    if (!b) return { active: false, completed: false, stage: "NOT_STARTED" };
    const copy = { ...b };
    delete copy.futureOverlap;
    return copy;
  }

  async ensureBackfillStarted(days = 90, force = false) {
    const existing = this.mem.backfill;
    if (
      !force &&
      existing &&
      (existing.active || existing.completed)
    ) {
      return;
    }

    this.mem.backfill = freshBackfillState(days);
    await this.persist();

    await this.notifyOnce(
      `backfill-start|${days}`,
      [
        "BTC TRADING CENTER — HISTORY IMPORT START",
        `${days} Tage historische Daten werden stufenweise geladen.`,
        "Priorität: BTC 5m + Candle-Patterns + Open Interest + Long/Short + Funding + ETH/SOL/BNB 1h.",
        "Der Import begrenzt sich selbst, damit der Cloudflare-Free-Tier nicht unnötig überschritten wird."
      ].join("\n")
    );
  }

  resetBackfillBudgetIfNeeded() {
    const b = this.mem.backfill;
    if (!b) return;
    const day = new Date().toISOString().slice(0,10);
    if (b.writeDay !== day) {
      b.writeDay = day;
      b.writesToday = 0;
      b.pauseUntil = null;
    }
  }

  nextUtcResetMs() {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 2, 0);
  }

  advanceBackfillStage(next) {
    const b = this.mem.backfill;
    if (!b) return;
    b.stage = next;
    b.cursor = b.end;
    b.pages = Number(b.pages || 0) + 1;
    b.futureOverlap = [];
    if (next === "crossAssets") b.crossSymbolIndex = 0;
  }

  async runBackfillStep(force = false) {
    const b = this.mem.backfill;
    if (!b || !b.active || b.completed) return;

    this.resetBackfillBudgetIfNeeded();
    const now = Date.now();

    if (b.pauseUntil && now < b.pauseUntil && !force) return;

    const DAILY_WRITE_BUDGET = 70000;
    if (Number(b.writesToday || 0) >= DAILY_WRITE_BUDGET && !force) {
      b.pauseUntil = this.nextUtcResetMs();
      await this.persist();
      return;
    }

    try {
      let writes = 0;
      let rows = [];

      if (b.stage === "candles") {
        rows = await fetch5mPage(b.start, b.cursor, 1000);
        const current = rows.filter(x => x.t >= b.start && x.t <= b.end);

        if (!current.length) {
          this.advanceBackfillStage("openInterest");
        } else {
          writes += this.center.recordHistorical5m(current, "bybit");

          const future = Array.isArray(b.futureOverlap) ? b.futureOverlap : [];
          const combined = [...current, ...future]
            .filter((x,i,a) => i === 0 || x.t !== a[i-1]?.t)
            .sort((a,b) => a.t-b.t);
          const patternWrites = this.center.bootstrapPatternHistory(combined);
          writes += patternWrites;
          b.rows.candles += current.length;
          b.rows.patterns += patternWrites;

          const oldest = current[0].t;
          b.futureOverlap = current.slice(0, 288);
          b.cursor = oldest - 1;
          b.pages += 1;
          if (oldest <= b.start + 5*60_000) this.advanceBackfillStage("openInterest");
        }
      } else if (b.stage === "openInterest") {
        rows = await fetchOpenInterestPage(b.start, b.cursor, 200);
        const current = rows.filter(x => x.ts >= b.start && x.ts <= b.end);
        if (!current.length) {
          this.advanceBackfillStage("longShort");
        } else {
          for (const row of current) writes += Number(this.center.recordOpenInterest(row.ts, row.value, "bybit") || 0);
          b.rows.openInterest += current.length;
          const oldest = current[0].ts;
          b.cursor = oldest - 1;
          b.pages += 1;
          if (oldest <= b.start + 5*60_000) this.advanceBackfillStage("longShort");
        }
      } else if (b.stage === "longShort") {
        rows = await fetchLongShortPage(b.start, b.cursor, 500);
        const current = rows.filter(x => x.ts >= b.start && x.ts <= b.end);
        if (!current.length) {
          this.advanceBackfillStage("funding");
        } else {
          for (const row of current) writes += Number(this.center.recordLongShort(row.ts, row.longRatio, row.shortRatio, "bybit") || 0);
          b.rows.longShort += current.length;
          const oldest = current[0].ts;
          b.cursor = oldest - 1;
          b.pages += 1;
          if (oldest <= b.start + 5*60_000) this.advanceBackfillStage("funding");
        }
      } else if (b.stage === "funding") {
        rows = await fetchFundingPage(b.start, b.cursor, 200);
        const current = rows.filter(x => x.ts >= b.start && x.ts <= b.end);
        if (!current.length) {
          this.advanceBackfillStage("crossAssets");
        } else {
          for (const row of current) writes += Number(this.center.recordFunding(row.ts, row.rate, "bybit") || 0);
          b.rows.funding += current.length;
          const oldest = current[0].ts;
          b.cursor = oldest - 1;
          b.pages += 1;
          if (oldest <= b.start + 8*60*60_000) this.advanceBackfillStage("crossAssets");
        }
      } else if (b.stage === "crossAssets") {
        const symbols = ["ETHUSDT","SOLUSDT","BNBUSDT"];
        const symbol = symbols[Number(b.crossSymbolIndex || 0)];

        if (!symbol) {
          b.active = false;
          b.completed = true;
          b.finishedAt = Date.now();
          b.stage = "DONE";
          await this.notifyOnce(
            `backfill-done|${b.days}`,
            [
              "BTC TRADING CENTER — HISTORY IMPORT COMPLETE",
              `${b.days} Tage Backfill abgeschlossen.`,
              `BTC 5m: ${b.rows.candles}`,
              `Patterns: ${b.rows.patterns}`,
              `Open Interest: ${b.rows.openInterest}`,
              `Long/Short: ${b.rows.longShort}`,
              `Funding: ${b.rows.funding}`,
              `Cross-Asset: ${b.rows.crossAssets}`
            ].join("\n")
          );
        } else {
          rows = await fetchHourlyCrossAssetPage(symbol, b.start, b.cursor, 1000);
          const current = rows.filter(x => x.ts >= b.start && x.ts <= b.end);
          if (!current.length) {
            b.crossSymbolIndex = Number(b.crossSymbolIndex || 0) + 1;
            b.cursor = b.end;
          } else {
            for (const row of current) {
              writes += Number(this.center.recordCrossAsset(
                row.ts, row.symbol, row.ret5m, row.ret60m, row.close, "bybit"
              ) || 0);
            }
            b.rows.crossAssets += current.length;
            const oldest = current[0].ts;
            b.cursor = oldest - 1;
            b.pages += 1;
            if (oldest <= b.start + 60*60_000) {
              b.crossSymbolIndex = Number(b.crossSymbolIndex || 0) + 1;
              b.cursor = b.end;
            }
          }
        }
      }

      b.writesToday = Number(b.writesToday || 0) + writes;
      b.lastStepAt = Date.now();
      b.lastError = null;

      if (b.active && b.writesToday >= DAILY_WRITE_BUDGET && !force) {
        b.pauseUntil = this.nextUtcResetMs();
      }

      await this.persist();
    } catch (e) {
      b.lastError = e?.message || String(e);
      b.lastStepAt = Date.now();
      b.pauseUntil = Date.now() + 10 * 60 * 1000;
      await this.persist();
    }
  }

  async scheduleNextAlarm() {
    const b = this.mem.backfill;
    const g = this.mem.genomeBackfill;
    const r = this.mem.replay;
    let when = Date.now() + 10 * 60 * 1000;

    if (b?.active) {
      if (b.pauseUntil && Date.now() < b.pauseUntil) {
        when = b.pauseUntil;
      } else {
        when = Date.now() + 5_000;
      }
    } else if (g?.active) {
      when = Date.now() + 10_000;
    } else if (r?.active) {
      when = Date.now() + 15_000;
    }
    await this.ctx.storage.setAlarm(when);
  }

  async pollMacroMarket(force=false) {
    const now=Date.now();
    if(!force && now-Number(this.mem.lastMacroMarketPoll||0)<6*60*60_000) return;
    this.mem.lastMacroMarketPoll=now;
    try {
      const result=await fetchMacroMarketContext();
      this.center.upsertMacroMarketContext(result);
      this.mem.lastMacroMarketError=result.errors?.length
        ? result.errors.map(x=>`${x.series}: ${x.error}`).join(" | ")
        : null;
    } catch(e) {
      this.mem.lastMacroMarketError=e?.message||String(e);
    }
    await this.persist();
  }

  async pollOfficialMacro(force=false) {
    const now=Date.now();
    if(!force && now-Number(this.mem.lastMacroPoll||0) < 6*60*60_000) {
      this.center.updateMacroImpacts(now);
      return;
    }
    this.mem.lastMacroPoll=now;
    try {
      const result=await fetchOfficialMacroEvents();
      this.center.upsertMacroEvents(result.events,result.fetchedAt);
      this.mem.lastMacroError=result.blsError||null;
      this.center.updateMacroImpacts(now);
    } catch(e) {
      this.mem.lastMacroError=e?.message||String(e);
    }
    await this.persist();
  }

  async checkMacroWarnings() {
    const risk=this.center.macroRiskState();
    const next=risk.nextEvent;
    const now=Date.now();
    if(next) {
      const mins=(Number(next.event_ts)-now)/60000;
      if(mins>=0 && mins<=90) {
        const bucket=mins<=15?"15M":mins<=30?"30M":mins<=60?"60M":"90M";
        await this.notifyOnce(
          `macro-ahead|${next.event_key}|${bucket}`,
          [
            "BTC — OFFICIAL MACRO RADAR",
            `${next.category}: ${next.name}`,
            `in ca. ${Math.max(0,Math.round(mins))} Minuten`,
            `Quelle: ${next.source}`,
            "AKTION: Kein neuer Blind-Entry in der Event-Risikozone. Bestehende Struktur weiter beobachten."
          ].join("\n")
        );
      }
    }
    if(risk.active && risk.activeEvents.length) {
      const e=risk.activeEvents[0];
      await this.notifyOnce(
        `macro-lock|${e.event_key}`,
        [
          "BTC — MACRO RISK WINDOW ACTIVE",
          `${e.category}: ${e.name}`,
          "Neue Setups werden weiter für Forschung erfasst, aber als Event-Risiko gekennzeichnet.",
          "Historische Reaktion wird nach 5m/15m/1h/4h vermessen."
        ].join("\n")
      );
    }
    return risk;
  }

  async pollNews(force = false) {
    const now = Date.now();
    if (!force && now - Number(this.mem.lastNewsPoll || 0) < 10 * 60 * 1000) return;
    this.mem.lastNewsPoll = now;
    try {
      const events = await fetchGlobalMarketNews();
      let criticalSent = 0;
      for (const event of events) {
        const isNew = this.center.upsertNews(event);
        if (isNew && event.critical && criticalSent < 2) {
          criticalSent += 1;
          await this.notifyOnce(
            `news|${event.fingerprint}`,
            [
              "BTC — GLOBAL EVENT RADAR",
              event.title,
              `Kategorie: ${event.category}`,
              event.domain ? `Quelle: ${event.domain}` : "",
              "AKTION: Kein Blind-Entry. Preisreaktion beobachten; 5m/15m/1h/4h-Auswirkung wird automatisch in der Datenbank vermessen."
            ].filter(Boolean).join("\n")
          );
        }
      }
      this.center.updateNewsImpacts(now);
      this.mem.lastNewsError = null;
    } catch (e) {
      this.mem.lastNewsError = e?.message || String(e);
      console.log("news radar failed", this.mem.lastNewsError);
    }
    await this.persist();
  }

  async refreshContext(reason) {
    this.mem.lastContextAttempt = Date.now();
    try {
      const oldTrends = this.context?.trends || null;
      this.context = await buildContext();
      this.context.reason = reason;
      this.mem.lastContextError = null;

      if (!this.mem.patternBootstrapDone) {
        try {
          const hist5 = await getCandles("5m", 1000);
          const added = this.center.bootstrapPatternHistory(hist5);
          this.mem.patternBootstrapDone = true;
          this.mem.patternBootstrapAdded = added;
        } catch (e) {
          this.mem.patternBootstrapError = e?.message || String(e);
        }
      }

      this.center.recordContext(this.context, reason);
      this.center.recordPatterns(this.context);
      this.center.recordFactorSnapshot(this.context);
      await this.pollOfficialMacro(false);
      await this.pollMacroMarket(false);

      try {
        const [derivatives, crossAssets, bookTicker, venue] = await Promise.all([
          fetchDerivativesData(),
          fetchCrossAssets(),
          fetchBookTicker(),
          fetchVenueSnapshot(this.context.price)
        ]);

        for (const row of derivatives.openInterest) this.center.recordOpenInterest(row.ts, row.value);
        for (const row of derivatives.funding) this.center.recordFunding(row.ts, row.rate);
        for (const row of derivatives.ratios) this.center.recordLongShort(row.ts, row.longRatio, row.shortRatio);
        for (const row of crossAssets) {
          this.center.recordCrossAsset(row.ts, row.symbol, row.ret5m, row.ret60m, row.close);
        }
        this.mem.bookTicker = bookTicker;
        this.center.recordVenueSnapshot(venue);
        this.mem.lastExternalDataError = null;
      } catch (e) {
        this.mem.lastExternalDataError = e?.message || String(e);
      }

      // Independent secondary microstructure source: a Kraken failure must never
      // take down the primary Binance/Bybit signal pipeline.
      try {
        const micro = await fetchKrakenMicrostructure();
        this.center.recordSecondaryMicrostructure(micro);
        this.mem.lastKrakenAnalyticsAt = Date.now();
        this.mem.lastKrakenAnalyticsError = null;
      } catch (e) {
        this.mem.lastKrakenAnalyticsError = e?.message || String(e);
      }

      this.center.recordMarketGenome(this.context);
      this.center.updatePatternOutcomes(Date.now());
      this.center.updateFactorOutcomes(Date.now());
      this.center.updateGenomeOutcomes(Date.now());
      this.center.updateNewsImpacts(Date.now());
      await this.pollNews(false);
      const macroRisk = await this.checkMacroWarnings();
      await this.persist();

      if (oldTrends) {
        const changed = ["4h", "1h"].filter(tf => oldTrends[tf] !== this.context.trends[tf]);
        if (changed.length) {
          await this.notifyOnce(
            `context|${changed.map(tf => this.context.trends[tf]).join("|")}`,
            [
              "BTC — CONTEXT CHANGE",
              changed.map(tf => `${tf}: ${oldTrends[tf]} → ${this.context.trends[tf]}`).join("\n"),
              "AKTION: Alte Setup-Annahmen verwerfen und Bias neu einordnen."
            ].join("\n")
          );
        }
      }

      const confirmed = evaluateConfirmed(this.context);
      if (confirmed) {
        const riskPolicy = this.center.riskPolicyState();
        const setup = this.center.openSetup(confirmed, this.context);
        const hist = this.center.matchingSetupHistory(confirmed.side, this.context);
        const twins = this.center.currentGenomeIntelligence(this.context, 20);
        const g = twins.current || {};
        const dataQualityLock = Number(g.data_quality||0) < 75;
        const dailyRiskLock = Boolean(riskPolicy?.locked);
        const histText = hist.n >= 8
          ? `Historischer Match: N=${hist.n} | TP-Quote ${(hist.hitRate*100).toFixed(1)}% | Ø ${hist.avgR?.toFixed(2) ?? "—"}R | ${hist.evidence}`
          : `Historischer Match: N=${hist.n} | noch Lernphase, keine belastbare Aussage`;
        const twinText = twins.outcomeSample >= 8
          ? `Genome-Twins: N=${twins.outcomeSample} | Ø 60m ${((twins.avgForward60m||0)*100).toFixed(2)}% | Novelty ${((g.novelty||0)*100).toFixed(0)}%`
          : `Genome-Twins: N=${twins.outcomeSample} | noch zu wenig Outcome-Daten`;

        // Store the empirical reference score before the outcome is known.
        // Shrink small historical samples toward neutral so they cannot dominate.
        const factorN=Number(hist.n||0);
        const twinN=Number(twins.outcomeSample||0);
        const factorRate=Number(hist.hitRate);
        const twinDirectionRate=Number(twins.sameDirectionRate);
        const factorShrunk=Number.isFinite(factorRate)
          ? (factorRate*factorN + 0.5*20)/(factorN+20) : null;
        const twinShrunk=Number.isFinite(twinDirectionRate)
          ? (twinDirectionRate*twinN + 0.5*20)/(twinN+20) : null;
        const rawParts=[factorShrunk,twinShrunk].filter(Number.isFinite);
        const rawScore=rawParts.length
          ? rawParts.reduce((a,b)=>a+b,0)/rawParts.length
          : null;
        if(setup?.id) {
          this.center.recordSetupPrediction({
            setupId:setup.id,
            rawScore,
            sampleN:factorN+twinN,
            source:"shrunk_factor_plus_twin_reference",
            dataQuality:g.data_quality??null,
            novelty:g.novelty??null
          });
        }

        await this.notifyOnce(
          `setup|${setup?.id || "new"}|${confirmed.side}`,
          [
            `BTC — ${confirmed.decision}`,
            `SETUP #${setup?.id || "?"}`,
            `Entry: ${fmt(confirmed.entry)}`,
            `Stop: ${fmt(confirmed.stop)}`,
            `Target: ${fmt(confirmed.target)}`,
            `CRV: ${confirmed.rr.toFixed(2)}R`,
            `4H/1H/15m/5m: ${this.context.trends["4h"]} / ${this.context.trends["1h"]} / ${this.context.trends["15m"]} / ${this.context.trends["5m"]}`,
            `Session: ${hist.factors.session} | Volatilität: ${hist.factors.volatility_regime} | Trend: ${hist.factors.trend_alignment}`,
            `Datenqualität: ${Number(g.data_quality||0).toFixed(0)}/100 | Agreement: ${((g.agreement||0)*100).toFixed(0)}% | Entropie: ${Number(g.entropy??1).toFixed(2)}`,
            histText,
            twinText,
            (g.novelty||0) >= 0.7 ? "WARNUNG: Ungewöhnlicher Markt-Zustand; historische Vergleiche schwächer." : "",
            macroRisk?.active ? "MACRO LOCK: offizielles Event-Risikofenster aktiv — Setup nur als Forschungsbeobachtung behandeln." : "",
            dataQualityLock ? "DATA QUALITY LOCK: mindestens eine wichtige Datenquelle fehlt oder ist veraltet." : "",
            dailyRiskLock ? `DAILY RISK LOCK: ${riskPolicy.reasons.join(", ")} | Heute: ${riskPolicy.setups} Setups, ${riskPolicy.realizedR.toFixed(2)}R realisiert.` : "",
            (macroRisk?.active || dataQualityLock || dailyRiskLock)
              ? "AKTION: Setup nur protokollieren; keine neue Entry-Freigabe aus diesem System."
              : "AKTION: Nur frisches Setup handeln; nicht hinterherjagen.",
            "Historische Statistik beschreibt Vergangenheitsdaten und ist keine Gewinnwahrscheinlichkeit."
          ].join("\n")
        );
      }

      // Live paper challengers: same closed market data, different parameters.
      // They never create a user-facing trade instruction; they exist to test
      // whether the champion rules are robust or being outperformed.
      const shadowVariants = [
        ["STRICT", {retestTol:0.0010,stopBuffer:0.0005,minRR:2.5,maxExtension:0.0015}],
        ["WIDE_RETEST", {retestTol:0.0016,stopBuffer:0.0005,minRR:2.0,maxExtension:0.0020}],
        ["WIDER_STOP", {retestTol:0.0012,stopBuffer:0.0008,minRR:2.0,maxExtension:0.0020}],
        ["LOWER_RR_RESEARCH", {retestTol:0.0012,stopBuffer:0.0005,minRR:1.5,maxExtension:0.0020}]
      ];
      for(const [variant,params] of shadowVariants) {
        const candidate=evaluateConfirmed(this.context,params);
        if(candidate) this.center.openShadowSetup(variant,candidate,this.context);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      this.mem.lastContextError = msg;
      await this.persist();
      console.log("refreshContext failed", msg);
    }
  }

  accumulateOrderflowFromClosedKline(k, closeTime) {
    const quoteVolume=Number(k.q||0);
    const takerBuyQuote=Number(k.Q||0);
    const buy=Math.max(0,takerBuyQuote);
    const sell=Math.max(0,quoteVolume-takerBuyQuote);
    const bucketStart=Math.floor(Number(closeTime)/(5*60_000))*5*60_000;

    let b=this.mem.flow5m;
    if(!b || Number(b.ts)!==bucketStart){
      if(b && Number(b.tradeCount||0)>0) this.flushOrderflowBucket(b);
      b={ts:bucketStart,buy:0,sell:0,tradeCount:0};
    }
    b.buy+=buy;
    b.sell+=sell;
    b.tradeCount+=Number(k.n||0);
    this.mem.flow5m=b;
  }

  flushOrderflowBucket(bucket=this.mem.flow5m) {
    if(!bucket || !Number(bucket.tradeCount||0)) return;
    const book=this.mem.bookTicker||{};
    this.center.recordOrderflow5m({
      ts:Number(bucket.ts),
      buyNotional:Number(bucket.buy||0),
      sellNotional:Number(bucket.sell||0),
      tradeCount:Number(bucket.tradeCount||0),
      spreadBps:Number.isFinite(Number(book.spreadBps))?Number(book.spreadBps):null,
      bookImbalance:Number.isFinite(Number(book.imbalance))?Number(book.imbalance):null,
      source:"binance"
    });
  }

  async ensureConnected() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.addEventListener("open", async () => {
      console.log("Binance websocket connected");
      await this.notifyOnce(
        "live-online-v1",
        "BTC LIVE-RADAR ONLINE\nCloudflare-WebSocket ist aktiv. 5m-Close bleibt Pflicht für bestätigte Setups."
      );
    });

    ws.addEventListener("message", event => {
      this.ctx.waitUntil(this.handleMarketMessage(event.data));
    });

    ws.addEventListener("close", () => {
      this.ws = null;
      this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + 5_000));
    });

    ws.addEventListener("error", () => {
      this.ws = null;
      this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + 5_000));
    });
  }

  async handleMarketMessage(raw) {
    if (!this.context) return;

    let payload;
    try {
      payload = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }

    const k = payload?.k;
    if (!k) return;

    const price = Number(k.c);
    const high = Number(k.h);
    const low = Number(k.l);
    const volume = Number(k.v);
    const eventTime = Number(payload.E || Date.now());

    const score = this.context.score;
    const trend5 = this.context.trends["5m"];
    const ema20 = this.context.ema20;

    let side = null;
    let level = null;

    if (
      score >= 1 &&
      trend5 !== "BEARISH" &&
      price >= ema20 &&
      typeof this.context.resistance === "number"
    ) {
      side = "LONG";
      level = this.context.resistance;
    } else if (
      score <= -1 &&
      trend5 !== "BULLISH" &&
      price <= ema20 &&
      typeof this.context.support === "number"
    ) {
      side = "SHORT";
      level = this.context.support;
    }

    if (side && level) {
      const signedDist = side === "LONG"
        ? (level - price) / price
        : (price - level) / price;

      const crossed = signedDist <= 0;
      const dist = Math.abs(signedDist);

      if (!crossed) {
        let stage = null;
        if (dist <= GET_READY_DISTANCE) stage = "GET READY";
        else if (dist <= PREPARE_DISTANCE) stage = "PREPARE";
        else if (dist <= RADAR_DISTANCE) stage = "RADAR";

        if (stage) {
          await this.notifyOnce(
            stageKey(stage, side, level),
            [
              `BTC — ${stage} ${side}`,
              `Live-Preis: ${fmt(price)}`,
              `Relevantes Level: ${fmt(level)}`,
              `Abstand: ${(dist * 100).toFixed(2)}%`,
              "AKTION: Noch kein Entry. Auf bestätigten 5m-Close und danach Retest warten."
            ].join("\n")
          );
        }
      } else {
        await this.notifyOnce(
          stageKey("BREAK RUNNING", side, level),
          [
            `BTC — BREAK LÄUFT ${side}`,
            `Live-Preis: ${fmt(price)}`,
            `Break-Level: ${fmt(level)}`,
            "AKTION: Nicht während der offenen Kerze springen. Erst 5m-Close bestätigen lassen."
          ].join("\n")
        );

        const extension = Math.abs(price - level) / level;
        if (extension >= DO_NOT_CHASE_DISTANCE) {
          await this.notifyOnce(
            stageKey("DO NOT CHASE", side, level),
            [
              `BTC — DO NOT CHASE ${side}`,
              `Preis bereits ${(extension * 100).toFixed(2)}% vom Break-Level entfernt.`,
              "AKTION: Nicht hinterherlaufen. Retest oder neues Setup abwarten."
            ].join("\n")
          );
        }
      }
    }

    const oneMinRange = price ? (high - low) / price : 0;
    if (oneMinRange >= 0.0035) {
      const minuteBucket = Math.floor(eventTime / 60_000);
      await this.notifyOnce(
        `fast|${minuteBucket}`,
        [
          "BTC — FAST MARKET",
          `Aktuelle 1m-Range: ${(oneMinRange * 100).toFixed(2)}%`,
          `1m Live-Volumen: ${fmt(volume)}`,
          "AKTION: Kein FOMO-Entry. Close + Struktur + Retest abwarten."
        ].join("\n"),
        true
      );
    }

    if (Boolean(k.x)) {
      const closeTime = Number(k.T || eventTime);
      this.accumulateOrderflowFromClosedKline(k, closeTime);
      this.center.recordMinute({
        ts: closeTime,
        open: Number(k.o),
        high,
        low,
        close: price,
        volume,
        source: "binance"
      });

      const closedSetups = this.center.checkOpenSetups({
        ts: closeTime,
        high,
        low,
        close: price
      });
      this.center.checkOpenShadowSetups({
        ts: closeTime,
        high,
        low
      });
      for (const s of closedSetups) {
        const resultText = s.result === "TARGET"
          ? `TARGET HIT (+${Number(s.realized_r || s.planned_rr).toFixed(2)}R)`
          : s.result === "STOP"
            ? "STOP HIT (-1.00R)"
            : "AMBIGUOUS: Stop und Target in derselben 1m-Kerze";
        await this.notifyOnce(
          `setup-result|${s.id}|${s.result}`,
          [
            `BTC — SETUP #${s.id} CLOSED`,
            resultText,
            `MFE: ${Number(s.mfe_r || 0).toFixed(2)}R`,
            `MAE: ${Number(s.mae_r || 0).toFixed(2)}R`,
            "Die Trading-Center-Datenbank wurde aktualisiert."
          ].join("\n")
        );
      }

      const d = new Date(closeTime);
      if ((d.getUTCMinutes() + 1) % 5 === 0) {
        this.flushOrderflowBucket();
        this.mem.flow5m = null;
        this.center.updatePatternOutcomes(closeTime);
        this.center.updateFactorOutcomes(closeTime);
        this.center.updateNewsImpacts(closeTime);
        await this.refreshContext("5m-close");
      }
    }
  }

  async ensureLiquidationConnected() {
    if (this.liqWs && (this.liqWs.readyState === WebSocket.OPEN || this.liqWs.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const ws = new WebSocket(BYBIT_WS_LINEAR);
    this.liqWs = ws;

    ws.addEventListener("open", () => {
      try {
        ws.send(JSON.stringify({
          op: "subscribe",
          args: ["allLiquidation.BTCUSDT"]
        }));
      } catch {}
    });

    ws.addEventListener("message", event => {
      this.ctx.waitUntil((async () => {
        let payload;
        try {
          payload = JSON.parse(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data));
        } catch {
          return;
        }
        if (payload?.topic !== "allLiquidation.BTCUSDT") return;
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        for (const row of rows) {
          this.center.recordLiquidation({
            ts: Number(row.T || payload.ts || Date.now()),
            side: String(row.S || "UNKNOWN"),
            size: Number(row.v),
            price: Number(row.p),
            source: "bybit"
          });
        }
      })());
    });

    ws.addEventListener("close", () => {
      this.liqWs = null;
      this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + 5_000));
    });

    ws.addEventListener("error", () => {
      this.liqWs = null;
      this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + 5_000));
    });
  }

  async ensureHeartbeat() {
    const now = Date.now();
    if (now - Number(this.mem.lastHeartbeat || 0) < HEARTBEAT_MS) return;
    if (await this.sendTelegram("BTC LIVE-RADAR — SYSTEM OK\nCloudflare überwacht weiter.")) {
      this.mem.lastHeartbeat = now;
      await this.persist();
    }
  }

  async notifyOnce(key, text, allowMinuteRepeat = false) {
    if (!allowMinuteRepeat && this.mem.lastStageKey === key) return false;
    if (await this.sendTelegram(text)) {
      this.mem.lastStageKey = key;
      const parts = String(key).split("|");
      this.center.recordAlert({
        key,
        stage: parts[0] || key,
        side: parts[1] === "LONG" || parts[1] === "SHORT" ? parts[1] : null,
        level: Number.isFinite(Number(parts[2])) ? Number(parts[2]) : null,
        price: this.context?.price ?? null,
        payload: { text }
      });
      await this.persist();
      return true;
    }
    return false;
  }

  async resolveChatId(token) {
    if (this.env.TELEGRAM_CHAT_ID) return String(this.env.TELEGRAM_CHAT_ID);
    if (this.mem.lastTelegramChat) return String(this.mem.lastTelegramChat);

    try {
      const data = await fetchJson(`https://api.telegram.org/bot${token}/getUpdates`);
      const updates = Array.isArray(data.result) ? data.result : [];
      for (let i = updates.length - 1; i >= 0; i--) {
        const msg = updates[i]?.message || updates[i]?.edited_message;
        const id = msg?.chat?.id;
        if (id !== undefined && id !== null) {
          this.mem.lastTelegramChat = String(id);
          await this.persist();
          return String(id);
        }
      }
    } catch {}
    return null;
  }

  async sendTelegram(text) {
    const token = String(this.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!token) {
      this.mem.lastTelegramError = "TELEGRAM_BOT_TOKEN fehlt";
      await this.persist();
      return false;
    }

    const chatId = await this.resolveChatId(token);
    if (!chatId) {
      this.mem.lastTelegramError = "Kein Telegram-Chat gefunden. Dem Bot zuerst /start senden.";
      await this.persist();
      return false;
    }

    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text
        })
      });
      if (r.ok) {
        this.mem.lastTelegramOkAt = Date.now();
        this.mem.lastTelegramError = null;
        await this.persist();
        return true;
      }
      this.mem.lastTelegramError = `HTTP ${r.status}`;
      await this.persist();
      return false;
    } catch (e) {
      this.mem.lastTelegramError = e?.message || "telegram fetch failed";
      await this.persist();
      return false;
    }
  }
}
