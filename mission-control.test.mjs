import test from 'node:test';
import assert from 'node:assert/strict';
import { missionControlSnapshot, renderMissionControlHtml, MISSION_CONTROL_VERSION } from './mission-control.mjs';

test('mission control V2 remains explicitly shadow only',()=>{
  const s=missionControlSnapshot({health:{ok:true}});
  assert.equal(MISSION_CONTROL_VERSION,'TCX_MISSION_CONTROL_V2');
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

test('mobile command center exposes autonomy learning trades intel and system tabs',()=>{
  const s=missionControlSnapshot({
    health:{
      autonomousOperator:{mode:'HANDS_OFF',operatorNeeded:false,automationCoverage:1},
      autonomousResearchFactory:{mode:'DATA_COLLECTION_ONLY'},
      researchCoverage:{averageCoverage:.75,blocked:0},
      biggjObservability:{
        maturityIndex:.6,
        trustedSkills:2,
        knowledge:[{skillId:'s1',title:'Structure',status:'VALIDATED',uncertainty:.2}],
        researchQueue:[{skillId:'s2',title:'Liquidity',nextGate:'FORWARD_SHADOW',priority:.7,uncertainty:.4}],
        learningTimeline:{events:[]}
      },
      experienceNeeds:[{priority:2,label:'More live data',detail:'coverage gap'}],
      globalIntel:{eventCount:0,recent:[]},
      traderWatch:{sourceReady:false,nextNeed:'PIT public performance source'}
    },
    portfolio:{equityQuote:1000,openPositions:0,closedTrades:0,netPnlQuote:0,positions:[],recentClosed:[]}
  });
  const html=renderMissionControlHtml(s);
  for(const x of ['data-tab="home"','data-tab="learn"','data-tab="trades"','data-tab="intel"','data-tab="system"','What BIGGJ needs','Trader watch']){
    assert.match(html,new RegExp(x));
  }
  assert.match(html,/app\.webmanifest/);
  assert.match(html,/serviceWorker/);
});
