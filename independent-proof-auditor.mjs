import { sha256 } from './institutional-kernel.mjs';
export const INDEPENDENT_PROOF_AUDITOR_VERSION='TCX_INDEPENDENT_PROOF_AUDITOR_V1';
const finite=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
function rows(l){return(l?.positions||[]).filter(p=>p?.execution==='SHADOW_ONLY'&&p?.canExecuteLive===false&&p?.status==='CLOSED'&&!['COVERAGE_PROBE','ABSTAIN_PROBE','CHALLENGER'].includes(String(p.entryMode||'STANDARD').toUpperCase())&&finite(p.realizedNetPnlQuote)!=null).sort((a,b)=>finite(a.closedAt,0)-finite(b.closedAt,0));}
function sum(xs){return xs.reduce((a,b)=>a+b,0);}
export function auditTcxEvidence(ledger,{minTrades=100,maxTopWinnerShare=.40,maxSymbolShare=.65,minRecentFraction=.25}={}){
 const r=rows(ledger),pnls=r.map(x=>finite(x.realizedNetPnlQuote,0)),positive=r.filter(x=>finite(x.realizedNetPnlQuote,0)>0).sort((a,b)=>finite(b.realizedNetPnlQuote,0)-finite(a.realizedNetPnlQuote,0));
 const grossProfit=sum(positive.map(x=>finite(x.realizedNetPnlQuote,0))),topCount=Math.max(1,Math.ceil(positive.length*.05)),topWinnerShare=grossProfit>0?sum(positive.slice(0,topCount).map(x=>finite(x.realizedNetPnlQuote,0)))/grossProfit:1;
 const bySymbol=new Map();for(const p of r)bySymbol.set(String(p.symbol||'UNKNOWN'),(bySymbol.get(String(p.symbol||'UNKNOWN'))||0)+1);
 const maxSymbolShare=r.length?Math.max(0,...bySymbol.values())/r.length:1;
 const temporalViolations=r.filter(p=>finite(p.openedAt)!=null&&finite(p.closedAt)!=null&&finite(p.openedAt)>finite(p.closedAt)).length;
 const missingForecastLink=r.filter(p=>!String(p.forecastFingerprint||'').trim()&&!String(p.issuanceId||'').trim()).length;
 const duplicateKeys=new Map();for(const p of r){const k=[p.symbol,p.openedAt,p.closedAt,p.entryQuote,p.realizedNetPnlQuote].join('|');duplicateKeys.set(k,(duplicateKeys.get(k)||0)+1);}
 const duplicateRate=r.length?sum([...duplicateKeys.values()].map(n=>Math.max(0,n-1)))/r.length:0;
 const recent=r.slice(Math.floor(r.length*(1-minRecentFraction))),recentNet=sum(recent.map(x=>finite(x.realizedNetPnlQuote,0)));
 const findings={
  insufficientSample:r.length<minTrades,
  winnerConcentration:topWinnerShare>maxTopWinnerShare,
  symbolConcentration:maxSymbolShare>maxSymbolShare,
  temporalIntegrity:temporalViolations>0,
  weakForecastLineage:r.length>0&&missingForecastLink/r.length>.10,
  duplicateEvidence:duplicateRate>.02,
  recentCollapse:recent.length>0&&recentNet<=0
 };
 const critical=['temporalIntegrity','duplicateEvidence','recentCollapse'].filter(k=>findings[k]);
 const warnings=Object.entries(findings).filter(([,v])=>v).map(([k])=>k);
 const passed=r.length>=minTrades&&critical.length===0&&warnings.length<=1;
 const core={version:INDEPENDENT_PROOF_AUDITOR_VERSION,samples:r.length,passed,findings,critical,warnings,metrics:{topWinnerShare,maxSymbolShare,temporalViolations,missingForecastLinkRate:r.length?missingForecastLink/r.length:null,duplicateRate,recentTrades:recent.length,recentNetPnlQuote:recentNet},execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,meaning:'ADVERSARIAL_EVIDENCE_AUDIT_NOT_LIVE_AUTHORIZATION'};
 return freeze({...core,fingerprint:sha256(core)});
}
