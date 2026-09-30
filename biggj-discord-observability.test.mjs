
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBiggjLivingResearchRuntime } from './biggj-living-research-runtime.mjs';
import {
  BIGGJ_DISCORD_OBSERVABILITY_LAYOUT,
  buildBiggjDiscordObservabilityPanelMap,
  buildBiggjDiscordObservabilityPayload,
  buildBiggjDiscordObservabilitySnapshot
} from './biggj-discord-observability.mjs';

function assertDiscordPayload(payload){
  assert.ok(Array.isArray(payload.embeds));
  assert.ok(payload.embeds.length>=1);
  for(const embed of payload.embeds){
    assert.ok(String(embed.title||'').length<=256);
    assert.ok(String(embed.description||'').length<=4096);
    assert.ok((embed.fields||[]).length<=25);
    for(const field of embed.fields||[]){
      assert.ok(String(field.name||'').length<=256);
      assert.ok(String(field.value||'').length<=1024);
    }
    assert.ok(String(embed.footer?.text||'').length<=2048);
    const aggregate=String(embed.title||'').length+String(embed.description||'').length+String(embed.footer?.text||'').length+(embed.fields||[]).reduce((n,x)=>n+String(x.name||'').length+String(x.value||'').length,0);
    assert.ok(aggregate<=6000);
  }
  assert.ok((payload.components||[]).length<=5);
  for(const row of payload.components||[])assert.ok((row.components||[]).length<=5);
}

test('BIGGJ observability stays research-only and exposes the complete operator layout',()=>{
  const state=createBiggjLivingResearchRuntime({asOf:1_800_000_000_000});
  const snapshot=buildBiggjDiscordObservabilitySnapshot({
    livingResearchState:state,
    claimAssumptionResearch:{state:'NOT_EVALUATED',observations:0},
    researchCoverage:{averageCoverage:.75,healthy:3,blocked:1,blockedFeatures:2},
    discovery:{checkedCoins:12},
    asOf:1_800_000_000_000
  });

  assert.equal(snapshot.execution,'SHADOW_ONLY');
  assert.equal(snapshot.action,'ABSTAIN');
  assert.equal(snapshot.canExecuteLive,false);
  assert.equal(snapshot.canInfluencePrimary,false);
  assert.equal(snapshot.primaryMutationAllowed,false);
  assert.equal(snapshot.automaticPromotion,false);
  assert.equal(snapshot.automaticExperimentLaunch,false);
  assert.equal(snapshot.semantics.visibleReasoningIsStructuredStateNotHiddenChainOfThought,true);

  const channels=BIGGJ_DISCORD_OBSERVABILITY_LAYOUT.flatMap(section=>section.channels.map(x=>x.name));
  assert.deepEqual(channels,[
    'brain-pulse','knowledge','research-queue','hypotheses','changes',
    'experiments','skill-tree','progress','evidence-ledger','decision-trace'
  ]);

  const panels=buildBiggjDiscordObservabilityPanelMap(snapshot);
  assert.equal(panels.length,10);
  assert.deepEqual(panels.map(x=>x.channel),channels);
  for(const panel of panels)assertDiscordPayload(panel.payload);
});

test('every BIGGJ operator view remains within Discord embed/component limits',()=>{
  const state=createBiggjLivingResearchRuntime({asOf:1_800_000_000_000});
  const snapshot=buildBiggjDiscordObservabilitySnapshot({livingResearchState:state,asOf:1_800_000_000_000});
  for(const view of ['pulse','knowledge','research','hypotheses','changes','experiments','skills','progress','evidence','decisions']){
    const payload=buildBiggjDiscordObservabilityPayload(view,snapshot);
    assertDiscordPayload(payload);
    assert.match(payload.embeds[0].footer.text,/structured state, not hidden chain-of-thought/);
  }
});

test('observability timestamp is tied to research state so unchanged state can be deduplicated',()=>{
  const state=createBiggjLivingResearchRuntime({asOf:1_800_000_000_000});
  const a=buildBiggjDiscordObservabilitySnapshot({livingResearchState:state,asOf:1_800_000_123_456});
  const b=buildBiggjDiscordObservabilitySnapshot({livingResearchState:state,asOf:1_800_000_999_999});
  assert.equal(a.generatedAt,state.updatedAt);
  assert.equal(b.generatedAt,state.updatedAt);
  assert.deepEqual(
    buildBiggjDiscordObservabilityPanelMap(a).map(x=>x.payload),
    buildBiggjDiscordObservabilityPanelMap(b).map(x=>x.payload)
  );
});
