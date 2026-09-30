import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBiggjTradeThesis, tradeOverlayFromPosition, renderBiggjThesisText } from './biggj-visual-intelligence.mjs';

const position={
  positionId:'sp_test',issuanceId:'iss_1',forecastFingerprint:'ff_1',symbol:'BTCUSDT',side:'LONG',status:'OPEN',
  openedAt:1_700_000_000_000,horizonMs:60*60_000,horizonId:'1h',setupType:'A',setupScore:.78,entryMode:'STANDARD',admissionGate:'VALID',
  entryPrice:100,stopLossPct:.01,takeProfitPct:.02,directionalProbability:.68,probabilityEdge:.22,expectedReturn:.012,
  entryRegimeConfidence:.74,entryStressRobustnessScore:.81,entryQualityScore:.76,lastMark:{executableExitPrice:101.2},
  execution:'SHADOW_ONLY',canExecuteLive:false
};

test('living thesis stays shadow-only and deterministic',()=>{
  const a=buildBiggjTradeThesis(position,{asOf:position.openedAt+30*60_000});
  const b=buildBiggjTradeThesis(position,{asOf:position.openedAt+30*60_000});
  assert.equal(a.fingerprint,b.fingerprint);assert.equal(a.execution,'SHADOW_ONLY');assert.equal(a.canExecuteLive,false);
  assert.equal(a.hypotheses.length,3);assert.equal(a.knownBeliefs,6);assert.equal(a.evidenceCoverage,1);assert.equal(a.thesisState,'ADMITTED');
  assert.ok(a.thesisHealth>0&&a.thesisHealth<=1);
});

test('trade overlay derives correct long risk levels',()=>{
  const x=tradeOverlayFromPosition(position,{asOf:position.openedAt});assert.equal(x.entryPrice,100);assert.equal(x.stopPrice,99);assert.equal(x.takeProfitPrice,102);assert.equal(x.rewardRisk,2);
});

test('short overlay reverses stop and target correctly',()=>{
  const x=tradeOverlayFromPosition({...position,side:'SHORT'},{asOf:position.openedAt});assert.equal(x.stopPrice,101);assert.equal(x.takeProfitPrice,98);
});

test('missing regime stress and quality reduce evidence coverage and health',()=>{
  const t=buildBiggjTradeThesis({...position,entryRegimeConfidence:null,entryStressRobustnessScore:null,entryQualityScore:null,setupScore:null},{asOf:position.openedAt});
  assert.equal(t.knownBeliefs,3);assert.equal(t.evidenceCoverage,.5);assert.equal(t.thesisState,'INCOMPLETE');
  assert.ok(t.thesisHealth<.5,'missing half the thesis evidence must materially lower health');
});

test('ABSTAIN thesis is research-only and cannot present as healthy admitted trade',()=>{
  const t=buildBiggjTradeThesis({...position,admissionGate:'ABSTAIN',entryRegimeConfidence:null,entryStressRobustnessScore:null,entryQualityScore:null,setupScore:null},{asOf:position.openedAt});
  assert.equal(t.admitted,false);assert.equal(t.thesisState,'RESEARCH_ONLY');assert.ok(t.thesisHealth<.25);
  const admission=t.whyNow.find(x=>x.id==='ADMISSION');assert.equal(admission.state,'ABSTAIN');assert.match(admission.detail,/research observation only/);
});

test('forecast wording distinguishes stored forecast from admission',()=>{
  const t=buildBiggjTradeThesis({...position,admissionGate:'ABSTAIN'},{asOf:position.openedAt});
  const forecast=t.whyNow.find(x=>x.id==='FORECAST');assert.equal(forecast.state,'KNOWN');assert.equal(forecast.detail,'Directional forecast stored');
});

test('thesis text exposes coverage state ghost paths and trade DNA without live-execution claims',()=>{
  const t=buildBiggjTradeThesis(position,{asOf:position.openedAt});const text=renderBiggjThesisText(t);
  assert.match(text,/THESIS STATE/);assert.match(text,/EVIDENCE/);assert.match(text,/GHOST PATHS/);assert.match(text,/TRADE DNA/);assert.match(text,/WHY NOW/);assert.match(text,/REAL ORDERS BLOCKED/);
});
