import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { sha256 } from './institutional-kernel.mjs';
import { evaluateForecastFeatureExtensionWalkForward } from './forecast-candidate-lab.mjs';
import { featureResearchRowsFromJournal } from './forecast-feature-research.mjs';
import { TECHNICAL_INDICATOR_EXPERIMENTS } from './technical-indicator-feature-factory.mjs';

export const INDICATOR_EVOLUTION_ENGINE_VERSION='BIGGJ_INDICATOR_EVOLUTION_ENGINE_V1';
export const INDICATOR_EVOLUTION_SCHEMA_VERSION=1;

export const DEFAULT_INDICATOR_EVOLUTION_POLICY=Object.freeze({
  minSeedRows:40,
  minOosCases:60,
  minIndependentEpisodes:30,
  minNewOosCasesPerDecision:25,
  minBrierImprovement:.003,
  familyFdrQ:.05,
  maxLogLossRegression:.01,
  maxHighConfidenceWrongRateRegression:.02,
  maxCoverageErrorRegression:.02,
  targetIntervalCoverage:.80,
  permutationIterations:1024,
  bootstrapIterations:600,
  supportMilestonesForCore:2,
  failuresBeforeRetire:3,
  minIndependentEpisodesForRetire:80,
  contextMinSamples:15,
  contextMinBrierImprovement:.006,
  contextSupportMilestones:2,
  redundancyAbsSpearman:.95,
  redundancyMinRows:80,
  reactivationNewOosCases:120,
  maxEvaluationsPerCycle:6,
  maxEvidenceEventsPerIndicator:30
});

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='')return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clone(v){return v==null?v:structuredClone(v);}
function mean(xs){
  const a=(xs||[]).map(Number).filter(Number.isFinite);
  return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
}
function quantile(xs,q){
  const a=(xs||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return null;
  const pos=(a.length-1)*Math.max(0,Math.min(1,Number(q)));
  const lo=Math.floor(pos),hi=Math.ceil(pos),w=pos-lo;
  return a[lo]*(1-w)+a[hi]*w;
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
function bootstrapMeanCi(values,{iterations=600,seed='x',alpha=.05}={}){
  const xs=(values||[]).map(Number).filter(Number.isFinite);
  if(xs.length<2)return {lower:null,upper:null,iterations:0};
  const rand=prng(seed32('indicator-bootstrap:'+seed)),reps=[],n=xs.length,it=Math.max(200,Math.floor(Number(iterations)||600));
  for(let b=0;b<it;b++){
    let s=0;
    for(let i=0;i<n;i++)s+=xs[Math.floor(rand()*n)];
    reps.push(s/n);
  }
  return {lower:quantile(reps,alpha/2),upper:quantile(reps,1-alpha/2),iterations:it};
}
function signFlipP(values,{iterations=1024,seed='x'}={}){
  const xs=(values||[]).map(Number).filter(Number.isFinite);
  if(xs.length<2)return 1;
  const observed=mean(xs);
  if(observed==null||observed>=0)return 1;
  const rand=prng(seed32('indicator-permutation:'+seed)),it=Math.max(256,Math.floor(Number(iterations)||1024));
  let extreme=0;
  for(let b=0;b<it;b++){
    let s=0;
    for(const x of xs)s+=(rand()<.5?-x:x);
    if(s/xs.length<=observed)extreme++;
  }
  return (extreme+1)/(it+1);
}
function bhAdjust(rows){
  const xs=(rows||[]).filter(x=>Number.isFinite(Number(x.rawP))).sort((a,b)=>Number(a.rawP)-Number(b.rawP)||String(a.id).localeCompare(String(b.id)));
  const out=new Map();let running=1;
  for(let i=xs.length-1;i>=0;i--){
    const q=Math.min(running,Number(xs[i].rawP)*xs.length/(i+1),1);
    running=q;out.set(String(xs[i].id),q);
  }
  return out;
}
function coverageError(m,target){return Math.abs(Number(m?.intervalCoverage)-Number(target));}
function statusOrder(s){
  return {
    CORE_CANDIDATE:8,SUPPORTED_ONCE:7,SPECIALIST_CANDIDATE:6,REACTIVATION_TRIAL:5,
    VALIDATING:4,WATCH:3,PROBATION:2,REDUNDANT:1,RETIRED:0,ERROR:-1
  }[String(s)]??0;
}
function baseEntry(exp,now){
  return {
    id:String(exp.id),
    label:String(exp.label||exp.id),
    family:String(exp.family||'UNKNOWN'),
    timeframe:String(exp.timeframe||'UNKNOWN'),
    featureIds:[...(exp.featureIds||[])],
    representativeFeatureId:String(exp.representativeFeatureId||exp.featureIds?.[0]||''),
    source:String(exp.source||'UNKNOWN'),
    status:'PROBATION',
    active:true,
    firstSeenAt:Number(now),
    lastSeenAt:Number(now),
    seedCutoffAt:null,
    seedCases:0,
    oosCases:0,
    independentEpisodes:0,
    supportMilestones:0,
    contextSupportMilestones:0,
    failureMilestones:0,
    lastDecisionOosCases:0,
    lastEvaluatedAt:null,
    lastEvaluation:null,
    redundancy:null,
    retiredAtOosCases:null,
    reactivationCount:0,
    evidence:[]
  };
}
function createEntries(experiments,now){
  return (Array.isArray(experiments)?experiments:[]).map(x=>baseEntry(x,now));
}
function experimentHash(experiments){
  return sha256((experiments||[]).map(x=>({
    id:x.id,featureIds:x.featureIds,representativeFeatureId:x.representativeFeatureId
  })));
}
export function createIndicatorEvolutionState({
  experiments=TECHNICAL_INDICATOR_EXPERIMENTS,
  incumbentConfig,
  now=Date.now()
}={}){
  if(!incumbentConfig?.featureIds?.length)throw new Error('incumbentConfig.featureIds required');
  return {
    schemaVersion:INDICATOR_EVOLUTION_SCHEMA_VERSION,
    version:INDICATOR_EVOLUTION_ENGINE_VERSION,
    createdAt:Number(now),
    updatedAt:Number(now),
    cycle:0,
    cursor:0,
    baselineGeneration:1,
    incumbentConfigHash:sha256(incumbentConfig),
    catalogHash:experimentHash(experiments),
    indicators:createEntries(experiments,now),
    lastDelta:null,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    automaticProductionMutation:false,
    automaticPromotion:false
  };
}
function featureComplete(row,ids){
  return ids.every(id=>Number.isFinite(Number(row?.features?.[id])));
}
function seedAndOos(entry,rows,asOf,policy){
  const complete=rows
    .filter(r=>Number(r.resolvedAt)<=Number(asOf)&&featureComplete(r,entry.featureIds))
    .sort((a,b)=>Number(a.resolvedAt)-Number(b.resolvedAt)||Number(a.timestamp)-Number(b.timestamp));
  let cutoff=finite(entry.seedCutoffAt);
  if(cutoff==null&&complete.length>=Number(policy.minSeedRows)){
    cutoff=Number(complete[Math.max(0,Number(policy.minSeedRows)-1)].resolvedAt);
  }
  const oos=cutoff==null?[]:complete.filter(r=>Number(r.timestamp)>cutoff);
  return {complete,cutoff,oos};
}
function contextEvidence(paired,policy){
  const groups=new Map();
  for(const x of paired||[]){
    const key=String(x.regimeId||'UNKNOWN')+'|'+String(x.horizonMs||'UNKNOWN');
    const a=groups.get(key)||[];a.push(Number(x.deltas?.brier));groups.set(key,a);
  }
  const contexts=[];
  for(const [key,vals] of groups){
    const xs=vals.filter(Number.isFinite);
    if(xs.length<Number(policy.contextMinSamples))continue;
    const m=mean(xs);
    const ci=bootstrapMeanCi(xs,{iterations:Math.min(400,Number(policy.bootstrapIterations)),seed:'context:'+key+':'+xs.length});
    contexts.push({
      key,samples:xs.length,meanBrierDelta:m,ci95:ci,
      supported:m!=null&&m<=-Number(policy.contextMinBrierImprovement)&&finite(ci.upper)!=null&&Number(ci.upper)<0
    });
  }
  contexts.sort((a,b)=>Number(a.meanBrierDelta)-Number(b.meanBrierDelta)||b.samples-a.samples);
  return contexts;
}
function evaluationStats(wf,entry,policy){
  const ev=wf?.evaluation||{},paired=wf?.diagnostics?.pairedIndependent||[];
  const deltas=paired.map(x=>Number(x?.deltas?.brier)).filter(Number.isFinite);
  const meanBrierDelta=mean(deltas);
  const ci=bootstrapMeanCi(deltas,{
    iterations:policy.bootstrapIterations,
    seed:String(entry.id)+':'+String(ev.independentEpisodes)+':'+String(ev.cases)
  });
  const rawP=signFlipP(deltas,{
    iterations:policy.permutationIterations,
    seed:String(entry.id)+':'+String(ev.independentEpisodes)+':'+String(ev.cases)
  });
  return {
    cases:Number(ev.cases||0),
    independentEpisodes:Number(ev.independentEpisodes||0),
    candidate:clone(ev.candidate||null),
    incumbent:clone(ev.incumbent||null),
    deltas:clone(ev.deltas||null),
    meanBrierDelta,
    brierCi95:ci,
    rawP,
    q:null,
    contexts:contextEvidence(paired,policy),
    pitViolations:Number(wf?.diagnostics?.pitViolations||0),
    temporalOosPassed:wf?.diagnostics?.temporalOosPassed===true
  };
}
function decisionFor(stats,policy){
  if(!stats||stats.cases<Number(policy.minOosCases)||stats.independentEpisodes<Number(policy.minIndependentEpisodes)){
    return {supported:false,ready:false,reasons:['INSUFFICIENT_OOS_EVIDENCE']};
  }
  const reasons=[];
  if(!(Number(stats.meanBrierDelta)<=-Number(policy.minBrierImprovement)))reasons.push('BRIER_LIFT_TOO_SMALL');
  if(!(Number(stats.q)<=Number(policy.familyFdrQ)))reasons.push('FDR_NOT_SURVIVED');
  if(!(finite(stats.brierCi95?.upper)!=null&&Number(stats.brierCi95.upper)<0))reasons.push('BRIER_CI_CROSSES_ZERO');
  if(Number(stats?.deltas?.logLoss)>Number(policy.maxLogLossRegression))reasons.push('LOG_LOSS_REGRESSION');
  const hc=(Number(stats?.candidate?.highConfidenceWrongRate)-Number(stats?.incumbent?.highConfidenceWrongRate));
  if(Number.isFinite(hc)&&hc>Number(policy.maxHighConfidenceWrongRateRegression))reasons.push('HIGH_CONFIDENCE_WRONG_REGRESSION');
  const cov=coverageError(stats?.candidate,policy.targetIntervalCoverage)-coverageError(stats?.incumbent,policy.targetIntervalCoverage);
  if(Number.isFinite(cov)&&cov>Number(policy.maxCoverageErrorRegression))reasons.push('INTERVAL_COVERAGE_REGRESSION');
  if(stats.temporalOosPassed!==true||Number(stats.pitViolations)>0)reasons.push('POINT_IN_TIME_VIOLATION');
  return {supported:reasons.length===0,ready:true,reasons};
}
function evidenceEvent(entry,{at,kind,decision=null}={}){
  return {
    at:Number(at),
    kind:String(kind),
    status:String(entry.status),
    oosCases:Number(entry.oosCases||0),
    independentEpisodes:Number(entry.independentEpisodes||0),
    supportMilestones:Number(entry.supportMilestones||0),
    failureMilestones:Number(entry.failureMilestones||0),
    meanBrierDelta:finite(entry?.lastEvaluation?.meanBrierDelta),
    q:finite(entry?.lastEvaluation?.q),
    decision:decision?clone(decision):null
  };
}
function rank(values){
  const indexed=values.map((v,i)=>({v:Number(v),i})).sort((a,b)=>a.v-b.v);
  const out=Array(values.length).fill(0);
  let p=0;
  while(p<indexed.length){
    let q=p+1;while(q<indexed.length&&indexed[q].v===indexed[p].v)q++;
    const r=(p+q-1)/2+1;
    for(let j=p;j<q;j++)out[indexed[j].i]=r;
    p=q;
  }
  return out;
}
function pearson(a,b){
  if(a.length!==b.length||a.length<3)return null;
  const ma=mean(a),mb=mean(b);
  let n=0,da=0,db=0;
  for(let i=0;i<a.length;i++){
    const x=a[i]-ma,y=b[i]-mb;n+=x*y;da+=x*x;db+=y*y;
  }
  return da>0&&db>0?n/Math.sqrt(da*db):null;
}
function spearmanForEntries(a,b,rows,policy){
  const xs=[],ys=[];
  for(const row of rows.slice(-1000)){
    const x=finite(row?.features?.[a.representativeFeatureId]),y=finite(row?.features?.[b.representativeFeatureId]);
    if(x==null||y==null)continue;
    xs.push(x);ys.push(y);
  }
  if(xs.length<Number(policy.redundancyMinRows))return {rho:null,samples:xs.length};
  return {rho:pearson(rank(xs),rank(ys)),samples:xs.length};
}
function applyRedundancy(entries,rows,policy){
  const supported=entries
    .filter(x=>['CORE_CANDIDATE','SUPPORTED_ONCE'].includes(String(x.status))&&x.lastEvaluation)
    .sort((a,b)=>
      Number(a.lastEvaluation.meanBrierDelta)-Number(b.lastEvaluation.meanBrierDelta)||
      Number(b.independentEpisodes)-Number(a.independentEpisodes)
    );
  const kept=[];
  for(const e of supported){
    let duplicate=null;
    for(const stronger of kept){
      if(stronger.timeframe!==e.timeframe)continue;
      const corr=spearmanForEntries(stronger,e,rows,policy);
      if(corr.rho!=null&&Math.abs(corr.rho)>=Number(policy.redundancyAbsSpearman)){
        duplicate={withId:stronger.id,rho:corr.rho,samples:corr.samples};
        break;
      }
    }
    if(duplicate){
      e.redundancy=duplicate;
      e.status='REDUNDANT';
      e.active=false;
    }else{
      e.redundancy=null;
      kept.push(e);
    }
  }
  for(const e of entries){
    if(e.status==='REDUNDANT'&&e.redundancy){
      const peer=entries.find(x=>x.id===e.redundancy.withId);
      if(!peer||!['CORE_CANDIDATE','SUPPORTED_ONCE'].includes(String(peer.status))){
        e.status='WATCH';e.active=true;e.redundancy=null;
      }
    }
  }
}
function applyLifecycle(entry,decision,policy,{freshDecision=false}={}){
  const contextSupported=(entry.lastEvaluation?.contexts||[]).some(x=>x.supported===true);
  if(!decision.ready){
    entry.status=entry.seedCutoffAt==null?'PROBATION':'VALIDATING';
    entry.active=true;
    return;
  }
  if(freshDecision){
    if(decision.supported){
      entry.supportMilestones=Number(entry.supportMilestones||0)+1;
      entry.failureMilestones=0;
    }else if(contextSupported){
      entry.contextSupportMilestones=Number(entry.contextSupportMilestones||0)+1;
      entry.failureMilestones=Math.max(0,Number(entry.failureMilestones||0));
    }else{
      entry.failureMilestones=Number(entry.failureMilestones||0)+1;
    }
    entry.lastDecisionOosCases=Number(entry.oosCases||0);
  }

  if(decision.supported&&entry.supportMilestones>=Number(policy.supportMilestonesForCore)){
    entry.status='CORE_CANDIDATE';entry.active=true;return;
  }
  if(decision.supported){
    entry.status='SUPPORTED_ONCE';entry.active=true;return;
  }
  if(contextSupported&&entry.contextSupportMilestones>=Number(policy.contextSupportMilestones)){
    entry.status='SPECIALIST_CANDIDATE';entry.active=true;return;
  }
  if(
    entry.failureMilestones>=Number(policy.failuresBeforeRetire)&&
    entry.independentEpisodes>=Number(policy.minIndependentEpisodesForRetire)
  ){
    entry.status='RETIRED';entry.active=false;
    if(entry.retiredAtOosCases==null)entry.retiredAtOosCases=Number(entry.oosCases||0);
    return;
  }
  entry.status='WATCH';entry.active=true;
}
function maybeReactivate(entry,policy){
  if(entry.status!=='RETIRED')return false;
  const base=Number(entry.retiredAtOosCases||0);
  if(Number(entry.oosCases||0)-base<Number(policy.reactivationNewOosCases))return false;
  entry.status='REACTIVATION_TRIAL';
  entry.active=true;
  entry.reactivationCount=Number(entry.reactivationCount||0)+1;
  entry.failureMilestones=Math.max(0,Number(entry.failureMilestones||0)-1);
  entry.retiredAtOosCases=null;
  return true;
}
function prepareState(input,{experiments,incumbentConfig,now}){
  const hash=experimentHash(experiments),baseHash=sha256(incumbentConfig);
  if(!input||input.version!==INDICATOR_EVOLUTION_ENGINE_VERSION||input.schemaVersion!==INDICATOR_EVOLUTION_SCHEMA_VERSION){
    return {state:createIndicatorEvolutionState({experiments,incumbentConfig,now}),reset:true};
  }
  const state=clone(input);
  if(state.catalogHash!==hash){
    const prev=new Map((state.indicators||[]).map(x=>[x.id,x]));
    state.indicators=experiments.map(exp=>{
      const old=prev.get(exp.id);
      return old?{...baseEntry(exp,old.firstSeenAt||now),...old,featureIds:[...exp.featureIds],representativeFeatureId:exp.representativeFeatureId}:baseEntry(exp,now);
    });
    state.catalogHash=hash;
  }
  if(state.incumbentConfigHash!==baseHash){
    state.baselineGeneration=Number(state.baselineGeneration||1)+1;
    state.incumbentConfigHash=baseHash;
    state.cursor=0;
    for(const e of state.indicators){
      e.status='PROBATION';e.active=true;e.seedCutoffAt=null;e.seedCases=0;e.oosCases=0;e.independentEpisodes=0;
      e.supportMilestones=0;e.contextSupportMilestones=0;e.failureMilestones=0;e.lastDecisionOosCases=0;
      e.lastEvaluatedAt=null;e.lastEvaluation=null;e.redundancy=null;e.retiredAtOosCases=null;
      e.evidence=[...(e.evidence||[]),{at:Number(now),kind:'BASELINE_CHANGED_RESEED',baselineGeneration:state.baselineGeneration}].slice(-30);
    }
  }
  return {state,reset:false};
}

export function refreshIndicatorEvolutionEngine(input,{
  journalEntries,
  incumbentConfig,
  experiments=TECHNICAL_INDICATOR_EXPERIMENTS,
  asOf=Date.now(),
  policy={}
}={}){
  if(!incumbentConfig?.featureIds?.length)throw new Error('incumbentConfig.featureIds required');
  const p={...DEFAULT_INDICATOR_EVOLUTION_POLICY,...policy};
  const prepared=prepareState(input,{experiments,incumbentConfig,now:asOf});
  const state=prepared.state;
  const rows=featureResearchRowsFromJournal(journalEntries);
  let changed=prepared.reset,seeded=0,reactivated=0,evaluated=0,statusChanges=0;
  const beforeStatus=new Map(state.indicators.map(x=>[x.id,x.status]));

  for(const e of state.indicators){
    const cov=seedAndOos(e,rows,asOf,p);
    e.lastSeenAt=Number(asOf);
    e.seedCases=Math.min(cov.complete.length,Number(p.minSeedRows));
    if(e.seedCutoffAt==null&&cov.cutoff!=null){
      e.seedCutoffAt=cov.cutoff;e.status='VALIDATING';seeded++;changed=true;
      e.evidence=[...(e.evidence||[]),evidenceEvent(e,{at:asOf,kind:'SEED_LOCKED'})].slice(-Number(p.maxEvidenceEventsPerIndicator));
    }
    e.oosCases=cov.oos.length;
    maybeReactivate(e,p)&&(reactivated++,changed=true);
    if(e.seedCutoffAt==null){e.status='PROBATION';e.active=true;}
    else if(e.oosCases<Number(p.minOosCases)&&!['RETIRED','REDUNDANT'].includes(e.status)){e.status='VALIDATING';e.active=true;}
  }

  const total=state.indicators.length;
  const selected=[];
  let scanned=0,index=Math.max(0,Number(state.cursor||0))%Math.max(1,total);
  while(scanned<total&&selected.length<Number(p.maxEvaluationsPerCycle)){
    const e=state.indicators[index];
    const enough=e.seedCutoffAt!=null&&e.oosCases>=Number(p.minOosCases);
    const newData=e.oosCases>=Number(e.lastDecisionOosCases||0)+Number(p.minNewOosCasesPerDecision);
    const due=enough&&e.active!==false&&(e.lastEvaluatedAt==null||newData||e.status==='REACTIVATION_TRIAL');
    if(due)selected.push(e);
    index=(index+1)%Math.max(1,total);scanned++;
  }
  state.cursor=index;

  for(const e of selected){
    try{
      const wf=evaluateForecastFeatureExtensionWalkForward({
        historyRows:rows,
        incumbentConfig,
        addedFeatureIds:e.featureIds,
        dataCutoffAt:e.seedCutoffAt,
        asOf,
        minimumTrainCases:Math.max(20,Math.floor(Number(p.minSeedRows)))
      });
      const stats=evaluationStats(wf,e,p);
      e.lastEvaluation=stats;
      e.lastEvaluatedAt=Number(asOf);
      e.independentEpisodes=stats.independentEpisodes;
      evaluated++;changed=true;
    }catch(err){
      e.status='ERROR';e.active=true;e.lastEvaluatedAt=Number(asOf);
      e.lastError=err instanceof Error?err.message:String(err);
      e.evidence=[...(e.evidence||[]),{at:Number(asOf),kind:'EVALUATION_ERROR',error:e.lastError}].slice(-Number(p.maxEvidenceEventsPerIndicator));
      evaluated++;changed=true;
    }
  }

  const q=bhAdjust(state.indicators.map(e=>({id:e.id,rawP:e.lastEvaluation?.rawP})));
  for(const e of state.indicators){
    if(e.lastEvaluation)e.lastEvaluation.q=q.get(e.id)??1;
  }

  for(const e of selected){
    if(!e.lastEvaluation)continue;
    const previous=beforeStatus.get(e.id);
    const decision=decisionFor(e.lastEvaluation,p);
    const freshDecision=e.oosCases>=Number(e.lastDecisionOosCases||0)+Number(p.minNewOosCasesPerDecision)||e.lastDecisionOosCases===0;
    applyLifecycle(e,decision,p,{freshDecision});
    if(freshDecision){
      e.evidence=[...(e.evidence||[]),evidenceEvent(e,{at:asOf,kind:'OOS_DECISION_MILESTONE',decision})].slice(-Number(p.maxEvidenceEventsPerIndicator));
    }
    if(previous!==e.status)statusChanges++;
  }

  applyRedundancy(state.indicators,rows,p);

  for(const e of state.indicators){
    const previous=beforeStatus.get(e.id);
    if(previous!==e.status&&!selected.includes(e)){
      statusChanges++;
      e.evidence=[...(e.evidence||[]),evidenceEvent(e,{at:asOf,kind:'LIFECYCLE_CHANGE'})].slice(-Number(p.maxEvidenceEventsPerIndicator));
    }
  }

  state.updatedAt=Number(asOf);
  state.cycle=Number(state.cycle||0)+1;
  state.lastDelta={seeded,reactivated,evaluated,statusChanges,rows:rows.length};
  state.execution='SHADOW_ONLY';
  state.action='ABSTAIN';
  state.canExecuteLive=false;
  state.automaticProductionMutation=false;
  state.automaticPromotion=false;
  return {state,changed:changed||seeded>0||reactivated>0||evaluated>0||statusChanges>0,delta:clone(state.lastDelta)};
}

export function indicatorEvolutionSummary(state){
  const rows=(state?.indicators||[]).map(x=>({
    id:x.id,label:x.label,family:x.family,timeframe:x.timeframe,status:x.status,active:x.active!==false,
    seedCases:Number(x.seedCases||0),oosCases:Number(x.oosCases||0),independentEpisodes:Number(x.independentEpisodes||0),
    supportMilestones:Number(x.supportMilestones||0),failureMilestones:Number(x.failureMilestones||0),
    contextSupportMilestones:Number(x.contextSupportMilestones||0),reactivationCount:Number(x.reactivationCount||0),
    meanBrierDelta:finite(x?.lastEvaluation?.meanBrierDelta),q:finite(x?.lastEvaluation?.q),
    contexts:(x?.lastEvaluation?.contexts||[]).slice(0,4),redundancy:clone(x.redundancy),
    lastEvaluatedAt:finite(x.lastEvaluatedAt),lastError:x.lastError||null
  }));
  const counts={};
  for(const r of rows)counts[r.status]=Number(counts[r.status]||0)+1;
  const strength=x=>{
    const lift=finite(x.meanBrierDelta,0);
    return (x.status==='CORE_CANDIDATE'?100:x.status==='SUPPORTED_ONCE'?70:x.status==='SPECIALIST_CANDIDATE'?55:0)-lift*1000+Math.min(20,x.independentEpisodes/5);
  };
  const top=[...rows].filter(x=>['CORE_CANDIDATE','SUPPORTED_ONCE','SPECIALIST_CANDIDATE'].includes(x.status)).sort((a,b)=>strength(b)-strength(a)).slice(0,12);
  const retired=[...rows].filter(x=>x.status==='RETIRED').sort((a,b)=>Number(b.failureMilestones)-Number(a.failureMilestones)||Number(b.oosCases)-Number(a.oosCases)).slice(0,10);
  const redundant=[...rows].filter(x=>x.status==='REDUNDANT').slice(0,10);
  return {
    version:INDICATOR_EVOLUTION_ENGINE_VERSION,
    updatedAt:finite(state?.updatedAt),
    cycle:Number(state?.cycle||0),
    baselineGeneration:Number(state?.baselineGeneration||1),
    catalogSize:rows.length,
    active:rows.filter(x=>x.active).length,
    counts,
    top,
    retired,
    redundant,
    evaluationCursor:Number(state?.cursor||0),
    lastDelta:clone(state?.lastDelta||null),
    semantics:'BROAD_INDICATOR_POOL_WITH_POINT_IN_TIME_WALK_FORWARD_FDR_PRUNING',
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    automaticProductionMutation:false,
    automaticPromotion:false
  };
}

export async function loadIndicatorEvolutionState(filePath,{incumbentConfig,experiments=TECHNICAL_INDICATOR_EXPERIMENTS,now=Date.now()}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(parsed?.version!==INDICATOR_EVOLUTION_ENGINE_VERSION||parsed?.schemaVersion!==INDICATOR_EVOLUTION_SCHEMA_VERSION)throw new Error('INDICATOR_EVOLUTION_SCHEMA_MISMATCH');
    return {state:parsed,healthy:true,recoveredFromCorrupt:false,error:null};
  }catch(err){
    if(err?.code!=='ENOENT'){
      try{await rename(filePath,filePath+'.corrupt-'+Date.now());}catch{}
    }
    return {
      state:createIndicatorEvolutionState({experiments,incumbentConfig,now}),
      healthy:err?.code==='ENOENT',
      recoveredFromCorrupt:err?.code!=='ENOENT',
      error:err?.code==='ENOENT'?null:(err instanceof Error?err.message:String(err))
    };
  }
}
export async function saveIndicatorEvolutionState(filePath,state){
  await mkdir(path.dirname(filePath),{recursive:true});
  const body={...clone(state),schemaVersion:INDICATOR_EVOLUTION_SCHEMA_VERSION,version:INDICATOR_EVOLUTION_ENGINE_VERSION,updatedAt:Date.now(),execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,automaticProductionMutation:false,automaticPromotion:false};
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(body,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return body;
}
