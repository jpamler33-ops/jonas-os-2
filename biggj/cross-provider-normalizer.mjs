const num=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const CONTRACTS={
  OKX:{market:'BTC_USDT_LINEAR_PERP',oiUnit:'CONTRACTS',fundingUnit:'PER_INTERVAL_RATE',fundingComparable:true},
  KRAKEN_FUTURES:{market:'BTC_USD_INVERSE_PERP',oiUnit:'PROVIDER_NATIVE',fundingUnit:'PROVIDER_NATIVE_RATE',fundingComparable:false},
  BINANCE_FUTURES:{market:'BTC_USDT_LINEAR_PERP',oiUnit:'BTC',fundingUnit:'PER_INTERVAL_RATE',fundingComparable:true},
  BYBIT:{market:'BTC_USDT_LINEAR_PERP',oiUnit:'BTC',fundingUnit:'PER_INTERVAL_RATE',fundingComparable:true}
};
export function normalizeObservation(o){
  const meta=CONTRACTS[o.provider]??{market:o.symbol,oiUnit:'UNKNOWN',fundingUnit:'UNKNOWN',fundingComparable:false};
  const v=o.values??{};
  return {
    provider:o.provider,
    symbol:o.symbol,
    sourceTimestamp:o.sourceTimestamp,
    ingestTimestamp:o.ingestTimestamp,
    market:meta.market,
    units:{funding_rate:meta.fundingUnit,open_interest:meta.oiUnit},
    fundingComparable:meta.fundingComparable===true,
    funding_rate:num(v.funding_rate),
    mark_price:num(v.mark_price),
    index_price:num(v.index_price),
    open_interest:num(v.open_interest),
    open_interest_ccy:num(v.open_interest_ccy),
    provenance:{observationSha256:o.sha256??null,chainSha256:o.chainSha256??null}
  };
}
const rel=(a,b)=>Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-12);
const sameMarket=(a,b)=>a.market===b.market;
export function crossProviderCheck(observations,{maxAgeMs=90*60*1000,fundingRelWarn=.5,priceRelWarn=.01}={}){
  const xs=observations.map(normalizeObservation),alerts=[];
  let comparableFundingPairs=0;
  for(let i=0;i<xs.length;i++)for(let k=i+1;k<xs.length;k++){
    const a=xs[i],b=xs[k],age=Math.abs(Date.parse(a.sourceTimestamp)-Date.parse(b.sourceTimestamp));
    if(age>maxAgeMs)continue;
    if(a.funding_rate!=null&&b.funding_rate!=null){
      const comparable=
        a.fundingComparable===true&&
        b.fundingComparable===true&&
        a.units.funding_rate===b.units.funding_rate;
      if(!comparable){
        alerts.push({
          type:'FUNDING_NOT_DIRECTLY_COMPARABLE',
          providers:[a.provider,b.provider],
          units:[a.units.funding_rate,b.units.funding_rate],
          severity:'WARN'
        });
      }else{
        comparableFundingPairs++;
        if(Math.sign(a.funding_rate)!==Math.sign(b.funding_rate)){
          alerts.push({type:'FUNDING_SIGN_DIVERGENCE',providers:[a.provider,b.provider],severity:'WARN'});
        }else if(rel(a.funding_rate,b.funding_rate)>fundingRelWarn){
          alerts.push({type:'FUNDING_MAGNITUDE_DIVERGENCE',providers:[a.provider,b.provider],severity:'WARN'});
        }
      }
    }
    if(a.mark_price!=null&&b.mark_price!=null&&rel(a.mark_price,b.mark_price)>priceRelWarn){
      alerts.push({type:'MARK_PRICE_DIVERGENCE',providers:[a.provider,b.provider],severity:'WARN'});
    }
    if(a.open_interest!=null&&b.open_interest!=null&&sameMarket(a,b)&&a.units.open_interest!==b.units.open_interest){
      alerts.push({type:'OI_NOT_DIRECTLY_COMPARABLE',providers:[a.provider,b.provider],units:[a.units.open_interest,b.units.open_interest],severity:'INFO'});
    }
  }
  const comparableFundingProviders=[...new Set(xs.filter(x=>x.funding_rate!=null&&x.fundingComparable===true).map(x=>x.provider))].sort();
  return {
    normalized:xs,
    alerts,
    comparableFundingPairs,
    comparableFundingProviders,
    policy:'Funding and OI are never aggregated across providers unless interval/unit semantics are explicitly verified.'
  };
}
