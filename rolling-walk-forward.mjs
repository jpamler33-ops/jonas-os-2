import { sha256 } from './institutional-kernel.mjs';
export const ROLLING_WALK_FORWARD_VERSION='TCX_ROLLING_WALK_FORWARD_V1';
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
function rows(l){return(l?.positions||[]).filter(p=>p?.execution==='SHADOW_ONLY'&&p?.canExecuteLive===false&&p?.status==='CLOSED'&&!['COVERAGE_PROBE','ABSTAIN_PROBE','CHALLENGER'].includes(String(p.entryMode||'STANDARD').toUpperCase())&&Number.isFinite(Number(p.realizedNetPnlQuote))&&Number.isFinite(Number(p.closedAt))).sort((a,b)=>Number(a.closedAt)-Number(b.closedAt));}
function stats(r){let gp=0,gl=0,net=0;for(const p of r){const x=finite(p.realizedNetPnlQuote);net+=x;x>0?gp+=x:gl+=Math.abs(x);}return{trades:r.length,netPnlQuote:net,expectancyQuote:r.length?net/r.length:null,profitFactor:gl?gp/gl:(gp?999:null)};}
export function evaluateRollingWalkForward(ledger,{minTrainTrades=120,testTrades=30,stepTrades=30,minWindows=4,minPositiveWindowRate=.75,minTestProfitFactor=1.05}={}){
 const r=rows(ledger),windows=[];
 for(let trainEnd=minTrainTrades;trainEnd+testTrades<=r.length;trainEnd+=stepTrades){
  const train=r.slice(0,trainEnd),test=r.slice(trainEnd,trainEnd+testTrades),a=stats(train),b=stats(test);
  windows.push({index:windows.length+1,trainStartAt:train[0]?.closedAt??null,trainEndAt:train.at(-1)?.closedAt??null,testStartAt:test[0]?.closedAt??null,testEndAt:test.at(-1)?.closedAt??null,chronologyValid:Number(train.at(-1)?.closedAt)<Number(test[0]?.closedAt),train:a,test:b,passed:finite(b.expectancyQuote,-Infinity)>0&&Number(b.profitFactor)>minTestProfitFactor});
 }
 const complete=windows.filter(x=>x.test.trades===testTrades),positive=complete.filter(x=>x.passed),positiveWindowRate=complete.length?positive.length/complete.length:0;
 const checks={enoughWindows:complete.length>=minWindows,strictChronology:complete.length>0&&complete.every(x=>x.chronologyValid),positiveWindowRate:positiveWindowRate>=minPositiveWindowRate,recentWindowPositive:complete.length>0&&complete.at(-1).passed};
 const passed=Object.values(checks).every(Boolean);
 const core={version:ROLLING_WALK_FORWARD_VERSION,samples:r.length,passed,checks,windows:complete,positiveWindows:positive.length,positiveWindowRate,thresholds:{minTrainTrades,testTrades,stepTrades,minWindows,minPositiveWindowRate,minTestProfitFactor},execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,meaning:'CHRONOLOGICAL_ROLLING_FORWARD_EVIDENCE_NOT_STRATEGY_RETRAINING_OR_LIVE_AUTHORIZATION'};
 return freeze({...core,fingerprint:sha256(core)});
}
