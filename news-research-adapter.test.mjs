import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEWS_RESEARCH_ADAPTER_VERSION,
  buildNewsResearchSnapshots,
  filterPreviouslyObservedNewsSnapshots,
  newsEventToResearchSnapshot,
  newsResearchSnapshotKey
} from './news-research-adapter.mjs';
import { createResearchDataGovernanceState, governResearchSnapshot } from './research-data-governance.mjs';

const OBSERVED=Date.parse('2026-09-30T12:00:00Z');
const PUBLISHED=Date.parse('2026-09-30T11:45:00Z');

const official={
  id:'fed:1',
  title:'Federal Reserve issues FOMC statement on interest rates',
  url:'https://www.federalreserve.gov/a',
  sourceId:'FED_PRESS',
  source:'Federal Reserve Board',
  publicationAuthenticity:'DIRECT_OFFICIAL_FEED',
  primarySource:true,
  publishedAt:PUBLISHED,
  availableAt:OBSERVED,
  eventFamily:'MACRO',
  family:'MACRO',
  status:'HIGH_IMPACT',
  verified:false,
  independentConfirmation:0,
  affectedAssets:['USD','RATES'],
  worldRelevant:true,
  epistemic:'OFFICIAL_PRIMARY_SOURCE_PUBLICATION_NOT_INDEPENDENTLY_CORROBORATED'
};

test('official publication becomes provisional non-directional research at observation time',()=>{
  const x=newsEventToResearchSnapshot(official,{symbol:'BTCUSDT',ingestedAt:OBSERVED});
  assert.equal(x.sourceVersion,NEWS_RESEARCH_ADAPTER_VERSION);
  assert.equal(x.domain,'NEWS_EVENT');
  assert.equal(x.source,'FED_PRESS');
  assert.equal(x.eventTime,PUBLISHED);
  assert.equal(x.availableAt,OBSERVED);
  assert.equal(x.ingestedAt,OBSERVED);
  assert.equal(x.finality,'PROVISIONAL');
  assert.equal(x.provenance.primarySource,true);
  assert.equal(x.provenance.directionalClaim,false);
  assert.equal(x.provenance.causalClaim,false);
  assert.equal(x.provenance.canExecuteLive,false);
  assert.equal(x.features.find(f=>f.id==='research.news.primarySource').value,1);
  assert.equal(x.features.find(f=>f.id==='research.news.contentVerified').value,0);
});

test('aggregator event remains distinct from official primary-source provenance',()=>{
  const event={
    ...official,
    id:'gdelt:1',
    sourceId:'GDELT_DOC_API',
    source:'example.test',
    primarySource:false,
    publicationAuthenticity:'',
    eventFamily:'CRYPTO',
    family:'CRYPTO',
    affectedAssets:['BTC']
  };
  const x=newsEventToResearchSnapshot(event,{symbol:'BTCUSDT',ingestedAt:OBSERVED});
  assert.equal(x.features.find(f=>f.id==='research.news.primarySource').value,0);
  assert.equal(x.features.find(f=>f.id==='research.news.sourceClassCode').value,1);
});

test('asset-specific crypto news maps only to relevant configured asset',()=>{
  const event={...official,eventFamily:'CRYPTO',family:'CRYPTO',affectedAssets:['BTC'],sourceId:'GDELT_DOC_API',primarySource:false};
  assert.ok(newsEventToResearchSnapshot(event,{symbol:'BTCUSDT',ingestedAt:OBSERVED}));
  assert.equal(newsEventToResearchSnapshot(event,{symbol:'ETHUSDT',ingestedAt:OBSERVED}),null);
});

test('future and stale publications are rejected instead of backfilled',()=>{
  assert.equal(newsEventToResearchSnapshot({...official,publishedAt:OBSERVED+60_000},{symbol:'BTCUSDT',ingestedAt:OBSERVED}),null);
  assert.equal(newsEventToResearchSnapshot({...official,publishedAt:OBSERVED-25*60*60_000},{symbol:'BTCUSDT',ingestedAt:OBSERVED}),null);
});

test('snapshot source key is stable for repeated observations of same source event',()=>{
  const first=newsEventToResearchSnapshot(official,{symbol:'BTCUSDT',ingestedAt:OBSERVED});
  const second=newsEventToResearchSnapshot(official,{symbol:'BTCUSDT',ingestedAt:OBSERVED+60_000});
  assert.equal(newsResearchSnapshotKey(first),newsResearchSnapshotKey(second));
  assert.equal(first.sourceEventId,second.sourceEventId);
  assert.notEqual(first.availableAt,second.availableAt);
});

test('macro event fans out across configured markets without claiming direction',()=>{
  const rows=buildNewsResearchSnapshots({events:[official]},{symbols:['BTCUSDT','ETHUSDT','SOLUSDT'],ingestedAt:OBSERVED});
  assert.equal(rows.length,3);
  assert.ok(rows.every(x=>x.provenance.directionalClaim===false));
});

test('registered official NEWS_EVENT snapshot passes central source governance research-only',()=>{
  const state=createResearchDataGovernanceState({createdAt:OBSERVED});
  const snapshot=newsEventToResearchSnapshot(official,{symbol:'BTCUSDT',ingestedAt:OBSERVED});
  const governed=governResearchSnapshot(state,snapshot,{evaluatedAt:OBSERVED});
  assert.equal(governed.governance.decision,'ACCEPT');
  assert.equal(governed.governance.usableForResearch,true);
  assert.equal(governed.governance.canExecute,false);
});


test('previously persisted source event is skipped before payload-conflict preflight',()=>{
  const first=newsEventToResearchSnapshot(official,{symbol:'BTCUSDT',ingestedAt:OBSERVED});
  const repeated=newsEventToResearchSnapshot(official,{symbol:'BTCUSDT',ingestedAt:OBSERVED+60_000});
  const plane={sourcePayload:new Map([[newsResearchSnapshotKey(first),'existing-payload-hash']])};
  const filtered=filterPreviouslyObservedNewsSnapshots(plane,[repeated]);
  assert.equal(filtered.previouslyObserved,1);
  assert.deepEqual(filtered.candidates,[]);
});
