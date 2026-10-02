import {normalizeObservation,crossProviderCheck} from './cross-provider-normalizer.mjs';
const median=xs=>{const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
const sign=x=>x==null?0:Math.sign(x);
export function buildDerivativesState(observations,{asOf=new Date().toISOString(),maxAgeMs=2*60*60*1000}={}){
  const t=Date.parse(asOf);
  const fresh=observations.filter(o=>{const x=Date.parse(o.sourceTimestamp);return Number.isFinite(x)&&x<=t&&t-x<=maxAgeMs;});
  const check=crossProviderCheck(fresh,{maxAgeMs});
  const xs=check.normalized;
  const fundingRows=xs.filter(x=>x.fundingComparable===true&&Number.isFinite(x.funding_rate));
  const funding=fundingRows.map(x=>x.funding_rate);
  const marks=xs.map(x=>x.mark_price).filter(Number.isFinite);
  const signs=[...new Set(funding.map(sign).filter(Boolean))];
  const fundingConsensus=funding.length<2?'INSUFFICIENT':signs.length===1?'ALIGNED':'CONFLICT';
  const oiByProvider=Object.fromEntries(xs.filter(x=>x.open_interest!=null).map(x=>[x.provider,{value:x.open_interest,unit:x.units.open_interest,market:x.market}]));
  const warnAlerts=check.alerts.filter(a=>a.severity==='WARN');
  const state={
    schema:'BIGGJ_DERIVATIVES_STATE_V1',
    asOf,
    providerCount:xs.length,
    providers:xs.map(x=>x.provider),
    funding:{
      median:median(funding),
      consensus:fundingConsensus,
      comparableProviderCount:check.comparableFundingProviders.length,
      comparableProviders:check.comparableFundingProviders,
      positive:funding.filter(x=>x>0).length,
      negative:funding.filter(x=>x<0).length,
      zero:funding.filter(x=>x===0).length
    },
    markPrice:{median:median(marks)},
    openInterest:{aggregation:'DISABLED_UNLESS_UNITS_VERIFIED',byProvider:oiByProvider},
    alerts:check.alerts,
    quality:{
      freshProviders:xs.length,
      comparableFundingProviders:check.comparableFundingProviders.length,
      crossProviderConflict:warnAlerts.length>0,
      usableForDirectionalFeature:
        check.comparableFundingProviders.length>=2&&
        fundingConsensus==='ALIGNED'&&
        warnAlerts.length===0
    }
  };
  return Object.freeze(state);
}
