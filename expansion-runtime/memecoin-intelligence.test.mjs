import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemecoinEvidence, verifyMemecoinEvidence } from './memecoin-intelligence.mjs';

test('memecoin evidence reports observed risks without inventing rug probability',()=>{
  const x=buildMemecoinEvidence({
    asOf:1000,token:'mint1',chain:'SOLANA',
    observations:[{availableAt:900,kind:'SWAP',source:'PUBLIC_CHAIN'},{availableAt:1100,kind:'FUTURE'}],
    tokenState:{mintAuthorityActive:true,freezeAuthorityActive:false,transferRestrictions:false},
    holderState:{top10Share:.72,largestHolderShare:.30},
    liquidityState:{liquidityUsd:20000,lockedShare:.4,change1h:-.3},
    flowState:{uniqueBuyers1h:20,uniqueSellers1h:10}
  });
  assert.equal(x.evidenceGate,'ABSTAIN');
  assert.ok(x.tokenRisk.riskFlags.includes('MINT_AUTHORITY_ACTIVE'));
  assert.ok(x.reasons.includes('FUTURE_OBSERVATIONS_REJECTED'));
  assert.equal(x.epistemic.risk,'OBSERVED_RISK_FLAGS_NOT_RUG_PROBABILITY');
  assert.equal(x.canExecute,false);
  assert.equal(verifyMemecoinEvidence(x).ok,true);
});

test('missing core evidence fails to insufficient rather than pretending confidence',()=>{
  const x=buildMemecoinEvidence({asOf:1000,token:'mint1',chain:'SOLANA'});
  assert.equal(x.evidenceGate,'INSUFFICIENT');
  assert.equal(x.earlyActivity.classification,'DESCRIPTIVE_ACTIVITY_NOT_MOMENTUM_PROBABILITY');
});

test('fingerprint catches post-hoc mutation',()=>{
  const x=buildMemecoinEvidence({
    asOf:1000,token:'mint1',chain:'SOLANA',
    observations:[{availableAt:900,kind:'SWAP'}],
    holderState:{top10Share:.2,largestHolderShare:.1},
    liquidityState:{liquidityUsd:100000,lockedShare:.9,change1h:.1}
  });
  const y=structuredClone(x); y.holders.top10Share=.99;
  assert.equal(verifyMemecoinEvidence(y).ok,false);
});
