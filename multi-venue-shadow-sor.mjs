import { sha256 } from './institutional-kernel.mjs';

const EPS=1e-12;
const SCHEMA_VERSION=1;

function finite(x,fallback=null){ const n=Number(x); return Number.isFinite(n)?n:fallback; }
function clamp(x,a,b){ return Math.max(a,Math.min(b,x)); }

export const SHADOW_SOR_VERSION='SOR_V1';
export const SHADOW_SOR_CAPABILITIES=Object.freeze({
  execution:'SHADOW_ONLY',
  canExecuteLive:false,
  exchangeOrderAdapter:false,
  networkOrderSubmission:false,
  routeIsSimulation:true
});

export function normalizeVenueBook({
  venue,source,symbol,quote='USDT',bids,asks,availableAt=Date.now(),
  fetchLatencyMs=null,feeBps=10,provenance='',toxicityBps=null,toxicityEvidenceN=0
}){
  const clean=(xs,side)=>[...(xs||[])]
    .map(x=>[finite(x?.[0]),finite(x?.[1])])
    .filter(([p,q])=>p>0&&q>0)
    .sort((a,b)=>side==='BID'?b[0]-a[0]:a[0]-b[0]);
  const b=clean(bids,'BID'),a=clean(asks,'ASK');
  if(!b.length||!a.length) throw new Error('VENUE_BOOK_EMPTY');
  if(a[0][0]<b[0][0]) throw new Error('VENUE_BOOK_CROSSED');
  const bid=b[0][0],ask=a[0][0],mid=(bid+ask)/2;
  return {
    schemaVersion:SCHEMA_VERSION,
    venue:String(venue),
    source:String(source||venue),
    symbol:String(symbol),
    quote:String(quote).toUpperCase(),
    bids:b,
    asks:a,
    bid,ask,mid,
    spreadBps:mid>0?(ask-bid)/mid*10000:null,
    availableAt:Number(availableAt),
    fetchLatencyMs:finite(fetchLatencyMs),
    feeBps:Math.max(0,finite(feeBps,0)),
    provenance:String(provenance||''),
    toxicityBps:finite(toxicityBps),
    toxicityEvidenceN:Math.max(0,Math.floor(finite(toxicityEvidenceN,0)))
  };
}

function toxicityPenalty(book,{minToxicityEvidenceN=30}={}){
  if(book.toxicityEvidenceN>=minToxicityEvidenceN && Number.isFinite(book.toxicityBps) && book.toxicityBps>=0){
    return {appliedBps:book.toxicityBps,status:'MODELLED_FROM_MARKOUT_EVIDENCE',evidenceN:book.toxicityEvidenceN};
  }
  return {appliedBps:0,status:'NOT_APPLIED_INSUFFICIENT_EVIDENCE',evidenceN:book.toxicityEvidenceN};
}

function routeEligibility(book,{routeQuote='USDT',asOf=Date.now(),maxAgeMs=15_000}={}){
  const reasons=[];
  if(book.quote!==String(routeQuote).toUpperCase()) reasons.push(`QUOTE_MISMATCH_${book.quote}_VS_${String(routeQuote).toUpperCase()}`);
  const age=Math.max(0,Number(asOf)-Number(book.availableAt));
  if(!Number.isFinite(age)||age>maxAgeMs) reasons.push('STALE');
  if(!(book.bid>0&&book.ask>0&&book.ask>=book.bid)) reasons.push('INVALID_BOOK');
  return {eligible:reasons.length===0,reasons,ageMs:age};
}

function median(xs){
  const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length) return null;
  const i=Math.floor(a.length/2);
  return a.length%2?a[i]:(a[i-1]+a[i])/2;
}

function consolidatedReference(books){ return median(books.map(x=>x.mid).filter(Number.isFinite)); }

function marginalLevels(book,side,opts){
  const tox=toxicityPenalty(book,opts);
  const fee=Number(book.feeBps||0);
  const levels=side==='BUY'?book.asks:book.bids;
  return levels.map(([price,qty],levelIndex)=>{
    const feeAdj=side==='BUY'?(1+fee/10000):(1-fee/10000);
    const toxAdj=side==='BUY'?(1+tox.appliedBps/10000):(1-tox.appliedBps/10000);
    return {
      venue:book.venue,source:book.source,quote:book.quote,price,qty,levelIndex,
      feeBps:fee,toxicityPenaltyBps:tox.appliedBps,toxicityStatus:tox.status,
      toxicityEvidenceN:tox.evidenceN,fetchLatencyMs:book.fetchLatencyMs,
      effectiveUnit:price*feeAdj*toxAdj
    };
  });
}

function aggregateLegs(raw,side){
  const by=new Map();
  for(const x of raw){
    if(!by.has(x.venue)){
      by.set(x.venue,{
        venue:x.venue,source:x.source,quote:x.quote,baseQty:0,quoteQty:0,feeQuote:0,toxicityCostQuote:0,
        levels:0,latencyMs:x.fetchLatencyMs,toxicityPenaltyBps:x.toxicityPenaltyBps,
        toxicityStatus:x.toxicityStatus,toxicityEvidenceN:x.toxicityEvidenceN
      });
    }
    const r=by.get(x.venue);
    r.baseQty+=x.baseQty;r.quoteQty+=x.quoteQty;r.feeQuote+=x.feeQuote;r.toxicityCostQuote+=x.toxicityCostQuote;r.levels++;
  }
  return [...by.values()].map(r=>({
    ...r,
    avgPrice:r.baseQty>EPS?r.quoteQty/r.baseQty:null,
    netCashQuote:side==='BUY'?r.quoteQty+r.feeQuote+r.toxicityCostQuote:r.quoteQty-r.feeQuote-r.toxicityCostQuote
  })).sort((a,b)=>b.baseQty-a.baseQty||a.venue.localeCompare(b.venue));
}

function fragmentation(legs){
  const total=legs.reduce((s,x)=>s+x.baseQty,0);
  if(total<=EPS) return {venueCountUsed:0,hhi:null,effectiveVenues:null,maxVenueShare:null};
  const shares=legs.map(x=>x.baseQty/total);
  const hhi=shares.reduce((s,x)=>s+x*x,0);
  return {venueCountUsed:legs.length,hhi,effectiveVenues:hhi>0?1/hhi:null,maxVenueShare:Math.max(...shares)};
}

function simulateRouteCore({side,notionalQuote},books,opts={}){
  const eligible=[],excluded=[];
  for(const b of books){
    const e=routeEligibility(b,opts);
    if(e.eligible) eligible.push({...b,ageMs:e.ageMs});
    else excluded.push({venue:b.venue,quote:b.quote,reasons:e.reasons,ageMs:e.ageMs});
  }
  const referenceMid=consolidatedReference(eligible);
  if(!(referenceMid>0)){
    return {side,notionalQuote:Number(notionalQuote),referenceMid:null,fillRatio:0,filledBase:0,filledQuote:0,
      feesQuote:0,toxicityCostQuote:0,avgFillPrice:null,netCashQuote:0,legs:[],excluded,
      fragmentation:fragmentation([]),depthExhausted:true};
  }

  const levels=eligible.flatMap(b=>marginalLevels(b,side,opts));
  levels.sort((a,b)=>{
    const d=side==='BUY'?a.effectiveUnit-b.effectiveUnit:b.effectiveUnit-a.effectiveUnit;
    if(Math.abs(d)>1e-12) return d;
    const la=Number.isFinite(a.fetchLatencyMs)?a.fetchLatencyMs:Infinity;
    const lb=Number.isFinite(b.fetchLatencyMs)?b.fetchLatencyMs:Infinity;
    return la-lb||a.venue.localeCompare(b.venue)||a.levelIndex-b.levelIndex;
  });

  const targetQuote=Number(notionalQuote);
  const targetBase=side==='SELL'?targetQuote/referenceMid:null;
  let remainingQuote=targetQuote,remainingBase=targetBase;
  let filledBase=0,filledQuote=0,feesQuote=0,toxicityCostQuote=0;
  const fills=[];

  for(const l of levels){
    let takeBase=0;
    if(side==='BUY'){
      const takeQuote=Math.min(remainingQuote,l.price*l.qty);
      takeBase=takeQuote/l.price;
    }else{
      takeBase=Math.min(remainingBase,l.qty);
    }
    if(!(takeBase>EPS)) continue;
    const quote=takeBase*l.price;
    const fee=quote*l.feeBps/10000;
    const toxicityCost=quote*l.toxicityPenaltyBps/10000;
    fills.push({...l,baseQty:takeBase,quoteQty:quote,feeQuote:fee,toxicityCostQuote:toxicityCost});
    filledBase+=takeBase;filledQuote+=quote;feesQuote+=fee;toxicityCostQuote+=toxicityCost;
    if(side==='BUY'){ remainingQuote-=quote; if(remainingQuote<=EPS) break; }
    else { remainingBase-=takeBase; if(remainingBase<=EPS) break; }
  }

  const fillRatio=side==='BUY'?clamp(filledQuote/targetQuote,0,1):clamp(filledBase/targetBase,0,1);
  const avgFillPrice=filledBase>EPS?filledQuote/filledBase:null;
  const netCashQuote=side==='BUY'?filledQuote+feesQuote+toxicityCostQuote:filledQuote-feesQuote-toxicityCostQuote;
  const legs=aggregateLegs(fills,side);

  return {
    side,notionalQuote:targetQuote,referenceMid,fillRatio,
    targetBase:side==='SELL'?targetBase:targetQuote/referenceMid,
    filledBase,filledQuote,feesQuote,toxicityCostQuote,avgFillPrice,netCashQuote,
    slippageBps:avgFillPrice==null?null:(side==='BUY'?1:-1)*(avgFillPrice-referenceMid)/referenceMid*10000,
    allInBps:filledQuote>EPS?(side==='BUY'?1:-1)*(netCashQuote-filledBase*referenceMid)/(filledBase*referenceMid)*10000:null,
    legs,excluded,fragmentation:fragmentation(legs),depthExhausted:fillRatio<1-EPS
  };
}

function chooseBestSingle(side,candidates){
  const full=candidates.filter(x=>x.fillRatio>=1-EPS);
  const pool=full.length?full:candidates;
  return [...pool].sort((a,b)=>{
    if(Math.abs(a.fillRatio-b.fillRatio)>EPS) return b.fillRatio-a.fillRatio;
    return side==='BUY'?a.netCashQuote-b.netCashQuote:b.netCashQuote-a.netCashQuote;
  })[0]||null;
}

export function buildShadowSmartRoute(intent,venueBooks,opts={}){
  const side=String(intent?.side||'').toUpperCase();
  const notionalQuote=Number(intent?.notionalQuote);
  if(!['BUY','SELL'].includes(side)) throw new Error('SOR_SIDE_INVALID');
  if(!(notionalQuote>0)) throw new Error('SOR_NOTIONAL_INVALID');
  if(!Array.isArray(venueBooks)||!venueBooks.length) throw new Error('SOR_NO_VENUES');

  const normalized={side,notionalQuote};
  const route=simulateRouteCore(normalized,venueBooks,opts);
  const singles=venueBooks.map(book=>{
    const single=simulateRouteCore(normalized,[book],opts);
    const tox=toxicityPenalty(book,opts);
    const ref=Number(route.referenceMid);
    const sideSign=side==='BUY'?1:-1;
    const benchmarkSlippageBps=
      single.avgFillPrice!=null && ref>0
        ? sideSign*(Number(single.avgFillPrice)-ref)/ref*10000
        : null;
    const benchmarkAllInBps=
      single.filledBase>EPS && ref>0
        ? sideSign*(Number(single.netCashQuote)-Number(single.filledBase)*ref)/(Number(single.filledBase)*ref)*10000
        : null;
    return {
      ...single,
      venue:book.venue,
      quote:book.quote,
      source:book.source,
      fetchLatencyMs:book.fetchLatencyMs,
      feeBps:book.feeBps,
      benchmarkReferenceMid:ref>0?ref:null,
      benchmarkSlippageBps,
      benchmarkAllInBps,
      predictedToxicityBps:tox.appliedBps,
      predictedToxicityStatus:tox.status,
      predictedToxicityEvidenceN:tox.evidenceN
    };
  });
  const bestSingle=chooseBestSingle(side,singles);

  let improvementQuote=null,improvementBps=null;
  if(bestSingle && route.fillRatio>=1-EPS && bestSingle.fillRatio>=1-EPS){
    improvementQuote=side==='BUY'?bestSingle.netCashQuote-route.netCashQuote:route.netCashQuote-bestSingle.netCashQuote;
    const denom=Math.abs(bestSingle.netCashQuote);
    improvementBps=denom>EPS?improvementQuote/denom*10000:null;
  }

  const core={
    version:SHADOW_SOR_VERSION,execution:'SHADOW_ONLY',canExecuteLive:false,
    routeQuote:String(opts.routeQuote||'USDT').toUpperCase(),createdAt:Number(opts.asOf||Date.now()),
    intent:normalized,route,
    singleVenueCounterfactuals:singles.map(x=>({
      venue:x.venue,
      source:x.source,
      quote:x.quote,
      fillRatio:x.fillRatio,
      avgFillPrice:x.avgFillPrice,
      netCashQuote:x.netCashQuote,
      feesQuote:x.feesQuote,
      slippageBps:x.slippageBps,
      allInBps:x.allInBps,
      benchmarkReferenceMid:x.benchmarkReferenceMid,
      benchmarkSlippageBps:x.benchmarkSlippageBps,
      benchmarkAllInBps:x.benchmarkAllInBps,
      predictedToxicityBps:x.predictedToxicityBps,
      predictedToxicityStatus:x.predictedToxicityStatus,
      predictedToxicityEvidenceN:x.predictedToxicityEvidenceN,
      depthExhausted:x.depthExhausted,
      fetchLatencyMs:x.fetchLatencyMs,
      feeBps:x.feeBps,
      exclusionReasons:(x.excluded||[]).flatMap(e=>e.reasons||[])
    })),
    bestSingleVenue:bestSingle?{
      venue:bestSingle.venue,fillRatio:bestSingle.fillRatio,avgFillPrice:bestSingle.avgFillPrice,
      netCashQuote:bestSingle.netCashQuote,feesQuote:bestSingle.feesQuote
    }:null,
    improvementQuote,improvementBps,
    epistemic:{
      books:'OBSERVED_PUBLIC_L2',fees:'ASSUMED_CONFIG',
      toxicity:route.legs.some(x=>x.toxicityPenaltyBps>0)?'MODELLED_FROM_MARKOUT_EVIDENCE':'NOT_APPLIED',
      route:'COUNTERFACTUAL_SHADOW_SIMULATION'
    }
  };
  return {...core,routeHash:sha256(core)};
}

export function summarizeVenueQuality(venueBooks,{routeQuote='USDT',asOf=Date.now(),maxAgeMs=15_000,minToxicityEvidenceN=30}={}){
  return venueBooks.map(b=>{
    const e=routeEligibility(b,{routeQuote,asOf,maxAgeMs});
    const t=toxicityPenalty(b,{minToxicityEvidenceN});
    return {
      venue:b.venue,quote:b.quote,eligible:e.eligible,exclusionReasons:e.reasons,ageMs:e.ageMs,
      spreadBps:b.spreadBps,feeBps:b.feeBps,fetchLatencyMs:b.fetchLatencyMs,
      bidDepthQuote:b.bids.reduce((s,[p,q])=>s+p*q,0),askDepthQuote:b.asks.reduce((s,[p,q])=>s+p*q,0),
      toxicityPenaltyBps:t.appliedBps,toxicityStatus:t.status,toxicityEvidenceN:t.evidenceN
    };
  });
}
