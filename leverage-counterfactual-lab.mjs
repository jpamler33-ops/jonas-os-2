import { sha256 } from './institutional-kernel.mjs';
export const LEVERAGE_COUNTERFACTUAL_LAB_VERSION='TCX_LEVERAGE_COUNTERFACTUAL_LAB_V1';
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};

function eligible(ledger){
 return (ledger?.positions||[]).filter(p=>p?.execution==='SHADOW_ONLY'&&p?.canExecuteLive===false&&p?.status==='CLOSED'&&
 !['COVERAGE_PROBE','ABSTAIN_PROBE','CHALLENGER'].includes(String(p.entryMode||'STANDARD').toUpperCase())&&
 Number.isFinite(Number(p.realizedNetPnlQuote))&&finite(p.entryQuote)>0);
}
function simulate(rows,leverage,initial){
 let eq=initial,peak=initial,maxDd=0,gp=0,gl=0,net=0;
 for(const p of rows){
   const actualLev=Math.max(1,finite(p.leverage,1));
   const actualMargin=Math.max(.01,finite(p.marginQuote,finite(p.entryQuote)/actualLev));
   const actualNet=finite(p.realizedNetPnlQuote);
   const actualFees=Math.max(0,finite(p.entryFeesQuote)+finite(p.exitFeesQuote));
   const priceComponent=actualNet+actualFees;
   const scale=leverage/actualLev;
   const cfFees=actualFees*scale;
   const pnl=priceComponent*scale-cfFees;
   net+=pnl;if(pnl>0)gp+=pnl;else gl+=Math.abs(pnl);
   eq+=pnl;peak=Math.max(peak,eq);maxDd=Math.max(maxDd,peak>0?(peak-eq)/peak:1);
 }
 return {leverage,trades:rows.length,netPnlQuote:net,expectancyQuote:rows.length?net/rows.length:null,
   profitFactor:gl>0?gp/gl:(gp>0?999:null),maxDrawdownPct:maxDd,returnPct:initial>0?net/initial:null};
}
export function buildLeverageCounterfactualLab(ledger,{levels=[1,1.25,1.5,2,2.5,3],minTrades=100,maxDrawdownPct=.15}={}){
 const rows=eligible(ledger),initial=Math.max(1,finite(ledger?.initialEquityQuote,10_000));
 const normalized=[...new Set(levels.map(x=>Math.max(1,Math.min(3,finite(x,1))))].sort((a,b)=>a-b);
 const scenarios=normalized.map(x=>simulate(rows,x,initial));
 const admissible=scenarios.filter(x=>x.trades>=minTrades&&finite(x.expectancyQuote,-1)>0&&x.maxDrawdownPct<=maxDrawdownPct);
 admissible.sort((a,b)=>(finite(b.expectancyQuote)/Math.max(.01,b.maxDrawdownPct+.01))-(finite(a.expectancyQuote)/Math.max(.01,a.maxDrawdownPct+.01)));
 const suggested=admissible[0]?.leverage??1;
 const core={version:LEVERAGE_COUNTERFACTUAL_LAB_VERSION,samples:rows.length,scenarios,
   suggestedShadowLeverage:suggested,evidenceReady:rows.length>=minTrades&&admissible.length>0,
   execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,
   caveat:'COUNTERFACTUAL_REPLAY_NOT_CAUSAL_PROOF_OR_LIVE_AUTHORIZATION'};
 return freeze({...core,fingerprint:sha256(core)});
}
