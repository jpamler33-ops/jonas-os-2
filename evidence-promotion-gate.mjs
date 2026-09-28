import { sha256 } from './institutional-kernel.mjs';

export const EVIDENCE_PROMOTION_GATE_VERSION='TCX_EVIDENCE_PROMOTION_GATE_V1';
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};

function metrics(rows,initial=10_000){
  let equity=initial,peak=initial,maxDd=0,grossProfit=0,grossLoss=0;
  for(const p of rows){
    const pnl=finite(p.realizedNetPnlQuote);
    equity+=pnl; peak=Math.max(peak,equity); maxDd=Math.max(maxDd,peak>0?(peak-equity)/peak:1);
    if(pnl>0) grossProfit+=pnl; else grossLoss+=Math.abs(pnl);
  }
  const net=rows.reduce((s,p)=>s+finite(p.realizedNetPnlQuote),0);
  return {trades:rows.length,netPnlQuote:net,expectancyQuote:rows.length?net/rows.length:null,
    profitFactor:grossLoss>0?grossProfit/grossLoss:(grossProfit>0?Infinity:null),maxDrawdownPct:maxDd};
}
function eligibleRows(ledger){
  return (ledger?.positions||[]).filter(p=>p?.execution==='SHADOW_ONLY'&&p?.canExecuteLive===false&&p?.status==='CLOSED'&&
    !['COVERAGE_PROBE','ABSTAIN_PROBE','CHALLENGER'].includes(String(p.entryMode||'STANDARD').toUpperCase())&&
    Number.isFinite(Number(p.realizedNetPnlQuote))&&Number.isFinite(Number(p.closedAt))).sort((a,b)=>Number(a.closedAt)-Number(b.closedAt));
}
export function evaluateEvidencePromotionGate(ledger,{
  minTrades=300,minForwardTrades=90,minProfitFactor=1.15,minExpectancyQuote=0,maxDrawdownPct=.15,
  forwardFraction=.30,minForwardWindows=3
}={}){
  const rows=eligibleRows(ledger), cut=Math.max(1,Math.floor(rows.length*(1-forwardFraction)));
  const train=rows.slice(0,cut),forward=rows.slice(cut);
  const all=metrics(rows,finite(ledger?.initialEquityQuote,10_000));
  const trainStats=metrics(train),forwardStats=metrics(forward);
  const windowSize=Math.max(1,Math.floor(forward.length/Math.max(1,minForwardWindows)));
  const windows=[];
  for(let i=0;i<forward.length;i+=windowSize) windows.push(metrics(forward.slice(i,Math.min(forward.length,i+windowSize))));
  const fullWindows=windows.filter(x=>x.trades>=Math.max(1,Math.floor(minForwardTrades/minForwardWindows)));
  const checks={
    sampleSize:rows.length>=minTrades,
    forwardSample:forward.length>=minForwardTrades,
    netExpectancy:finite(all.expectancyQuote,-Infinity)>minExpectancyQuote,
    profitFactor:Number(all.profitFactor)>minProfitFactor,
    drawdown:all.maxDrawdownPct<=maxDrawdownPct,
    forwardExpectancy:finite(forwardStats.expectancyQuote,-Infinity)>minExpectancyQuote,
    forwardProfitFactor:Number(forwardStats.profitFactor)>minProfitFactor,
    forwardWindows:fullWindows.length>=minForwardWindows&&fullWindows.every(x=>finite(x.expectancyQuote,-Infinity)>minExpectancyQuote)
  };
  const passed=Object.values(checks).every(Boolean);
  const core={version:EVIDENCE_PROMOTION_GATE_VERSION,asOf:Date.now(),passed,checks,
    thresholds:{minTrades,minForwardTrades,minProfitFactor,minExpectancyQuote,maxDrawdownPct,forwardFraction,minForwardWindows},
    all,train:trainStats,forward:forwardStats,forwardWindows:windows,
    execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,
    meaning:'RESEARCH_PROMOTION_EVIDENCE_ONLY_NOT_AUTHORIZATION_FOR_LIVE_TRADING'};
  return freeze({...core,fingerprint:sha256(core)});
}
