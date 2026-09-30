import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { missionControlSnapshot, renderMissionControlHtml, MISSION_CONTROL_VERSION } from './mission-control.mjs';

test('market science mission control remains explicitly shadow only',()=>{
  const s=missionControlSnapshot({health:{ok:true}});
  assert.equal(MISSION_CONTROL_VERSION,'BIGGJ_MARKET_SCIENCE_CONTROL_V1');
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.execution,'SHADOW_ONLY');
  const html=renderMissionControlHtml(s);
  assert.match(html,/SHADOW_ONLY/);
  assert.match(html,/BIGGJ/);
});

test('embedded state cannot inject a script tag',()=>{
  const html=renderMissionControlHtml(missionControlSnapshot({health:{x:'<script>'}}));
  assert.ok(!html.includes('"x":"<script>"'));
  assert.match(html,/"x":"\\u003cscript>"/);
});

test('mobile control plane exposes science world lab decisions trading and system tabs',()=>{
  const s=missionControlSnapshot({
    health:{
      autonomousOperator:{mode:'HANDS_OFF',operatorNeeded:false,automationCoverage:1},
      autonomousResearchFactory:{mode:'DATA_COLLECTION_ONLY'},
      biggjLivingResearch:{researchRequired:2,activeAgendaItems:3,topResearchBottlenecks:[],researchProtocols:{total:1},researchReviews:{open:0}},
      researchCoverage:{averageCoverage:.75,blocked:0},
      biggjObservability:{
        maturityIndex:.6,
        trustedSkills:2,
        knowledge:[{skillId:'s1',title:'Structure',status:'VALIDATED',uncertainty:.2}],
        researchQueue:[{skillId:'s2',title:'Liquidity',nextGate:'FORWARD_SHADOW',priority:.7,uncertainty:.4}],
        learningTimeline:{events:[]}
      },
      experienceNeeds:[{priority:2,label:'Mehr Live Data',detail:'coverage gap'}],
      globalIntel:{eventCount:0,recent:[]},
      traderWatch:{sourceReady:false,nextNeed:'PIT public performance source'}
    },
    portfolio:{equityQuote:1000,openPositions:0,closedTrades:0,netPnlQuote:0,positions:[],recentClosed:[]}
  });
  const html=renderMissionControlHtml(s);
  for(const x of ['data-tab="science"','data-tab="world"','data-tab="lab"','data-tab="decisions"','data-tab="trading"','data-tab="system"','Knowledge Frontier','Epistemic Firewall']){
    assert.match(html,new RegExp(x));
  }
  assert.match(html,/app\.webmanifest/);
  assert.match(html,/serviceWorker/);
  assert.match(html,/SHADOW_ONLY/);
});

test('mission snapshot feeds only primary positions into primary Discord trade streams',()=>{
  const source=readFileSync(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("const researchShadowModes=new Set(['CHALLENGER','ABSTAIN_PROBE','COVERAGE_PROBE','EXPLORATION'])"));
  assert.ok(source.includes("const primaryShadowPositions=allShadowPositions.filter"));
  assert.ok(source.includes("const openPositions=primaryShadowPositions.filter"));
  assert.ok(source.includes("const recentClosed=primaryShadowPositions.filter"));
  assert.ok(source.includes("TCX_COVERAGE_CURRICULUM_NOTIONAL || 5"));
  assert.ok(source.includes("TCX_MANDATORY_SHADOW_DISCOVERY_NOTIONAL || 25"));
  assert.ok(source.includes("TCX_AUTO_SHADOW_NOTIONAL_QUOTE || 200"));
});
