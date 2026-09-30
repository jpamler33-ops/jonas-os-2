import test from 'node:test';
import assert from 'node:assert/strict';
import { newsEventToResearchSnapshot, buildNewsResearchSnapshots } from './news-research-adapter.mjs';
import { createResearchDataGovernanceState, governResearchSnapshot } from './research-data-governance.mjs';

const event={id:'news:1',title:'Fed signals rate change as Bitcoin volatility rises',url:'https://example.test/a',sourceId:'GDELT_DOC_API',availableAt:1000,eventFamily:'MACRO',family:'MACRO',status:'HIGH_IMPACT',verified:false,independentConfirmation:0,affectedAssets:['BTC','USD','RATES'],worldRelevant:true,epistemic:'PUBLIC_NEWS_HEADLINE_NOT_INDEPENDENTLY_VERIFIED'};

test('unverified news becomes provisional research evidence only',()=>{
  const x=newsEventToResearchSnapshot(event,{symbol:'BTCUSDT',ingestedAt:2000});
  assert.equal(x.domain,'NEWS_EVENT');
  assert.equal(x.finality,'PROVISIONAL');
  assert.equal(x.provenance.researchOnly,true);
  assert.equal(x.provenance.productionMutationAllowed,false);
  assert.equal(x.provenance.canExecuteLive,false);
  assert.equal(x.features.find(f=>f.id==='research.news.verified').value,0);
});

test('news availability is observation time, never retroactively publisher time',()=>{
  const x=newsEventToResearchSnapshot(event,{symbol:'BTCUSDT',ingestedAt:5000});
  assert.equal(x.eventTime,1000);
  assert.equal(x.availableAt,5000);
  assert.equal(x.ingestedAt,5000);
  assert.equal(x.provenance.publishedAt,1000);
  assert.equal(x.provenance.observedAt,5000);
});

test('macro/world news can inform every configured market without becoming causal proof',()=>{
  const rows=buildNewsResearchSnapshots({events:[event],world:[event]},{symbols:['BTCUSDT','ETHUSDT'],ingestedAt:2000});
  assert.equal(rows.length,2);
  assert.ok(rows.every(x=>x.provenance.causalClaim===false));
});

test('asset-specific crypto news only maps to relevant asset unless marked broad crypto',()=>{
  const btc={...event,eventFamily:'CRYPTO',family:'CRYPTO',affectedAssets:['BTC'],title:'Bitcoin ETF update'};
  assert.ok(newsEventToResearchSnapshot(btc,{symbol:'BTCUSDT',ingestedAt:2000}));
  assert.equal(newsEventToResearchSnapshot(btc,{symbol:'ETHUSDT',ingestedAt:2000}),null);
});

test('future-published news is rejected for point-in-time safety',()=>{
  assert.equal(newsEventToResearchSnapshot({...event,availableAt:10000},{symbol:'BTCUSDT',ingestedAt:2000}),null);
});

test('registered GDELT news snapshot passes research governance without execution authority',()=>{
  const state=createResearchDataGovernanceState({createdAt:2000});
  const snapshot=newsEventToResearchSnapshot(event,{symbol:'BTCUSDT',ingestedAt:2000});
  const governed=governResearchSnapshot(state,snapshot,{evaluatedAt:2000});
  assert.equal(governed.governance.decision,'ACCEPT');
  assert.equal(governed.governance.usableForResearch,true);
  assert.equal(governed.governance.canExecute,false);
});
