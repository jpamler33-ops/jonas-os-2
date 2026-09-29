export function candleFromKline(row, asOf = Date.now()) {
  if (!Array.isArray(row) || row.length < 7) throw new Error('Invalid kline row');
  const candle = {
    openTime: Number(row[0]),
    o: Number(row[1]),
    h: Number(row[2]),
    l: Number(row[3]),
    c: Number(row[4]),
    v: Number(row[5]),
    closeTime: Number(row[6]),
  };
  candle.closed = Number.isFinite(candle.closeTime) && candle.closeTime <= asOf;
  return candle;
}

export function candlesFromKlines(rows, asOf = Date.now()) {
  return rows.map(row => candleFromKline(row, asOf));
}

export function closedCandles(candles) {
  return candles.filter(c => c.closed === true);
}

export function ema(values, period) {
  if (!Array.isArray(values) || values.length === 0) return [];
  if (!Number.isInteger(period) || period < 1) throw new Error('Invalid EMA period');
  const alpha = 2 / (period + 1);
  const out = [Number(values[0])];
  for (let i = 1; i < values.length; i++) {
    const v = Number(values[i]);
    out.push(alpha * v + (1 - alpha) * out[out.length - 1]);
  }
  return out;
}

export function pivots(candles, window = 2) {
  const xs = closedCandles(candles);
  const out = [];
  for (let i = window; i < xs.length - window; i++) {
    const c = xs[i];
    const slice = xs.slice(i - window, i + window + 1);
    const highs = slice.map(x => x.h);
    const lows = slice.map(x => x.l);
    if (c.h === Math.max(...highs) && highs.filter(x => x === c.h).length === 1) {
      out.push({ i, openTime:c.openTime, price:c.h, kind:'H' });
    }
    if (c.l === Math.min(...lows) && lows.filter(x => x === c.l).length === 1) {
      out.push({ i, openTime:c.openTime, price:c.l, kind:'L' });
    }
  }
  return out.sort((a,b) => a.i - b.i);
}

export function classifyPivots(items) {
  let prevHigh = null;
  let prevLow = null;
  return items.map(p => {
    let label = p.kind;
    if (p.kind === 'H') {
      if (prevHigh != null) label = p.price > prevHigh ? 'HH' : p.price < prevHigh ? 'LH' : 'EH';
      prevHigh = p.price;
    } else {
      if (prevLow != null) label = p.price > prevLow ? 'HL' : p.price < prevLow ? 'LL' : 'EL';
      prevLow = p.price;
    }
    return { ...p, label };
  });
}

export function trendFromPivots(items) {
  const highs = items.filter(p => p.kind === 'H').slice(-2);
  const lows = items.filter(p => p.kind === 'L').slice(-2);
  if (highs.length < 2 || lows.length < 2) return 'NEUTRAL';
  if (highs[1].price > highs[0].price && lows[1].price > lows[0].price) return 'BULLISH';
  if (highs[1].price < highs[0].price && lows[1].price < lows[0].price) return 'BEARISH';
  return 'NEUTRAL';
}

export function nearestLevels(candles, price, lookback = 120) {
  const xs = closedCandles(candles).slice(-lookback);
  const ps = pivots(xs, 2);
  const below = [...new Set(ps.filter(p => p.price < price).map(p => p.price))].sort((a,b) => b-a);
  const above = [...new Set(ps.filter(p => p.price > price).map(p => p.price))].sort((a,b) => a-b);
  return { support: below[0] ?? null, resistance: above[0] ?? null };
}

export function breakRetestState(candles, side, { lookback = 16, searchBars = 10, retestTolerance = 0.0012, minBreakPct = 0.00015 } = {}) {
  const xs = closedCandles(candles);
  const n = xs.length;
  if (n < lookback + 8) return null;
  const start = Math.max(lookback, n - searchBars);
  for (let b = start; b < n; b++) {
    const history = xs.slice(Math.max(0, b - lookback), b);
    if (history.length < Math.min(10, lookback)) continue;
    if (side === 'LONG') {
      const level = Math.max(...history.map(x => x.h));
      if (xs[b].c <= level || (xs[b].c - level) / level < minBreakPct) continue;
      for (let r = b + 1; r < Math.min(n, b + 7); r++) {
        const touched = xs[r].l <= level * (1 + retestTolerance);
        const held = xs[r].c >= level * (1 - retestTolerance);
        if (touched && held && xs[n-1].c >= level) {
          return { side, stage:'BREAK_RETEST_CONFIRMED', level, breakIndex:b, retestIndex:r };
        }
      }
      if (b === n - 1) return { side, stage:'BREAK_CLOSE', level, breakIndex:b, retestIndex:null };
    } else {
      const level = Math.min(...history.map(x => x.l));
      if (xs[b].c >= level || (level - xs[b].c) / level < minBreakPct) continue;
      for (let r = b + 1; r < Math.min(n, b + 7); r++) {
        const touched = xs[r].h >= level * (1 - retestTolerance);
        const held = xs[r].c <= level * (1 + retestTolerance);
        if (touched && held && xs[n-1].c <= level) {
          return { side, stage:'BREAK_RETEST_CONFIRMED', level, breakIndex:b, retestIndex:r };
        }
      }
      if (b === n - 1) return { side, stage:'BREAK_CLOSE', level, breakIndex:b, retestIndex:null };
    }
  }
  return null;
}

export function analyzeStructure(candles, { window = 2 } = {}) {
  const closed = closedCandles(candles);
  if (closed.length < 10) {
    return {
      barsClosed:closed.length,
      trend:'INSUFFICIENT',
      pivots:[], classifiedPivots:[], ema20:null, ema50:null,
      support:null, resistance:null, pattern:null, lastClose:closed.at(-1)?.c ?? null,
    };
  }
  const closes = closed.map(c => c.c);
  const ps = pivots(closed, window);
  const classified = classifyPivots(ps);
  const trend = trendFromPivots(ps);
  const e20s = ema(closes, 20);
  const e50s = ema(closes, 50);
  const lastClose = closed.at(-1).c;
  const { support, resistance } = nearestLevels(closed, lastClose);
  const long = breakRetestState(closed, 'LONG');
  const short = breakRetestState(closed, 'SHORT');
  let pattern = long || short || null;
  if (long && short) {
    const li = long.retestIndex ?? long.breakIndex;
    const si = short.retestIndex ?? short.breakIndex;
    pattern = li >= si ? long : short;
  }
  return {
    barsClosed:closed.length,
    trend,
    pivots:ps,
    classifiedPivots:classified,
    ema20:e20s.at(-1) ?? null,
    ema50:e50s.at(-1) ?? null,
    support,
    resistance,
    pattern,
    lastClose,
  };
}

export function analyzeMultiTimeframe(byTf) {
  const analyses = {};
  for (const [tf,candles] of Object.entries(byTf)) analyses[tf] = analyzeStructure(candles);
  const weights = { '4h':2, '1h':2, '15m':1, '5m':1 };
  let biasScore = 0;
  for (const [tf,w] of Object.entries(weights)) {
    const t = analyses[tf]?.trend;
    if (t === 'BULLISH') biasScore += w;
    else if (t === 'BEARISH') biasScore -= w;
  }
  const bias = biasScore >= 3 ? 'BULLISH' : biasScore <= -3 ? 'BEARISH' : 'MIXED';
  return { analyses, biasScore, bias };
}
