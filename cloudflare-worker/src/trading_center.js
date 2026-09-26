export class TradingCenter {
  constructor(sql) {
    this.sql = sql;
    this.init();
  }

  init() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS market_minutes (
        ts INTEGER PRIMARY KEY,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS contexts (
        ts INTEGER PRIMARY KEY,
        price REAL NOT NULL,
        trend_5m TEXT,
        trend_15m TEXT,
        trend_1h TEXT,
        trend_4h TEXT,
        bias_score INTEGER,
        ema20 REAL,
        ema50 REAL,
        support REAL,
        resistance REAL,
        reason TEXT
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        alert_key TEXT NOT NULL,
        stage TEXT,
        side TEXT,
        level REAL,
        price REAL,
        payload_json TEXT
      );

      CREATE TABLE IF NOT EXISTS setups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signature TEXT NOT NULL UNIQUE,
        opened_ts INTEGER NOT NULL,
        closed_ts INTEGER,
        side TEXT NOT NULL,
        entry REAL NOT NULL,
        stop REAL NOT NULL,
        target REAL NOT NULL,
        planned_rr REAL NOT NULL,
        level REAL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        result TEXT,
        exit_price REAL,
        realized_r REAL,
        mfe_r REAL NOT NULL DEFAULT 0,
        mae_r REAL NOT NULL DEFAULT 0,
        trend_5m TEXT,
        trend_15m TEXT,
        trend_1h TEXT,
        trend_4h TEXT,
        bias_score INTEGER,
        hour_utc INTEGER,
        dow_utc INTEGER
      );

      CREATE TABLE IF NOT EXISTS pattern_occurrences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candle_ts INTEGER NOT NULL,
        pattern TEXT NOT NULL,
        direction INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        trend_5m TEXT,
        trend_15m TEXT,
        trend_1h TEXT,
        trend_4h TEXT,
        bias_score INTEGER,
        ret_15m REAL,
        ret_60m REAL,
        ret_240m REAL,
        ret_1440m REAL,
        UNIQUE(candle_ts, pattern)
      );

      CREATE TABLE IF NOT EXISTS news_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT NOT NULL UNIQUE,
        published_ts INTEGER NOT NULL,
        captured_ts INTEGER NOT NULL,
        title TEXT NOT NULL,
        url TEXT,
        domain TEXT,
        country TEXT,
        category TEXT NOT NULL,
        base_price REAL,
        ret_5m REAL,
        ret_15m REAL,
        ret_60m REAL,
        ret_240m REAL,
        ret_1440m REAL
      );

      CREATE INDEX IF NOT EXISTS idx_setups_status ON setups(status);
      CREATE INDEX IF NOT EXISTS idx_patterns_pattern ON pattern_occurrences(pattern);
      CREATE INDEX IF NOT EXISTS idx_news_category ON news_events(category);
      CREATE INDEX IF NOT EXISTS idx_market_minutes_ts ON market_minutes(ts);
    `);
  }

  rows(query, ...params) {
    return this.sql.exec(query, ...params).toArray();
  }

  one(query, ...params) {
    const rows = this.rows(query, ...params);
    return rows.length ? rows[0] : null;
  }

  recordMinute({ ts, open, high, low, close, volume, source = "binance" }) {
    this.sql.exec(
      `INSERT OR IGNORE INTO market_minutes(ts, open, high, low, close, volume, source)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      ts, open, high, low, close, volume, source
    );
  }

  recordContext(ctx, reason = "") {
    const ts = Number(ctx?.c5?.at(-1)?.t || Date.now());
    this.sql.exec(
      `INSERT OR REPLACE INTO contexts(
        ts, price, trend_5m, trend_15m, trend_1h, trend_4h, bias_score,
        ema20, ema50, support, resistance, reason
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ts,
      Number(ctx.price),
      ctx.trends?.["5m"] || null,
      ctx.trends?.["15m"] || null,
      ctx.trends?.["1h"] || null,
      ctx.trends?.["4h"] || null,
      Number(ctx.score || 0),
      Number(ctx.ema20 || 0),
      Number(ctx.ema50 || 0),
      ctx.support ?? null,
      ctx.resistance ?? null,
      reason
    );
  }

  recordAlert({ key, stage, side = null, level = null, price = null, payload = null }) {
    this.sql.exec(
      `INSERT INTO alerts(ts, alert_key, stage, side, level, price, payload_json)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      Date.now(), key, stage, side, level, price,
      payload ? JSON.stringify(payload) : null
    );
  }

  openSetup(confirmed, ctx) {
    const candleTs = Number(ctx?.c5?.at(-1)?.t || Date.now());
    const levelBucket = Math.round(Number(confirmed.level || confirmed.entry) / 5) * 5;
    const signature = `${confirmed.side}|${levelBucket}|${candleTs}`;
    const d = new Date(candleTs);
    this.sql.exec(
      `INSERT OR IGNORE INTO setups(
        signature, opened_ts, side, entry, stop, target, planned_rr, level,
        trend_5m, trend_15m, trend_1h, trend_4h, bias_score, hour_utc, dow_utc
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      signature,
      candleTs,
      confirmed.side,
      Number(confirmed.entry),
      Number(confirmed.stop),
      Number(confirmed.target),
      Number(confirmed.rr),
      confirmed.level ?? null,
      ctx.trends?.["5m"] || null,
      ctx.trends?.["15m"] || null,
      ctx.trends?.["1h"] || null,
      ctx.trends?.["4h"] || null,
      Number(ctx.score || 0),
      d.getUTCHours(),
      d.getUTCDay()
    );
    return this.one("SELECT * FROM setups WHERE signature = ?", signature);
  }

  checkOpenSetups({ ts, high, low, close }) {
    const open = this.rows("SELECT * FROM setups WHERE status = 'OPEN' ORDER BY id ASC");
    const closed = [];

    for (const s of open) {
      const risk = s.side === "LONG" ? s.entry - s.stop : s.stop - s.entry;
      if (!(risk > 0)) continue;

      const favorable = s.side === "LONG" ? (high - s.entry) / risk : (s.entry - low) / risk;
      const adverse = s.side === "LONG" ? (s.entry - low) / risk : (high - s.entry) / risk;
      const mfe = Math.max(Number(s.mfe_r || 0), favorable);
      const mae = Math.max(Number(s.mae_r || 0), adverse);

      const stopHit = s.side === "LONG" ? low <= s.stop : high >= s.stop;
      const targetHit = s.side === "LONG" ? high >= s.target : low <= s.target;

      if (stopHit && targetHit) {
        this.sql.exec(
          `UPDATE setups SET status='CLOSED', result='AMBIGUOUS', closed_ts=?,
           exit_price=?, realized_r=NULL, mfe_r=?, mae_r=? WHERE id=?`,
          ts, close, mfe, mae, s.id
        );
        closed.push({ ...s, result: "AMBIGUOUS", exit_price: close, mfe_r: mfe, mae_r: mae });
      } else if (targetHit) {
        this.sql.exec(
          `UPDATE setups SET status='CLOSED', result='TARGET', closed_ts=?,
           exit_price=?, realized_r=?, mfe_r=?, mae_r=? WHERE id=?`,
          ts, s.target, s.planned_rr, mfe, mae, s.id
        );
        closed.push({ ...s, result: "TARGET", exit_price: s.target, realized_r: s.planned_rr, mfe_r: mfe, mae_r: mae });
      } else if (stopHit) {
        this.sql.exec(
          `UPDATE setups SET status='CLOSED', result='STOP', closed_ts=?,
           exit_price=?, realized_r=-1, mfe_r=?, mae_r=? WHERE id=?`,
          ts, s.stop, mfe, mae, s.id
        );
        closed.push({ ...s, result: "STOP", exit_price: s.stop, realized_r: -1, mfe_r: mfe, mae_r: mae });
      } else {
        this.sql.exec("UPDATE setups SET mfe_r=?, mae_r=? WHERE id=?", mfe, mae, s.id);
      }
    }
    return closed;
  }

  detectPatterns(c5) {
    if (!Array.isArray(c5) || c5.length < 2) return [];
    const a = c5.at(-2);
    const b = c5.at(-1);
    const range = Math.max(b.h - b.l, 1e-9);
    const body = Math.abs(b.c - b.o);
    const upper = b.h - Math.max(b.o, b.c);
    const lower = Math.min(b.o, b.c) - b.l;
    const out = [];

    if (body / range <= 0.10) out.push(["DOJI", 0]);
    if (lower >= body * 2 && upper <= Math.max(body, range * 0.15) && (Math.max(b.o, b.c) - b.l) / range >= 0.65) {
      out.push(["HAMMER", 1]);
    }
    if (upper >= body * 2 && lower <= Math.max(body, range * 0.15) && (b.h - Math.min(b.o, b.c)) / range >= 0.65) {
      out.push(["SHOOTING_STAR", -1]);
    }
    if (b.c > b.o && a.c < a.o && b.o <= a.c && b.c >= a.o) out.push(["BULLISH_ENGULFING", 1]);
    if (b.c < b.o && a.c > a.o && b.o >= a.c && b.c <= a.o) out.push(["BEARISH_ENGULFING", -1]);
    if (b.h < a.h && b.l > a.l) out.push(["INSIDE_BAR", 0]);
    if (b.h > a.h && b.l < a.l) out.push(["OUTSIDE_BAR", b.c >= b.o ? 1 : -1]);
    if (body / range >= 0.80) out.push([b.c >= b.o ? "BULL_MARUBOZU" : "BEAR_MARUBOZU", b.c >= b.o ? 1 : -1]);

    return out;
  }

  recordPatterns(ctx) {
    const c5 = ctx?.c5;
    if (!Array.isArray(c5) || !c5.length) return;
    const candle = c5.at(-1);
    for (const [pattern, direction] of this.detectPatterns(c5)) {
      this.sql.exec(
        `INSERT OR IGNORE INTO pattern_occurrences(
          candle_ts, pattern, direction, open, high, low, close, volume,
          trend_5m, trend_15m, trend_1h, trend_4h, bias_score
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        Number(candle.t), pattern, direction,
        Number(candle.o), Number(candle.h), Number(candle.l), Number(candle.c), Number(candle.v),
        ctx.trends?.["5m"] || null,
        ctx.trends?.["15m"] || null,
        ctx.trends?.["1h"] || null,
        ctx.trends?.["4h"] || null,
        Number(ctx.score || 0)
      );
    }
  }

  nearestClose(targetTs) {
    return this.one(
      "SELECT close, ts FROM market_minutes WHERE ts >= ? ORDER BY ts ASC LIMIT 1",
      targetTs
    );
  }

  updatePatternOutcomes(nowTs = Date.now()) {
    const pending = this.rows(
      `SELECT id, candle_ts, close, ret_15m, ret_60m, ret_240m, ret_1440m
       FROM pattern_occurrences
       WHERE ret_1440m IS NULL
       ORDER BY candle_ts ASC LIMIT 200`
    );
    const horizons = [
      ["ret_15m", 15],
      ["ret_60m", 60],
      ["ret_240m", 240],
      ["ret_1440m", 1440]
    ];

    for (const row of pending) {
      const updates = [];
      const values = [];
      for (const [field, minutes] of horizons) {
        if (row[field] !== null && row[field] !== undefined) continue;
        const target = Number(row.candle_ts) + minutes * 60_000;
        if (nowTs < target) continue;
        const p = this.nearestClose(target);
        if (!p) continue;
        updates.push(`${field}=?`);
        values.push((Number(p.close) - Number(row.close)) / Number(row.close));
      }
      if (updates.length) {
        values.push(row.id);
        this.sql.exec(`UPDATE pattern_occurrences SET ${updates.join(", ")} WHERE id=?`, ...values);
      }
    }
  }

  upsertNews(event) {
    const cursor = this.sql.exec(
      `INSERT OR IGNORE INTO news_events(
        fingerprint, published_ts, captured_ts, title, url, domain, country, category
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      event.fingerprint,
      Number(event.publishedTs),
      Date.now(),
      event.title,
      event.url || null,
      event.domain || null,
      event.country || null,
      event.category || "other"
    );
    return Number(cursor.rowsWritten || 0) > 0;
  }

  updateNewsImpacts(nowTs = Date.now()) {
    const pending = this.rows(
      `SELECT * FROM news_events
       WHERE ret_1440m IS NULL
       ORDER BY published_ts ASC LIMIT 200`
    );
    const horizons = [
      ["ret_5m", 5],
      ["ret_15m", 15],
      ["ret_60m", 60],
      ["ret_240m", 240],
      ["ret_1440m", 1440]
    ];

    for (const row of pending) {
      let basePrice = row.base_price;
      if (basePrice === null || basePrice === undefined) {
        const base = this.nearestClose(Number(row.published_ts));
        if (base) {
          basePrice = Number(base.close);
          this.sql.exec("UPDATE news_events SET base_price=? WHERE id=?", basePrice, row.id);
        }
      }
      if (!(basePrice > 0)) continue;

      const updates = [];
      const values = [];
      for (const [field, minutes] of horizons) {
        if (row[field] !== null && row[field] !== undefined) continue;
        const target = Number(row.published_ts) + minutes * 60_000;
        if (nowTs < target) continue;
        const p = this.nearestClose(target);
        if (!p) continue;
        updates.push(`${field}=?`);
        values.push((Number(p.close) - basePrice) / basePrice);
      }
      if (updates.length) {
        values.push(row.id);
        this.sql.exec(`UPDATE news_events SET ${updates.join(", ")} WHERE id=?`, ...values);
      }
    }
  }

  summary() {
    const setup = this.one(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status='OPEN' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN result='TARGET' THEN 1 ELSE 0 END) AS targets,
        SUM(CASE WHEN result='STOP' THEN 1 ELSE 0 END) AS stops,
        AVG(CASE WHEN realized_r IS NOT NULL THEN realized_r END) AS avg_r
      FROM setups
    `) || {};

    const decided = Number(setup.targets || 0) + Number(setup.stops || 0);
    return {
      setups: {
        total: Number(setup.total || 0),
        open: Number(setup.open_count || 0),
        targets: Number(setup.targets || 0),
        stops: Number(setup.stops || 0),
        hitRate: decided ? Number(setup.targets || 0) / decided : null,
        avgR: setup.avg_r === null ? null : Number(setup.avg_r)
      },
      patterns: Number(this.one("SELECT COUNT(*) AS n FROM pattern_occurrences")?.n || 0),
      newsEvents: Number(this.one("SELECT COUNT(*) AS n FROM news_events")?.n || 0),
      marketMinutes: Number(this.one("SELECT COUNT(*) AS n FROM market_minutes")?.n || 0)
    };
  }

  setupTimeStats() {
    return this.rows(`
      SELECT hour_utc,
        COUNT(*) AS n,
        SUM(CASE WHEN result='TARGET' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN result='STOP' THEN 1 ELSE 0 END) AS losses,
        AVG(realized_r) AS avg_r
      FROM setups
      WHERE result IN ('TARGET','STOP')
      GROUP BY hour_utc
      ORDER BY hour_utc
    `);
  }

  patternStats() {
    return this.rows(`
      SELECT pattern, direction,
        COUNT(*) AS n,
        AVG(ret_15m) AS avg_15m,
        AVG(ret_60m) AS avg_60m,
        AVG(ret_240m) AS avg_240m,
        AVG(ret_1440m) AS avg_1440m,
        AVG(CASE
          WHEN direction=1 AND ret_60m>0 THEN 1.0
          WHEN direction=-1 AND ret_60m<0 THEN 1.0
          WHEN direction=0 THEN NULL
          WHEN ret_60m IS NOT NULL THEN 0.0
        END) AS directional_hit_60m
      FROM pattern_occurrences
      GROUP BY pattern, direction
      ORDER BY n DESC, pattern ASC
    `);
  }

  newsStats() {
    return this.rows(`
      SELECT category,
        COUNT(*) AS n,
        AVG(ret_15m) AS avg_15m,
        AVG(ABS(ret_15m)) AS avg_abs_15m,
        AVG(ret_60m) AS avg_60m,
        AVG(ABS(ret_60m)) AS avg_abs_60m,
        AVG(ret_240m) AS avg_240m,
        AVG(ABS(ret_240m)) AS avg_abs_240m
      FROM news_events
      GROUP BY category
      ORDER BY n DESC, category ASC
    `);
  }

  recentSetups(limit = 30) {
    return this.rows("SELECT * FROM setups ORDER BY opened_ts DESC LIMIT ?", limit);
  }

  recentNews(limit = 30) {
    return this.rows("SELECT * FROM news_events ORDER BY published_ts DESC LIMIT ?", limit);
  }

  recentPatterns(limit = 30) {
    return this.rows("SELECT * FROM pattern_occurrences ORDER BY candle_ts DESC LIMIT ?", limit);
  }

  exportSnapshot() {
    return {
      generatedAt: Date.now(),
      summary: this.summary(),
      setupTimeStats: this.setupTimeStats(),
      patternStats: this.patternStats(),
      newsStats: this.newsStats(),
      recentSetups: this.recentSetups(50),
      recentNews: this.recentNews(50),
      recentPatterns: this.recentPatterns(50)
    };
  }
}

export function renderTradingCenter(snapshot) {
  const pct = x => x === null || x === undefined ? "—" : (Number(x) * 100).toFixed(1) + "%";
  const num = x => x === null || x === undefined ? "—" : Number(x).toFixed(2);
  const s = snapshot.summary.setups;

  const patternRows = snapshot.patternStats.slice(0, 12).map(r => `
    <tr><td>${r.pattern}</td><td>${r.n}</td><td>${pct(r.directional_hit_60m)}</td>
    <td>${pct(r.avg_15m)}</td><td>${pct(r.avg_60m)}</td><td>${pct(r.avg_240m)}</td></tr>
  `).join("");

  const newsRows = snapshot.newsStats.slice(0, 12).map(r => `
    <tr><td>${r.category}</td><td>${r.n}</td><td>${pct(r.avg_abs_15m)}</td>
    <td>${pct(r.avg_abs_60m)}</td><td>${pct(r.avg_abs_240m)}</td></tr>
  `).join("");

  const setupRows = snapshot.recentSetups.slice(0, 12).map(r => `
    <tr><td>#${r.id}</td><td>${r.side}</td><td>${r.status}</td><td>${r.result || "—"}</td>
    <td>${num(r.planned_rr)}R</td><td>${r.realized_r === null ? "—" : num(r.realized_r) + "R"}</td></tr>
  `).join("");

  return `<!doctype html>
  <html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>BTC Trading Center</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:0;background:#0b0d10;color:#f4f5f7}
    main{max-width:1100px;margin:auto;padding:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
    .card{background:#15181d;border:1px solid #272b33;border-radius:14px;padding:14px}.big{font-size:26px;font-weight:700}
    h1{font-size:28px}h2{margin-top:28px;font-size:19px}table{width:100%;border-collapse:collapse;background:#15181d;border-radius:12px;overflow:hidden}
    th,td{text-align:left;padding:10px;border-bottom:1px solid #272b33;font-size:13px}th{color:#aeb4bf}
    .note{color:#9aa2ad;font-size:13px;line-height:1.5}a{color:#9ecbff}
  </style></head><body><main>
    <h1>BTC Trading Center</h1>
    <p class="note">Empirische Datenbank. Trefferquoten und Event-Reaktionen sind historische Beobachtungen, keine Garantie für zukünftige Ergebnisse.</p>
    <div class="grid">
      <div class="card"><div class="big">${s.total}</div><div>Setups gesamt</div></div>
      <div class="card"><div class="big">${s.open}</div><div>offene Paper-Setups</div></div>
      <div class="card"><div class="big">${pct(s.hitRate)}</div><div>TP-Quote*</div></div>
      <div class="card"><div class="big">${s.avgR === null ? "—" : num(s.avgR)+"R"}</div><div>Ø realisiertes R</div></div>
      <div class="card"><div class="big">${snapshot.summary.patterns}</div><div>Candle-Patterns</div></div>
      <div class="card"><div class="big">${snapshot.summary.newsEvents}</div><div>News-Events</div></div>
    </div>

    <h2>Letzte Setups</h2>
    <table><thead><tr><th>ID</th><th>Side</th><th>Status</th><th>Ergebnis</th><th>Plan</th><th>Realisiert</th></tr></thead><tbody>${setupRows}</tbody></table>

    <h2>Candle-Pattern Statistik</h2>
    <table><thead><tr><th>Pattern</th><th>N</th><th>60m Richtungsquote</th><th>Ø 15m</th><th>Ø 1h</th><th>Ø 4h</th></tr></thead><tbody>${patternRows}</tbody></table>

    <h2>News-Kategorien: BTC-Bewegung danach</h2>
    <p class="note">Das misst zeitliche Preisreaktion nach einer Meldung, nicht bewiesene Kausalität.</p>
    <table><thead><tr><th>Kategorie</th><th>N</th><th>Ø |15m|</th><th>Ø |1h|</th><th>Ø |4h|</th></tr></thead><tbody>${newsRows}</tbody></table>

    <p class="note">* TP-Quote = TARGET / (TARGET + STOP). Ambiguous-1m-Kerzen werden nicht als Gewinn/Verlust gewertet.</p>
  </main></body></html>`;
}
