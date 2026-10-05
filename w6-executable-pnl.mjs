export const W6_EXECUTABLE_PNL_VERSION='BIGGJ_W6_EXECUTABLE_PNL_V1';

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='')return fallback;
  const n=Number(v);return Number.isFinite(n)?n:fallback;
}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

// Conservative constant-product AMM approximation. Research/shadow only.
// Unknown liquidity is deliberately UNFILLABLE rather than inventing a fill.
export function estimateW6ExecutableExit({
  side='LONG',entryPrice,markPrice,exposureQuote,liquidityUsd,
  feeBps=10,baseSlippageBps=0,maxPoolFraction=0.25
}={}){
  const entry=finite(entryPrice), mark=finite(markPrice), exposure=Math.max(0,finite(exposureQuote,0));
  const liq=finite(liquidityUsd);
  if(String(side).toUpperCase()!=='LONG')return {version:W6_EXECUTABLE_PNL_VERSION,status:'UNSUPPORTED_SIDE',executable:false};
  if(!(entry>0&&mark>0&&exposure>0))return {version:W6_EXECUTABLE_PNL_VERSION,status:'INVALID_INPUT',executable:false};
  if(!(liq>0))return {version:W6_EXECUTABLE_PNL_VERSION,status:'UNFILLABLE',reason:'LIQUIDITY_UNKNOWN_OR_ZERO',executable:false};

  const poolSideUsd=liq/2;
  const positionValueAtMark=exposure*(mark/entry);
  const poolFraction=positionValueAtMark/poolSideUsd;
  if(poolFraction>clamp(finite(maxPoolFraction,0.25),0.01,0.95)){
    return {version:W6_EXECUTABLE_PNL_VERSION,status:'UNFILLABLE',reason:'EXIT_TOO_LARGE_FOR_POOL',executable:false,poolFraction};
  }

  // For x*y=k, selling quote value q into one side gives an approximate average
  // execution discount q/(reserve+q). Add explicit base slippage conservatively.
  const impactFraction=positionValueAtMark/(poolSideUsd+positionValueAtMark);
  const explicitSlip=Math.max(0,finite(baseSlippageBps,0))/10000;
  const totalSlip=clamp(impactFraction+explicitSlip,0,0.99);
  const executablePrice=mark*(1-totalSlip);
  const gross=exposure*(executablePrice/entry-1);
  const fees=exposure*Math.max(0,finite(feeBps,10))/10000*2;
  const net=gross-fees;
  return {
    version:W6_EXECUTABLE_PNL_VERSION,status:'EXECUTABLE',executable:true,
    entryPrice:entry,markPrice:mark,executablePrice,exposureQuote:exposure,
    liquidityUsd:liq,poolFraction,estimatedImpactPct:impactFraction,
    estimatedTotalSlippagePct:totalSlip,grossPnlQuote:gross,feesQuote:fees,
    executableNetPnlQuote:net,executableReturnPct:net/exposure
  };
}

export function captureW6ExecutableCheckpoint(position,market,{now=Date.now(),feeBps=10}={}){
  const openedAt=finite(position?.openedAt,finite(position?.entryAt));
  if(!(openedAt>0))return null;
  const ageSeconds=Math.max(0,(Number(now)-openedAt)/1000);
  const targets=[60,120,180,240,300,480,600];
  const target=targets.find(t=>ageSeconds>=t&&!Array.isArray(position?.executableCheckpoints)||false);
  const existing=new Set((Array.isArray(position?.executableCheckpoints)?position.executableCheckpoints:[]).map(x=>Number(x?.targetSeconds)));
  const due=targets.find(t=>ageSeconds>=t&&!existing.has(t));
  if(!due)return null;
  return {
    targetSeconds:due,observedAt:Number(now),ageSeconds,
    marketCapUsd:finite(market?.marketCapUsd),liquidityUsd:finite(market?.liquidityUsd),
    ...estimateW6ExecutableExit({
      side:position?.side||'LONG',entryPrice:position?.entryPrice,
      markPrice:finite(market?.priceUsd,finite(market?.price,position?.lastPrice)),
      exposureQuote:position?.exposureQuote,liquidityUsd:market?.liquidityUsd,feeBps
    })
  };
}
