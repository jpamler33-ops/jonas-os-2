import { sha256 } from '../institutional-kernel.mjs';

export const TRADER_WALLET_INTELLIGENCE_VERSION='TCX_TRADER_WALLET_INTELLIGENCE_V1';

const GATES=new Set(['PASS','CAUTION','INSUFFICIENT','ABSTAIN']);
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function clamp01(v){const n=finite(v);return n==null?null:Math.max(0,Math.min(1,n));}
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))deepFreeze(x);}return v;}
function gate(v){const x=String(v||'INSUFFICIENT').toUpperCase();return GATES.has(x)?x:'INSUFFICIENT';}

/**
 * Converts already-observed public wallet/trader records into read-only evidence.
 * This module does not fetch private data, identify natural persons, predict PnL,
 * or create a trading permission.
 */
export function buildTraderWalletEvidence({
  asOf,
  entityId,
  observations=[],
  resolution={},
  selection={},
  costs={}
}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  const id=String(entityId||'').trim();
  if(!id) throw new Error('entityId required');

  const eligible=[];
  let futureRejected=0, invalidRejected=0;
  for(const raw of Array.isArray(observations)?observations:[]){
    const availableAt=finite(raw?.availableAt);
    const returnPct=finite(raw?.returnPct);
    if(availableAt==null||returnPct==null){invalidRejected++;continue;}
    if(availableAt>t){futureRejected++;continue;}
    eligible.push({
      availableAt,
      returnPct,
      notional:Math.max(0,finite(raw?.notional)??0),
      holdingMs:Math.max(0,finite(raw?.holdingMs)??0),
      source:String(raw?.source||'PUBLIC_OBSERVATION'),
      observationId:String(raw?.observationId||sha256({entityId:id,availableAt,returnPct,source:raw?.source||''})).slice(0,64)
    });
  }
  eligible.sort((a,b)=>a.availableAt-b.availableAt);

  const feeBps=Math.max(0,finite(costs?.feeBps)??0);
  const slippageBps=Math.max(0,finite(costs?.slippageBps)??0);
  const costPct=(feeBps+slippageBps)/10000;
  const net=eligible.map(x=>x.returnPct-costPct);
  const wins=net.filter(x=>x>0).length;
  const meanNet=net.length?net.reduce((a,b)=>a+b,0)/net.length:null;
  const hitRate=net.length?wins/net.length:null;

  const resolutionConfidence=clamp01(resolution?.confidence);
  const survivorshipControlled=selection?.survivorshipControlled===true;
  const selectionWindowLocked=selection?.windowLocked===true;
  const inclusionRuleLocked=selection?.inclusionRuleLocked===true;
  const sampleSufficient=eligible.length>=Math.max(10,Number(selection?.minSamples||20));
  const identitySufficient=resolutionConfidence!=null&&resolutionConfidence>=0.8;

  const reasons=[];
  if(!identitySufficient) reasons.push('ENTITY_RESOLUTION_INSUFFICIENT');
  if(!survivorshipControlled) reasons.push('SURVIVORSHIP_BIAS_UNCONTROLLED');
  if(!selectionWindowLocked) reasons.push('SELECTION_WINDOW_NOT_LOCKED');
  if(!inclusionRuleLocked) reasons.push('INCLUSION_RULE_NOT_LOCKED');
  if(!sampleSufficient) reasons.push('SAMPLE_INSUFFICIENT');
  if(futureRejected) reasons.push('FUTURE_OBSERVATIONS_REJECTED');

  let evidenceGate='PASS';
  if(!identitySufficient||!survivorshipControlled||!selectionWindowLocked||!inclusionRuleLocked) evidenceGate='ABSTAIN';
  else if(!sampleSufficient) evidenceGate='INSUFFICIENT';
  else if(futureRejected||invalidRejected) evidenceGate='CAUTION';

  const core={
    version:TRADER_WALLET_INTELLIGENCE_VERSION,
    asOf:t,
    entityId:id,
    evidenceGate:gate(evidenceGate),
    reasons,
    entityResolution:{
      confidence:resolutionConfidence,
      method:String(resolution?.method||'UNSPECIFIED'),
      naturalPersonIdentified:false
    },
    selectionControls:{
      survivorshipControlled,
      windowLocked:selectionWindowLocked,
      inclusionRuleLocked,
      cohortId:String(selection?.cohortId||'UNSPECIFIED')
    },
    performance:{
      sampleSize:eligible.length,
      meanNetReturn:meanNet,
      hitRate,
      feeBps,
      slippageBps,
      objective:'HISTORICAL_OBSERVATION_NOT_PNL_FORECAST'
    },
    audit:{futureRejected,invalidRejected,lastAvailableAt:eligible.at(-1)?.availableAt??null},
    lineage:eligible.map(x=>({observationId:x.observationId,availableAt:x.availableAt,source:x.source})),
    epistemic:{
      classification:'EMPIRICAL_POST_OUTCOME_EVIDENCE',
      causality:'NOT_IDENTIFIED',
      probability:'NOT_FORECAST_PROBABILITY'
    },
    restrictions:{
      mayExecute:false,
      mayRouteStrategy:false,
      mayMutateForecast:false,
      mayBypassInstitutionalAdmission:false,
      mayIdentifyNaturalPerson:false
    },
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function verifyTraderWalletEvidence(value){
  try{
    if(value?.version!==TRADER_WALLET_INTELLIGENCE_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    const reasons=[];
    if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false) reasons.push('EXECUTION_INVARIANT_INVALID');
    if(value?.restrictions?.mayBypassInstitutionalAdmission!==false) reasons.push('ADMISSION_BYPASS_INVALID');
    if(value?.restrictions?.mayIdentifyNaturalPerson!==false) reasons.push('IDENTITY_BOUNDARY_INVALID');
    const {fingerprint,...core}=value||{};
    const expected=sha256(core);
    if(fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['TRADER_WALLET_EVIDENCE_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
