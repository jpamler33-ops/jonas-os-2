import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchEnvelope, sha256 } from './institutional-kernel.mjs';
import { buildCanonicalForecastInput, verifyCanonicalForecastInput } from './forecast-input-adapter.mjs';
import { buildInstitutionalExpansionEvidence } from './expansion-runtime/institutional-expansion.mjs';

function envelope(extra={}){
  return buildResearchEnvelope({
    symbol:'BTCUSDT',
    availableAt:1000,
    market:{
      source:'TEST',version:'1',timestamp:990,availableAt:995,
      price:65000,bid:64999,ask:65001,spreadBps:.3,imbalance:.2,provenance:'fixture'
    },
    witness:{
      sourceIndependence:'STRICT',independentWitnessSatisfied:true,
      externalWitnessCount:2,agreementScore:.9,distinctVenues:['OKX','KRAKEN'],
      contradictions:[],rejected:[]
    },
    engine:{
      version:'M1',action:'ABSTAIN',execution:'SHADOW_ONLY',
      hypothesis:{candidate:'X',gate:'PASS',causalStatus:'NOT_IDENTIFIED',evidenceStrength:.7},
      audit:{contradictionScore:.1},
      lattice:{novelty:.2,transitionCoherence:.8,support:.75}
    },
    safety:{state:'NORMAL',canResearch:true,hardReasons:[],softReasons:[]},
    config:{x:1},versions:{},dataFabric:{},runtimeRelease:{},
    ...extra
  });
}

test('adapter derives forecast input only from canonical envelope plus PIT extras',()=>{
  const e=envelope();
  const x=buildCanonicalForecastInput({
    envelope:e,dataQuality:.95,regimeId:'RANGE',regimeConfidence:.8,
    extraFeatures:[
      {id:'structure.trend',value:.4,availableAt:999,source:'MASTER_STRUCTURE'},
      {id:'future.hidden',value:9,availableAt:1001,source:'BAD_FUTURE'}
    ]
  });
  assert.equal(x.symbol,'BTCUSDT');
  assert.equal(x.asOf,1000);
  assert.equal(x.features['market.imbalance'],.2);
  assert.equal(x.features['structure.trend'],.4);
  assert.equal('future.hidden' in x.features,false);
  assert.equal(x.audit.blockedFutureExtras,1);
  assert.equal(x.audit.duplicateMarketTruthCreated,false);
  assert.equal(verifyCanonicalForecastInput(x).ok,true);
});

test('tampered envelope is rejected before forecast adaptation',()=>{
  const e=envelope();
  e.inputs.market.price=1;
  assert.throws(()=>buildCanonicalForecastInput({envelope:e,dataQuality:.9}),/integrity/);
});

test('future market knowledge is rejected',()=>{
  const e=envelope();
  const modified=structuredClone(e);
  modified.inputs.market.availableAt=1001;
  modified.inputHash=sha256(modified.inputs);
  const {envelopeHash,...without}=modified;
  modified.envelopeHash=sha256(without);
  assert.throws(()=>buildCanonicalForecastInput({envelope:modified,dataQuality:.9}),/future market knowledge/);
});

test('adapter does not invent missing extras',()=>{
  const x=buildCanonicalForecastInput({
    envelope:envelope(),dataQuality:.9,
    extraFeatures:[{id:'bad',value:'nan',availableAt:999}]
  });
  assert.equal('bad' in x.features,false);
  assert.equal(x.audit.rejectedExtras,1);
});

test('invalid data quality fails closed',()=>{
  assert.throws(()=>buildCanonicalForecastInput({envelope:envelope(),dataQuality:1.2}),/dataQuality/);
});

test('input tampering is detected',()=>{
  const x=buildCanonicalForecastInput({envelope:envelope(),dataQuality:.9});
  const y=structuredClone(x);
  y.features['market.imbalance']=.99;
  assert.equal(verifyCanonicalForecastInput(y).ok,false);
});


test('typed expansion evidence is cryptographically verified before use',()=>{
  const e=envelope();
  const expansion=buildInstitutionalExpansionEvidence({
    asOf:999,
    orderBook:{timestamp:998,availableAt:999,bids:[[64999,10]],asks:[[65001,8]]}
  });
  const x=buildCanonicalForecastInput({envelope:e,dataQuality:.9,expansionEvidence:expansion});
  assert.equal(x.audit.expansionFingerprint,expansion.fingerprint);
  assert.equal(x.audit.rejectedExpansion,0);
  assert.equal(verifyCanonicalForecastInput(x).ok,true);

  const tampered=structuredClone(expansion);
  tampered.liquiditySnapshot={...(tampered.liquiditySnapshot||{}),imbalance:.99};
  const rejected=buildCanonicalForecastInput({envelope:e,dataQuality:.9,expansionEvidence:tampered});
  assert.equal(rejected.audit.rejectedExpansion,1);
  assert.equal(rejected.audit.expansionFingerprint,null);
});

test('future expansion evidence is blocked after integrity verification',()=>{
  const e=envelope();
  const future=buildInstitutionalExpansionEvidence({asOf:1001});
  const x=buildCanonicalForecastInput({envelope:e,dataQuality:.9,expansionEvidence:future});
  assert.equal(x.audit.blockedFutureExpansion,1);
  assert.equal(x.audit.expansionFingerprint,null);
});
