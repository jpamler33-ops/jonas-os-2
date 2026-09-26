import {
  FEATURE_REGISTRY,
  GENOME_DISTANCE_FIELDS,
  agreementFromSignals,
  directionSign,
  noveltyFromDistances,
  percentileRank,
  weightedDistance
} from "./market_intelligence.js";
import {
  buildHypotheses,
  chronologicalBuckets,
  costAdjustedR,
  decayWindows,
  mean as researchMean,
  sequenceDNA,
  transitionMatrix,
  wilsonInterval
} from "./research_engine.js";
import { parameterGrid } from "./replay_engine.js";

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

      CREATE TABLE IF NOT EXISTS historical_5m (
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

      CREATE TABLE IF NOT EXISTS setup_features (
        setup_id INTEGER PRIMARY KEY,
        session TEXT,
        volatility_regime TEXT,
        atr_pct REAL,
        volume_ratio REAL,
        trend_alignment TEXT,
        ema_state TEXT,
        distance_level_pct REAL,
        pattern_tags TEXT,
        recent_news_60m INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS factor_snapshots (
        ts INTEGER PRIMARY KEY,
        close REAL NOT NULL,
        session TEXT,
        volatility_regime TEXT,
        atr_pct REAL,
        volume_ratio REAL,
        trend_alignment TEXT,
        ema_state TEXT,
        distance_level_pct REAL,
        pattern_tags TEXT,
        recent_news_60m INTEGER NOT NULL DEFAULT 0,
        ret_15m REAL,
        ret_60m REAL,
        ret_240m REAL,
        ret_1440m REAL
      );

      CREATE TABLE IF NOT EXISTS open_interest_history (
        ts INTEGER PRIMARY KEY,
        open_interest REAL NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS funding_history (
        ts INTEGER PRIMARY KEY,
        funding_rate REAL NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS long_short_history (
        ts INTEGER PRIMARY KEY,
        long_ratio REAL NOT NULL,
        short_ratio REAL NOT NULL,
        long_short_ratio REAL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cross_asset_history (
        ts INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        ret_5m REAL,
        ret_60m REAL,
        close REAL,
        source TEXT NOT NULL,
        PRIMARY KEY(ts, symbol)
      );

      CREATE TABLE IF NOT EXISTS liquidations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        position_side TEXT NOT NULL,
        size REAL NOT NULL,
        price REAL NOT NULL,
        notional_usdt REAL NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orderflow_5m (
        ts INTEGER PRIMARY KEY,
        buy_notional REAL NOT NULL,
        sell_notional REAL NOT NULL,
        delta_notional REAL NOT NULL,
        delta_ratio REAL,
        trade_count INTEGER NOT NULL,
        spread_bps REAL,
        book_imbalance REAL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS market_genomes (
        ts INTEGER PRIMARY KEY,
        price REAL NOT NULL,
        ret_5m REAL,
        ret_15m REAL,
        atr_pct REAL,
        volume_ratio REAL,
        ema_distance_pct REAL,
        level_distance_pct REAL,
        bias_score REAL,
        oi_change REAL,
        funding_rate REAL,
        long_short_ratio REAL,
        liq_5m REAL,
        liq_imbalance REAL,
        cross_ret_60m REAL,
        flow_delta_ratio REAL,
        spread_bps REAL,
        book_imbalance REAL,
        agreement REAL,
        entropy REAL,
        novelty REAL,
        data_quality REAL,
        volume_surprise REAL,
        oi_surprise REAL,
        liq_surprise REAL,
        flow_surprise REAL,
        state_label TEXT,
        fingerprint TEXT,
        ret_fwd_15m REAL,
        ret_fwd_60m REAL,
        ret_fwd_240m REAL
      );

      CREATE TABLE IF NOT EXISTS data_quality_snapshots (
        ts INTEGER PRIMARY KEY,
        score REAL NOT NULL,
        missing_json TEXT,
        stale_json TEXT,
        details_json TEXT
      );

      CREATE TABLE IF NOT EXISTS market_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        subtype TEXT,
        direction REAL,
        magnitude REAL,
        source TEXT,
        payload_json TEXT
      );

      CREATE TABLE IF NOT EXISTS replay_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signature TEXT NOT NULL UNIQUE,
        params_hash TEXT NOT NULL,
        params_json TEXT NOT NULL,
        ts INTEGER NOT NULL,
        side TEXT NOT NULL,
        entry REAL NOT NULL,
        stop REAL NOT NULL,
        target REAL NOT NULL,
        planned_rr REAL NOT NULL,
        level REAL,
        result TEXT,
        realized_r REAL,
        mfe_r REAL,
        mae_r REAL,
        closed_ts INTEGER,
        trend_5m TEXT,
        trend_15m TEXT,
        trend_1h TEXT,
        trend_4h TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_setups_status ON setups(status);
      CREATE INDEX IF NOT EXISTS idx_patterns_pattern ON pattern_occurrences(pattern);
      CREATE INDEX IF NOT EXISTS idx_news_category ON news_events(category);
      CREATE INDEX IF NOT EXISTS idx_market_minutes_ts ON market_minutes(ts);
      CREATE INDEX IF NOT EXISTS idx_historical_5m_ts ON historical_5m(ts);
      CREATE INDEX IF NOT EXISTS idx_setup_features_session ON setup_features(session);
      CREATE INDEX IF NOT EXISTS idx_factor_snapshots_ts ON factor_snapshots(ts);
      CREATE INDEX IF NOT EXISTS idx_oi_ts ON open_interest_history(ts);
      CREATE INDEX IF NOT EXISTS idx_funding_ts ON funding_history(ts);
      CREATE INDEX IF NOT EXISTS idx_long_short_ts ON long_short_history(ts);
      CREATE INDEX IF NOT EXISTS idx_cross_asset_ts ON cross_asset_history(ts);
      CREATE INDEX IF NOT EXISTS idx_liquidations_ts ON liquidations(ts);
      CREATE INDEX IF NOT EXISTS idx_orderflow_5m_ts ON orderflow_5m(ts);
      CREATE INDEX IF NOT EXISTS idx_market_genomes_ts ON market_genomes(ts);
      CREATE INDEX IF NOT EXISTS idx_timeline_ts ON market_timeline(ts);
      CREATE INDEX IF NOT EXISTS idx_timeline_type ON market_timeline(event_type);
      CREATE INDEX IF NOT EXISTS idx_replay_params ON replay_results(params_hash);
      CREATE INDEX IF NOT EXISTS idx_replay_ts ON replay_results(ts);
    `);
  }

  rows(query, ...params) {
    return this.sql.exec(query, ...params).toArray();
  }

  one(query, ...params) {
    const rows = this.rows(query, ...params);
    return rows.length ? rows[0] : null;
  }

  recordOpenInterest(ts, value, source = "bybit") {
    if (!Number.isFinite(Number(value))) return;
    const cur = this.sql.exec(
      "INSERT OR REPLACE INTO open_interest_history(ts, open_interest, source) VALUES(?,?,?)",
      Number(ts), Number(value), source
    );
    return Number(cur.rowsWritten || 0);
  }

  recordFunding(ts, rate, source = "bybit") {
    if (!Number.isFinite(Number(rate))) return;
    const cur = this.sql.exec(
      "INSERT OR REPLACE INTO funding_history(ts, funding_rate, source) VALUES(?,?,?)",
      Number(ts), Number(rate), source
    );
    return Number(cur.rowsWritten || 0);
  }

  recordLongShort(ts, longRatio, shortRatio, source = "bybit") {
    const l=Number(longRatio), s=Number(shortRatio);
    if (!Number.isFinite(l) || !Number.isFinite(s)) return;
    const cur = this.sql.exec(
      "INSERT OR REPLACE INTO long_short_history(ts, long_ratio, short_ratio, long_short_ratio, source) VALUES(?,?,?,?,?)",
      Number(ts), l, s, s > 0 ? l/s : null, source
    );
    return Number(cur.rowsWritten || 0);
  }

  recordCrossAsset(ts, symbol, ret5m, ret60m, close, source = "bybit") {
    const cur = this.sql.exec(
      "INSERT OR REPLACE INTO cross_asset_history(ts, symbol, ret_5m, ret_60m, close, source) VALUES(?,?,?,?,?,?)",
      Number(ts), String(symbol), ret5m ?? null, ret60m ?? null, close ?? null, source
    );
    return Number(cur.rowsWritten || 0);
  }

  recordLiquidation({ ts, side, size, price, source = "bybit" }) {
    const q=Number(size), p=Number(price);
    if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p <= 0) return;
    this.sql.exec(
      "INSERT INTO liquidations(ts, position_side, size, price, notional_usdt, source) VALUES(?,?,?,?,?,?)",
      Number(ts), String(side), q, p, q*p, source
    );
    this.recordTimeline({
      ts:Number(ts),eventType:"LIQUIDATION",subtype:String(side),
      direction:String(side).toUpperCase()==="BUY"?1:String(side).toUpperCase()==="SELL"?-1:null,
      magnitude:q*p,source,payload:{size:q,price:p,notional:q*p}
    });
  }

  externalMarketSummary() {
    const latestOI=this.one("SELECT * FROM open_interest_history ORDER BY ts DESC LIMIT 1");
    const prevOI=this.one("SELECT * FROM open_interest_history WHERE ts < ? ORDER BY ts DESC LIMIT 1", latestOI?.ts || 0);
    const latestFunding=this.one("SELECT * FROM funding_history ORDER BY ts DESC LIMIT 1");
    const latestLS=this.one("SELECT * FROM long_short_history ORDER BY ts DESC LIMIT 1");
    const cross=this.rows("SELECT * FROM cross_asset_history WHERE ts=(SELECT MAX(ts) FROM cross_asset_history) ORDER BY symbol");
    const since=Date.now()-60*60*1000;
    const liq=this.rows(
      `SELECT position_side, COUNT(*) AS n, SUM(notional_usdt) AS notional
       FROM liquidations WHERE ts>=? GROUP BY position_side`,
      since
    );
    return {
      openInterest: latestOI ? {
        ts: latestOI.ts,
        value: Number(latestOI.open_interest),
        change5m: prevOI && Number(prevOI.open_interest) ? (Number(latestOI.open_interest)-Number(prevOI.open_interest))/Number(prevOI.open_interest) : null
      } : null,
      funding: latestFunding ? { ts: latestFunding.ts, rate: Number(latestFunding.funding_rate) } : null,
      longShort: latestLS ? {
        ts: latestLS.ts,
        longRatio: Number(latestLS.long_ratio),
        shortRatio: Number(latestLS.short_ratio),
        ratio: latestLS.long_short_ratio === null ? null : Number(latestLS.long_short_ratio)
      } : null,
      crossAssets: cross,
      liquidations1h: liq
    };
  }

  recordOrderflow5m({
    ts, buyNotional, sellNotional, tradeCount,
    spreadBps = null, bookImbalance = null, source = "binance"
  }) {
    const buy=Number(buyNotional||0), sell=Number(sellNotional||0);
    const total=buy+sell;
    const delta=buy-sell;
    const ratio=total>0 ? delta/total : null;
    const cur=this.sql.exec(
      `INSERT OR REPLACE INTO orderflow_5m(
        ts,buy_notional,sell_notional,delta_notional,delta_ratio,
        trade_count,spread_bps,book_imbalance,source
      ) VALUES(?,?,?,?,?,?,?,?,?)`,
      Number(ts),buy,sell,delta,ratio,Number(tradeCount||0),
      spreadBps===null?null:Number(spreadBps),
      bookImbalance===null?null:Number(bookImbalance),
      source
    );
    this.recordTimeline({
      ts:Number(ts), eventType:"ORDERFLOW_5M",
      subtype: ratio===null ? "NO_FLOW" : ratio>0.15 ? "BUY_HEAVY" : ratio<-0.15 ? "SELL_HEAVY" : "BALANCED",
      direction: ratio, magnitude: Math.abs(delta), source,
      payload:{buy,sell,delta,ratio,spreadBps,bookImbalance,tradeCount}
    });
    return Number(cur.rowsWritten||0);
  }

  recordTimeline({ts=Date.now(),eventType,subtype=null,direction=null,magnitude=null,source=null,payload=null}) {
    if (!eventType) return;
    this.sql.exec(
      `INSERT INTO market_timeline(ts,event_type,subtype,direction,magnitude,source,payload_json)
       VALUES(?,?,?,?,?,?,?)`,
      Number(ts),String(eventType),subtype===null?null:String(subtype),
      direction===null?null:Number(direction),
      magnitude===null?null:Number(magnitude),
      source===null?null:String(source),
      payload?JSON.stringify(payload):null
    );
  }

  latestOrderflow() {
    return this.one("SELECT * FROM orderflow_5m ORDER BY ts DESC LIMIT 1");
  }

  recentLiquidationSummary(minutes=5) {
    const since=Date.now()-Number(minutes)*60_000;
    const rows=this.rows(
      `SELECT position_side, SUM(notional_usdt) AS notional, COUNT(*) AS n
       FROM liquidations WHERE ts>=? GROUP BY position_side`,
      since
    );
    let buy=0,sell=0,total=0;
    for (const r of rows) {
      const n=Number(r.notional||0);
      total+=n;
      const side=String(r.position_side||"").toUpperCase();
      if(side==="BUY") buy+=n;
      else if(side==="SELL") sell+=n;
    }
    return {
      total,
      buy,
      sell,
      imbalance: total>0 ? (buy-sell)/total : 0,
      rows
    };
  }

  nearestAnyClose(targetTs) {
    return this.one(
      `SELECT close,ts FROM (
         SELECT close,ts FROM market_minutes WHERE ts>=?
         UNION ALL
         SELECT close,ts FROM historical_5m WHERE ts>=?
       ) ORDER BY ts ASC LIMIT 1`,
      Number(targetTs),Number(targetTs)
    );
  }

  dataQuality(ctx) {
    const now=Date.now();
    const missing=[], stale=[];
    const details={};

    const mark=(name,row,maxAgeMs)=>{
      if(!row || !Number.isFinite(Number(row.ts))) {
        missing.push(name); details[name]={status:"missing"}; return;
      }
      const age=now-Number(row.ts);
      details[name]={status:age<=maxAgeMs?"fresh":"stale",ageMs:age,ts:Number(row.ts)};
      if(age>maxAgeMs) stale.push(name);
    };

    const oi=this.one("SELECT ts FROM open_interest_history ORDER BY ts DESC LIMIT 1");
    const funding=this.one("SELECT ts FROM funding_history ORDER BY ts DESC LIMIT 1");
    const ls=this.one("SELECT ts FROM long_short_history ORDER BY ts DESC LIMIT 1");
    const cross=this.one("SELECT MAX(ts) AS ts FROM cross_asset_history");
    const flow=this.one("SELECT ts FROM orderflow_5m ORDER BY ts DESC LIMIT 1");

    mark("open_interest",oi,15*60_000);
    mark("funding",funding,12*60*60_000);
    mark("long_short_ratio",ls,15*60_000);
    mark("cross_asset",cross,20*60_000);
    mark("orderflow",flow,15*60_000);

    const c5=Array.isArray(ctx?.c5)?ctx.c5:[];
    if(c5.length<100) missing.push("price_history");
    else details.price_history={status:"fresh",bars:c5.length};

    const recent=this.rows(
      "SELECT ts FROM market_minutes WHERE ts>=? ORDER BY ts ASC",
      now-30*60_000
    );
    let gaps=0;
    for(let i=1;i<recent.length;i++){
      if(Number(recent[i].ts)-Number(recent[i-1].ts)>125_000) gaps++;
    }
    details.live_gaps_30m=gaps;

    const critical=["open_interest","cross_asset","orderflow","price_history"];
    const criticalPenalty=missing.filter(x=>critical.includes(x)).length*14 +
      stale.filter(x=>critical.includes(x)).length*9;
    const otherPenalty=missing.filter(x=>!critical.includes(x)).length*7 +
      stale.filter(x=>!critical.includes(x)).length*4;
    const gapPenalty=Math.min(20,gaps*4);
    const score=Math.max(0,100-criticalPenalty-otherPenalty-gapPenalty);

    const ts=Number(ctx?.c5?.at(-1)?.t||now);
    this.sql.exec(
      `INSERT OR REPLACE INTO data_quality_snapshots(ts,score,missing_json,stale_json,details_json)
       VALUES(?,?,?,?,?)`,
      ts,score,JSON.stringify(missing),JSON.stringify(stale),JSON.stringify(details)
    );
    return {score,missing,stale,details};
  }

  buildMarketGenome(ctx) {
    const f=this.factorsFromContext(ctx);
    const c5=Array.isArray(ctx?.c5)?ctx.c5:[];
    const last=c5.at(-1), prev=c5.at(-2), prev3=c5.at(-4);
    const price=Number(ctx?.price||last?.c||0);
    const ret5=prev?.c ? price/Number(prev.c)-1 : null;
    const ret15=prev3?.c ? price/Number(prev3.c)-1 : null;
    const emaMid=(Number(ctx?.ema20||0)+Number(ctx?.ema50||0))/2;
    const emaDistance=price && emaMid ? (price-emaMid)/price : null;
    const levelDistance=f.distance_level_pct;

    const oi=this.one("SELECT * FROM open_interest_history ORDER BY ts DESC LIMIT 1");
    const prevOi=oi?this.one("SELECT * FROM open_interest_history WHERE ts<? ORDER BY ts DESC LIMIT 1",oi.ts):null;
    const oiChange=oi&&prevOi&&Number(prevOi.open_interest)
      ? (Number(oi.open_interest)-Number(prevOi.open_interest))/Number(prevOi.open_interest):null;
    const funding=this.one("SELECT * FROM funding_history ORDER BY ts DESC LIMIT 1");
    const ls=this.one("SELECT * FROM long_short_history ORDER BY ts DESC LIMIT 1");
    const flow=this.latestOrderflow();
    const liq=this.recentLiquidationSummary(5);
    const crossRows=this.rows(
      "SELECT * FROM cross_asset_history WHERE ts=(SELECT MAX(ts) FROM cross_asset_history)"
    );
    const crossVals=crossRows.map(r=>Number(r.ret_60m)).filter(Number.isFinite);
    const crossRet=crossVals.length?crossVals.reduce((a,b)=>a+b,0)/crossVals.length:null;

    const history=this.rows(
      `SELECT volume_ratio,oi_change,liq_5m,flow_delta_ratio
       FROM market_genomes ORDER BY ts DESC LIMIT 576`
    );
    const volumeSample=history.map(r=>Number(r.volume_ratio)).filter(Number.isFinite);
    const oiSample=history.map(r=>Number(r.oi_change)).filter(Number.isFinite);
    const liqSample=history.map(r=>Number(r.liq_5m)).filter(Number.isFinite);
    const flowSample=history.map(r=>Number(r.flow_delta_ratio)).filter(Number.isFinite);

    const directional=[
      directionSign(ret5,0.0001),
      directionSign(ret15,0.0002),
      directionSign(ctx?.score,0),
      directionSign(emaDistance,0.0002),
      directionSign(crossRet,0.001),
      directionSign(flow?.delta_ratio,0.05),
      directionSign(flow?.book_imbalance,0.05),
      directionSign((ls?.long_short_ratio??1)-1,0.03)
    ];
    const agree=agreementFromSignals(directional);
    const quality=this.dataQuality(ctx);

    const g={
      ts:Number(last?.t||Date.now()),
      price,
      ret_5m:ret5,
      ret_15m:ret15,
      atr_pct:f.atr_pct,
      volume_ratio:f.volume_ratio,
      ema_distance_pct:emaDistance,
      level_distance_pct:levelDistance,
      bias_score:Number(ctx?.score||0),
      oi_change:oiChange,
      funding_rate:funding?Number(funding.funding_rate):null,
      long_short_ratio:ls?.long_short_ratio===null||ls?.long_short_ratio===undefined?null:Number(ls.long_short_ratio),
      liq_5m:Number(liq.total||0),
      liq_imbalance:Number(liq.imbalance||0),
      cross_ret_60m:crossRet,
      flow_delta_ratio:flow?.delta_ratio===null||flow?.delta_ratio===undefined?null:Number(flow.delta_ratio),
      spread_bps:flow?.spread_bps===null||flow?.spread_bps===undefined?null:Number(flow.spread_bps),
      book_imbalance:flow?.book_imbalance===null||flow?.book_imbalance===undefined?null:Number(flow.book_imbalance),
      agreement:agree.agreement,
      entropy:agree.entropy,
      novelty:null,
      data_quality:quality.score,
      volume_surprise:percentileRank(f.volume_ratio,volumeSample),
      oi_surprise:percentileRank(Math.abs(oiChange??0),oiSample.map(Math.abs)),
      liq_surprise:percentileRank(liq.total,liqSample),
      flow_surprise:percentileRank(Math.abs(flow?.delta_ratio??0),flowSample.map(Math.abs))
    };

    const peers=this.rows("SELECT * FROM market_genomes ORDER BY ts DESC LIMIT 1000");
    const distances=peers.map(x=>weightedDistance(g,x,GENOME_DISTANCE_FIELDS)).filter(Number.isFinite);
    g.novelty=noveltyFromDistances(distances);

    const trend=f.trend_alignment;
    const leverage=oiChange===null?"OI?":oiChange>0.003?"OI_BUILD":oiChange<-0.003?"OI_UNWIND":"OI_FLAT";
    const flowState=g.flow_delta_ratio===null?"FLOW?":g.flow_delta_ratio>0.15?"BUY_FLOW":g.flow_delta_ratio<-0.15?"SELL_FLOW":"FLOW_BAL";
    g.state_label=`${trend}|${f.volatility_regime}|${leverage}|${flowState}`;
    g.fingerprint=[
      trend,f.volatility_regime,
      Math.round((g.volume_surprise??0.5)*10),
      Math.round((g.oi_surprise??0.5)*10),
      Math.round((g.liq_surprise??0.5)*10),
      Math.round((g.flow_surprise??0.5)*10),
      Math.round((g.agreement??0)*10),
      Math.round((g.novelty??0)*10)
    ].join(":");
    return g;
  }

  recordMarketGenome(ctx) {
    const g=this.buildMarketGenome(ctx);
    this.sql.exec(
      `INSERT OR REPLACE INTO market_genomes(
        ts,price,ret_5m,ret_15m,atr_pct,volume_ratio,ema_distance_pct,level_distance_pct,
        bias_score,oi_change,funding_rate,long_short_ratio,liq_5m,liq_imbalance,cross_ret_60m,
        flow_delta_ratio,spread_bps,book_imbalance,agreement,entropy,novelty,data_quality,
        volume_surprise,oi_surprise,liq_surprise,flow_surprise,state_label,fingerprint
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      g.ts,g.price,g.ret_5m,g.ret_15m,g.atr_pct,g.volume_ratio,g.ema_distance_pct,g.level_distance_pct,
      g.bias_score,g.oi_change,g.funding_rate,g.long_short_ratio,g.liq_5m,g.liq_imbalance,g.cross_ret_60m,
      g.flow_delta_ratio,g.spread_bps,g.book_imbalance,g.agreement,g.entropy,g.novelty,g.data_quality,
      g.volume_surprise,g.oi_surprise,g.liq_surprise,g.flow_surprise,g.state_label,g.fingerprint
    );
    return g;
  }

  updateGenomeOutcomes(nowTs=Date.now()) {
    const rows=this.rows(
      `SELECT ts,price,ret_fwd_15m,ret_fwd_60m,ret_fwd_240m
       FROM market_genomes WHERE ret_fwd_240m IS NULL ORDER BY ts ASC LIMIT 250`
    );
    const horizons=[["ret_fwd_15m",15],["ret_fwd_60m",60],["ret_fwd_240m",240]];
    for(const row of rows){
      const updates=[],vals=[];
      for(const [field,min] of horizons){
        if(row[field]!==null&&row[field]!==undefined) continue;
        const target=Number(row.ts)+min*60_000;
        if(nowTs<target) continue;
        const p=this.nearestAnyClose(target);
        if(!p) continue;
        updates.push(`${field}=?`);
        vals.push((Number(p.close)-Number(row.price))/Number(row.price));
      }
      if(updates.length){
        vals.push(row.ts);
        this.sql.exec(`UPDATE market_genomes SET ${updates.join(",")} WHERE ts=?`,...vals);
      }
    }
  }

  currentGenomeIntelligence(ctx, limit=20) {
    const current=this.buildMarketGenome(ctx);
    const rows=this.rows(
      "SELECT * FROM market_genomes WHERE ts<? ORDER BY ts DESC LIMIT 1500",
      current.ts
    );
    const scored=rows.map(r=>({
      ...r,
      distance:weightedDistance(current,r,GENOME_DISTANCE_FIELDS)
    })).filter(x=>Number.isFinite(x.distance)).sort((a,b)=>a.distance-b.distance);

    const twins=scored.slice(0,Math.max(1,Number(limit||20)));
    const withOutcome=twins.filter(x=>Number.isFinite(Number(x.ret_fwd_60m)));
    const avg60=withOutcome.length
      ? withOutcome.reduce((s,x)=>s+Number(x.ret_fwd_60m),0)/withOutcome.length:null;
    const sameDir=withOutcome.length
      ? withOutcome.filter(x=>Math.sign(Number(x.ret_fwd_60m))===Math.sign(Number(current.ret_15m||current.ret_5m||0))).length/withOutcome.length:null;

    const failure=withOutcome.length
      ? withOutcome.find(x=>Math.sign(Number(x.ret_fwd_60m))!==Math.sign(Number(current.ret_15m||current.ret_5m||0)))||null:null;

    return {
      current,
      sample:twins.length,
      outcomeSample:withOutcome.length,
      avgForward60m:avg60,
      sameDirectionRate:sameDir,
      nearestTwins:twins.slice(0,10),
      nearestFailureTwin:failure
    };
  }

  latestGenome() {
    return this.one("SELECT * FROM market_genomes ORDER BY ts DESC LIMIT 1");
  }

  coverageReport(ctx=null) {
    const summary=this.summary();
    const genomeCount=Number(this.one("SELECT COUNT(*) AS n FROM market_genomes")?.n||0);
    const flowCount=Number(this.one("SELECT COUNT(*) AS n FROM orderflow_5m")?.n||0);
    const currentQuality=ctx
      ? this.dataQuality(ctx)
      : (()=>{const q=this.one("SELECT * FROM data_quality_snapshots ORDER BY ts DESC LIMIT 1");
          return q?{score:Number(q.score),missing:JSON.parse(q.missing_json||"[]"),stale:JSON.parse(q.stale_json||"[]")} : null;})();
    const live=new Set([
      "price_structure","volatility","volume","ema_state","support_resistance","session",
      "open_interest","funding","long_short_ratio","liquidations","cross_asset","news_events",
      "orderflow_delta","spread","book_imbalance","data_quality","novelty","agreement_entropy",
      "historical_twins","counterfactuals","walk_forward","cost_model","edge_decay"
    ]);
    const partial=new Set([]);
    live.add("parameter_stability");
    const features=FEATURE_REGISTRY.map(f=>{
      const status=live.has(f.key)?"LIVE":partial.has(f.key)?"PARTIAL":"PLANNED";
      return {
        ...f,status,
        disadvantageIfMissing:Boolean(f.critical&&status==="PLANNED")
      };
    });
    return {features,summary,genomeCount,flowCount,currentQuality};
  }

  historicalBounds() {
    return this.one(
      "SELECT MIN(ts) AS min_ts, MAX(ts) AS max_ts, COUNT(*) AS n FROM historical_5m"
    ) || {min_ts:null,max_ts:null,n:0};
  }

  historicalReplayWindow(startTs,endTs) {
    return this.rows(
      `SELECT ts AS t,open AS o,high AS h,low AS l,close AS c,volume AS v
       FROM historical_5m WHERE ts>=? AND ts<=? ORDER BY ts ASC`,
      Number(startTs),Number(endTs)
    ).map(x=>({
      t:Number(x.t),o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),v:Number(x.v)
    }));
  }

  paramsHash(params) {
    return [
      Number(params.retestTol??0.0012).toFixed(6),
      Number(params.stopBuffer??0.0005).toFixed(6),
      Number(params.minRR??2).toFixed(2),
      Number(params.maxExtension??0.002).toFixed(6)
    ].join("|");
  }

  replayParameterSet() {
    const champion={retestTol:0.0012,stopBuffer:0.0005,minRR:2,maxExtension:0.002};
    const grid=parameterGrid().filter(p =>
      p.stopBuffer===0.0005 &&
      [0.0010,0.0012,0.0016].includes(p.retestTol) &&
      [1.5,2.0,2.5].includes(p.minRR)
    );
    const seen=new Set();
    return [champion,...grid].filter(p=>{
      const h=this.paramsHash(p);
      if(seen.has(h)) return false;
      seen.add(h); return true;
    });
  }

  recordReplayResult(setup,outcome,params) {
    if(!setup||!outcome)return 0;
    const hash=this.paramsHash(params);
    const levelBucket=Math.round(Number(setup.level||setup.entry)/5)*5;
    const signature=`${hash}|${setup.side}|${Number(setup.ts)}|${levelBucket}`;
    const t=setup.trends||{};
    const cur=this.sql.exec(
      `INSERT OR IGNORE INTO replay_results(
        signature,params_hash,params_json,ts,side,entry,stop,target,planned_rr,level,
        result,realized_r,mfe_r,mae_r,closed_ts,trend_5m,trend_15m,trend_1h,trend_4h
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      signature,hash,JSON.stringify(params),Number(setup.ts),setup.side,
      Number(setup.entry),Number(setup.stop),Number(setup.target),Number(setup.planned_rr),
      setup.level??null,outcome.result,outcome.realized_r??null,
      Number(outcome.mfe_r||0),Number(outcome.mae_r||0),outcome.closed_ts??null,
      t["5m"]||null,t["15m"]||null,t["1h"]||null,t["4h"]||null
    );
    return Number(cur.rowsWritten||0);
  }

  replayStats() {
    const rows=this.rows(
      `SELECT params_hash,params_json,
        COUNT(*) AS n,
        SUM(CASE WHEN result='TARGET' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN result='STOP' THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN result='AMBIGUOUS' THEN 1 ELSE 0 END) AS ambiguous,
        AVG(CASE WHEN realized_r IS NOT NULL THEN realized_r END) AS avg_r,
        AVG(mfe_r) AS avg_mfe,
        AVG(mae_r) AS avg_mae
       FROM replay_results GROUP BY params_hash,params_json ORDER BY n DESC`
    );
    return rows.map(r=>{
      const wins=Number(r.wins||0),losses=Number(r.losses||0),decided=wins+losses;
      const ci=wilsonInterval(wins,decided);
      return {
        paramsHash:r.params_hash,
        params:JSON.parse(r.params_json),
        n:Number(r.n||0),wins,losses,ambiguous:Number(r.ambiguous||0),
        hitRate:ci.p,hitLow95:ci.low,hitHigh95:ci.high,
        avgR:r.avg_r===null?null:Number(r.avg_r),
        avgMfe:r.avg_mfe===null?null:Number(r.avg_mfe),
        avgMae:r.avg_mae===null?null:Number(r.avg_mae)
      };
    });
  }

  parameterStabilityReport() {
    const stats=this.replayStats();
    if(!stats.length)return {status:"WAITING_FOR_REPLAY",variants:[]};
    const byRR={};
    for(const s of stats){
      const k=`RR_${s.params.minRR}`;
      if(!byRR[k])byRR[k]=[];
      byRR[k].push(s.avgR);
    }
    const neighborhood=Object.entries(byRR).map(([key,vals])=>({
      key,nVariants:vals.length,avgOfAvgR:researchMean(vals.filter(Number.isFinite))
    }));
    return {
      status:stats.length>=5?"ACTIVE":"EARLY",
      variants:stats,
      neighborhood,
      warning:"A single best parameter is not promoted automatically; stable neighborhoods matter more than an isolated optimum."
    };
  }

  setupValidationReport() {
    const closed=this.rows(
      `SELECT * FROM setups WHERE result IN ('TARGET','STOP') ORDER BY opened_ts ASC`
    );
    const wins=closed.filter(x=>x.result==="TARGET").length;
    const interval=wilsonInterval(wins,closed.length);
    const grossAvg=researchMean(closed.map(x=>Number(x.realized_r)).filter(Number.isFinite));
    const costScenarios=[4,8,12,20].map(bps=>({
      roundTripBps:bps,
      avgNetR:researchMean(closed.map(x=>costAdjustedR(x,bps)).filter(Number.isFinite))
    }));
    const walkForward=chronologicalBuckets(closed,4).map((bucket,i)=>{
      const w=bucket.filter(x=>x.result==="TARGET").length;
      const ci=wilsonInterval(w,bucket.length);
      return {
        fold:i+1,
        n:bucket.length,
        hitRate:ci.p,
        hitLow95:ci.low,
        hitHigh95:ci.high,
        avgR:researchMean(bucket.map(x=>Number(x.realized_r)).filter(Number.isFinite)),
        startTs:bucket[0]?.opened_ts||null,
        endTs:bucket.at(-1)?.opened_ts||null
      };
    });
    return {
      n:closed.length,
      wins,
      losses:closed.length-wins,
      hitRate:interval.p,
      hitLow95:interval.low,
      hitHigh95:interval.high,
      grossAvgR:grossAvg,
      costScenarios,
      walkForward,
      decay:decayWindows(closed),
      note:"Cost scenarios are sensitivity tests, not assumed broker/exchange fees."
    };
  }

  genomeResearchReport(limit=5000) {
    const rows=this.rows(
      `SELECT * FROM market_genomes WHERE ret_fwd_60m IS NOT NULL
       ORDER BY ts DESC LIMIT ?`,
      Math.min(10000,Math.max(100,Number(limit||5000)))
    );
    const hypotheses=buildHypotheses(rows).slice(0,30);
    const transitions=transitionMatrix(rows).slice(0,40);
    const events=this.recentTimeline(1000);
    const sequences=sequenceDNA(events,5).slice(0,30);
    return {
      sample:rows.length,
      hypotheses,
      transitions,
      sequenceDNA:sequences,
      warning:"Exploratory findings are hypotheses only. They require out-of-sample confirmation before being promoted to a rule."
    };
  }

  fullResearchReport(ctx=null) {
    return {
      generatedAt:Date.now(),
      validation:this.setupValidationReport(),
      genomeResearch:this.genomeResearchReport(),
      currentGenome:ctx?this.currentGenomeIntelligence(ctx,30):null,
      coverage:this.coverageReport(ctx),
      replay:this.replayStats(),
      parameterStability:this.parameterStabilityReport()
    };
  }

  recentTimeline(limit=100) {
    return this.rows(
      "SELECT * FROM market_timeline ORDER BY ts DESC LIMIT ?",
      Math.min(500,Math.max(1,Number(limit||100)))
    );
  }

  recordHistorical5m(rows, source = "bybit") {
    let written = 0;
    for (const row of rows || []) {
      const cur = this.sql.exec(
        `INSERT OR IGNORE INTO historical_5m(ts, open, high, low, close, volume, source)
         VALUES(?,?,?,?,?,?,?)`,
        Number(row.t), Number(row.o), Number(row.h), Number(row.l),
        Number(row.c), Number(row.v), source
      );
      written += Number(cur.rowsWritten || 0);
    }
    return written;
  }

  historical5mCount() {
    return Number(this.one("SELECT COUNT(*) AS n FROM historical_5m")?.n || 0);
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
    const ts=Date.now();
    this.sql.exec(
      `INSERT INTO alerts(ts, alert_key, stage, side, level, price, payload_json)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      ts, key, stage, side, level, price,
      payload ? JSON.stringify(payload) : null
    );
    this.recordTimeline({
      ts,eventType:"ALERT",subtype:stage,direction:side==="LONG"?1:side==="SHORT"?-1:null,
      magnitude:level,source:"system",payload:{key,price,...(payload||{})}
    });
  }

  sessionFor(ts) {
    const h = new Date(Number(ts)).getUTCHours();
    if (h < 7) return "ASIA_00_07_UTC";
    if (h < 13) return "EUROPE_07_13_UTC";
    if (h < 16) return "NY_OPEN_13_16_UTC";
    if (h < 21) return "US_16_21_UTC";
    return "LATE_21_24_UTC";
  }

  median(values) {
    const xs = values.filter(Number.isFinite).sort((a,b) => a-b);
    if (!xs.length) return 0;
    const m = Math.floor(xs.length/2);
    return xs.length % 2 ? xs[m] : (xs[m-1] + xs[m]) / 2;
  }

  factorsFromContext(ctx) {
    const c5 = Array.isArray(ctx?.c5) ? ctx.c5 : [];
    const latest = c5.at(-1);
    const ts = Number(latest?.t || Date.now());
    const price = Number(ctx?.price || latest?.c || 0);
    const recent = c5.slice(-101);
    const trs = [];
    for (let i=1;i<recent.length;i++) {
      const cur=recent[i], prev=recent[i-1];
      const tr=Math.max(
        cur.h-cur.l,
        Math.abs(cur.h-prev.c),
        Math.abs(cur.l-prev.c)
      );
      trs.push(prev.c ? tr/prev.c : 0);
    }
    const atr14 = trs.slice(-14).reduce((a,b)=>a+b,0) / Math.max(1, Math.min(14, trs.length));
    const baseline = this.median(trs.slice(-80));
    const volRatio = baseline > 0 ? atr14 / baseline : 1;
    const volatility_regime = volRatio < 0.70 ? "LOW"
      : volRatio < 1.30 ? "NORMAL"
      : volRatio < 2.00 ? "HIGH"
      : "EXTREME";

    const vols = c5.slice(-21,-1).map(x => Number(x.v));
    const volMedian = this.median(vols);
    const volume_ratio = volMedian > 0 && latest ? Number(latest.v)/volMedian : 1;

    const t = ctx?.trends || {};
    const bull = ["4h","1h","15m","5m"].filter(tf => t[tf] === "BULLISH").length;
    const bear = ["4h","1h","15m","5m"].filter(tf => t[tf] === "BEARISH").length;
    const trend_alignment = bull === 4 ? "ALL_BULL"
      : bear === 4 ? "ALL_BEAR"
      : bull >= 3 ? "BULL_ALIGNED"
      : bear >= 3 ? "BEAR_ALIGNED"
      : "MIXED";

    const e20=Number(ctx?.ema20||0), e50=Number(ctx?.ema50||0);
    const ema_state = price > e20 && price > e50 ? "ABOVE_BOTH"
      : price < e20 && price < e50 ? "BELOW_BOTH"
      : "BETWEEN";

    const levels=[ctx?.support,ctx?.resistance]
      .filter(x => typeof x === "number" && x > 0)
      .map(x => Math.abs(price-x)/price);
    const distance_level_pct = levels.length ? Math.min(...levels) : null;

    const patterns = this.detectPatterns(c5).map(x => x[0]);
    const recentNews = Number(this.one(
      "SELECT COUNT(*) AS n FROM news_events WHERE published_ts >= ?",
      ts - 60*60*1000
    )?.n || 0);

    return {
      ts,
      close: price,
      session: this.sessionFor(ts),
      volatility_regime,
      atr_pct: atr14,
      volume_ratio,
      trend_alignment,
      ema_state,
      distance_level_pct,
      pattern_tags: patterns.join(","),
      recent_news_60m: recentNews
    };
  }

  recordFactorSnapshot(ctx) {
    const f = this.factorsFromContext(ctx);
    this.sql.exec(
      `INSERT OR REPLACE INTO factor_snapshots(
        ts, close, session, volatility_regime, atr_pct, volume_ratio,
        trend_alignment, ema_state, distance_level_pct, pattern_tags, recent_news_60m
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      f.ts, f.close, f.session, f.volatility_regime, f.atr_pct, f.volume_ratio,
      f.trend_alignment, f.ema_state, f.distance_level_pct, f.pattern_tags, f.recent_news_60m
    );
    return f;
  }

  attachSetupFeatures(setupId, ctx) {
    const f = this.factorsFromContext(ctx);
    this.sql.exec(
      `INSERT OR REPLACE INTO setup_features(
        setup_id, session, volatility_regime, atr_pct, volume_ratio,
        trend_alignment, ema_state, distance_level_pct, pattern_tags, recent_news_60m
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      Number(setupId), f.session, f.volatility_regime, f.atr_pct, f.volume_ratio,
      f.trend_alignment, f.ema_state, f.distance_level_pct, f.pattern_tags, f.recent_news_60m
    );
    return f;
  }

  updateFactorOutcomes(nowTs = Date.now()) {
    const pending = this.rows(
      `SELECT ts, close, ret_15m, ret_60m, ret_240m, ret_1440m
       FROM factor_snapshots WHERE ret_1440m IS NULL
       ORDER BY ts ASC LIMIT 300`
    );
    const horizons=[["ret_15m",15],["ret_60m",60],["ret_240m",240],["ret_1440m",1440]];
    for (const row of pending) {
      const updates=[], values=[];
      for (const [field,min] of horizons) {
        if (row[field] !== null && row[field] !== undefined) continue;
        const target=Number(row.ts)+min*60_000;
        if (nowTs < target) continue;
        const p=this.nearestClose(target);
        if (!p) continue;
        updates.push(`${field}=?`);
        values.push((Number(p.close)-Number(row.close))/Number(row.close));
      }
      if (updates.length) {
        values.push(row.ts);
        this.sql.exec(`UPDATE factor_snapshots SET ${updates.join(", ")} WHERE ts=?`,...values);
      }
    }
  }

  matchingSetupHistory(side, ctx) {
    const f=this.factorsFromContext(ctx);
    const row=this.one(
      `SELECT COUNT(*) AS n,
        SUM(CASE WHEN s.result='TARGET' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN s.result='STOP' THEN 1 ELSE 0 END) AS losses,
        AVG(s.realized_r) AS avg_r,
        AVG(s.mfe_r) AS avg_mfe,
        AVG(s.mae_r) AS avg_mae
       FROM setups s JOIN setup_features f ON f.setup_id=s.id
       WHERE s.side=? AND s.result IN ('TARGET','STOP')
         AND f.session=? AND f.volatility_regime=?
         AND f.trend_alignment=? AND f.ema_state=?`,
      side, f.session, f.volatility_regime, f.trend_alignment, f.ema_state
    ) || {};
    const n=Number(row.n||0), wins=Number(row.wins||0), losses=Number(row.losses||0);
    return {
      factors:f,
      n,wins,losses,
      hitRate:n ? wins/n : null,
      avgR: row.avg_r === null ? null : Number(row.avg_r),
      avgMfe: row.avg_mfe === null ? null : Number(row.avg_mfe),
      avgMae: row.avg_mae === null ? null : Number(row.avg_mae),
      evidence: n >= 50 ? "STRONG_SAMPLE" : n >= 20 ? "USABLE_SAMPLE" : n >= 8 ? "EARLY_SAMPLE" : "LEARNING"
    };
  }

  factorEdgeStats() {
    return this.rows(
      `SELECT f.session, f.volatility_regime, f.trend_alignment, f.ema_state, s.side,
        COUNT(*) AS n,
        SUM(CASE WHEN s.result='TARGET' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN s.result='STOP' THEN 1 ELSE 0 END) AS losses,
        AVG(s.realized_r) AS avg_r,
        AVG(s.mfe_r) AS avg_mfe,
        AVG(s.mae_r) AS avg_mae
       FROM setups s JOIN setup_features f ON f.setup_id=s.id
       WHERE s.result IN ('TARGET','STOP')
       GROUP BY f.session, f.volatility_regime, f.trend_alignment, f.ema_state, s.side
       ORDER BY n DESC, avg_r DESC`
    );
  }

  factorSnapshotStats() {
    return this.rows(
      `SELECT session, volatility_regime, trend_alignment, ema_state,
        COUNT(*) AS n,
        AVG(ret_15m) AS avg_15m,
        AVG(ret_60m) AS avg_60m,
        AVG(ABS(ret_60m)) AS avg_abs_60m,
        AVG(ret_240m) AS avg_240m
       FROM factor_snapshots
       GROUP BY session, volatility_regime, trend_alignment, ema_state
       ORDER BY n DESC`
    );
  }

  alertFunnel() {
    return this.rows(
      `SELECT stage, COUNT(*) AS n FROM alerts GROUP BY stage ORDER BY n DESC`
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
    const row = this.one("SELECT * FROM setups WHERE signature = ?", signature);
    if (row?.id) this.attachSetupFeatures(row.id, ctx);
    return row;
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

  bootstrapPatternHistory(candles) {
    if (!Array.isArray(candles) || candles.length < 300) return 0;
    let inserted = 0;
    const retAt = (i, bars) => {
      const j=i+bars;
      if (j >= candles.length) return null;
      const base=Number(candles[i].c);
      return base ? (Number(candles[j].c)-base)/base : null;
    };

    for (let i=2;i<candles.length;i++) {
      const slice=candles.slice(Math.max(0,i-2),i+1);
      const candle=candles[i];
      for (const [pattern,direction] of this.detectPatterns(slice)) {
        const cur=this.sql.exec(
          `INSERT OR IGNORE INTO pattern_occurrences(
            candle_ts, pattern, direction, open, high, low, close, volume,
            trend_5m, trend_15m, trend_1h, trend_4h, bias_score,
            ret_15m, ret_60m, ret_240m, ret_1440m
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          Number(candle.t), pattern, direction,
          Number(candle.o), Number(candle.h), Number(candle.l), Number(candle.c), Number(candle.v),
          null,null,null,null,null,
          retAt(i,3), retAt(i,12), retAt(i,48), retAt(i,288)
        );
        inserted += Number(cur.rowsWritten || 0);
      }
    }
    return inserted;
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
      marketMinutes: Number(this.one("SELECT COUNT(*) AS n FROM market_minutes")?.n || 0),
      historical5m: this.historical5mCount(),
      openInterestRows: Number(this.one("SELECT COUNT(*) AS n FROM open_interest_history")?.n || 0),
      longShortRows: Number(this.one("SELECT COUNT(*) AS n FROM long_short_history")?.n || 0),
      fundingRows: Number(this.one("SELECT COUNT(*) AS n FROM funding_history")?.n || 0),
      crossAssetRows: Number(this.one("SELECT COUNT(*) AS n FROM cross_asset_history")?.n || 0),
      orderflow5mRows: Number(this.one("SELECT COUNT(*) AS n FROM orderflow_5m")?.n || 0),
      genomeRows: Number(this.one("SELECT COUNT(*) AS n FROM market_genomes")?.n || 0),
      timelineEvents: Number(this.one("SELECT COUNT(*) AS n FROM market_timeline")?.n || 0),
      replayResults: Number(this.one("SELECT COUNT(*) AS n FROM replay_results")?.n || 0)
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
      factorEdgeStats: this.factorEdgeStats(),
      factorSnapshotStats: this.factorSnapshotStats(),
      alertFunnel: this.alertFunnel(),
      recentSetups: this.recentSetups(50),
      recentNews: this.recentNews(50),
      recentPatterns: this.recentPatterns(50),
      externalMarket: this.externalMarketSummary(),
      coverage: this.coverageReport(),
      recentTimeline: this.recentTimeline(50),
      validation: this.setupValidationReport(),
      latestGenome: this.latestGenome(),
      replayStats: this.replayStats(),
      parameterStability: this.parameterStabilityReport()
    };
  }
}

export function renderTradingCenter(snapshot) {
  const pct = x => x === null || x === undefined ? "—" : (Number(x) * 100).toFixed(1) + "%";
  const num = x => x === null || x === undefined ? "—" : Number(x).toFixed(2);
  const s = snapshot.summary.setups;

  const g = snapshot.latestGenome || {};
  const quality = snapshot.coverage?.currentQuality?.score ?? g.data_quality ?? null;
  const replayRows = (snapshot.replayStats || []).slice(0,10).map(r => `
    <tr><td>${r.paramsHash}</td><td>${r.n}</td><td>${pct(r.hitRate)}</td>
    <td>${r.avgR===null?"—":num(r.avgR)+"R"}</td><td>${r.avgMfe===null?"—":num(r.avgMfe)+"R"}</td>
    <td>${r.avgMae===null?"—":num(r.avgMae)+"R"}</td></tr>
  `).join("");
  const coverageRows = (snapshot.coverage?.features || []).map(f => `
    <tr><td>${f.group}</td><td>${f.key}</td><td>${f.status}</td><td>${f.critical?"critical":"support"}</td></tr>
  `).join("");

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

  const edgeRows = (snapshot.factorEdgeStats || []).slice(0, 12).map(r => {
    const decided=Number(r.wins||0)+Number(r.losses||0);
    const hit=decided ? Number(r.wins||0)/decided : null;
    const sample=Number(r.n||0) >= 50 ? "STRONG" : Number(r.n||0) >= 20 ? "USABLE" : Number(r.n||0) >= 8 ? "EARLY" : "LEARNING";
    return `<tr><td>${r.side}</td><td>${r.session}</td><td>${r.volatility_regime}</td>
      <td>${r.trend_alignment}</td><td>${r.ema_state}</td><td>${r.n}</td>
      <td>${pct(hit)}</td><td>${r.avg_r===null?"—":num(r.avg_r)+"R"}</td><td>${sample}</td></tr>`;
  }).join("");

  const funnelRows = (snapshot.alertFunnel || []).slice(0, 16).map(r => `
    <tr><td>${r.stage}</td><td>${r.n}</td></tr>
  `).join("");

  const factorRows = (snapshot.factorSnapshotStats || []).slice(0, 12).map(r => `
    <tr><td>${r.session}</td><td>${r.volatility_regime}</td><td>${r.trend_alignment}</td>
    <td>${r.ema_state}</td><td>${r.n}</td><td>${pct(r.avg_60m)}</td><td>${pct(r.avg_abs_60m)}</td></tr>
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
    .pill{display:inline-block;padding:5px 9px;border-radius:999px;background:#20242b;color:#c9d0da;font-size:12px;margin-right:6px}
    .section{overflow-x:auto}.topline{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 18px}
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
      <div class="card"><div class="big">${quality===null?"—":Number(quality).toFixed(0)+"/100"}</div><div>Datenqualität</div></div>
      <div class="card"><div class="big">${g.novelty===null||g.novelty===undefined?"—":pct(g.novelty)}</div><div>Market Novelty</div></div>
      <div class="card"><div class="big">${g.agreement===null||g.agreement===undefined?"—":pct(g.agreement)}</div><div>Signal Agreement</div></div>
      <div class="card"><div class="big">${snapshot.summary.genomeRows||0}</div><div>Market Genomes</div></div>
      <div class="card"><div class="big">${snapshot.summary.replayResults||0}</div><div>Replay-Ergebnisse</div></div>
    </div>

    <div class="topline">
      <span class="pill">LIVE + DATABASE</span>
      <span class="pill">FACTOR INTELLIGENCE</span>
      <span class="pill">GLOBAL EVENT RADAR</span>
      <span class="pill">PAPER-TRACKING</span>
      <span class="pill">MARKET GENOME</span>
      <span class="pill">NO-LOOKAHEAD REPLAY</span>
      <span class="pill">FALSIFICATION LAB</span>
    </div>

    <h2>Market Genome · aktueller Zustand</h2>
    <div class="grid">
      <div class="card"><div class="big">${g.state_label || "—"}</div><div>State DNA</div></div>
      <div class="card"><div class="big">${g.entropy===null||g.entropy===undefined?"—":num(g.entropy)}</div><div>Informationsentropie</div></div>
      <div class="card"><div class="big">${g.flow_delta_ratio===null||g.flow_delta_ratio===undefined?"—":pct(g.flow_delta_ratio)}</div><div>Taker Flow Delta</div></div>
      <div class="card"><div class="big">${g.oi_change===null||g.oi_change===undefined?"—":pct(g.oi_change)}</div><div>OI Δ</div></div>
      <div class="card"><div class="big">${g.liq_5m===null||g.liq_5m===undefined?"—":Number(g.liq_5m).toLocaleString("en-US",{maximumFractionDigits:0})}</div><div>Liquidationen 5m · USDT</div></div>
    </div>
    <p class="note">Novelty misst historische Unähnlichkeit. Agreement/Entropie beschreiben, wie stark unabhängige Datenquellen übereinstimmen; sie sind keine Gewinnwahrscheinlichkeit.</p>

    <h2>No-Lookahead Replay & Parameter-Stabilität</h2>
    <p class="note">Die Replay Engine sieht pro historischem Zeitpunkt nur Daten, die damals bereits geschlossen waren. Varianten werden nicht automatisch zur Live-Regel befördert.</p>
    <div class="section"><table><thead><tr><th>Parameter</th><th>N</th><th>TP-Quote</th><th>Ø R</th><th>Ø MFE</th><th>Ø MAE</th></tr></thead><tbody>${replayRows}</tbody></table></div>

    <h2>Feature Coverage</h2>
    <p class="note">Fehlende kritische Datenquellen bleiben explizit sichtbar, statt stillschweigend als Null behandelt zu werden.</p>
    <div class="section"><table><thead><tr><th>Gruppe</th><th>Feature</th><th>Status</th><th>Priorität</th></tr></thead><tbody>${coverageRows}</tbody></table></div>

    <h2>Letzte Setups</h2>
    <table><thead><tr><th>ID</th><th>Side</th><th>Status</th><th>Ergebnis</th><th>Plan</th><th>Realisiert</th></tr></thead><tbody>${setupRows}</tbody></table>

    <h2>Intelligence Layer: Setup-Kombinationen</h2>
    <p class="note">Session + Volatilitätsregime + Trend-Ausrichtung + EMA-Lage. Aussagekraft wird erst mit größerem N sinnvoll.</p>
    <div class="section"><table><thead><tr><th>Side</th><th>Session</th><th>Vol</th><th>Trend</th><th>EMA</th><th>N</th><th>TP-Quote</th><th>Ø R</th><th>Sample</th></tr></thead><tbody>${edgeRows}</tbody></table></div>

    <h2>Marktregime: Verhalten ohne Setup</h2>
    <p class="note">Misst, wie BTC sich in verschiedenen Marktregimen historisch danach bewegt hat.</p>
    <div class="section"><table><thead><tr><th>Session</th><th>Vol</th><th>Trend</th><th>EMA</th><th>N</th><th>Ø 1h</th><th>Ø |1h|</th></tr></thead><tbody>${factorRows}</tbody></table></div>

    <h2>Signal-Funnel</h2>
    <p class="note">Zeigt, wie oft RADAR/PREPARE/BREAK/SETUP usw. tatsächlich auftreten.</p>
    <div class="section"><table><thead><tr><th>Stufe</th><th>Anzahl</th></tr></thead><tbody>${funnelRows}</tbody></table></div>

    <h2>Candle-Pattern Statistik</h2>
    <table><thead><tr><th>Pattern</th><th>N</th><th>60m Richtungsquote</th><th>Ø 15m</th><th>Ø 1h</th><th>Ø 4h</th></tr></thead><tbody>${patternRows}</tbody></table>

    <h2>News-Kategorien: BTC-Bewegung danach</h2>
    <p class="note">Das misst zeitliche Preisreaktion nach einer Meldung, nicht bewiesene Kausalität.</p>
    <table><thead><tr><th>Kategorie</th><th>N</th><th>Ø |15m|</th><th>Ø |1h|</th><th>Ø |4h|</th></tr></thead><tbody>${newsRows}</tbody></table>

    <p class="note">* TP-Quote = TARGET / (TARGET + STOP). Ambiguous-1m-Kerzen werden nicht als Gewinn/Verlust gewertet.</p>
  </main></body></html>`;
}
