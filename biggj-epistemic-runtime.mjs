import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { sha256 } from './institutional-kernel.mjs';
import {
  BIGGJ_EPISTEMIC_KERNEL_VERSION,
  createEpistemicLedger,
  verifyEpistemicLedger,
  registerTheory,
  appendTheoryEvidence,
  evaluateTheory,
  planNextTheoryExperiment,
  epistemicKernelSnapshot
} from './biggj-epistemic-kernel.mjs';

export const BIGGJ_EPISTEMIC_RUNTIME_VERSION='BIGGJ_EPISTEMIC_RUNTIME_V1';

const deepFreeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
};
const finite=(v,f=null)=>{
  if(v===null||v===undefined||v==='') return f;
  const n=Number(v);
  return Number.isFinite(n)?n:f;
};
const txt=(v,f='')=>{
  const s=String(v??'').trim();
  return s||f;
};
const uniq=xs=>[...new Set((Array.isArray(xs)?xs:[]).map(x=>txt(x)).filter(Boolean))].sort();

function provenanceIds(rows){
  return (Array.isArray(rows)?rows:[]).map(row=>'prov:'+sha256(row).slice(0,24)).sort();
}
function firstToken(rows,keys,fallback='UNKNOWN'){
  for(const row of Array.isArray(rows)?rows:[]){
    for(const key of keys){
      const value=txt(row?.[key]);
      if(value) return value.toUpperCase();
    }
  }
  return fallback;
}
function controllerFromProvenance(rows){
  const controllers=uniq((Array.isArray(rows)?rows:[]).flatMap(row=>[
    row?.sourceControllerId,
    row?.canonicalControllerId,
    row?.controllerId
  ]));
  return controllers.length===1?controllers[0]:'';
}
function polarityOf(outcome){
  const x=String(outcome||'NEUTRAL').toUpperCase();
  if(['POSITIVE','SUPPORT','SUPPORTED','PASS','WIN'].includes(x)) return 'SUPPORT';
  if(['NEGATIVE','CONTRA','CONTRADICTED','FAIL','LOSS'].includes(x)) return 'CONTRA';
  return 'NEUTRAL';
}
function evidenceKindOf(epistemicClass){
  const x=String(epistemicClass||'').toUpperCase();
  return x==='MODELLED'?'STRESS_TEST':'REAL';
}
function nullHypothesisFor(skill){
  return 'Observed evidence for '+txt(skill?.title,'this research skill')+
    ' is adequately explained by noise, selection effects, regime mix, measurement error, or common-cause dependence without requiring the stated hypothesis.';
}
function theoryForSkill(ledger,skillId){
  const tag='skill:'+String(skillId);
  return (ledger?.theories||[]).find(x=>(x.tags||[]).includes(tag))||null;
}
function scienceGateForSkill(skill){
  const rows=(skill?.evidence||[]).filter(x=>x?.validationEligible!==false);
  if(!rows.length) return 'INSUFFICIENT';
  const usable=rows.filter(x=>
    x?.pointInTime===true&&
    x?.futureLeakage!==true&&
    x?.auditReady===true&&
    x?.scientificGuardsPassed===true
  );
  if(usable.length>=4&&usable.length===rows.length) return 'PASS';
  if(usable.length>=2) return 'CAUTION';
  return 'INSUFFICIENT';
}
function validateLivingResearchSource(state){
  const reasons=[];
  if(state?.execution!=='SHADOW_ONLY') reasons.push('SOURCE_EXECUTION_MODE_INVALID');
  if(state?.canInfluencePrimary!==false) reasons.push('SOURCE_PRIMARY_INFLUENCE_INVALID');
  if(state?.canExecuteLive!==false) reasons.push('SOURCE_LIVE_EXECUTION_INVALID');
  if(state?.skillTree?.execution!=='SHADOW_ONLY') reasons.push('SKILL_TREE_EXECUTION_MODE_INVALID');
  if(state?.skillTree?.canExecuteLive!==false) reasons.push('SKILL_TREE_LIVE_EXECUTION_INVALID');
  if(!Array.isArray(state?.skillTree?.nodes)) reasons.push('SKILL_TREE_NODES_INVALID');
  return reasons;
}

export function syncLivingResearchIntoEpistemicKernel(ledger,livingResearchState,{asOf=Date.now()}={}){
  const lv=verifyEpistemicLedger(ledger);
  if(!lv.ok) throw new Error('EPISTEMIC_LEDGER_INVALID:'+lv.reasons.join(','));
  const sourceProblems=validateLivingResearchSource(livingResearchState);
  if(sourceProblems.length) throw new Error('LIVING_RESEARCH_SOURCE_INVALID:'+sourceProblems.join(','));
  const t=finite(asOf);
  if(t==null) throw new Error('EPISTEMIC_SYNC_ASOF_INVALID');

  let next=ledger;
  const links=[];
  const createdTheoryIds=[];
  const appendedEvidenceIds=[];
  const skippedEvidenceIds=[];

  const skills=(livingResearchState.skillTree.nodes||[])
    .filter(x=>x?.kind==='DISCOVERED_SKILL')
    .filter(x=>txt(x?.question)&&txt(x?.hypothesis)&&txt(x?.falsifier))
    .sort((a,b)=>String(a.skillId).localeCompare(String(b.skillId)));

  for(const skill of skills){
    let theory=theoryForSkill(next,skill.skillId);
    if(!theory){
      const registered=registerTheory(next,{
        title:txt(skill.title,'Living Research Theory'),
        question:skill.question,
        hypothesis:skill.hypothesis,
        falsifier:skill.falsifier,
        nullHypothesis:nullHypothesisFor(skill),
        mechanism:'LIVING_RESEARCH_SKILL:'+String(skill.skillId),
        tags:[
          'living-research',
          'skill:'+String(skill.skillId),
          'root:'+String(skill.rootId||'UNKNOWN'),
          'discovered-by:'+String(skill.discoveredBy||'UNKNOWN')
        ]
      },{at:finite(skill.createdAt,t)});
      next=registered.ledger;
      theory=registered.theory;
      if(registered.created) createdTheoryIds.push(theory.theoryId);
    }

    for(const evidence of skill.evidence||[]){
      const evidenceId='lr:'+String(evidence.evidenceId||sha256(evidence));
      if((next.evidence||[]).some(x=>x.evidenceId===evidenceId)){
        skippedEvidenceIds.push(evidenceId);
        continue;
      }
      const prov=Array.isArray(evidence.provenance)?evidence.provenance:[];
      const availableAt=finite(evidence.availableAt);
      const observedAt=availableAt;
      const appended=appendTheoryEvidence(next,theory.theoryId,{
        evidenceId,
        classification:String(evidence.epistemicClass||'ASSUMED').toUpperCase(),
        kind:evidenceKindOf(evidence.epistemicClass),
        polarity:polarityOf(evidence.outcome),
        sourceId:txt(evidence.sourceId),
        sourceControllerId:controllerFromProvenance(prov),
        provenanceIds:provenanceIds(prov),
        independenceKey:txt(evidence.independentEpisodeId),
        episodeId:txt(evidence.independentEpisodeId),
        market:firstToken(prov,['symbol','market','asset'],'UNKNOWN'),
        regime:firstToken(prov,['regimeId','regime'],'UNKNOWN'),
        horizon:firstToken(prov,['horizonId','horizon'],'UNKNOWN'),
        observedAt,
        availableAt,
        outOfSample:evidence.forwardShadow===true,
        prospective:evidence.forwardShadow===true,
        falsifierHit:false,
        value:{
          statement:txt(evidence.statement),
          metricDelta:finite(evidence.metricDelta),
          auditReady:evidence.auditReady===true,
          scientificGuardsPassed:evidence.scientificGuardsPassed===true,
          chronologicalStable:evidence.chronologicalStable===true,
          costStressPassed:evidence.costStressPassed===true,
          concentrationPassed:evidence.concentrationPassed===true,
          winnerRemovalPassed:evidence.winnerRemovalPassed===true,
          validationEligible:evidence.validationEligible!==false
        },
        notes:'Imported conservatively from BIGGJ Living Research; absence of explicit controller or episode metadata is never inferred.'
      },{at:finite(evidence.asOf,availableAt??t)});
      next=appended.ledger;
      if(appended.created) appendedEvidenceIds.push(evidenceId);
    }

    const scientificGate=scienceGateForSkill(skill);
    const evaluation=evaluateTheory(next,theory.theoryId,{asOf:t,scientificGate});
    const nextExperiment=planNextTheoryExperiment(next,theory.theoryId,{asOf:t,scientificGate});
    links.push({
      skillId:skill.skillId,
      theoryId:theory.theoryId,
      scientificGate,
      derivedStatus:evaluation.derivedStatus,
      evidenceFingerprint:evaluation.fingerprint,
      nextExperiment
    });
  }

  const snapshot=epistemicKernelSnapshot(next,{asOf:t});
  return deepFreeze({
    version:BIGGJ_EPISTEMIC_RUNTIME_VERSION,
    asOf:t,
    changed:createdTheoryIds.length>0||appendedEvidenceIds.length>0,
    ledger:next,
    links,
    createdTheoryIds:uniq(createdTheoryIds),
    appendedEvidenceIds:uniq(appendedEvidenceIds),
    skippedEvidenceIds:uniq(skippedEvidenceIds),
    snapshot,
    invariants:{
      sourceResearchRemainsCanonical:true,
      noMissingIndependenceMetadataInvented:true,
      noMissingControllerMetadataInvented:true,
      modelledEvidenceCannotBecomeObserved:true,
      automaticExperimentLaunch:false,
      automaticPrimaryPromotion:false,
      primaryMutationAllowed:false
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}

export function biggjEpistemicRuntimeSummary(ledger,{asOf=Date.now()}={}){
  const snapshot=epistemicKernelSnapshot(ledger,{asOf});
  return deepFreeze({
    ...snapshot,
    version:BIGGJ_EPISTEMIC_RUNTIME_VERSION,
    kernelVersion:BIGGJ_EPISTEMIC_KERNEL_VERSION,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}

export async function openBiggjEpistemicRuntime(filePath,{asOf=Date.now()}={}){
  const p=String(filePath||'').trim();
  if(!p) throw new Error('EPISTEMIC_RUNTIME_FILE_REQUIRED');
  try{
    const raw=await readFile(p,'utf8');
    const parsed=JSON.parse(raw);
    const v=verifyEpistemicLedger(parsed);
    if(!v.ok) throw new Error('EPISTEMIC_LEDGER_INVALID:'+v.reasons.join(','));
    return {state:deepFreeze(parsed),healthy:true,created:false,recoveredFromCorrupt:false};
  }catch(err){
    if(err?.code==='ENOENT'){
      return {state:createEpistemicLedger({asOf}),healthy:true,created:true,recoveredFromCorrupt:false};
    }
    try{
      const corrupt=p+'.corrupt.'+Date.now();
      await rename(p,corrupt);
    }catch{}
    return {
      state:createEpistemicLedger({asOf}),
      healthy:false,
      created:true,
      recoveredFromCorrupt:true,
      error:err instanceof Error?err.message:String(err)
    };
  }
}

export async function saveBiggjEpistemicRuntime(filePath,ledger){
  const v=verifyEpistemicLedger(ledger);
  if(!v.ok) throw new Error('EPISTEMIC_LEDGER_INVALID:'+v.reasons.join(','));
  const p=String(filePath||'').trim();
  if(!p) throw new Error('EPISTEMIC_RUNTIME_FILE_REQUIRED');
  await mkdir(path.dirname(p),{recursive:true});
  const tmp=p+'.tmp.'+process.pid+'.'+Date.now();
  await writeFile(tmp,JSON.stringify(ledger),'utf8');
  await rename(tmp,p);
  return {ok:true,file:p,fingerprint:ledger.fingerprint};
}
