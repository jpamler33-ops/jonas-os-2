export const BIGGJ_HEALTH_AUDIT_VERSION='TCX_BIGGJ_HEALTH_AUDIT_V1';

const finite=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;

export function auditWalletResearch({state,control,experiment,ageMs=0,lastOutcomeAgeMs=null,recentHistory=[]}={}){
  const findings=[];
  const c=control||{},e=experiment||{};
  const ct=finite(c.trades,0),et=finite(e.trades,0),total=ct+et;
  if(total>=10){
    const balance=Math.min(ct,et)/Math.max(1,Math.max(ct,et));
    if(balance<0.5) findings.push({code:'WALLET_ARM_IMBALANCE',severity:'WARN',cause:{control:ct,experiment:et,balance},impact:'Epoch comparison may be underpowered or biased.',action:'Keep collecting outcomes; do not LOCK until both arms have adequate samples.'});
  }
  if(lastOutcomeAgeMs!=null&&finite(lastOutcomeAgeMs,0)>4*60*60_000) findings.push({code:'WALLET_OUTCOME_STALE',severity:'WARN',cause:{lastOutcomeAgeMs},impact:'Epoch cannot gain new evidence.',action:'Trace admission→open→close→ledger outcome propagation.'});
  const h=Array.isArray(recentHistory)?recentHistory.slice(-6):[];
  const rejects=h.filter(x=>String(x?.decision?.verdict||x?.verdict||'').toUpperCase()==='REJECT');
  if(rejects.length>=4){
    const signatures=new Set(rejects.map(x=>JSON.stringify([x?.activeExperiment?.wheelId||x?.wheelId,x?.activeExperiment?.value||x?.value,x?.decision?.improvementScore??x?.improvementScore])));
    if(signatures.size<=2) findings.push({code:'WALLET_LOW_INFORMATION_REJECT_LOOP',severity:'WARN',cause:{rejects:rejects.length,uniqueSignatures:signatures.size},impact:'Research spends epochs without materially new information.',action:'Force a different research axis or widen challenger coverage; never mutate PRIMARY.'});
  }
  if(finite(e.winRate)!=null&&finite(c.winRate)!=null&&e.winRate>c.winRate){
    const expectancyWorse=finite(e.expectancyReturn,-Infinity)<finite(c.expectancyReturn,-Infinity);
    const pfWorse=finite(e.profitFactor,-Infinity)<finite(c.profitFactor,-Infinity);
    const ddWorse=finite(e.maxDrawdownPct,Infinity)>finite(c.maxDrawdownPct,Infinity);
    if(expectancyWorse&&(pfWorse||ddWorse)) findings.push({code:'WINRATE_UP_QUALITY_DOWN',severity:'WARN',cause:{control:c,experiment:e},impact:'Higher hit rate masks weaker payoff quality/risk.',action:'Reject LOCK; prioritize expectancy, PF and drawdown breadth over winrate.'});
  }
  return findings;
}

export function auditParallelWorlds({worlds=[],now=Date.now(),staleMs=6*60*60_000}={}){
  const findings=[];
  const xs=Array.isArray(worlds)?worlds:[];
  const genomes=new Map();
  for(const w of xs){
    const g=w?.currentGenome||{};
    const closed=finite(g?.evidence?.closed,0);
    const last=finite(g?.evidence?.lastClosedAt,g?.createdAt);
    if(closed===0&&last!=null&&now-last>staleMs) findings.push({code:'WORLD_STALLED_NO_EVIDENCE',severity:'WARN',cause:{worldId:w.worldId,generation:w.generation,ageMs:now-last},impact:'World consumes research capacity without outcomes.',action:'Trace candidate coverage and outcome binding; keep world isolated.'});
    const sig=JSON.stringify(g.profile||{});
    if(genomes.has(sig)) findings.push({code:'WORLD_REDUNDANT_GENOME',severity:'INFO',cause:{worldId:w.worldId,duplicateOf:genomes.get(sig)},impact:'Parallel capacity is not producing divergence.',action:'Mutate an orthogonal one-factor axis before further evaluation.'});
    else genomes.set(sig,w.worldId);
  }
  return findings;
}

export function auditSafetyInvariants(snapshot={}){
  const bad=[];
  if(snapshot.execution&&snapshot.execution!=='SHADOW_ONLY') bad.push('execution');
  if(snapshot.canExecute!==undefined&&snapshot.canExecute!==false) bad.push('canExecute');
  if(snapshot.canExecuteLive!==undefined&&snapshot.canExecuteLive!==false) bad.push('canExecuteLive');
  if(snapshot.action&&snapshot.action!=='ABSTAIN') bad.push('action');
  return bad.length?[{code:'SAFETY_INVARIANT_VIOLATION',severity:'CRITICAL',cause:{fields:bad},impact:'Research boundary may be breached.',action:'Fail closed immediately; no live execution or promotion.'}]:[];
}

export function runBiggjHealthAudit(input={}){
  const findings=[...auditSafetyInvariants(input.safety||{}),...auditWalletResearch(input.wallet||{}),...auditParallelWorlds(input.parallelWorlds||{})];
  return {version:BIGGJ_HEALTH_AUDIT_VERSION,asOf:finite(input.asOf,Date.now()),status:findings.some(x=>x.severity==='CRITICAL')?'CRITICAL':findings.some(x=>x.severity==='WARN')?'WARN':'OK',findings,execution:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false,canExecuteLive:false,automaticProductionPromotion:false};
}
