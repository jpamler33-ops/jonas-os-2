import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTradeDiscoveryDiagnostics,
  recordTradeDiscoveryScan,
  summarizeTradeDiscovery,
  renderTradeDiscoveryDiagnostics,
  countOpenDiscoveryPositions,
  isMandatoryDiscoveryFallbackReasonAllowed
} from './trade-discovery-diagnostics.mjs';

test('discovery diagnostics summarize gates and explain the cold calibration path',()=>{
  const state=createTradeDiscoveryDiagnostics();
  recordTradeDiscoveryScan(state,{
    symbol:'BTCUSDT',scannedAt:1000,forecastAvailable:true,forecastGate:'ABSTAIN',
    admissionGate:'ABSTAIN',probabilityDisplayAllowed:false,dataSafety:'NORMAL',
    autoShadowTradeReason:'ADMISSION_ABSTAIN',autoShadowTradeEligible:false,
    mandatoryDiscoveryReason:'DISCOVERY_RESPECTS_STANDARD_BLOCK_ADMISSION_ABSTAIN',
    mandatoryDiscoveryEligible:false,mandatoryDiscoveryPlaced:false,
    researchDependencyGate:'ABSTAIN',
    coverageCurriculumPlaced:2,horizons:[
      {horizonId:'5m',gate:'ABSTAIN',calibration:'INSUFFICIENT',expectedReturnPass:false,directionProbabilityPass:false,probabilityEdgePass:false,reasons:['probability calibration history is insufficient']}
    ]
  });
  const summary=summarizeTradeDiscovery(state,{now:2000,runtime:{academyStage:'BOOTCAMP',academyCoreAllowed:true,academyMemeAllowed:false,trainingHold:false,trainingMission:'DISCOVERY'}});
  assert.equal(summary.checkedCoins,1);
  assert.equal(summary.abstainForecasts,1);
  assert.equal(summary.totalCalibratedHorizons,0);
  assert.equal(summary.coverageProbes,2);
  assert.ok(summary.topBlockers.some(x=>x.reason==='ADMISSION_ABSTAIN'));
  assert.match(summary.nextStep,/calibrated horizon/i);
  const rendered=renderTradeDiscoveryDiagnostics(summary);
  assert.match(rendered,/Datensicherheit NORMAL: 1\/1/);
  assert.match(rendered,/probability calibration history is insufficient/);
  assert.match(rendered,/RESEARCH_DEPENDENCY_ABSTAIN|Forschungsdaten blockiert/i);
  assert.match(rendered,/Academy: BOOTCAMP · Core freigegeben/);
  assert.match(rendered,/Training Supervisor: freigegeben · Mission DISCOVERY/);
});

test('coverage probes do not consume the mandatory discovery open-position cap',()=>{
  assert.equal(countOpenDiscoveryPositions([
    {status:'OPEN',entryMode:'COVERAGE_PROBE'},
    {status:'OPEN',entryMode:'EXPLORATION'},
    {status:'OPEN',entryMode:'ABSTAIN_PROBE'},
    {status:'CLOSED',entryMode:'EXPLORATION'}
  ]),2);
});

test('mandatory discovery fallback only accepts near-miss signal gates',()=>{
  assert.equal(isMandatoryDiscoveryFallbackReasonAllowed('EXPECTED_RETURN_TOO_SMALL'),true);
  assert.equal(isMandatoryDiscoveryFallbackReasonAllowed('ADMISSION_ABSTAIN'),false);
  assert.equal(isMandatoryDiscoveryFallbackReasonAllowed('NO_ADMITTED_DIRECTIONAL_HORIZON'),false);
});
