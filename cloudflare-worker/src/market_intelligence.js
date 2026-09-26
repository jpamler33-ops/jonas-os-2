export const FEATURE_REGISTRY = [
  { key: "price_structure", group: "price", critical: true },
  { key: "volatility", group: "price", critical: true },
  { key: "volume", group: "price", critical: true },
  { key: "ema_state", group: "price", critical: false },
  { key: "support_resistance", group: "structure", critical: true },
  { key: "session", group: "time", critical: false },
  { key: "open_interest", group: "derivatives", critical: true },
  { key: "funding", group: "derivatives", critical: true },
  { key: "long_short_ratio", group: "derivatives", critical: false },
  { key: "liquidations", group: "derivatives", critical: true },
  { key: "cross_asset", group: "cross_market", critical: true },
  { key: "news_events", group: "macro", critical: true },
  { key: "official_macro_calendar", group: "macro", critical: true },
  { key: "macro_risk_window", group: "macro", critical: true },
  { key: "macro_reaction_history", group: "macro", critical: true },
  { key: "historical_gap_audit", group: "system", critical: true },
  { key: "multi_exchange_confirmation", group: "cross_market", critical: true },
  { key: "spot_perp_dislocation", group: "cross_market", critical: true },
  { key: "tick_orderflow", group: "microstructure", critical: false },
  { key: "orderflow_delta", group: "microstructure", critical: true },
  { key: "spread", group: "microstructure", critical: true },
  { key: "book_imbalance", group: "microstructure", critical: false },
  { key: "data_quality", group: "system", critical: true },
  { key: "novelty", group: "research", critical: true },
  { key: "agreement_entropy", group: "research", critical: true },
  { key: "historical_twins", group: "research", critical: true },
  { key: "counterfactuals", group: "research", critical: true },
  { key: "walk_forward", group: "validation", critical: true },
  { key: "cost_model", group: "validation", critical: true },
  { key: "parameter_stability", group: "validation", critical: true },
  { key: "edge_decay", group: "validation", critical: true },
  { key: "data_quality_lock", group: "system", critical: true },
  { key: "feed_latency_monitor", group: "system", critical: true },
  { key: "feed_redundancy", group: "system", critical: true },
  { key: "historical_genome_bootstrap", group: "research", critical: true },
  { key: "sequence_outcomes", group: "research", critical: true },
  { key: "lead_lag_network", group: "research", critical: true },
  { key: "change_point_detection", group: "research", critical: true },
  { key: "missed_opportunity_analysis", group: "research", critical: true },
  { key: "failure_attribution", group: "research", critical: true },
  { key: "alert_value_tracking", group: "research", critical: false },
  { key: "shadow_strategies", group: "validation", critical: true },
  { key: "hypothesis_falsification", group: "validation", critical: true },
  { key: "probability_calibration", group: "validation", critical: true },
  { key: "slippage_model", group: "execution", critical: true },
  { key: "latency_cost_model", group: "execution", critical: false },
  { key: "orderbook_depth", group: "microstructure", critical: true },
  { key: "liquidity_sweep_detection", group: "microstructure", critical: true },
  { key: "options_iv_skew", group: "options", critical: false },
  { key: "options_term_structure", group: "options", critical: false },
  { key: "traditional_risk_assets", group: "cross_market", critical: true },
  { key: "usd_rates_context", group: "cross_market", critical: true },
  { key: "coinbase_premium", group: "cross_market", critical: false }
];

export function clamp(x, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, Number(x)));
}

export function mean(xs) {
  const v = (xs || []).map(Number).filter(Number.isFinite);
  return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
}

export function stddev(xs) {
  const v = (xs || []).map(Number).filter(Number.isFinite);
  if (v.length < 2) return null;
  const m = mean(v);
  return Math.sqrt(v.reduce((s,x)=>s+(x-m)*(x-m),0)/(v.length-1));
}

export function zScore(value, sample) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const m = mean(sample);
  const sd = stddev(sample);
  if (m === null || !sd || !Number.isFinite(sd)) return null;
  return (v-m)/sd;
}

export function percentileRank(value, sample) {
  const v = Number(value);
  const xs = (sample || []).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!Number.isFinite(v) || !xs.length) return null;
  let n = 0;
  for (const x of xs) if (x <= v) n++;
  return n/xs.length;
}

export function binaryEntropy(prob) {
  const p = clamp(prob, 1e-9, 1-1e-9);
  return -(p*Math.log2(p)+(1-p)*Math.log2(1-p));
}

export function agreementFromSignals(signals = []) {
  const xs = signals.map(Number).filter(Number.isFinite).map(x => x > 0 ? 1 : x < 0 ? -1 : 0);
  const directional = xs.filter(x => x !== 0);
  if (!directional.length) return { agreement: 0, entropy: 1, direction: 0, n: 0 };
  const pos = directional.filter(x => x > 0).length;
  const neg = directional.length - pos;
  const p = pos/directional.length;
  const direction = pos === neg ? 0 : pos > neg ? 1 : -1;
  const rawAgreement = Math.max(pos,neg)/directional.length;
  return {
    agreement: rawAgreement,
    entropy: binaryEntropy(p),
    direction,
    n: directional.length
  };
}

export function weightedDistance(a, b, fields) {
  let sum = 0, wsum = 0, missingWeight = 0, availableWeight = 0;
  for (const f of fields) {
    const x = Number(a?.[f.key]), y = Number(b?.[f.key]);
    const xOk=Number.isFinite(x), yOk=Number.isFinite(y);
    const w = Number(f.weight || 1);
    if (!xOk && !yOk) continue;
    availableWeight += w;
    if (!xOk || !yOk) {
      const missingPenalty=1.5;
      sum += w*missingPenalty*missingPenalty;
      wsum += w;
      missingWeight += w;
      continue;
    }
    const scale = Number(f.scale || 1);
    const d = (x-y)/Math.max(1e-9,scale);
    sum += w*d*d;
    wsum += w;
  }
  if(!wsum) return null;
  const base=Math.sqrt(sum/wsum);
  const missingShare=availableWeight?missingWeight/availableWeight:0;
  return base*(1+0.5*missingShare);
}

export const GENOME_DISTANCE_FIELDS = [
  { key: "ret_5m", scale: 0.004, weight: 1.3 },
  { key: "ret_15m", scale: 0.008, weight: 1.0 },
  { key: "atr_pct", scale: 0.004, weight: 1.2 },
  { key: "volume_ratio", scale: 1.0, weight: 0.9 },
  { key: "ema_distance_pct", scale: 0.006, weight: 0.7 },
  { key: "level_distance_pct", scale: 0.008, weight: 1.0 },
  { key: "oi_change", scale: 0.01, weight: 1.3 },
  { key: "funding_rate", scale: 0.0005, weight: 0.7 },
  { key: "long_short_ratio", scale: 0.35, weight: 0.6 },
  { key: "liq_imbalance", scale: 1.0, weight: 1.0 },
  { key: "cross_ret_60m", scale: 0.02, weight: 0.8 },
  { key: "flow_delta_ratio", scale: 1.0, weight: 1.3 },
  { key: "spread_bps", scale: 4.0, weight: 0.5 },
  { key: "book_imbalance", scale: 1.0, weight: 0.6 }
];

export function noveltyFromDistances(distances = []) {
  const xs = distances.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!xs.length) return null;
  const nearest = xs.slice(0, Math.min(10,xs.length));
  const avg = mean(nearest);
  return avg === null ? null : clamp(avg/2.5,0,1);
}

export function directionSign(value, deadband = 0) {
  const x = Number(value);
  if (!Number.isFinite(x) || Math.abs(x) <= deadband) return 0;
  return x > 0 ? 1 : -1;
}
