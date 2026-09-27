import { sha256 } from '../institutional-kernel.mjs';

export const LIQUIDITY_INTELLIGENCE_VERSION='TCX_LIQUIDITY_INTELLIGENCE_V1';

const clamp01=x=>Math.max(0,Math.min(1,Number(x)||0));

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function normalizeSide(rows,side,topN){
  const out=[];
  let invalid=0;
  for(const raw of Array.isArray(rows)?rows.slice(0,topN):[]){
    const p=finite(raw?.[0]);
    const q=finite(raw?.[1]);
    if(!(p>0)||!(q>0)){invalid++;continue;}
    out.push({side,price:p,qty:q,notional:p*q});
  }
  return {rows:out,invalid};
}

export function analyzeLiquiditySnapshot(asOf,book,{
  topN=20,
  maxAgeMs=15_000,
  maxSpreadBps=80
}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');

  const availableAt=finite(book?.availableAt);
  const timestamp=finite(book?.timestamp);
  const reasons=[];

  if(availableAt==null||timestamp==null){
    return Object.freeze({
      version:LIQUIDITY_INTELLIGENCE_VERSION,
      asOf:t,
      gate:'ABSTAIN',
      status:'INVALID',
      reasons:['BOOK_TIME_MISSING'],
      executionMode:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    });
  }

  if(availableAt>t||timestamp>t){
    return Object.freeze({
      version:LIQUIDITY_INTELLIGENCE_VERSION,
      asOf:t,
      gate:'ABSTAIN',
      status:'INVALID',
      reasons:['BOOK_FROM_FUTURE'],
      executionMode:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    });
  }

  const ageMs=Math.max(0,t-availableAt);
  const bidsN=normalizeSide(book?.bids,'BID',topN);
  const asksN=normalizeSide(book?.asks,'ASK',topN);
  const bids=bidsN.rows.sort((a,b)=>b.price-a.price);
  const asks=asksN.rows.sort((a,b)=>a.price-b.price);

  if(!bids.length||!asks.length){
    return Object.freeze({
      version:LIQUIDITY_INTELLIGENCE_VERSION,
      asOf:t,
      gate:'INSUFFICIENT',
      status:'INSUFFICIENT',
      ageMs,
      reasons:['BOOK_SIDE_EMPTY'],
      invalidLevels:bidsN.invalid+asksN.invalid,
      executionMode:'SHADOW_ONLY',
      action:'ABSTAIN',
      canExecute:false
    });
  }

  const bestBid=bids[0].price,bestAsk=asks[0].price;
  if(bestAsk<bestBid) reasons.push('CROSSED_BOOK');

  const mid=(bestBid+bestAsk)/2;
  const spreadBps=(bestAsk-bestBid)/mid*10_000;
  if(ageMs>Number(maxAgeMs)) reasons.push('BOOK_STALE');
  if(spreadBps>Number(maxSpreadBps)) reasons.push('SPREAD_EXTREME');

  const bidNotional=bids.reduce((s,x)=>s+x.notional,0);
  const askNotional=asks.reduce((s,x)=>s+x.notional,0);
  const total=bidNotional+askNotional;
  const imbalance=total>0?(bidNotional-askNotional)/total:0;
  const avgNotional=total/Math.max(1,bids.length+asks.length);

  const visibleLevels=[...bids,...asks]
    .map(x=>({
      ...x,
      distanceBps:x.side==='BID'
        ?(mid-x.price)/mid*10_000
        :(x.price-mid)/mid*10_000,
      sizeVsAverage:x.notional/Math.max(1e-9,avgNotional),
      evidenceType:'OBSERVED_ORDER_BOOK',
      durability:'UNKNOWN_TRANSIENT_VISIBLE_LIQUIDITY'
    }))
    .sort((a,b)=>b.notional-a.notional)
    .slice(0,8);

  let gate='PASS';
  if(reasons.includes('CROSSED_BOOK')||reasons.includes('BOOK_STALE')) gate='ABSTAIN';
  else if(reasons.length||bidsN.invalid+asksN.invalid>0) gate='CAUTION';

  const core={
    version:LIQUIDITY_INTELLIGENCE_VERSION,
    asOf:t,
    gate,
    status:gate==='ABSTAIN'?'INVALID':'OK',
    source:String(book?.source??'UNKNOWN'),
    sourceVersion:String(book?.version??'UNKNOWN'),
    timestamp,
    availableAt,
    ageMs,
    bestBid,
    bestAsk,
    mid,
    spreadBps,
    bidNotional,
    askNotional,
    imbalance,
    visibleBookPressure:clamp01((imbalance+1)/2),
    visibleLevels,
    invalidLevels:bidsN.invalid+asksN.invalid,
    reasons,
    caveats:[
      'VISIBLE_LIQUIDITY_IS_NOT_COMMITMENT',
      'SPOOFING_CANNOT_BE_IDENTIFIED_FROM_ONE_SNAPSHOT',
      'BOOK_IMBALANCE_IS_NOT_FORECAST_PROBABILITY'
    ],
    epistemic:'OBSERVED_MICROSTRUCTURE_WITH_DERIVED_DIAGNOSTICS',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };

  return Object.freeze({...core,fingerprint:sha256(core)});
}

export function buildLiquidityMap({
  snapshot,
  swings=[],
  roundNumbers=[],
  liquidationClusters=[]
}={}){
  const zones=[];

  for(const l of snapshot?.visibleLevels||[]){
    zones.push({
      price:Number(l.price),
      type:l.side==='ASK'?'VISIBLE_SUPPLY':'VISIBLE_DEMAND',
      strength:clamp01(Number(l.sizeVsAverage)/5),
      evidenceType:'OBSERVED_ORDER_BOOK',
      durability:'UNKNOWN_TRANSIENT_VISIBLE_LIQUIDITY'
    });
  }

  for(const s of Array.isArray(swings)?swings:[]){
    const price=finite(s?.price);
    if(!(price>0)) continue;
    zones.push({
      price,
      type:String(s?.type??'SWING'),
      strength:clamp01(s?.strength??.45),
      evidenceType:'DERIVED_STRUCTURE',
      durability:'STRUCTURAL_LEVEL_NOT_ORDER_COMMITMENT'
    });
  }

  for(const r of Array.isArray(roundNumbers)?roundNumbers:[]){
    const price=finite(r);
    if(!(price>0)) continue;
    zones.push({
      price,
      type:'ROUND_NUMBER',
      strength:.25,
      evidenceType:'HEURISTIC',
      durability:'UNKNOWN'
    });
  }

  for(const c of Array.isArray(liquidationClusters)?liquidationClusters:[]){
    const price=finite(c?.price);
    if(!(price>0)) continue;
    zones.push({
      price,
      type:'LIQUIDATION_CLUSTER',
      strength:clamp01(c?.strength??.5),
      evidenceType:String(c?.evidenceType??'MODEL_ESTIMATE'),
      durability:'MODEL_DEPENDENT'
    });
  }

  return Object.freeze({
    version:'TCX_LIQUIDITY_MAP_V1',
    asOf:Number(snapshot?.asOf),
    zones:zones.sort((a,b)=>b.strength-a.strength),
    epistemic:'MIXED_EVIDENCE_TYPES_PRESERVED',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  });
}

export function inferLiquidityReaction({
  aggressiveFlow=0,
  priceResponse=0,
  visibleBarrierStrength=0,
  approachVelocity=0
}={}){
  const absorption=clamp01(
    Math.abs(Number(aggressiveFlow))>.2&&Math.abs(Number(priceResponse))<.1
      ?Math.abs(Number(aggressiveFlow))*(.5+clamp01(visibleBarrierStrength)/2)
      :0
  );

  const breakthroughScore=clamp01(
    .35+
    .3*Math.max(0,Number(aggressiveFlow)||0)+
    .2*clamp01(approachVelocity)-
    .25*clamp01(visibleBarrierStrength)-
    .25*absorption
  );

  const rejectionScore=clamp01(
    .35+
    .3*clamp01(visibleBarrierStrength)+
    .25*absorption-
    .2*clamp01(approachVelocity)
  );

  return Object.freeze({
    absorptionScore:absorption,
    breakthroughScore,
    rejectionScore,
    uncertainty:clamp01(1-Math.abs(breakthroughScore-rejectionScore)),
    epistemic:'DERIVED_HEURISTIC_NOT_PROBABILITY',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  });
}

export function verifyLiquiditySnapshot(report){
  try{
    if(report?.version!==LIQUIDITY_INTELLIGENCE_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(report?.executionMode!=='SHADOW_ONLY'||report?.canExecute!==false) return {ok:false,reasons:['EXECUTION_INVARIANT_INVALID']};
    if(!report?.fingerprint) return {ok:false,reasons:['FINGERPRINT_MISSING']};
    const {fingerprint,...core}=report;
    const expected=sha256(core);
    return fingerprint===expected?{ok:true,reasons:[],expectedFingerprint:expected}:{ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['LIQUIDITY_INTELLIGENCE_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
