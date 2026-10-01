
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_EXPERIENCE_LAYOUT,
  buildBiggjNeedsPayload,
  buildBiggjLearnedPayload,
  buildBiggjTraderWatchPayload,
  buildBiggjTradeCockpitPayload,
  buildBiggjChartDeskPayload,
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
      globalIntel:{eventCount:4,sourceReady:true,source:'GDELT DOC 2.1',lastError:null},
      memecoinRadar:{sourceReady:true,rows:[{pair:{symbol:'MEME'}}],metas:[]},
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
  for(const name of ['biggj-needs','learned-playbook','mobile-app','news-feed','world-watch','trader-watch','trade-cockpit','chart-desk']){
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
  assert.match(text,/erfindet keine Positionen oder Rankings/i);
  assert.match(text,/SOURCE REQUIRED/);
});

test('trader watch renders provider-ranked public traders, inferred behavior and open positions',()=>{
  const x=snapshot();
  x.health.traderWatch={
    sourceReady:true,
    source:'OKX_PUBLIC_COPY_TRADING_API',
    capturedAt:Date.now()-60_000,
    rankingMethod:'OKX_OVERVIEW',
    nextNeed:'second independent source',
    entityRegistry:{entityCount:12},
    entityFlow:{observationCount:33},
    traders:[{
      providerRank:1,
      nickname:'Alpha',
      metrics:{pnl90d:12000,pnlRatio90d:.42,winRatio:.64,aum:500000,copyTraderNum:200,leadDays:420},
      strategy:{
        holdingStyle:'INTRADAY',
        directionalBias:'TWO_WAY',
        leverageStyle:'MODERATE_LEVERAGE',
        topSymbols:[{symbol:'BTC-USDT-SWAP',count:10},{symbol:'ETH-USDT-SWAP',count:4}],
        inferred:true
      },
      openPositions:[{
        instId:'BTC-USDT-SWAP',side:'LONG',leverage:5,openAvgPx:100000,markPx:101000,uplRatio:.01,protectedFields:false
      }]
    }]
  };
  const p=buildBiggjTraderWatchPayload(x);
  const text=JSON.stringify(p);
  assert.match(text,/TOP TRADER WATCH/);
  assert.match(text,/Alpha/);
  assert.match(text,/OKX-Overview-Ranking/);
  assert.match(text,/Verhaltensprofil/);
  assert.match(text,/Intraday/);
  assert.match(text,/LONG BTC-USDT-SWAP/);
  assert.match(text,/UPL \+1\.0%/);
  assert.match(text,/keine echten Orders/i);
});

test('trade cockpit remains shadow-only',()=>{
  const p=buildBiggjTradeCockpitPayload(snapshot());
  const text=JSON.stringify(p);
  assert.match(text,/BTCUSDT/);
  assert.match(text,/SHADOW_ONLY/);
  assert.match(text,/canExecuteLive:false/);
});



test('trade cockpit emits unique Discord custom ids when multiple positions share a symbol',()=>{
  const x=snapshot();
  x.portfolio.positions=[
    {...x.portfolio.positions[0],positionId:'p1'},
    {...x.portfolio.positions[0],positionId:'p2',side:'SHORT'}
  ];
  x.portfolio.openPositions=2;
  const p=buildBiggjTradeCockpitPayload(x);
  const ids=(p.components||[]).flatMap(row=>(row.components||[]).map(button=>button.custom_id));
  assert.equal(ids.length,3);
  assert.equal(new Set(ids).size,ids.length);
});

test('experience panel map has unique channel ownership',()=>{
  const rows=buildBiggjExperiencePanelMap(snapshot(),{mobileUrl:'https://example.invalid/mission-control'});
  assert.equal(new Set(rows.map(x=>x.channel)).size,rows.length);
  assert.ok(rows.some(x=>x.channel==='mobile-app'));
  assert.ok(rows.every(x=>x.marker&&x.payload));
});


test('chart desk exposes one-tap charts without execution authority',()=>{
  const p=buildBiggjChartDeskPayload(snapshot());
  const text=JSON.stringify(p);
  assert.match(text,/CHART DESK/);
  assert.match(text,/dc3:superchart:BTCUSDT:FULL:5m/);
  assert.match(text,/dc3:terminal:radar/);
  assert.match(text,/keine garantierte Kursbahn/i);
});

test('needs detects missing live intelligence sources explicitly',()=>{
  const x=snapshot();
  x.health.globalIntel={eventCount:0,sourceReady:false,lastError:'NEWS_SOURCE_DOWN'};
  x.health.memecoinRadar={sourceReady:false,lastError:'DEX_SOURCE_DOWN'};
  const text=JSON.stringify(buildBiggjNeedsPayload(x));
  assert.match(text,/Live News Coverage/);
  assert.match(text,/NEWS_SOURCE_DOWN/);
  assert.match(text,/Memecoin Live Coverage/);
  assert.match(text,/DEX_SOURCE_DOWN/);
});


test('needs panel treats passive data waiting as waiting, not a deadlock',()=>{
  const x=snapshot();
  x.health.autonomousOperator={
    mode:'WAITING_FOR_DATA',
    operatorNeeded:false,
    humanJobRemaining:'EXCEPTIONS_ONLY',
    waitingForData:true,
    automationCoverage:1
  };
  x.health.autonomousResearchFactory={
    mode:'RESEARCH_STALLED',
    operatorDataOnly:false,
    dataNeeds:['FORWARD_SHADOW_OBSERVATIONS','REGIME_DIVERSITY']
  };
  const p=buildBiggjNeedsPayload(x);
  const text=JSON.stringify(p);
  assert.match(text,/Research wartet auf Daten/);
  assert.doesNotMatch(text,/Research Deadlock/);
  assert.match(text,/Mensch nötig: NEIN/);
  assert.match(text,/aktuell nichts zu tun/);
  assert.match(text,/Automatisiert: 100%/);
});

test('needs panel still surfaces a real stalled research deadlock when not passively waiting',()=>{
  const x=snapshot();
  x.health.autonomousOperator={
    mode:'AUTO_MONITORING',
    operatorNeeded:false,
    humanJobRemaining:'EXCEPTIONS_ONLY',
    waitingForData:false,
    automationCoverage:1
  };
  x.health.autonomousResearchFactory={
    mode:'RESEARCH_STALLED',
    operatorDataOnly:false,
    dataNeeds:[]
  };
  const p=buildBiggjNeedsPayload(x);
  const text=JSON.stringify(p);
  assert.match(text,/Research Deadlock/);
  assert.match(text,/trotz verfügbarer Inputs/);
});


test('passive data-quality wait is not shown as a human blocker',()=>{
  const x=snapshot();
  x.health.autonomousOperator={
    mode:'WAITING_FOR_DATA',
    operatorNeeded:false,
    humanJobRemaining:'EXCEPTIONS_ONLY',
    waitingForData:true,
    automationCoverage:1
  };
  x.health.autonomousResearchFactory={
    mode:'DATA_QUALITY_BLOCKED',
    operatorDataOnly:false,
    dataNeeds:['MORE_POINT_IN_TIME_DATA']
  };
  x.health.researchCoverage={
    averageCoverage:.72,
    blocked:1,
    blockedFeatures:3
  };
  const text=JSON.stringify(buildBiggjNeedsPayload(x));
  assert.doesNotMatch(text,/Research coverage reparieren/);
  assert.doesNotMatch(text,/Datenqualität/);
  assert.doesNotMatch(text,/Operator-Eskalation/);
  assert.doesNotMatch(text,/Mehr Live Data/);
  assert.match(text,/Mensch nötig: NEIN/);
  assert.match(text,/Nur Datensammlung: JA/);
  assert.match(text,/Automatisiert: 100%/);
});

test('real data-quality block remains visible when operator action is actually needed',()=>{
  const x=snapshot();
  x.health.autonomousOperator={
    mode:'ESCALATION_REQUIRED',
    operatorNeeded:true,
    humanJobRemaining:'DATA_QUALITY_BLOCKED',
    waitingForData:false,
    automationCoverage:1
  };
  x.health.autonomousResearchFactory={
    mode:'DATA_QUALITY_BLOCKED',
    operatorDataOnly:false,
    dataNeeds:['AUDITABLE_POINT_IN_TIME_EVIDENCE']
  };
  const text=JSON.stringify(buildBiggjNeedsPayload(x));
  assert.match(text,/Datenqualität/);
  assert.match(text,/Operator-Eskalation/);
  assert.match(text,/Mensch nötig: JA/);
  assert.match(text,/Nur Datensammlung: NEIN/);
});
