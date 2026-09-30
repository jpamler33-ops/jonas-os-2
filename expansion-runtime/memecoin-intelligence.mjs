import { sha256 } from '../institutional-kernel.mjs';

export const MEMECOIN_INTELLIGENCE_VERSION='TCX_MEMECOIN_INTELLIGENCE_V1';
const GATES=new Set(['PASS','CAUTION','INSUFFICIENT','ABSTAIN']);
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function clamp01(v){const n=finite(v);return n==null?null:Math.max(0,Math.min(1,n));}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;}
function gate(v){const x=String(v||'INSUFFICIENT').toUpperCase();return GATES.has(x)?x:'INSUFFICIENT';}

/**
 * Descriptive token-risk and early-activity evidence only.
 * No rug-pull probability, no price probability and no execution permission.
 */
export function buildMemecoinEvidence({
  asOf,
  token,
  chain,
  observations=[],
  tokenState={},
  holderState={},
  liquidityState={},
  flowState={}
}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  const tokenId=String(token||'').trim();
  const chainId=String(chain||'').trim().toUpperCase();
  if(!tokenId||!chainId) throw new Error('token and chain required');

  let futureRejected=0,invalidRejected=0;
  const rows=[];
  for(const r of Array.isArray(observations)?observations:[]){
    const availableAt=finite(r?.availableAt);
    if(availableAt==null){invalidRejected++;continue;}
    if(availableAt>t){futureRejected++;continue;}
    rows.push({availableAt,kind:String(r?.kind||'UNKNOWN'),source:String(r?.source||'PUBLIC_CHAIN'),
      observationId:String(r?.observationId||sha256({token:tokenId,chain:chainId,availableAt,kind:r?.kind||'',source:r?.source||''})).slice(0,64)});
  }

  const top10Share=clamp01(holderState?.top10Share);
  const largestHolderShare=clamp01(holderState?.largestHolderShare);
  const lpLockedShare=clamp01(liquidityState?.lockedShare);
  const liquidityUsd=Math.max(0,finite(liquidityState?.liquidityUsd)??0);
  const liquidityChange1h=finite(liquidityState?.change1h);
  const uniqueBuyers1h=Math.max(0,Math.floor(finite(flowState?.uniqueBuyers1h)??0));
  const uniqueSellers1h=Math.max(0,Math.floor(finite(flowState?.uniqueSellers1h)??0));
  const buySellRatio=uniqueSellers1h>0?uniqueBuyers1h/uniqueSellers1h:(uniqueBuyers1h>0?uniqueBuyers1h:null);

  const riskFlags=[];
  if(tokenState?.mintAuthorityActive===true) riskFlags.push('MINT_AUTHORITY_ACTIVE');
  if(tokenState?.freezeAuthorityActive===true) riskFlags.push('FREEZE_AUTHORITY_ACTIVE');
  if(tokenState?.transferRestrictions===true) riskFlags.push('TRANSFER_RESTRICTIONS_PRESENT');
  if(top10Share!=null&&top10Share>.60) riskFlags.push('HOLDER_CONCENTRATION_HIGH');
  if(largestHolderShare!=null&&largestHolderShare>.25) riskFlags.push('SINGLE_HOLDER_CONCENTRATION_HIGH');
  if(lpLockedShare!=null&&lpLockedShare<.50) riskFlags.push('LP_LOCK_COVERAGE_LOW');
  if(liquidityUsd>0&&liquidityUsd<25000) riskFlags.push('LIQUIDITY_THIN');
  if(liquidityChange1h!=null&&liquidityChange1h<-.25) riskFlags.push('LIQUIDITY_DRAIN_OBSERVED');

  const missing=[];
  if(top10Share==null) missing.push('HOLDER_CONCENTRATION');
  if(liquidityUsd<=0) missing.push('LIQUIDITY');
  if(lpLockedShare==null) missing.push('LP_LOCK_STATE');
  if(rows.length===0) missing.push('OBSERVATION_LINEAGE');

  let evidenceGate='PASS';
  if(missing.length>=3) evidenceGate='INSUFFICIENT';
  else if(riskFlags.includes('MINT_AUTHORITY_ACTIVE')||riskFlags.includes('FREEZE_AUTHORITY_ACTIVE')||
    riskFlags.includes('TRANSFER_RESTRICTIONS_PRESENT')||riskFlags.includes('LIQUIDITY_DRAIN_OBSERVED')) evidenceGate='ABSTAIN';
  else if(riskFlags.length||futureRejected||invalidRejected||missing.length) evidenceGate='CAUTION';

  const earlyActivity={
    uniqueBuyers1h,uniqueSellers1h,buySellRatio,
    liquidityChange1h,
    classification:'DESCRIPTIVE_ACTIVITY_NOT_MOMENTUM_PROBABILITY'
  };

  const core={
    version:MEMECOIN_INTELLIGENCE_VERSION,asOf:t,token:tokenId,chain:chainId,
    evidenceGate:gate(evidenceGate),
    reasons:[...riskFlags,...missing.map(x=>'MISSING_'+x),...(futureRejected?['FUTURE_OBSERVATIONS_REJECTED']:[])],
    tokenRisk:{riskFlags,mintAuthorityActive:tokenState?.mintAuthorityActive??null,
      freezeAuthorityActive:tokenState?.freezeAuthorityActive??null,transferRestrictions:tokenState?.transferRestrictions??null},
    holders:{top10Share,largestHolderShare},
    liquidity:{liquidityUsd,lockedShare:lpLockedShare,change1h:liquidityChange1h},
    earlyActivity,
    audit:{futureRejected,invalidRejected,observationCount:rows.length,lastAvailableAt:rows.at(-1)?.availableAt??null},
    lineage:rows,
    epistemic:{risk:'OBSERVED_RISK_FLAGS_NOT_RUG_PROBABILITY',activity:'DESCRIPTIVE_NOT_CAUSAL',forecast:'NOT_PRICE_PROBABILITY'},
    restrictions:{mayExecute:false,mayRouteStrategy:false,mayMutateForecast:false,mayBypassInstitutionalAdmission:false},
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function verifyMemecoinEvidence(value){
  try{
    if(value?.version!==MEMECOIN_INTELLIGENCE_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    const reasons=[];
    if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false) reasons.push('EXECUTION_INVARIANT_INVALID');
    if(value?.restrictions?.mayBypassInstitutionalAdmission!==false) reasons.push('ADMISSION_BYPASS_INVALID');
    const {fingerprint,...core}=value||{};
    const expected=sha256(core);
    if(fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){return {ok:false,reasons:['MEMECOIN_EVIDENCE_INVALID',err instanceof Error?err.message:String(err)]};}
}
