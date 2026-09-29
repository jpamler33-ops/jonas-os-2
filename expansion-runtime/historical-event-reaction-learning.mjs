import { sha256 } from '../institutional-kernel.mjs';

export const HISTORICAL_EVENT_REACTION_LEARNING_VERSION='TCX_HISTORICAL_EVENT_REACTION_LEARNING_V1';
const HORIZONS=Object.freeze([300000,900000,3600000,14400000,86400000]);
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp01=x=>Math.max(0,Math.min(1,Number(x)||0));
const q=(xs,p)=>{if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y),i=(a.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return l===h?a[l]:a[l]*(h-i)+a[h]*(i-l);};

export function reconstructHistoricalEventReactions(events=[],prices=[],{asOf=Date.now(),horizons=HORIZONS}={}){
  const t=finite(asOf); if(t==null) throw new Error('asOf must be finite');
  const byAsset=new Map();
  for(const p of prices){
    const at=finite(p?.availableAt??p?.timestamp),price=finite(p?.price);
    if(at==null||price==null||price<=0||at>t) continue;
    const a=String(p.asset||p.symbol||'').toUpperCase(); if(!a) continue;
    if(!byAsset.has(a)) byAsset.set(a,[]);
    byAsset.get(a).push({at,price});
  }
  for(const xs of byAsset.values()) xs.sort((a,b)=>a.at-b.at);
  const nearest=(xs,target,maxLag)=>{let best=null;for(const x of xs){const d=Math.abs(x.at-target);if(d<=maxLag&&(!best||d<best.d))best={...x,d};}return best;};
  const rows=[];
  for(const e of events){
    const at=finite(e?.availableAt); if(at==null||at>t) continue;
    const eventType=String(e.eventType||e.type||'OTHER').toUpperCase();
    const regime=String(e.regime||'ANY').toUpperCase();
    const assets=[...(e.affectedAssets||e.assets||[])].map(x=>String(x).toUpperCase());
    for(const asset of assets){
      const xs=byAsset.get(asset)||[],base=nearest(xs,at,60000); if(!base) continue;
      for(const horizonMs of horizons){
        const resolvedAt=at+Number(horizonMs); if(resolvedAt>t) continue;
        const end=nearest(xs,resolvedAt,Math.min(300000,Math.max(60000,horizonMs*.1))); if(!end) continue;
        const ret=end.price/base.price-1;
        const path=xs.filter(x=>x.at>=at&&x.at<=resolvedAt).map(x=>x.price/base.price-1);
        rows.push({
          id:sha256({eventId:e.id||e.fingerprint||eventType,asset,horizonMs,availableAt:at}),
          eventId:e.id||e.fingerprint||null,asset,eventType,regime,horizonMs,availableAt:at,resolvedAt:end.at,
          returnPct:ret,maxUpPct:path.length?Math.max(...path):ret,maxDownPct:path.length?Math.min(...path):ret,
          absoluteMovePct:Math.abs(ret),sourceQuality:finite(e.sourceQuality??e.sourceReliability),novelty:finite(e.novelty),
          epistemic:'HISTORICAL_POST_OUTCOME_REACTION_NOT_CAUSAL'
        });
      }
    }
  }
  return rows;
}

export function learnHistoricalMoveDrivers(rows=[],{largeMoveQuantile=.8,minSamples=8}={}){
  const groups=new Map();
  for(const r of rows){
    const key=[r.asset,r.eventType,r.horizonMs,r.regime||'ANY'].join('|');
    if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(r);
  }
  const cohorts=[];
  for(const [key,xs] of groups){
    const abs=xs.map(x=>Math.abs(Number(x.returnPct)||0)),threshold=q(abs,largeMoveQuantile)||0;
    const large=xs.filter(x=>Math.abs(Number(x.returnPct)||0)>=threshold&&threshold>0);
    const quiet=xs.filter(x=>Math.abs(Number(x.returnPct)||0)<threshold||threshold===0);
    const returns=xs.map(x=>Number(x.returnPct)||0);
    cohorts.push({key,asset:xs[0].asset,eventType:xs[0].eventType,horizonMs:xs[0].horizonMs,regime:xs[0].regime||'ANY',
      samples:xs.length,status:xs.length>=minSamples?'LEARNED':'WARMING',largeMoveThresholdPct:threshold,
      largeMoveRate:xs.length?large.length/xs.length:0,quietCounterexamples:quiet.length,
      medianReturnPct:q(returns,.5),q10ReturnPct:q(returns,.1),q90ReturnPct:q(returns,.9),
      medianAbsoluteMovePct:q(abs,.5),supportScore:clamp01(1-Math.exp(-xs.length/30)),
      epistemic:'EMPIRICAL_ASSOCIATION_WITH_COUNTEREXAMPLES_NOT_CAUSAL'});
  }
  return {version:HISTORICAL_EVENT_REACTION_LEARNING_VERSION,cohorts,rows:rows.length,
    fingerprint:sha256(cohorts),epistemic:'HISTORICAL_ASSOCIATION_NOT_CAUSAL'};
}

export function historicalAnalogueEvidence(model,{asset,eventType,horizonMs,regime='ANY'}={}){
  const exact=[String(asset).toUpperCase(),String(eventType).toUpperCase(),Number(horizonMs),String(regime).toUpperCase()].join('|');
  const any=[String(asset).toUpperCase(),String(eventType).toUpperCase(),Number(horizonMs),'ANY'].join('|');
  const c=model?.cohorts?.find(x=>x.key===exact)||model?.cohorts?.find(x=>x.key===any)||null;
  if(!c) return {status:'INSUFFICIENT',samples:0,supportScore:0};
  return {...structuredClone(c),historicalSupport:clamp01(c.supportScore*(.5+.5*c.largeMoveRate))};
}
