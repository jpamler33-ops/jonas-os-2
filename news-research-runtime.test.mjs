import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { openResearchDataPlane, researchFeaturesAsOf } from './research-data-plane.mjs';
import { createResearchDataGovernanceState } from './research-data-governance.mjs';
import { ingestNewsResearchFeed } from './news-research-runtime.mjs';

const event={id:'gdelt:abc',title:'Fed rate decision moves risk markets',url:'https://example.test/fed',sourceId:'GDELT_DOC_API',availableAt:1000,eventFamily:'MACRO',family:'MACRO',status:'HIGH_IMPACT',verified:false,independentConfirmation:0,affectedAssets:['USD','RATES'],worldRelevant:true};

test('channel news is governed, appended once and exposed point-in-time as research features',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-news-rdp-'));
  const plane=await openResearchDataPlane(path.join(dir,'plane.jsonl'));
  const governanceState=createResearchDataGovernanceState({createdAt:2000});
  const feed={events:[event],world:[event]};
  const first=await ingestNewsResearchFeed({feed,symbols:['BTCUSDT'],plane,governanceState,ingestedAt:2000});
  assert.equal(first.ok,true);
  assert.equal(first.appended,1);
  assert.equal(first.rejected,0);
  assert.equal(plane.countsByDomain.NEWS_EVENT,1);
  const before=researchFeaturesAsOf(plane,{streamKey:'BTCUSDT',asOf:1500,requireGoverned:true});
  assert.equal(before.features.length,0);
  const after=researchFeaturesAsOf(plane,{streamKey:'BTCUSDT',asOf:2000,requireGoverned:true});
  assert.ok(after.features.some(x=>x.id==='research.news.present'));
  assert.ok(after.features.every(x=>x.governanceDecision==='ACCEPT'));
  const second=await ingestNewsResearchFeed({feed,symbols:['BTCUSDT'],plane,governanceState,ingestedAt:3000});
  assert.equal(second.appended,0);
  assert.equal(second.preflightDuplicates,1);
});
