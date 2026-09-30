import {
  createEvidenceRecord,
  appendEvidenceRecord,
  evidenceHistoryFor
} from "./evidence-history.mjs";
import {
  assessResearchValidity,
  formatValidityReason
} from "./state-validity.mjs";

export const RESEARCH_LIFECYCLE_VERSION="TCX_RESEARCH_LIFECYCLE_V1";

export function latestEvidenceSnapshot(records,symbol){
  return evidenceHistoryFor(records,symbol,{limit:1}).at(-1)||null;
}

export function assessEvidenceTransition(previous,currentRecord,{config,now=currentRecord?.capturedAt||Date.now()}={}){
  if(!previous?.stateFingerprint||!currentRecord?.stateFingerprint) return null;
  return assessResearchValidity({
    baseline:previous.stateFingerprint,
    current:currentRecord.stateFingerprint,
    now,
    config
  });
}

export function currentEvidenceLifecycle(records,symbol,context,{config}={}){
  const baseline=latestEvidenceSnapshot(records,symbol);
  const record=createEvidenceRecord(symbol,context,baseline);
  const validity=assessEvidenceTransition(baseline,record,{config,now:record.capturedAt});
  return {baseline,record,validity};
}

export function advanceEvidenceLifecycle(
  records,
  symbol,
  context,
  {
    config,
    dedupeWindowMs=15*60*1000,
    maxPerSymbol=2000
  }={}
){
  const previous=latestEvidenceSnapshot(records,symbol);
  const record=createEvidenceRecord(symbol,context,previous);
  const validity=assessEvidenceTransition(previous,record,{config,now:record.capturedAt});

  let lifecycleChanged=false;
  if(previous&&validity){
    const before=JSON.stringify({
      validityLast:previous.validityLast||null,
      closedAt:previous.closedAt||null
    });
    previous.validityLast=validity;
    if(["DRIFTED","EXPIRED","INVALIDATED"].includes(validity.status)&&!previous.closedAt){
      previous.closedAt=record.capturedAt;
    }
    lifecycleChanged=before!==JSON.stringify({
      validityLast:previous.validityLast||null,
      closedAt:previous.closedAt||null
    });
  }

  const sameResearchState=Boolean(
    previous &&
    previous.stateFingerprint?.hash &&
    record.stateFingerprint?.hash &&
    previous.stateFingerprint.hash===record.stateFingerprint.hash &&
    Number(previous.index)===Number(record.index) &&
    Number(previous.disagreementCount)===Number(record.disagreementCount) &&
    String(previous.gate)===String(record.gate)
  );

  if(
    sameResearchState &&
    record.capturedAt-previous.capturedAt<dedupeWindowMs
  ){
    return {
      records,
      previous,
      record:previous,
      validity,
      changed:lifecycleChanged,
      appended:false,
      lifecycleChanged
    };
  }

  record.transitionFromPrevious=validity;
  const next=appendEvidenceRecord(records,record,{maxPerSymbol});
  return {
    records:next,
    previous,
    record,
    validity,
    changed:true,
    appended:true,
    lifecycleChanged
  };
}

export function compactValidity(validity,{limit=3}={}){
  if(!validity) return {
    status:"BASELINE",
    driftScore:0,
    ageMs:0,
    reasons:[]
  };
  return {
    status:String(validity.status||"UNKNOWN"),
    driftScore:Number(validity.driftScore||0),
    ageMs:Number(validity.ageMs||0),
    reasons:formatValidityReason(validity,{limit})
  };
}
