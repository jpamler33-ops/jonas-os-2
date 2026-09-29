import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';
import { DEFAULT_PROMOTION_POLICY } from './model-promotion-ladder.mjs';

export const FORECAST_EXPERIMENT_GOVERNOR_VERSION='TCX_FORECAST_EXPERIMENT_GOVERNOR_V1';

export const DEFAULT_EXPERIMENT_POLICY=Object.freeze({
  minCases:DEFAULT_PROMOTION_POLICY.minCases,
  minIndependentEpisodes:DEFAULT_PROMOTION_POLICY.minIndependentEpisodes,
  familyAlpha:.05,
  minBrierImprovement:DEFAULT_PROMOTION_POLICY.minBrierImprovement,
  maxLogLossRegression:DEFAULT_PROMOTION_POLICY.maxLogLossRegression,
  maxHighConfidenceWrongRateRegression:DEFAULT_PROMOTION_POLICY.maxHighConfidenceWrongRateRegression,
  maxCoverageErrorRegression:DEFAULT_PROMOTION_POLICY.maxCoverageErrorRegression,
  targetIntervalCoverage:DEFAULT_PROMOTION_POLICY.targetIntervalCoverage,
  maxSubgroupBrierRegression:.02,
  maxSubgroupLogLossRegression:.05,
  minSubgroupCases:10,
  permutationIterations:2048,
  bootstrapIterations:1200
});

const TERMINAL=new Set(['REJECTED','PROMOTION_CANDIDATE','RETIRED']);

function clone(v){ return structuredClone(v); }
function finite(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function mean(xs){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null);
  return ys.length?ys.reduce((a,b)=>a+b,0)/ys.length:null;
}
function quantile(xs,q){
  const ys=(Array.isArray(xs)?xs:[]).map(finite).filter(x=>x!=null).sort((a,b)=>a-b);
  if(!ys.length) return null;
  const pos=(ys.length-1)*Math.max(0,Math.min(1,Number(q)));
  const lo=Math.floor(pos),hi=Math.ceil(pos),w=pos-lo;
  return ys[lo]*(1-w)+ys[hi]*w;
}
function policyOf(policy){
  return Object.freeze({...DEFAULT_EXPERIMENT_POLICY,...(policy||{})});
}
function seed32(value){
  const h=sha256(String(value));
  return (parseInt(h.slice(0,8),16)>>>0)||0x9e3779b9;
}
function prng(seed){
  let a=seed>>>0;
  return ()=>{
    a=(a+0x6D2B79F5)>>>0;
    let t=a;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
function pairedRows(candidate){
  const rows=candidate?.lastEvaluation?.diagnostics?.pairedIndependent;
  if(!Array.isArray(rows)) return [];
  return rows.filter(r=>
    finite(r?.deltas?.brier)!=null&&
    finite(r?.deltas?.logLoss)!=null&&
    finite(r?.timestamp)!=null&&
    finite(r?.horizonMs)!=null
  );
}
function bootstrapMeanCi(values,{iterations,seed,alpha=.05}){
  const xs=(values||[]).map(Number).filter(Number.isFinite);
  if(xs.length<2) return {lower:null,upper:null,iterations:0};
  const rand=prng(seed32('bootstrap:'+seed));
  const reps=[];
  const n=xs.length;
  const it=Math.max(200,Math.floor(Number(iterations)||1200));
  for(let b=0;b<it;b++){
    let s=0;
    for(let i=0;i<n;i++) s+=xs[Math.floor(rand()*n)];
    reps.push(s/n);
  }
  return {
    lower:quantile(reps,alpha/2),
    upper:quantile(reps,1-alpha/2),
    iterations:it
  };
}
function pairedPermutationPValue(values,{iterations,seed}){
  const xs=(values||[]).map(Number).filter(Number.isFinite);
  if(xs.length<2) return 1;
  const observed=mean(xs);
  if(observed==null||observed>=0) return 1;
  const rand=prng(seed32('perm:'+seed));
  const it=Math.max(256,Math.floor(Number(iterations)||2048));
  let extreme=0;
  for(let b=0;b<it;b++){
    let s=0;
    for(const x of xs) s+=(rand()<.5?-x:x);
    const perm=s/xs.length;
    if(perm<=observed) extreme++;
  }
  return (extreme+1)/(it+1);
}
function holmAdjust(rows){
  const sorted=[...rows]
    .filter(r=>finite(r.rawP)!=null)
    .sort((a,b)=>a.rawP-b.rawP||String(a.id).localeCompare(String(b.id)));
  const m=sorted.length;
  let running=0;
  const map=new Map();
  for(let i=0;i<m;i++){
    const adjusted=Math.min(1,Math.max(running,(m-i)*sorted[i].rawP));
    running=adjusted;
    map.set(sorted[i].id,adjusted);
  }
  return map;
}
function subgroupDiagnostics(rows,policy){
  const p=policyOf(policy);
  const groups=[];
  const pushGroups=(kind,keyFn)=>{
    const map=new Map();
    for(const r of rows){
      const key=String(keyFn(r));
      const xs=map.get(key)??[];
      xs.push(r);
      map.set(key,xs);
    }
    for(const [key,xs] of map){
      if(xs.length<Number(p.minSubgroupCases)) continue;
      groups.push({
        kind,
        key,
        cases:xs.length,
        meanBrierDelta:mean(xs.map(x=>x.deltas.brier)),
        meanLogLossDelta:mean(xs.map(x=>x.deltas.logLoss))
      });
    }
  };
  pushGroups('HORIZON',r=>r.horizonMs);
  pushGroups('REGIME',r=>r.regimeId||'UNKNOWN');
  const severe=groups.filter(g=>
    Number(g.meanBrierDelta)>Number(p.maxSubgroupBrierRegression)||
    Number(g.meanLogLossDelta)>Number(p.maxSubgroupLogLossRegression)
  );
  return {
    checkedGroups:groups.length,
    severeRegressionCount:severe.length,
    stable:severe.length===0,
    groups,
    severe
  };
}
function metricsFinite(m){
  return m&&[
    m.brier,m.logLoss,m.intervalCoverage,m.highConfidenceWrongRate
  ].every(x=>finite(x)!=null);
}
function candidateSnapshot(c){
  const e=c?.lastEvaluation?.evaluation;
  return {
    cases:Math.max(0,Math.floor(Number(e?.cases??0))),
    independentEpisodes:Math.max(0,Math.floor(Number(e?.independentEpisodes??0))),
    candidateMetrics:metricsFinite(e?.candidate)?clone(e.candidate):null,
    incumbentMetrics:metricsFinite(e?.incumbent)?clone(e.incumbent):null,
    temporalOosPassed:c?.lastEvaluation?.diagnostics?.temporalOosPassed===true,
    pairedRows:pairedRows(c)
  };
}
function coverageError(m,target){
  return Math.abs(Number(m.intervalCoverage)-Number(target));
}
function frozenParticipant(c){
  const a=c?.artifact;
  if(!a?.candidateId||!a?.fingerprint) throw new Error('candidate artifact required');
  return Object.freeze({
    blueprintId:String(c.blueprintId),
    label:String(c.label||c.blueprintId),
    candidateId:String(a.candidateId),
    artifactFingerprint:String(a.fingerprint),
    modelHash:String(a.modelHash),
    configHash:String(a.configHash),
    source:String(c.source||a.source||'UNKNOWN'),
    status:'SHADOW_TESTING',
    frozenAt:null,
    decision:null
  });
}

export function createExperimentGovernor({
  competition,
  championConfigHash,
  championReleaseId='UNKNOWN',
  generationNumber=1,
  now=Date.now(),
  policy=DEFAULT_EXPERIMENT_POLICY
}={}){
  const t=finite(now);
  if(t==null) throw new Error('now must be finite');
  if(competition?.status!=='ACTIVE') throw new Error('active shadow competition required');
  if(!Number.isFinite(Number(competition?.dataCutoffAt))) throw new Error('competition cutoff required');
  const participants=(competition.candidates||[]).map(frozenParticipant);
  if(!participants.length) throw new Error('experiment participants required');
  const championHash=String(championConfigHash||competition.incumbentConfigHash||'').trim();
  if(!/^[a-f0-9]{64}$/i.test(championHash)) throw new Error('championConfigHash must be sha256');
  const participantSetHash=sha256(participants.map(p=>({
    blueprintId:p.blueprintId,
    candidateId:p.candidateId,
    artifactFingerprint:p.artifactFingerprint
  })));
  const core={
    generationNumber:Math.max(1,Math.floor(Number(generationNumber)||1)),
    createdAt:t,
    dataCutoffAt:Number(competition.dataCutoffAt),
    championConfigHash:championHash.toLowerCase(),
    championReleaseId:String(championReleaseId||'UNKNOWN'),
    participantSetHash
  };
  const generationId='EXP-'+sha256(core).slice(0,20).toUpperCase();
  return Object.freeze({
    version:FORECAST_EXPERIMENT_GOVERNOR_VERSION,
    status:'ACTIVE',
    generationId,
    ...core,
    policy:policyOf(policy),
    participants:Object.freeze(participants.map(p=>Object.freeze({...p,frozenAt:t}))),
    lastEvaluatedAt:null,
    decisionLookAt:null,
    evidencePacks:Object.freeze([]),
    nextGenerationEligible:false,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    productionMutationPerformed:false
  });
}

function buildEvidencePack(state,participant,snapshot,stats,adjustedP,subgroups,now,status,reasons){
  const core={
    version:'TCX_EXPERIMENT_EVIDENCE_V1',
    generationId:state.generationId,
    generationNumber:state.generationNumber,
    candidateId:participant.candidateId,
    blueprintId:participant.blueprintId,
    label:participant.label,
    championConfigHash:state.championConfigHash,
    championReleaseId:state.championReleaseId,
    trainingCutoffAt:state.dataCutoffAt,
    evaluatedAt:Number(now),
    decisionLookAt:Number(now),
    cases:snapshot.cases,
    independentEpisodes:snapshot.independentEpisodes,
    metrics:{
      candidate:snapshot.candidateMetrics,
      incumbent:snapshot.incumbentMetrics
    },
    statistics:{
      meanBrierDelta:stats.meanBrierDelta,
      meanLogLossDelta:stats.meanLogLossDelta,
      brierCi95:stats.brierCi95,
      rawPermutationP:stats.rawPermutationP,
      holmAdjustedP:adjustedP,
      multipleTestingMethod:'HOLM_BONFERRONI',
      familyAlpha:Number(state.policy.familyAlpha)
    },
    subgroupStability:subgroups,
    decision:status,
    reasons:[...reasons],
    invariants:{
      participantFrozenBeforeOos:true,
      sameSampleRetuningAllowed:false,
      repeatedDecisionPeekingAllowed:false,
      productionMutationAllowed:false,
      executionMode:'SHADOW_ONLY',
      canExecute:false
    }
  };
  return Object.freeze({...core,evidenceId:sha256(core)});
}

export function evaluateExperimentGovernor(state,{
  competition,
  now=Date.now()
}={}){
  if(state?.version!==FORECAST_EXPERIMENT_GOVERNOR_VERSION) throw new Error('experiment governor version invalid');
  if(state.status!=='ACTIVE') return Object.freeze(clone(state));
  const t=finite(now);
  if(t==null) throw new Error('now must be finite');
  if(Number(competition?.dataCutoffAt)!==Number(state.dataCutoffAt)){
    return Object.freeze({...clone(state),status:'INTEGRITY_HOLD',lastEvaluatedAt:t,integrityReason:'COMPETITION_CUTOFF_CHANGED'});
  }
  if(String(competition?.incumbentConfigHash||'').toLowerCase()!==String(state.championConfigHash).toLowerCase()){
    return Object.freeze({...clone(state),status:'INTEGRITY_HOLD',lastEvaluatedAt:t,integrityReason:'CHAMPION_CONFIG_CHANGED'});
  }

  const compById=new Map((competition.candidates||[]).map(c=>[String(c?.artifact?.candidateId),c]));
  const policy=policyOf(state.policy);
  const prepared=[];
  for(const p of state.participants){
    if(TERMINAL.has(p.status)){
      prepared.push({participant:p,terminal:true});
      continue;
    }
    const live=compById.get(p.candidateId);
    if(!live||String(live?.artifact?.fingerprint)!==p.artifactFingerprint){
      prepared.push({participant:{...p,status:'INTEGRITY_HOLD',decision:{reasons:['FROZEN_PARTICIPANT_MISSING_OR_CHANGED'],evaluatedAt:t}},terminal:false});
      continue;
    }
    const snap=candidateSnapshot(live);
    if(!snap.candidateMetrics||!snap.incumbentMetrics||!snap.temporalOosPassed){
      prepared.push({participant:{...p,status:'SHADOW_TESTING',decision:null},snapshot:snap,terminal:false});
      continue;
    }
    if(
      snap.cases<Number(policy.minCases)||
      snap.independentEpisodes<Number(policy.minIndependentEpisodes)||
      snap.pairedRows.length<Number(policy.minIndependentEpisodes)
    ){
      prepared.push({participant:{...p,status:'MEASURING',decision:{
        evaluatedAt:t,
        cases:snap.cases,
        independentEpisodes:snap.independentEpisodes,
        requiredCases:Number(policy.minCases),
        requiredIndependentEpisodes:Number(policy.minIndependentEpisodes)
      }},snapshot:snap,terminal:false});
      continue;
    }
    const brierDeltas=snap.pairedRows.map(r=>Number(r.deltas.brier));
    const logDeltas=snap.pairedRows.map(r=>Number(r.deltas.logLoss));
    const stats={
      meanBrierDelta:mean(brierDeltas),
      meanLogLossDelta:mean(logDeltas),
      brierCi95:bootstrapMeanCi(brierDeltas,{
        iterations:policy.bootstrapIterations,
        seed:state.generationId+':'+p.candidateId,
        alpha:.05
      }),
      rawPermutationP:pairedPermutationPValue(brierDeltas,{
        iterations:policy.permutationIterations,
        seed:state.generationId+':'+p.candidateId
      })
    };
    prepared.push({participant:p,snapshot:snap,stats,live,decisionReady:true,terminal:false});
  }

  const rawP=prepared.filter(x=>x.decisionReady).map(x=>({id:x.participant.candidateId,rawP:x.stats.rawPermutationP}));
  const adjusted=holmAdjust(rawP);
  const evidence=[...(state.evidencePacks||[])];
  const outParticipants=[];

  for(const item of prepared){
    const p=item.participant;
    if(item.terminal){ outParticipants.push(clone(p)); continue; }
    if(!item.decisionReady){ outParticipants.push(clone(p)); continue; }

    const snap=item.snapshot,stats=item.stats;
    const adjustedP=adjusted.get(p.candidateId)??1;
    const subgroups=subgroupDiagnostics(snap.pairedRows,policy);
    const coverageDelta=
      coverageError(snap.candidateMetrics,policy.targetIntervalCoverage)-
      coverageError(snap.incumbentMetrics,policy.targetIntervalCoverage);
    const logLossDelta=Number(snap.candidateMetrics.logLoss)-Number(snap.incumbentMetrics.logLoss);
    const hcWrongDelta=
      Number(snap.candidateMetrics.highConfidenceWrongRate)-
      Number(snap.incumbentMetrics.highConfidenceWrongRate);

    const reasons=[];
    if(!(Number(stats.meanBrierDelta)<=-Number(policy.minBrierImprovement))) reasons.push('BRIER_IMPROVEMENT_TOO_SMALL');
    if(!(Number(adjustedP)<=Number(policy.familyAlpha))) reasons.push('MULTIPLE_TESTING_NOT_SIGNIFICANT');
    if(!(finite(stats.brierCi95?.upper)!=null&&Number(stats.brierCi95.upper)<0)) reasons.push('BRIER_CI_CROSSES_ZERO');
    if(logLossDelta>Number(policy.maxLogLossRegression)) reasons.push('LOG_LOSS_REGRESSION');
    if(hcWrongDelta>Number(policy.maxHighConfidenceWrongRateRegression)) reasons.push('HIGH_CONFIDENCE_WRONG_RATE_REGRESSION');
    if(coverageDelta>Number(policy.maxCoverageErrorRegression)) reasons.push('INTERVAL_COVERAGE_REGRESSION');
    if(!subgroups.stable) reasons.push('SUBGROUP_INSTABILITY');

    const status=reasons.length?'REJECTED':'PROMOTION_CANDIDATE';
    const pack=buildEvidencePack(state,p,snap,stats,adjustedP,subgroups,t,status,reasons);
    evidence.push(pack);
    outParticipants.push({
      ...clone(p),
      status,
      decision:{
        evaluatedAt:t,
        evidenceId:pack.evidenceId,
        reasons,
        holmAdjustedP:adjustedP,
        meanBrierDelta:stats.meanBrierDelta,
        brierCi95:stats.brierCi95
      }
    });
  }

  const allTerminal=outParticipants.every(p=>TERMINAL.has(p.status));
  const promotion=outParticipants.filter(p=>p.status==='PROMOTION_CANDIDATE');
  const finalStatus=allTerminal
    ?(promotion.length?'COMPLETE_PROMOTION_REVIEW_REQUIRED':'COMPLETE_NO_PROMOTION')
    :'ACTIVE';

  return Object.freeze({
    ...clone(state),
    status:finalStatus,
    participants:Object.freeze(outParticipants.map(Object.freeze)),
    lastEvaluatedAt:t,
    decisionLookAt:allTerminal?(state.decisionLookAt??t):state.decisionLookAt,
    evidencePacks:Object.freeze(evidence.map(Object.freeze)),
    nextGenerationEligible:allTerminal,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    productionMutationPerformed:false
  });
}

export function experimentGovernorSummary(state){
  const participants=(state?.participants||[]);
  const counts={SHADOW_TESTING:0,MEASURING:0,INTEGRITY_HOLD:0,REJECTED:0,PROMOTION_CANDIDATE:0,RETIRED:0};
  for(const p of participants){
    const key=String(p.status||'SHADOW_TESTING');
    counts[key]=(counts[key]||0)+1;
  }
  const promotionCandidates=participants
    .filter(p=>p.status==='PROMOTION_CANDIDATE')
    .map(p=>({
      candidateId:p.candidateId,
      blueprintId:p.blueprintId,
      label:p.label,
      evidenceId:p.decision?.evidenceId??null,
      holmAdjustedP:finite(p.decision?.holmAdjustedP),
      meanBrierDelta:finite(p.decision?.meanBrierDelta),
      brierCi95:p.decision?.brierCi95??null
    }));
  return {
    version:FORECAST_EXPERIMENT_GOVERNOR_VERSION,
    status:String(state?.status||'UNINITIALIZED'),
    generationId:state?.generationId??null,
    generationNumber:Number(state?.generationNumber??0),
    dataCutoffAt:finite(state?.dataCutoffAt),
    participantCount:participants.length,
    counts,
    promotionCandidates,
    policy:state?.policy??policyOf(),
    lastEvaluatedAt:finite(state?.lastEvaluatedAt),
    decisionLookAt:finite(state?.decisionLookAt),
    nextGenerationEligible:state?.nextGenerationEligible===true,
    executionMode:'SHADOW_ONLY',
    productionMutationPerformed:false
  };
}

export async function loadExperimentGovernor(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const raw=await readFile(filePath,'utf8');
    const state=JSON.parse(raw);
    if(state?.version!==FORECAST_EXPERIMENT_GOVERNOR_VERSION) throw new Error('unsupported experiment governor version');
    return state;
  }catch(err){
    if(err?.code==='ENOENT') return null;
    const backup=filePath+'.corrupt-'+Date.now();
    try{ await rename(filePath,backup); }catch{}
    return null;
  }
}

export async function saveExperimentGovernor(filePath,state){
  await mkdir(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return state;
}
