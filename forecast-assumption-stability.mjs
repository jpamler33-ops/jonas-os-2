import { sha256 } from './institutional-kernel.mjs';

export const FORECAST_ASSUMPTION_STABILITY_VERSION='TCX_FORECAST_ASSUMPTION_STABILITY_V1';

export const ASSUMPTION_STABILITY_STATES=Object.freeze([
  'ISSUE_UNSUPPORTED',
  'LEGACY_UNKNOWN',
  'SUPPORTED_STABLE',
  'TRANSIENT_FLICKER',
  'PERSISTENT_STALE',
  'RECOVERING'
]);

export const DEFAULT_ASSUMPTION_STABILITY_CONFIG=Object.freeze({
  minPersistentObservations:2,
  minPersistentDurationMs:60_000,
  minRecoveryObservations:2,
  minRecoveryDurationMs:60_000,
  minIndependentEvidenceFamilies:2,
  maxFalsifierCodes:16
});

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const clone=value=>value==null?value:structuredClone(value);
const uniq=xs=>[...new Set((xs||[]).map(String).filter(Boolean))].sort();
const text=(v,f='')=>String(v??f).trim();
const finite=(v,name)=>{
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
};
const int=(v,f=0)=>Number.isFinite(Number(v))?Math.max(0,Math.floor(Number(v))):f;

const EVIDENCE_FAMILY=Object.freeze({
  THESIS_WORLD_STATE:'DERIVED_MARKET_STATE',
  THESIS_WITNESS_STATE:'CROSS_VENUE_WITNESS',
  THESIS_MECHANISM_STATE:'MECHANISM_MODEL',
  THESIS_TRANSITION_STATE:'HISTORICAL_ANALOGUES',
  THESIS_EVIDENCE_STATE:'RESEARCH_EVIDENCE_ALIGNMENT',
  THESIS_DEPENDENCY_STATE:'DATA_GOVERNANCE_DEPENDENCIES',
  THESIS_SCIENCE_STATE:'SCIENTIFIC_GUARDS'
});

function configSnapshot(input={}){
  const d=DEFAULT_ASSUMPTION_STABILITY_CONFIG;
  return deepFreeze({
    minPersistentObservations:Math.max(2,int(input.minPersistentObservations,d.minPersistentObservations)),
    minPersistentDurationMs:Math.max(1,int(input.minPersistentDurationMs,d.minPersistentDurationMs)),
    minRecoveryObservations:Math.max(2,int(input.minRecoveryObservations,d.minRecoveryObservations)),
    minRecoveryDurationMs:Math.max(1,int(input.minRecoveryDurationMs,d.minRecoveryDurationMs)),
    minIndependentEvidenceFamilies:Math.max(2,int(input.minIndependentEvidenceFamilies,d.minIndependentEvidenceFamilies)),
    maxFalsifierCodes:Math.max(4,int(input.maxFalsifierCodes,d.maxFalsifierCodes))
  });
}

function provenanceMap(currentEvidence){
  const map=new Map();
  for(const row of currentEvidence||[]){
    for(const raw of row?.provenanceIds||[]){
      const value=String(raw);
      const i=value.indexOf(':');
      const key=(i<0?value:value.slice(0,i)).toUpperCase();
      const rest=i<0?'':value.slice(i+1);
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(rest);
    }
  }
  return map;
}

function first(map,key){
  const xs=map.get(String(key).toUpperCase());
  return xs?.[0]??null;
}
function boolValue(v){
  const s=String(v??'').toLowerCase();
  if(s==='true') return true;
  if(s==='false') return false;
  return null;
}
function numValue(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function nonBasisContradictions(map){
  return (map.get('CONTRADICTION')||[])
    .map(String)
    .filter(x=>x&&!x.startsWith('QUOTE_BASIS_RISK_'));
}

export function explicitAssumptionFalsifiers(assumption){
  const id=text(assumption?.assumptionId).toUpperCase();
  const p=provenanceMap(assumption?.currentEvidence);
  const codes=[];

  if(id==='THESIS_WORLD_STATE_REPRESENTATIVE'){
    const regime=text(first(p,'REGIME'),'UNKNOWN').toUpperCase();
    const structure=text(first(p,'STRUCTURE'),'UNKNOWN').toUpperCase();
    if(['UNKNOWN','INSUFFICIENT'].includes(regime)) codes.push('WORLD_REGIME_UNKNOWN');
    if(['UNKNOWN','INSUFFICIENT'].includes(structure)) codes.push('WORLD_STRUCTURE_UNKNOWN');
  }else if(id==='THESIS_WITNESS_SUPPORT_ADEQUATE'){
    if(boolValue(first(p,'SATISFIED'))===false) codes.push('WITNESS_NOT_SATISFIED');
    const external=numValue(first(p,'EXTERNAL'));
    if(external!=null&&external<2) codes.push('WITNESS_EXTERNAL_COUNT_LT_2');
    if(nonBasisContradictions(p).length) codes.push('WITNESS_MATERIAL_CONTRADICTION');
  }else if(id==='THESIS_MECHANISM_SUPPORT_ADEQUATE'){
    const gate=text(first(p,'GATE'),'UNKNOWN').toUpperCase();
    if(!['HYPOTHESIS_SUPPORTED','IDENTIFIABILITY_REVIEW'].includes(gate)) codes.push('MECHANISM_GATE_NOT_SUPPORTED');
    const strength=numValue(first(p,'EVIDENCE_STRENGTH'));
    if(strength!=null&&strength<.55) codes.push('MECHANISM_EVIDENCE_STRENGTH_LT_055');
  }else if(id==='THESIS_TRANSITION_ANALOGUES_ADEQUATE'){
    if(boolValue(first(p,'SUFFICIENT'))===false) codes.push('TRANSITION_ANALOGUES_INSUFFICIENT');
  }else if(id==='THESIS_EVIDENCE_ALIGNMENT_ADEQUATE'){
    const index=numValue(first(p,'INDEX'));
    if(index==null||index<45) codes.push('EVIDENCE_INDEX_LT_45');
    const strength=numValue(first(p,'EVIDENCE_STRENGTH'));
    if(strength==null||strength<.55) codes.push('EVIDENCE_STRENGTH_LT_055');
  }else if(id==='THESIS_DEPENDENCY_COVERAGE_ADEQUATE'){
    const gate=text(first(p,'GATE'),'UNKNOWN').toUpperCase();
    if(!['PASS','CAUTION'].includes(gate)) codes.push('DEPENDENCY_GATE_NOT_ADEQUATE');
    const blocked=numValue(first(p,'BLOCKED_FEATURES'));
    if(blocked!=null&&blocked>0) codes.push('DEPENDENCY_BLOCKED_FEATURES_PRESENT');
  }else if(id==='THESIS_DISAGREEMENT_WITHIN_TOLERANCE'){
    const score=numValue(first(p,'CONTRADICTION_SCORE'));
    if(score==null||score>.25) codes.push('CONTRADICTION_SCORE_GT_025');
    if(nonBasisContradictions(p).length) codes.push('MATERIAL_WITNESS_CONTRADICTION');
  }else if(id==='THESIS_SCIENTIFIC_GUARDS_ADEQUATE'){
    const gate=text(first(p,'GATE'),'UNKNOWN').toUpperCase();
    if(!['PASS','CAUTION','VALID'].includes(gate)) codes.push('SCIENTIFIC_GUARD_NOT_ADEQUATE');
  }

  return uniq(codes);
}

export function assumptionEvidenceFamilies(assumption){
  return uniq((assumption?.expectedEvidenceIds||assumption?.currentEvidenceIds||[])
    .map(id=>EVIDENCE_FAMILY[String(id)]||('UNCLASSIFIED:'+String(id))));
}

function initialCore({
  assumptionId,
  issueSupported,
  issueEvidenceIds=[],
  legacy=false
}={}){
  const supported=issueSupported===true;
  return {
    version:FORECAST_ASSUMPTION_STABILITY_VERSION,
    assumptionId:text(assumptionId),
    state:legacy?'LEGACY_UNKNOWN':supported?'SUPPORTED_STABLE':'ISSUE_UNSUPPORTED',
    hasEstablishedSupport:supported,
    lastEvaluatedAt:null,
    lastCurrentSupported:supported,
    unsupportedSince:null,
    unsupportedObservationCount:0,
    supportedSince:supported?null:null,
    supportedObservationCount:0,
    currentUnsupportedDurationMs:0,
    currentRecoveryDurationMs:0,
    currentEvidenceFamilies:uniq(issueEvidenceIds.map(id=>EVIDENCE_FAMILY[String(id)]||('UNCLASSIFIED:'+String(id)))),
    structurallyIndependentEvidenceFamilyCount:0,
    currentFalsifierCodes:[],
    repeatedFalsifierCodes:[],
    firstTransientFlickerAt:null,
    firstPersistentStaleAt:null,
    firstRecoveryAt:null,
    firstRecoveredStableAt:null,
    transientFlickerCount:0,
    persistentStaleCount:0,
    recoveryCount:0,
    relapseCount:0,
    evaluationCount:0,
    migration:legacy?'LEGACY_V1_NO_HISTORICAL_STABILITY_BACKFILL':'NATIVE_V1',
    semantics:{
      structuralIndependenceIsHeuristicNotStatisticalProof:true,
      persistenceRequiresRepeatedPointInTimeObservation:true,
      aSingleSupportLossCannotBecomePersistentStale:true,
      outcomeInformationForbidden:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
}

export function createInitialAssumptionStability(input={}){
  const core=initialCore(input);
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function verifyAssumptionStability(value){
  try{
    const reasons=[];
    if(value?.version!==FORECAST_ASSUMPTION_STABILITY_VERSION) reasons.push('VERSION_INVALID');
    if(!ASSUMPTION_STABILITY_STATES.includes(String(value?.state))) reasons.push('STATE_INVALID');
    if(!text(value?.assumptionId)) reasons.push('ASSUMPTION_ID_MISSING');
    if(value?.execution!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canInfluencePrimary!==false||value?.canExecuteLive!==false){
      reasons.push('SAFETY_INVARIANT_INVALID');
    }
    const {fingerprint,...core}=value||{};
    const expected=sha256(core);
    if(fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['ASSUMPTION_STABILITY_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

function finalized(core){
  return deepFreeze({...core,fingerprint:sha256(core)});
}

function event(type,prior,next,at,details={}){
  const core={
    version:'TCX_ASSUMPTION_STABILITY_EVENT_V1',
    assumptionId:prior.assumptionId,
    type,
    observedAt:at,
    fromState:prior.state,
    toState:next.state,
    ...clone(details),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return deepFreeze({...core,eventId:sha256(core)});
}

export function observeAssumptionStability(prior,{
  assumption,
  observedAt,
  config={}
}={}){
  const v=verifyAssumptionStability(prior);
  if(!v.ok) throw new Error('assumption stability invalid: '+v.reasons.join(','));
  const cfg=configSnapshot(config);
  const at=finite(observedAt,'observedAt');
  if(prior.lastEvaluatedAt!=null&&at<=Number(prior.lastEvaluatedAt)){
    return deepFreeze({changed:false,stateChanged:false,stability:prior,event:null,reasons:['NON_ADVANCING_OBSERVATION']});
  }
  if(assumption?.currentSupported==null){
    return deepFreeze({changed:false,stateChanged:false,stability:prior,event:null,reasons:['CURRENT_SUPPORT_UNKNOWN']});
  }

  const supported=assumption.currentSupported===true;
  const families=assumptionEvidenceFamilies(assumption);
  const falsifiers=explicitAssumptionFalsifiers(assumption).slice(0,cfg.maxFalsifierCodes);
  const previousFalsifiers=uniq(prior.currentFalsifierCodes);
  const repeatedFalsifiers=falsifiers.filter(x=>previousFalsifiers.includes(x));

  let next={
    ...structuredClone(prior),
    lastEvaluatedAt:at,
    lastCurrentSupported:supported,
    currentEvidenceFamilies:families,
    structurallyIndependentEvidenceFamilyCount:new Set(families).size,
    currentFalsifierCodes:falsifiers,
    repeatedFalsifierCodes:repeatedFalsifiers,
    evaluationCount:Number(prior.evaluationCount||0)+1
  };
  delete next.fingerprint;

  let type=null;
  let details={};

  if(!supported){
    const continuing=prior.lastCurrentSupported===false&&prior.unsupportedSince!=null;
    next.unsupportedSince=continuing?prior.unsupportedSince:at;
    next.unsupportedObservationCount=continuing?Number(prior.unsupportedObservationCount||0)+1:1;
    next.currentUnsupportedDurationMs=Math.max(0,at-Number(next.unsupportedSince));
    next.supportedSince=null;
    next.supportedObservationCount=0;
    next.currentRecoveryDurationMs=0;

    if(prior.state==='PERSISTENT_STALE'){
      next.state='PERSISTENT_STALE';
    }else if(prior.state==='RECOVERING'){
      next.state='PERSISTENT_STALE';
      next.relapseCount=Number(prior.relapseCount||0)+1;
      type='RECOVERY_FAILED';
    }else if(prior.state==='ISSUE_UNSUPPORTED'&&!prior.hasEstablishedSupport){
      next.state='ISSUE_UNSUPPORTED';
    }else{
      const persistentByTime=
        next.unsupportedObservationCount>=cfg.minPersistentObservations&&
        next.currentUnsupportedDurationMs>=cfg.minPersistentDurationMs;
      const persistentByCorroboration=
        next.unsupportedObservationCount>=cfg.minPersistentObservations&&
        next.structurallyIndependentEvidenceFamilyCount>=cfg.minIndependentEvidenceFamilies;
      const persistentByRepeatedFalsifier=
        next.unsupportedObservationCount>=cfg.minPersistentObservations&&
        repeatedFalsifiers.length>0;
      const persistent=persistentByTime||persistentByCorroboration||persistentByRepeatedFalsifier;

      if(persistent){
        next.state='PERSISTENT_STALE';
        next.firstPersistentStaleAt=prior.firstPersistentStaleAt??at;
        next.persistentStaleCount=Number(prior.persistentStaleCount||0)+1;
        type='PERSISTENT_STALE_CONFIRMED';
        details={
          persistentByTime,
          persistentByCorroboration,
          persistentByRepeatedFalsifier,
          unsupportedObservationCount:next.unsupportedObservationCount,
          unsupportedDurationMs:next.currentUnsupportedDurationMs,
          structurallyIndependentEvidenceFamilyCount:next.structurallyIndependentEvidenceFamilyCount,
          repeatedFalsifierCodes:repeatedFalsifiers
        };
      }else{
        next.state='TRANSIENT_FLICKER';
        if(prior.state!=='TRANSIENT_FLICKER'){
          next.firstTransientFlickerAt=prior.firstTransientFlickerAt??at;
          next.transientFlickerCount=Number(prior.transientFlickerCount||0)+1;
          type='TRANSIENT_FLICKER_STARTED';
          details={
            unsupportedObservationCount:next.unsupportedObservationCount,
            unsupportedDurationMs:next.currentUnsupportedDurationMs,
            falsifierCodes:falsifiers
          };
        }
      }
    }
  }else{
    next.unsupportedSince=null;
    next.unsupportedObservationCount=0;
    next.currentUnsupportedDurationMs=0;

    if(prior.state==='PERSISTENT_STALE'||prior.state==='RECOVERING'||prior.state==='ISSUE_UNSUPPORTED'){
      const continuingRecovery=prior.state==='RECOVERING'&&prior.lastCurrentSupported===true&&prior.supportedSince!=null;
      next.supportedSince=continuingRecovery?prior.supportedSince:at;
      next.supportedObservationCount=continuingRecovery?Number(prior.supportedObservationCount||0)+1:1;
      next.currentRecoveryDurationMs=Math.max(0,at-Number(next.supportedSince));
      const recovered=
        next.supportedObservationCount>=cfg.minRecoveryObservations&&
        next.currentRecoveryDurationMs>=cfg.minRecoveryDurationMs;

      if(recovered){
        next.state='SUPPORTED_STABLE';
        next.hasEstablishedSupport=true;
        next.firstRecoveredStableAt=prior.firstRecoveredStableAt??at;
        next.recoveryCount=Number(prior.recoveryCount||0)+1;
        type='PERSISTENT_STALE_RECOVERED';
        details={
          supportedObservationCount:next.supportedObservationCount,
          recoveryDurationMs:next.currentRecoveryDurationMs
        };
      }else{
        next.state='RECOVERING';
        next.firstRecoveryAt=prior.firstRecoveryAt??at;
        if(prior.state!=='RECOVERING'){
          type='RECOVERY_STARTED';
          details={supportedObservationCount:1,recoveryDurationMs:0};
        }
      }
    }else{
      next.supportedSince=null;
      next.supportedObservationCount=0;
      next.currentRecoveryDurationMs=0;
      next.state='SUPPORTED_STABLE';
      next.hasEstablishedSupport=true;
      if(prior.state==='TRANSIENT_FLICKER'){
        type='FLICKER_CLEARED';
        details={
          flickerStartedAt:prior.unsupportedSince,
          flickerDurationMs:prior.unsupportedSince==null?null:Math.max(0,at-Number(prior.unsupportedSince))
        };
      }else if(prior.state==='LEGACY_UNKNOWN'){
        type='LEGACY_STABILITY_BASELINE_ESTABLISHED';
      }
    }
  }

  next.currentFalsifierCodes=supported?[]:falsifiers;
  next.repeatedFalsifierCodes=supported?[]:repeatedFalsifiers;
  const result=finalized(next);
  const stateChanged=prior.state!==result.state;
  const changed=prior.fingerprint!==result.fingerprint;
  return deepFreeze({
    changed,
    stateChanged,
    stability:result,
    event:type?event(type,prior,result,at,details):null,
    reasons:[]
  });
}

export function assumptionStabilitySummary(value){
  const v=verifyAssumptionStability(value);
  return deepFreeze({
    version:FORECAST_ASSUMPTION_STABILITY_VERSION,
    integrity:v.ok?'VALID':'INVALID',
    assumptionId:value?.assumptionId??null,
    state:value?.state??'UNKNOWN',
    unsupportedObservationCount:Number(value?.unsupportedObservationCount||0),
    unsupportedDurationMs:Number(value?.currentUnsupportedDurationMs||0),
    structurallyIndependentEvidenceFamilyCount:Number(value?.structurallyIndependentEvidenceFamilyCount||0),
    currentFalsifierCodes:uniq(value?.currentFalsifierCodes),
    firstTransientFlickerAt:value?.firstTransientFlickerAt??null,
    firstPersistentStaleAt:value?.firstPersistentStaleAt??null,
    firstRecoveredStableAt:value?.firstRecoveredStableAt??null,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  });
}
