export const COVERAGE_ISSUANCE_POOL_VERSION='TCX_COVERAGE_ISSUANCE_POOL_V1';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function issuanceClock(issuance){
  const xs=[
    finite(issuance?.generatedAt),
    finite(issuance?.forecast?.asOf),
    finite(issuance?.asOf)
  ].filter(x=>x!=null);
  return xs.length?Math.max(...xs):null;
}

function normalizeSymbol(issuance){
  return String(issuance?.symbol||'').trim().toUpperCase();
}

export function createCoverageIssuancePool({
  maxAgeMs=10*60_000,
  maxEntries=64
}={}){
  return {
    version:COVERAGE_ISSUANCE_POOL_VERSION,
    maxAgeMs:Math.max(1,Number(maxAgeMs)||10*60_000),
    maxEntries:Math.max(1,Math.floor(Number(maxEntries)||64)),
    items:new Map()
  };
}

export function pruneCoverageIssuancePool(pool,{now=Date.now()}={}){
  if(!pool?.items||!(pool.items instanceof Map)) return 0;
  const t=finite(now);
  if(t==null) return 0;
  let removed=0;
  for(const [symbol,row] of pool.items){
    const clock=issuanceClock(row?.issuance);
    if(
      row?.auditHealthy!==true||
      !row?.issuance||
      clock==null||
      clock>t||
      t-clock>pool.maxAgeMs
    ){
      pool.items.delete(symbol);
      removed++;
    }
  }
  if(pool.items.size>pool.maxEntries){
    const ordered=[...pool.items.entries()].sort((a,b)=>
      Number(a[1]?.rememberedAt||0)-Number(b[1]?.rememberedAt||0)||
      String(a[0]).localeCompare(String(b[0]))
    );
    for(const [symbol] of ordered.slice(0,pool.items.size-pool.maxEntries)){
      pool.items.delete(symbol);
      removed++;
    }
  }
  return removed;
}

export function rememberCoverageIssuance(pool,{
  issuance,
  auditHealthy=false,
  now=Date.now()
}={}){
  if(!pool?.items||!(pool.items instanceof Map)){
    return {accepted:false,reason:'POOL_INVALID',symbol:null};
  }
  const symbol=normalizeSymbol(issuance);
  if(!symbol) return {accepted:false,reason:'SYMBOL_MISSING',symbol:null};
  const t=finite(now);
  const clock=issuanceClock(issuance);
  if(auditHealthy!==true){
    pool.items.delete(symbol);
    return {accepted:false,reason:'AUDIT_NOT_HEALTHY',symbol};
  }
  if(t==null||clock==null||clock>t||t-clock>pool.maxAgeMs){
    pool.items.delete(symbol);
    return {accepted:false,reason:'ISSUANCE_STALE_OR_INVALID',symbol};
  }
  pool.items.set(symbol,{
    issuance,
    auditHealthy:true,
    rememberedAt:t
  });
  pruneCoverageIssuancePool(pool,{now:t});
  return {accepted:true,reason:'AUDIT_BOUND_ISSUANCE_REMEMBERED',symbol};
}

export function coverageIssuancePoolItems(pool,{now=Date.now()}={}){
  pruneCoverageIssuancePool(pool,{now});
  if(!pool?.items||!(pool.items instanceof Map)) return [];
  return [...pool.items.entries()]
    .sort((a,b)=>String(a[0]).localeCompare(String(b[0])))
    .map(([,row])=>({
      issuance:row.issuance,
      auditHealthy:true
    }));
}

export function coverageIssuancePoolSummary(pool,{now=Date.now()}={}){
  const items=coverageIssuancePoolItems(pool,{now});
  return {
    version:COVERAGE_ISSUANCE_POOL_VERSION,
    size:items.length,
    maxEntries:Number(pool?.maxEntries||0),
    maxAgeMs:Number(pool?.maxAgeMs||0),
    symbols:items.map(x=>normalizeSymbol(x.issuance))
  };
}
