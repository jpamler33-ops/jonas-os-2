import { sha256 } from './institutional-kernel.mjs';
import { evaluateEvidencePromotionGate } from './evidence-promotion-gate.mjs';
import { buildLeverageCounterfactualLab } from './leverage-counterfactual-lab.mjs';
import { buildRegimeStrategyMatrix } from './shadow-regime-brain.mjs';
import { evaluateTailRiskBootstrap } from './tail-risk-bootstrap.mjs';
import { auditTcxEvidence } from './independent-proof-auditor.mjs';
import { evaluateRollingWalkForward } from './rolling-walk-forward.mjs';

export const TCX_PROOF_SYSTEM_VERSION='TCX_PROOF_SYSTEM_V3';
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};

export function buildTcxProofReport(ledger){
 const evidence=evaluateEvidencePromotionGate(ledger);
 const leverage=buildLeverageCounterfactualLab(ledger);
 const regimes=buildRegimeStrategyMatrix(ledger);
 const tailRisk=evaluateTailRiskBootstrap(ledger);
 const audit=auditTcxEvidence(ledger);
 const walkForward=evaluateRollingWalkForward(ledger,{requireFrozenPolicy:true});
 const regimeKeys=new Set((regimes.cells||[]).map(x=>x.regimeKey));
 const matureRegimeCells=(regimes.cells||[]).filter(x=>x.n>=12);
 const positiveMature=matureRegimeCells.filter(x=>x.status==='FAVORED'||(x.status==='NEUTRAL'&&finite(x.shrinkedMeanReturn)>0));
 const checks={
   sampleSize:Boolean(evidence.checks.sampleSize),
   forwardSample:Boolean(evidence.checks.forwardSample),
   positiveExpectancy:Boolean(evidence.checks.netExpectancy),
   profitFactor:Boolean(evidence.checks.profitFactor),
   drawdown:Boolean(evidence.checks.drawdown),
   forwardExpectancy:Boolean(evidence.checks.forwardExpectancy),
   forwardProfitFactor:Boolean(evidence.checks.forwardProfitFactor),
   forwardConsistency:Boolean(evidence.checks.forwardWindows),
   leverageEvidence:Boolean(leverage.evidenceReady),
   regimeBreadth:regimeKeys.size>=3,
   regimeMaturity:matureRegimeCells.length>=3&&positiveMature.length>=2,
   tailRiskSurvival:Boolean(tailRisk.passed),
   independentAudit:Boolean(audit.passed),
   rollingWalkForward:Boolean(walkForward.passed),
   frozenPolicyOos:walkForward.validationMode==='VERIFIED_POST_FREEZE_OOS'&&Boolean(walkForward.checks?.verifiedPostFreezeOos)
 };
 const passed=Object.values(checks).filter(Boolean).length,total=Object.keys(checks).length;
 let status='UNPROVEN';
 if(evidence.passed&&tailRisk.passed&&audit.passed&&walkForward.passed&&checks.frozenPolicyOos&&passed>=13&&checks.regimeBreadth&&checks.regimeMaturity) status='ROBUST';
 else if(passed>=5&&finite(evidence.all.trades)>=100) status='EMERGING';
 const core={version:TCX_PROOF_SYSTEM_VERSION,asOf:Date.now(),status,passedChecks:passed,totalChecks:total,checks,
   evidence:{trades:evidence.all.trades,forwardTrades:evidence.forward.trades,expectancyQuote:evidence.all.expectancyQuote,
     profitFactor:evidence.all.profitFactor,maxDrawdownPct:evidence.all.maxDrawdownPct,
     forwardExpectancyQuote:evidence.forward.expectancyQuote,forwardProfitFactor:evidence.forward.profitFactor},
   leverage:{samples:leverage.samples,evidenceReady:leverage.evidenceReady,suggestedShadowLeverage:leverage.suggestedShadowLeverage},
   regimes:{samples:regimes.samples,distinct:regimeKeys.size,matureCells:matureRegimeCells.length,positiveMatureCells:positiveMature.length},
   tailRisk:{samples:tailRisk.samples,paths:tailRisk.paths,passed:tailRisk.passed,p95DrawdownPct:tailRisk.p95DrawdownPct,p99DrawdownPct:tailRisk.p99DrawdownPct,floorBreachRate:tailRisk.floorBreachRate,medianEndingEquity:tailRisk.medianEndingEquity,p05EndingEquity:tailRisk.p05EndingEquity},
   audit:{passed:audit.passed,findings:audit.findings,critical:audit.critical,warnings:audit.warnings,metrics:audit.metrics},
   walkForward:{passed:walkForward.passed,replayPassed:walkForward.replayPassed,validationMode:walkForward.validationMode,verifiedOosWindows:walkForward.verifiedOosWindows,oosCohorts:walkForward.oosCohorts,samples:walkForward.samples,windows:walkForward.windows.length,positiveWindows:walkForward.positiveWindows,positiveWindowRate:walkForward.positiveWindowRate,checks:walkForward.checks},
   execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,
   meaning:'EVIDENCE_STATUS_ONLY_NOT_PROFITABILITY_GUARANTEE_OR_LIVE_AUTHORIZATION'};
 return freeze({...core,fingerprint:sha256(core)});
}
