
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_EXPERIENCE_LAYOUT,
  buildBiggjNeedsPayload,
  buildBiggjLearnedPayload,
  buildBiggjTraderWatchPayload,
  buildBiggjTradeCockpitPayload,
  buildBiggjExperiencePanelMap
} from './biggj-experience-center.mjs';

function snapshot(){
  return {
    health:{
      autonomousOperator:{
        mode:'HANDS_OFF',
        operatorNeeded:false,
        humanJobRemaining:'EXCEPTIONS_ONLY',
        automationCoverage:1
      },
      autonomousResearchFactory:{
        mode:'DATA_COLLECTION_ONLY',
        operatorDataOnly:true
      },
      researchCoverage:{
        averageCoverage:.72,
        blocked:1,
        blockedFeatures:3
      },
      globalIntel:{eventCount:4},
      traderWatch:{
        sourceReady:false,
        nextNeed:'public PIT trader performance source',
        entityRegistry:{entityCount:12},
        entityFlow:{observationCount:33}
      },
      biggjObservability:{
        maturityIndex:.62,
        trustedSkills:3,
        decayingSkills:1,
        knowledge:[
          {skillId:'s1',title:'Market structure',status:'VALIDATED',uncertainty:.2},
          {skillId:'s2',title:'Liquidity context',status:'TESTING',uncertainty:.4}
        ],
        revisions:[{type:'ASSUMPTION_REVISION',assumptionId:'A1',falsifierCodes:['F1']}],
        researchQueue:[{skillId:'s3',title:'Regime transfer',nextGate:'FORWARD_SHADOW',uncertainty:.6}]
      }
    },
    portfolio:{
      equityQuote:1012.3,
      openPositions:1,
      closedTrades:2,
      netPnlQuote:12.3,
      positions:[{
        positionId:'p1',
        symbol:'BTCUSDT',
        side:'LONG',
        status:'OPEN',
        entryPrice:62000,
        entryMode:'STANDARD',
        lastMark:{unrealizedNetPnlQuote:3.2}
      }],
      recentClosed:[{symbol:'ETHUSDT',side:'SHORT',netPnlQuote:5.4,exitReason:'TARGET'}]
    }
  };
}

test('experience layout exposes requested operator and intelligence surfaces',()=>{
  const channels=BIGGJ_EXPERIENCE_LAYOUT.flatMap(x=>x.channels.map(c=>c.name));
  for(const name of ['biggj-needs','learned-playbook','learning-timeline','news-feed','world-watch','trader-watch','trade-cockpit']){
    assert.ok(channels.includes(name),name);
  }
});

test('needs panel surfaces real blockers instead of generic requests',()=>{
  const p=buildBiggjNeedsPayload(snapshot());
  const text=JSON.stringify(p);
  assert.match(text,/Research coverage reparieren/);
  assert.match(text,/Trader Intelligence Source/);
  assert.doesNotMatch(text,/guaranteed|safe profit/i);
});

test('learned panel keeps maturity and uncertainty visible',()=>{
  const p=buildBiggjLearnedPayload(snapshot());
  const text=JSON.stringify(p);
  assert.match(text,/Market structure/);
  assert.match(text,/VALIDATED/);
  assert.match(text,/MATURITY/);
});

test('trader watch fails honestly when no public profit source exists',()=>{
  const p=buildBiggjTraderWatchPayload(snapshot());
  const text=JSON.stringify(p);
  assert.match(text,/kein belastbarer öffentlicher PnL/i);
  assert.match(text,/SOURCE REQUIRED/);
});

test('trade cockpit remains shadow-only',()=>{
  const p=buildBiggjTradeCockpitPayload(snapshot());
  const text=JSON.stringify(p);
  assert.match(text,/BTCUSDT/);
  assert.match(text,/SHADOW_ONLY/);
  assert.match(text,/canExecuteLive:false/);
});

test('experience panel map has unique channel ownership',()=>{
  const rows=buildBiggjExperiencePanelMap(snapshot(),{mobileUrl:'https://example.invalid/mission-control'});
  assert.equal(new Set(rows.map(x=>x.channel)).size,rows.length);
  assert.ok(rows.some(x=>x.channel==='mobile-app'));
  assert.ok(rows.every(x=>x.marker&&x.payload));
});
