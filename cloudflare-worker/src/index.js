import { DurableObject } from "cloudflare:workers";

const SYMBOL = "BTCUSDT";
const WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@kline_1m";
const REST_BASES = [
  "https://data-api.binance.vision",
  "https://api.binance.com"
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

function findBreakRetest(c, side) {
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
        const touched = c[r].l <= level * (1 + RETEST_TOL);
        const held = c[r].c >= level * (1 - RETEST_TOL);
        if (touched && held && c[n - 1].c >= level) {
          return { side, level, break_i: b, retest_i: r, retest_low: c[r].l };
        }
      }
    } else {
      const level = Math.min(...history.map(x => x.l));
      if (c[b].c >= level) continue;
      if ((level - c[b].c) / level < 0.00015) continue;

      for (let r = b + 1; r < Math.min(n, b + 7); r++) {
        const touched = c[r].h >= level * (1 - RETEST_TOL);
        const held = c[r].c <= level * (1 + RETEST_TOL);
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

function evaluateConfirmed(ctx) {
  const { c5, score, price, ema20, ema50, resistance, support } = ctx;
  const longPattern = findBreakRetest(c5, "LONG");
  const shortPattern = findBreakRetest(c5, "SHORT");

  if (longPattern && score >= 1 && price >= Math.min(ema20, ema50)) {
    const lows = pivots(c5.slice(-80))
      .filter(p => p.kind === "L" && p.price < price)
      .map(p => p.price);
    let baseStop = lows.slice(-3).length ? Math.max(...lows.slice(-3)) : longPattern.retest_low;
    baseStop = Math.min(baseStop, longPattern.retest_low);
    const stop = baseStop * (1 - STOP_BUFFER);
    if (resistance && resistance > price) {
      const ratio = rr(price, stop, resistance, "LONG");
      if (ratio >= MIN_RR) {
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

  if (shortPattern && score <= -1 && price <= Math.max(ema20, ema50)) {
    const highs = pivots(c5.slice(-80))
      .filter(p => p.kind === "H" && p.price > price)
      .map(p => p.price);
    let baseStop = highs.slice(-3).length ? Math.min(...highs.slice(-3)) : shortPattern.retest_high;
    baseStop = Math.max(baseStop, shortPattern.retest_high);
    const stop = baseStop * (1 + STOP_BUFFER);
    if (support && support < price) {
      const ratio = rr(price, stop, support, "SHORT");
      if (ratio >= MIN_RR) {
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

    if (url.pathname === "/health") {
      return stub.fetch("https://radar/health");
    }
    if (url.pathname === "/start") {
      return stub.fetch("https://radar/start");
    }
    if (url.pathname === "/status") {
      return stub.fetch("https://radar/status");
    }
    return new Response(
      "BTC Live Radar\n\n/start = start/reconnect\n/status = current state\n/health = health check\n",
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
    this.context = null;
    this.mem = {
      lastStageKey: null,
      lastHeartbeat: 0,
      lastTelegramChat: null
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
      return Response.json({
        ok: true,
        connected: this.ws?.readyState === WebSocket.OPEN,
        contextUpdatedAt: this.context?.updatedAt || null,
        lastStageKey: this.mem.lastStageKey || null
      });
    }

    if (path === "/status") {
      return Response.json({
        connected: this.ws?.readyState === WebSocket.OPEN,
        context: this.context,
        state: this.mem
      });
    }

    if (path === "/start" || path === "/tick") {
      await this.refreshContext(path.slice(1));
      await this.ensureConnected();
      await this.ensureHeartbeat();
      await this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
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
      await this.ensureHeartbeat();
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
    }
  }

  async refreshContext(reason) {
    try {
      const oldTrends = this.context?.trends || null;
      this.context = await buildContext();
      this.context.reason = reason;
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
        await this.notifyOnce(
          stageKey(confirmed.decision, confirmed.side, confirmed.level),
          [
            `BTC — ${confirmed.decision}`,
            `Entry: ${fmt(confirmed.entry)}`,
            `Stop: ${fmt(confirmed.stop)}`,
            `Target: ${fmt(confirmed.target)}`,
            `CRV: ${confirmed.rr.toFixed(2)}R`,
            `4H/1H/15m/5m: ${this.context.trends["4h"]} / ${this.context.trends["1h"]} / ${this.context.trends["15m"]} / ${this.context.trends["5m"]}`,
            "AKTION: Nur frisches Setup handeln; nicht hinterherjagen.",
            "Paper-Signal, keine automatische Order."
          ].join("\n")
        );
      }
    } catch (e) {
      console.log("refreshContext failed", e?.message || String(e));
    }
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
      const d = new Date(closeTime);
      if ((d.getUTCMinutes() + 1) % 5 === 0) {
        await this.refreshContext("5m-close");
      }
    }
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
    if (!token) return false;

    const chatId = await this.resolveChatId(token);
    if (!chatId) return false;

    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text
        })
      });
      return r.ok;
    } catch {
      return false;
    }
  }
}
