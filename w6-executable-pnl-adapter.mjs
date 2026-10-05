import {captureW6ExecutableCheckpoint,estimateW6ExecutableExit} from './w6-executable-pnl.mjs';

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='')return fallback;
  const n=Number(v);return Number.isFinite(n)?n:fallback;
}

export function appendW6ExecutableCheckpoint(position,row,{now=Date.now(),feeBps=30}={}){
  const prior=Array.isArray(position?.executableCheckpoints)?position.executableCheckpoints:[];
  const checkpoint=captureW6ExecutableCheckpoint(
    {...position,executableCheckpoints:prior},
    {priceUsd:finite(row?.priceUsd),marketCapUsd:finite(row?.marketCap),liquidityUsd:finite(row?.liquidityUsd)},
    {now,feeBps}
  );
  if(!checkpoint)return position;
  return {...position,executableCheckpoints:[...prior,checkpoint].slice(-16),lastExecutableCheckpoint:checkpoint};
}

export function estimateW6ExecutableClose(position,row,{feeBps=30,maxPoolFraction=.25}={}){
  const markPrice=finite(row?.priceUsd,finite(position?.lastPrice));
  const liquidityUsd=finite(row?.liquidityUsd);
  const estimate=estimateW6ExecutableExit({
    side:position?.side||'LONG',
    entryPrice:position?.entryPrice,
    markPrice,
    exposureQuote:position?.exposureQuote,
    liquidityUsd,
    feeBps,
    maxPoolFraction
  });
  return {
    ...estimate,
    observedMarketCapUsd:finite(row?.marketCap,finite(position?.lastMarketCapUsd)),
    observedLiquidityUsd:liquidityUsd,
    observedPriceUsd:markPrice,
    semantics:'W6_SHADOW_RESEARCH_EXECUTABLE_ESTIMATE_NOT_LIVE_QUOTE',
    execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false
  };
}

export function attachW6ExecutableCloseEvidence(closed,position,row,options={}){
  return {...closed,executableExit:estimateW6ExecutableClose(position,row,options)};
}
