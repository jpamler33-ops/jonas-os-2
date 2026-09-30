import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBiggjTradeThesis, tradeOverlayFromPosition, renderBiggjThesisText } from './biggj-visual-intelligence.mjs';

const position={
  positionId:'sp_test',
  issuanceId:'iss_1',
  forecastFingerprint:'ff_1',
  symbol:'BTCUSDT',
  side:'LONG',
  status:'OPEN',
  openedAt:1_700_000_000_000,
  horizonMs:60*60_000,
  horizonId:'1h',
  setupType:'A',
  setupScore:.78,
  entryMode:'STANDARD',
  admissionGate:'VALID',
  entryPrice:100,
  stopLossPct:.01,
  takeProfitPct:.02,
  directionalProbability:.68,
  probabilityEdge:.22,
  expectedReturn:.012,
  entryRegimeConfidence:.74,
  entryStressRobustnessScore:.81,
  entryQualityScore:.76,
  lastMark:{executableExitPrice:101.2},
  execution:'SHADOW_ONLY',
  canExecuteLive:false
};

test('living thesis stays shadow-only and deterministic',()=>{
  const a=buildBiggjTradeThesis(position,{asOf:position.openedAt+30*60_000});
  const b=buildBiggjTradeThesis(position,{asOf:position.openedAt+30*60_000});
  assert.equal(a.fingerprint,b.fingerprint);
  assert.equal(a.execution,'SHADOW_ONLY');
  assert.equal(a.canExecuteLive,false);
  assert.equal(a.hypotheses.length,3);
  assert.equal(a.knownBeliefs,6);
  assert.ok(a.thesisHealth>0&&a.thesisHealth<=1);
});

test('trade overlay derives correct long risk levels',()=>{
  const x=tradeOverlayFromPosition(position,{asOf:position.openedAt});
  assert.equal(x.entryPrice,100);
  assert.equal(x.stopPrice,99);
  assert.equal(x.takeProfitPrice,102);
  assert.equal(x.rewardRisk,2);
});

test('short overlay reverses stop and target correctly',()=>{
  const x=tradeOverlayFromPosition({...position,side:'SHORT'},{asOf:position.openedAt});
  assert.equal(x.stopPrice,101);
  assert.equal(x.takeProfitPrice,98);
});

test('thesis text exposes ghost paths and trade DNA without live-execution claims',()=>{
  const t=buildBiggjTradeThesis(position,{asOf:position.openedAt});
  const text=renderBiggjThesisText(t);
  assert.match(text,/GHOST PATHS/);
  assert.match(text,/TRADE DNA/);
  assert.match(text,/WHY NOW/);
  assert.match(text,/REAL ORDERS BLOCKED/);
});


test('coverage probe thesis uses research lane instead of UNKNOWN setup',()=>{
  const t=buildBiggjTradeThesis({...position,setupType:'UNKNOWN',entryMode:'COVERAGE_PROBE',admissionGate:'ABSTAIN'},{asOf:position.openedAt});
  assert.equal(t.setupType,'COVERAGE_PROBE');
  assert.equal(t.entryMode,'COVERAGE_PROBE');
  assert.notEqual(t.setupType,'UNKNOWN');
});

test('primary trade without stored setup is explicit UNCLASSIFIED instead of fabricated setup',()=>{
  const t=buildBiggjTradeThesis({...position,setupType:'UNKNOWN',entryMode:'STANDARD',strategyId:''},{asOf:position.openedAt});
  assert.equal(t.setupType,'PRIMARY_UNCLASSIFIED');
});
