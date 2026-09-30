import { appendAuditRecord, findAuditRecordIdentity, sha256 } from './institutional-kernel.mjs';
import { verifyInstitutionalForecastIssuance } from './institutional-forecast-issuance.mjs';
import { verifyResearchTrace, verifyResearchTraceEvaluation } from './research-trace.mjs';

export const INSTITUTIONAL_AUDIT_BINDING_VERSION='TCX_INSTITUTIONAL_AUDIT_BINDING_V1';

function existing(ledger,kind,idField,id){
  return findAuditRecordIdentity(ledger,{kind,idField,id});
}

export async function appendInstitutionalForecastIssuanceAudit(
  ledger,
  issuance,
  {occurredAt=issuance?.generatedAt??Date.now()}={}
){
  const v=verifyInstitutionalForecastIssuance(issuance);
  if(!v.ok) throw new Error('invalid institutional issuance: '+v.reasons.join(','));
  if(!ledger?.healthy) throw new Error('Audit ledger unhealthy: fail closed');

  const prior=existing(ledger,'TCX_INSTITUTIONAL_FORECAST_ISSUED','issuanceId',issuance.issuanceId);
  if(prior) return {record:prior,duplicate:true};

  const payload={
    version:INSTITUTIONAL_AUDIT_BINDING_VERSION,
    issuanceId:issuance.issuanceId,
    traceId:issuance.traceId,
    forecastFingerprint:issuance.forecastFingerprint,
    scienceFingerprint:issuance.scienceFingerprint,
    admissionFingerprint:issuance.admissionFingerprint,
    symbol:issuance.symbol,
    asOf:issuance.asOf,
    generatedAt:issuance.generatedAt,
    gate:issuance.gate,
    researchDisposition:issuance.researchDisposition,
    probabilityDisplayAllowed:issuance.probabilityDisplayAllowed,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };

  const record=await appendAuditRecord(ledger,{
    kind:'TCX_INSTITUTIONAL_FORECAST_ISSUED',
    payload,
    occurredAt
  });
  return {record,duplicate:false};
}

export async function appendResearchTraceEvaluationAudit(
  ledger,
  trace,
  evaluation,
  {occurredAt=evaluation?.observedAt??Date.now()}={}
){
  const tv=verifyResearchTrace(trace);
  if(!tv.ok) throw new Error('invalid research trace');
  const ev=verifyResearchTraceEvaluation(evaluation,trace);
  if(!ev.ok) throw new Error('invalid research trace evaluation');
  if(!ledger?.healthy) throw new Error('Audit ledger unhealthy: fail closed');

  const prior=existing(ledger,'TCX_RESEARCH_TRACE_EVALUATED','evaluationId',evaluation.evaluationId);
  if(prior) return {record:prior,duplicate:true};

  const payload={
    version:INSTITUTIONAL_AUDIT_BINDING_VERSION,
    traceId:trace.traceId,
    evaluationId:evaluation.evaluationId,
    evaluationHash:sha256(evaluation),
    symbol:evaluation.symbol,
    horizonId:evaluation.horizonId,
    maturedAt:evaluation.maturedAt,
    observedAt:evaluation.observedAt,
    outcome:evaluation.outcome,
    metrics:evaluation.metrics,
    provenance:evaluation.provenance,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };

  const record=await appendAuditRecord(ledger,{
    kind:'TCX_RESEARCH_TRACE_EVALUATED',
    payload,
    occurredAt
  });
  return {record,duplicate:false};
}
