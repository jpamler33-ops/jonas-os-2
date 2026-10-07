import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSpecialistWalletState,
  applyPublicTraderCopySnapshot,
  applyMemecoinScoutSnapshot,
  evaluateUser99k60sEntry,
  applyUser99k60sStrategySnapshot,
  recordUser99k60sExitObservation,
  user99k60sExitLearningSummary,
  specialistWalletSummary,
  w6ResearchArchive,
  w6ResearchAnalysis,
  WALLET_3_TRADER_COPY,
  WALLET_4_MEME_SCOUT,
  WALLET_5_MEME_COPY,
  WALLET_6_USER_99K_60S,
  USER_99K_60S_STRATEGY_VERSION
} from './shadow-specialist-wallets.mjs';

test('wallet 3 copies all visible public trader positions with unlimited virtual capital model',()=>{
  const snap={sourceReady:true,traders:[{
    uniqueCode:'T1',nickname:'Alpha',providerRank:1,
    openPositions:[{id:'P1',instId:'BTC-USDT-SWAP',side:'LONG',leverage:5,markPx:100,openAvgPx:90,openTime:1,protectedFields:false}],
    recentClosed:[]
  }]};
  const x=applyPublicTraderCopySnapshot(createSpecialistWalletState(),snap,{now:1000,wallet3MarginQuote:500});
  const w=x.state.wallets[WALLET_3_TRADER_COPY];
  assert.equal(x.results.openedW3,1);
  assert.equal(w.positions.length,1);
  assert.equal(w.positions[0].entryPrice,100);
  assert.equal(w.positions[0].marginQuote,500);
  assert.equal(w.positions[0].exposureQuote,2500);
  assert.equal(w.capitalLimitQuote,null);
  assert.equal(w.positions[0].canExecuteLive,false);
});

test('wallet 5 copies only known memecoin instruments from public profitable traders',()=>{
  const snap={sourceReady:true,traders:[{
    uniqueCode:'T1',nickname:'Alpha',providerRank:1,recentClosed:[],
    openPositions:[
      {id:'B',instId:'BTC-USDT-SWAP',side:'LONG',leverage:2,markPx:100,openAvgPx:90,openTime:1,protectedFields:false},
      {id:'M',instId:'PEPE-USDT-SWAP',side:'SHORT',leverage:3,markPx:.001,openAvgPx:.0011,openTime:1,protectedFields:false}
    ]
  }]};
  const x=applyPublicTraderCopySnapshot(createSpecialistWalletState(),snap,{now:1000});
  assert.equal(x.results.openedW3,2);
  assert.equal(x.results.openedW5,1);
  assert.equal(x.state.wallets[WALLET_5_MEME_COPY].positions[0].sourceInstId,'PEPE-USDT-SWAP');
});

test('wallet 3 closes only with a public close price instead of inventing one',()=>{
  let x=applyPublicTraderCopySnapshot(createSpecialistWalletState(),{sourceReady:true,traders:[{
    uniqueCode:'T1',nickname:'A',openPositions:[{id:'P1',instId:'BTC-USDT-SWAP',side:'LONG',leverage:2,markPx:100,openAvgPx:90,openTime:1,protectedFields:false}],recentClosed:[]
  }]},{now:1000}).state;
  const pending=applyPublicTraderCopySnapshot(x,{sourceReady:true,traders:[{uniqueCode:'T1',nickname:'A',openPositions:[],recentClosed:[]}]},{now:2000});
  assert.equal(pending.state.wallets[WALLET_3_TRADER_COPY].positions[0].sourceState,'SOURCE_EXIT_PENDING');
  const closed=applyPublicTraderCopySnapshot(pending.state,{sourceReady:true,traders:[{
    uniqueCode:'T1',nickname:'A',openPositions:[],recentClosed:[{id:'P1',instId:'BTC-USDT-SWAP',side:'LONG',closeAvgPx:110,closeTime:3000}]
  }]},{now:3000});
  assert.equal(closed.state.wallets[WALLET_3_TRADER_COPY].positions.length,0);
  assert.equal(closed.state.wallets[WALLET_3_TRADER_COPY].closed.length,1);
  assert.ok(closed.state.wallets[WALLET_3_TRADER_COPY].closed[0].realizedNetPnlQuote>0);
});

test('wallet 4 enters only early liquid shadow candidates and ignores risky thin launches',()=>{
  const now=2_000_000;
  const snap={sourceReady:true,rows:[
    {chainId:'solana',tokenAddress:'GOOD',symbol:'GOOD',priceUsd:.01,liquidityUsd:30_000,pairCreatedAt:now-10_000,
      score:{stage:'NEW_NOW',researchPriorityScore:.72,attentionSignals:['NEW_PROFILE'],riskFlags:['ULTRA_NEW_PAIR']},
      security:{evidenceGate:'PASS',source:'GOPLUS_SOLANA_TOKEN_SECURITY+RUGCHECK_SOLANA_TOP_HOLDERS',criticalRiskFlags:[],warningFlags:[],coverage:{holderConcentrationKnown:true,holderConcentrationIndependent:true},independentHolderEvidence:{source:'RUGCHECK_SOLANA_TOP_HOLDERS'}}},
    {chainId:'solana',tokenAddress:'BAD',symbol:'BAD',priceUsd:.01,liquidityUsd:900,pairCreatedAt:now-10_000,
      score:{stage:'RISK_ONLY',researchPriorityScore:.80,attentionSignals:['NEW_BOOST'],riskFlags:['LIQUIDITY_EXTREME_THIN']},
      security:{evidenceGate:'ABSTAIN',criticalRiskFlags:['HONEYPOT_FLAGGED'],warningFlags:[]}}
  ]};
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),snap,{now,minLiquidityUsd:10_000,minScore:.58});
  assert.equal(x.results.opened,1);
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions[0].tokenAddress,'GOOD');
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions[0].entryHolderFallbackUsed,true);
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions[0].entryHolderEvidenceSource,'RUGCHECK_SOLANA_TOP_HOLDERS');
  assert.match(x.state.wallets[WALLET_4_MEME_SCOUT].positions[0].entrySecuritySource,/RUGCHECK_SOLANA_TOP_HOLDERS/);
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions[0].canExecuteLive,false);
});

test('wallet 4 preserves thin-liquidity moonshot candidates when no second risk signal exists',()=>{
  const now=2_300_000;
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'THIN',symbol:'THIN',priceUsd:.01,liquidityUsd:18_000,
    volumeM5:8_000,buysM5:12,sellsM5:5,priceChangeM5:12,
    score:{stage:'NEW_NOW',researchPriorityScore:.80,attentionSignals:['NEW_POOL'],riskFlags:['LIQUIDITY_THIN']},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now,minLiquidityUsd:10_000,minScore:.58});
  assert.equal(x.results.eligible,1);
  assert.equal(x.results.tailRiskBlocked,0);
  assert.equal(x.results.opened,1);
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions.length,1);
});

test('wallet 4 blocks thin launches when a second independent tail-risk signal is present',()=>{
  const now=2_350_000;
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'THINCHASE',symbol:'THINCHASE',priceUsd:.01,liquidityUsd:18_000,
    volumeM5:80_000,buysM5:28,sellsM5:3,priceChangeM5:140,
    score:{stage:'NEW_NOW',researchPriorityScore:.86,attentionSignals:['NEW_POOL'],riskFlags:['LIQUIDITY_THIN','M5_CHASE_RISK','EXTREME_TURNOVER']},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now,minLiquidityUsd:10_000,minScore:.58});
  assert.equal(x.results.eligible,1);
  assert.equal(x.results.tailRiskBlocked,1);
  assert.equal(x.results.opened,0);
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions.length,0);
});

test('wallet 4 refuses hard market-data anomalies even with security pass',()=>{
  const now=2_500_000;
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'base',tokenAddress:'ANOM',symbol:'ANOM',priceUsd:.001,liquidityUsd:11_000_000,
    score:{stage:'NEW_NOW',researchPriorityScore:.95,attentionSignals:['NEW_POOL'],riskFlags:['DATA_ANOMALY_MCAP_LIQUIDITY']},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now});
  assert.equal(x.results.opened,0);
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions.length,0);
});

test('wallet 4 learned BLOCK can only abstain from an otherwise eligible shadow entry',()=>{
  const now=2_700_000;
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'LEARNBAD',symbol:'LEARNBAD',priceUsd:.01,liquidityUsd:55_000,
    volumeM5:20_000,buysM5:18,sellsM5:9,priceChangeM5:18,pairCreatedAt:now-14*60_000,
    score:{stage:'EARLY',ageMinutes:14,researchPriorityScore:.68,attentionSignals:['SOCIAL_POSTS_RECENT'],riskFlags:[]},
    security:{evidenceGate:'PASS',source:'GOPLUS+RUGCHECK',criticalRiskFlags:[],warningFlags:[],coverage:{holderConcentrationKnown:true,holderConcentrationIndependent:true},holderState:{top10Share:.32}},
    memeLearning:{action:'BLOCK',rankingAdjustment:-.2,evidence:{level:'EXACT',samples:12,label:'LEARNED_BAD',confidence:.55}}
  }]},{now});
  assert.equal(x.results.eligible,1);
  assert.equal(x.results.learningBlocked,1);
  assert.equal(x.results.opened,0);
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions.length,0);
});

test('wallet 4 contrarian lane intentionally probes one soft rule at tiny shadow size',()=>{
  const now=2_725_000;
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'CONTRA',symbol:'CONTRA',priceUsd:.01,liquidityUsd:55_000,
    volumeM5:20_000,buysM5:18,sellsM5:9,priceChangeM5:18,pairCreatedAt:now-14*60_000,
    score:{stage:'EARLY',ageMinutes:14,researchPriorityScore:.68,attentionSignals:['SOCIAL_POSTS_RECENT'],riskFlags:[]},
    security:{evidenceGate:'PASS',source:'GOPLUS+RUGCHECK',criticalRiskFlags:[],warningFlags:[],coverage:{holderConcentrationKnown:true,holderConcentrationIndependent:true},holderState:{top10Share:.32}},
    memeLearning:{action:'BLOCK',rankingAdjustment:-.2,evidence:{level:'EXACT',samples:20,label:'LEARNED_BAD',confidence:.8}}
  }]},{now,marginQuote:100,contrarianEnabled:true,contrarianProbeRate:1,contrarianMarginMultiplier:.05});
  assert.equal(x.results.contrarianEligible,1);
  assert.equal(x.results.contrarianOpened,1);
  assert.equal(x.results.opened,1);
  const p=x.state.wallets[WALLET_4_MEME_SCOUT].positions[0];
  assert.equal(p.entryResearchLane,'CONTRARIAN_PROBE');
  assert.deepEqual(p.entryContrarianViolations,['LEARNED_BLOCK_WOULD_ABSTAIN']);
  assert.equal(p.marginQuote,5);
  assert.equal(p.exposureQuote,5);
  assert.equal(p.canExecute,false);
  assert.equal(p.canExecuteLive,false);
});

test('wallet 4 bootstraps one hard-safe contrarian probe even when random rate is zero',()=>{
  const now=2_728_000;
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'BOOT',symbol:'BOOT',priceUsd:.01,liquidityUsd:55_000,
    volumeM5:20_000,buysM5:18,sellsM5:9,priceChangeM5:18,pairCreatedAt:now-14*60_000,
    score:{stage:'EARLY',ageMinutes:14,researchPriorityScore:.68,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',source:'GOPLUS+RUGCHECK',criticalRiskFlags:[],warningFlags:[],coverage:{holderConcentrationKnown:true,holderConcentrationIndependent:true},holderState:{top10Share:.32}},
    memeLearning:{action:'BLOCK',rankingAdjustment:-.2,evidence:{level:'EXACT',samples:20,label:'LEARNED_BAD',confidence:.8}}
  }]},{now,marginQuote:100,contrarianEnabled:true,contrarianProbeRate:0,contrarianMarginMultiplier:.05});
  assert.equal(x.results.contrarianEligible,1);
  assert.equal(x.results.contrarianOpened,1);
  const p=x.state.wallets[WALLET_4_MEME_SCOUT].positions[0];
  assert.equal(p.entryContrarianBootstrap,true);
  assert.equal(p.marginQuote,5);
  assert.equal(p.canExecuteLive,false);
});

test('wallet 4 contrarian lane never bypasses hard security guards',()=>{
  const now=2_730_000;
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'HARDNO',symbol:'HARDNO',priceUsd:.01,liquidityUsd:55_000,
    volumeM5:20_000,buysM5:18,sellsM5:9,priceChangeM5:18,pairCreatedAt:now-14*60_000,
    score:{stage:'EARLY',ageMinutes:14,researchPriorityScore:.68,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'ABSTAIN',criticalRiskFlags:['HONEYPOT_FLAGGED'],warningFlags:[]},
    memeLearning:{action:'BLOCK',evidence:{level:'EXACT',samples:20,label:'LEARNED_BAD',confidence:.8}}
  }]},{now,contrarianEnabled:true,contrarianProbeRate:1});
  assert.equal(x.results.contrarianOpened,0);
  assert.equal(x.results.opened,0);
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions.length,0);
  assert.ok(x.results.contrarianRejectedByHardGuard>=1);
});

test('wallet 4 THROTTLE keeps learning but reduces destructive cohort notional',()=>{
  const now=2_750_000;
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'THROTTLED',symbol:'THROTTLED',priceUsd:.01,liquidityUsd:55_000,
    volumeM5:20_000,buysM5:18,sellsM5:9,priceChangeM5:18,pairCreatedAt:now-14*60_000,
    score:{stage:'EARLY',ageMinutes:14,researchPriorityScore:.68,attentionSignals:['SOCIAL_POSTS_RECENT'],riskFlags:[]},
    security:{evidenceGate:'PASS',source:'GOPLUS+RUGCHECK',criticalRiskFlags:[],warningFlags:[],coverage:{holderConcentrationKnown:true,holderConcentrationIndependent:true},holderState:{top10Share:.32}},
    memeLearning:{action:'THROTTLE',sizeMultiplier:.15,rankingAdjustment:-.1,evidence:{level:'CHAIN',samples:48,label:'LEARNED_BAD',confidence:.82,severeLossRate:.75}}
  }]},{now,marginQuote:100});
  assert.equal(x.results.eligible,1);
  assert.equal(x.results.learningThrottled,1);
  assert.equal(x.results.opened,1);
  const p=x.state.wallets[WALLET_4_MEME_SCOUT].positions[0];
  assert.equal(p.marginQuote,15);
  assert.equal(p.exposureQuote,15);
  assert.equal(p.entryLearningSizeMultiplier,.15);
  assert.equal(p.canExecuteLive,false);
});

test('wallet 4 persists entry microstructure and learning provenance for later outcome learning',()=>{
  const now=2_800_000;
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'LEARNGOOD',symbol:'LEARNGOOD',priceUsd:.01,liquidityUsd:55_000,
    marketCap:320_000,fdv:350_000,volumeM5:20_000,volumeH1:70_000,buysM5:18,sellsM5:9,
    priceChangeM5:18,priceChangeH1:55,pairCreatedAt:now-14*60_000,
    directSocialAttention:{posts:4,uniqueAuthors:3,engagement:80,attentionBand:'RISING'},
    score:{stage:'EARLY',ageMinutes:14,researchPriorityScore:.68,attentionSignals:['SOCIAL_POSTS_RECENT'],riskFlags:[]},
    security:{evidenceGate:'PASS',source:'GOPLUS+RUGCHECK',criticalRiskFlags:[],warningFlags:[],coverage:{holderConcentrationKnown:true,holderConcentrationIndependent:true},holderState:{top10Share:.32,largestHolderShare:.08}},
    memeLearning:{action:'BOOST',rankingAdjustment:.05,evidence:{level:'EXACT',samples:12,label:'LEARNED_GOOD',confidence:.55}}
  }]},{now});
  const p=x.state.wallets[WALLET_4_MEME_SCOUT].positions[0];
  assert.equal(x.results.learningBoosted,1);
  assert.equal(p.entryMarketFeatures.liquidityUsd,55_000);
  assert.equal(p.entryMarketFeatures.buysM5,18);
  assert.equal(p.entryMarketFeatures.sellsM5,9);
  assert.equal(p.entryMarketFeatures.holderTop10Share,.32);
  assert.equal(p.entryMemeLearning.action,'BOOST');
  assert.equal(p.canExecuteLive,false);
});

test('wallet 5 learned BLOCK does not interfere with wallet 3 public trader copy',()=>{
  const snap={sourceReady:true,traders:[{
    uniqueCode:'T1',nickname:'Alpha',providerRank:1,recentClosed:[],
    openPositions:[{
      id:'M',instId:'PEPE-USDT-SWAP',side:'LONG',leverage:3,markPx:.001,openAvgPx:.0009,openTime:1,protectedFields:false,
      memeLearning:{action:'BLOCK',evidence:{level:'TRADER_SYMBOL',samples:12,label:'LEARNED_BAD'}}
    }]
  }]};
  const x=applyPublicTraderCopySnapshot(createSpecialistWalletState(),snap,{now:3000});
  assert.equal(x.results.openedW3,1);
  assert.equal(x.results.openedW5,0);
  assert.equal(x.results.learningBlockedW5,1);
  assert.equal(x.state.wallets[WALLET_3_TRADER_COPY].positions.length,1);
  assert.equal(x.state.wallets[WALLET_5_MEME_COPY].positions.length,0);
});

test('wallet 4 exits deteriorating memes before the static minus-45 percent stop',()=>{
  const now=3_400_000;
  let state=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'TAIL',symbol:'TAIL',priceUsd:1,liquidityUsd:60_000,
    volumeM5:25_000,buysM5:20,sellsM5:8,priceChangeM5:15,
    score:{stage:'NEW_NOW',researchPriorityScore:.78,attentionSignals:['NEW_POOL'],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now}).state;

  const next=applyMemecoinScoutSnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'TAIL',symbol:'TAIL',priceUsd:.76,liquidityUsd:24_000,
    volumeM5:40_000,buysM5:4,sellsM5:18,priceChangeM5:-58,
    score:{stage:'RISK_ONLY',researchPriorityScore:.12,attentionSignals:[],riskFlags:['M5_DRAWDOWN_SEVERE']},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now:now+30_000,stopReturn:-.45,takeReturn:1.5});

  assert.equal(next.results.closed,1);
  assert.equal(next.results.tailRiskClosed,1);
  assert.equal(next.state.wallets[WALLET_4_MEME_SCOUT].closed[0].closeReason,'MEME_TAIL_RISK_EXIT');
  assert.ok(next.state.wallets[WALLET_4_MEME_SCOUT].closed[0].realizedReturnPct>-.45);
  assert.equal(next.state.wallets[WALLET_4_MEME_SCOUT].closed[0].lastMemeTailRisk.trigger,true);
});

test('wallet 4 does not choke healthy winners before the existing take-profit threshold',()=>{
  const now=3_600_000;
  let state=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'RUNNER',symbol:'RUNNER',priceUsd:1,liquidityUsd:70_000,
    volumeM5:25_000,buysM5:18,sellsM5:7,priceChangeM5:20,
    score:{stage:'NEW_NOW',researchPriorityScore:.82,attentionSignals:['NEW_POOL'],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now}).state;

  const next=applyMemecoinScoutSnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'RUNNER',symbol:'RUNNER',priceUsd:1.9,liquidityUsd:95_000,
    volumeM5:40_000,buysM5:25,sellsM5:9,priceChangeM5:45,
    score:{stage:'EARLY',researchPriorityScore:.74,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now:now+30_000,takeReturn:1.5});

  assert.equal(next.results.closed,0);
  assert.equal(next.state.wallets[WALLET_4_MEME_SCOUT].positions.length,1);
  assert.ok(next.state.wallets[WALLET_4_MEME_SCOUT].positions[0].peakUnrealizedReturnPct>.8);
});

test('wallet 4 marks and closes a take-profit research episode from later public price',()=>{
  const now=2_000_000;
  let state=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'GOOD',symbol:'GOOD',priceUsd:1,liquidityUsd:30_000,
    score:{stage:'NEW_NOW',researchPriorityScore:.72,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now}).state;
  const next=applyMemecoinScoutSnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'GOOD',symbol:'GOOD',priceUsd:2.6,liquidityUsd:40_000,
    score:{stage:'EARLY',researchPriorityScore:.70,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now:now+60_000,takeReturn:1.5});
  assert.equal(next.results.closed,1);
  assert.equal(next.state.wallets[WALLET_4_MEME_SCOUT].positions.length,0);
  assert.equal(next.state.wallets[WALLET_4_MEME_SCOUT].closed[0].closeReason,'MEME_TAKE_PROFIT');
});

test('wallet 4 refuses unknown security and exits when later evidence becomes critical',()=>{
  const now=3_000_000;
  const unknown=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'base',tokenAddress:'X',symbol:'X',priceUsd:1,liquidityUsd:40_000,
    score:{stage:'NEW_NOW',researchPriorityScore:.80,attentionSignals:['X_POSTS_RECENT'],riskFlags:[]},
    security:{evidenceGate:'UNKNOWN',criticalRiskFlags:[],warningFlags:['SECURITY_SOURCE_UNAVAILABLE']}
  }]},{now});
  assert.equal(unknown.results.opened,0);

  let state=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'base',tokenAddress:'Y',symbol:'Y',priceUsd:1,liquidityUsd:40_000,
    score:{stage:'NEW_NOW',researchPriorityScore:.80,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now}).state;
  const closed=applyMemecoinScoutSnapshot(state,{sourceReady:true,rows:[{
    chainId:'base',tokenAddress:'Y',symbol:'Y',priceUsd:.95,liquidityUsd:35_000,
    score:{stage:'EARLY',researchPriorityScore:.70,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'ABSTAIN',criticalRiskFlags:['HONEYPOT_FLAGGED'],warningFlags:[]}
  }]},{now:now+60_000});
  assert.equal(closed.results.closed,1);
  assert.equal(closed.state.wallets[WALLET_4_MEME_SCOUT].closed[0].closeReason,'MEME_SECURITY_ABSTAIN');
});

test('wallet 4 hard capital guard closes a plain loss near minus 25 percent instead of waiting for minus 45',()=>{
  const now=3_800_000;
  let state=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'GUARD',symbol:'GUARD',priceUsd:1,liquidityUsd:80_000,
    volumeM5:20_000,buysM5:12,sellsM5:8,priceChangeM5:2,
    score:{stage:'NEW_NOW',researchPriorityScore:.75,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now}).state;
  const next=applyMemecoinScoutSnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'GUARD',symbol:'GUARD',priceUsd:.74,liquidityUsd:80_000,
    volumeM5:20_000,buysM5:10,sellsM5:10,priceChangeM5:-10,
    score:{stage:'EARLY',researchPriorityScore:.62,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now:now+30_000});
  assert.equal(next.results.closed,1);
  assert.equal(next.results.hardStopClosed,1);
  assert.equal(next.state.wallets[WALLET_4_MEME_SCOUT].closed[0].closeReason,'MEME_STOP');
  assert.ok(next.state.wallets[WALLET_4_MEME_SCOUT].closed[0].realizedReturnPct<=-.25);
});

test('wallet 4 reduces exposure once when early deterioration appears before the hard stop',()=>{
  const now=3_900_000;
  let state=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'DERISK',symbol:'DERISK',priceUsd:1,liquidityUsd:60_000,
    volumeM5:20_000,buysM5:18,sellsM5:7,priceChangeM5:12,
    score:{stage:'NEW_NOW',researchPriorityScore:.78,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now}).state;
  const next=applyMemecoinScoutSnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'DERISK',symbol:'DERISK',priceUsd:.90,liquidityUsd:42_000,
    volumeM5:30_000,buysM5:4,sellsM5:12,priceChangeM5:-30,
    score:{stage:'EARLY',researchPriorityScore:.55,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now:now+30_000,riskReduceFraction:.50});
  assert.equal(next.results.closed,0);
  assert.equal(next.results.riskReduced,1);
  const p=next.state.wallets[WALLET_4_MEME_SCOUT].positions[0];
  assert.equal(p.riskReductionApplied,true);
  assert.equal(p.exposureQuote,50);
  assert.equal(p.marginQuote,50);
  assert.equal(p.partialExits.length,1);
  assert.ok(p.partialRealizedNetPnlQuote<0);
});

test('wallet 4 runner locks a fraction and exits the remainder only after a trailing drawdown',()=>{
  const now=4_000_000;
  let state=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'RUN2',symbol:'RUN2',priceUsd:1,liquidityUsd:90_000,
    volumeM5:25_000,buysM5:20,sellsM5:6,priceChangeM5:20,
    score:{stage:'NEW_NOW',researchPriorityScore:.82,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now}).state;
  let next=applyMemecoinScoutSnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'RUN2',symbol:'RUN2',priceUsd:2.1,liquidityUsd:120_000,
    volumeM5:35_000,buysM5:24,sellsM5:8,priceChangeM5:35,
    score:{stage:'EARLY',researchPriorityScore:.75,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now:now+30_000,runnerEnabled:true,runnerArmReturn:1,runnerTrailPct:.35,runnerProfitLockFraction:.25,takeReturn:null});
  assert.equal(next.results.closed,0);
  assert.equal(next.results.profitLocked,1);
  assert.equal(next.state.wallets[WALLET_4_MEME_SCOUT].positions[0].exposureQuote,75);

  next=applyMemecoinScoutSnapshot(next.state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'RUN2',symbol:'RUN2',priceUsd:1.30,liquidityUsd:100_000,
    volumeM5:28_000,buysM5:10,sellsM5:12,priceChangeM5:-20,
    score:{stage:'EARLY',researchPriorityScore:.62,attentionSignals:[],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now:now+60_000,runnerEnabled:true,runnerArmReturn:1,runnerTrailPct:.35,runnerProfitLockFraction:.25,takeReturn:null});
  assert.equal(next.results.closed,1);
  assert.equal(next.results.runnerTrailClosed,1);
  const c=next.state.wallets[WALLET_4_MEME_SCOUT].closed[0];
  assert.equal(c.closeReason,'MEME_RUNNER_TRAIL');
  assert.equal(c.profitLockApplied,true);
  assert.ok(c.realizedNetPnlQuote>0);
  assert.ok(c.observedMfeReturnPct>=1);
});

test('wallet 4 risk sizing makes low-liquidity lower-score research positions materially smaller',()=>{
  const now=4_100_000;
  const x=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'SIZED',symbol:'SIZED',priceUsd:1,liquidityUsd:18_000,
    volumeM5:10_000,buysM5:10,sellsM5:6,priceChangeM5:5,
    score:{stage:'NEW_NOW',researchPriorityScore:.60,attentionSignals:[],riskFlags:['LIQUIDITY_THIN']},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  }]},{now,marginQuote:100,riskSizingEnabled:true});
  assert.equal(x.results.opened,1);
  const p=x.state.wallets[WALLET_4_MEME_SCOUT].positions[0];
  assert.ok(p.marginQuote<=35);
  assert.ok(p.entryRiskSizeMultiplier<=.35);
  assert.equal(p.initialMarginQuote,p.marginQuote);
  assert.equal(p.entrySizingPolicy,'LIQUIDITY_SCORE_RISK_SIZED');
});

test('summary keeps specialist wallets isolated and shadow-only',()=>{
  const s=specialistWalletSummary(createSpecialistWalletState(),{asOf:100});
  assert.ok(s.wallets[WALLET_3_TRADER_COPY]);
  assert.ok(s.wallets[WALLET_4_MEME_SCOUT]);
  assert.ok(s.wallets[WALLET_5_MEME_COPY]);
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.wallets[WALLET_3_TRADER_COPY].capitalLimitQuote,null);
});


test('wallet 4 enforced signal gate opens only explicit BUY candidates',()=>{
  const now=4_300_000;
  const base={
    chainId:'solana',tokenAddress:'GATED',symbol:'GATED',priceUsd:1,liquidityUsd:80_000,
    volumeM5:30_000,buysM5:24,sellsM5:8,priceChangeM5:18,
    score:{stage:'NEW_NOW',researchPriorityScore:.82,attentionSignals:['SOCIAL_ATTENTION_SPIKE'],riskFlags:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]},
    memeLearning:{action:'BOOST'}
  };
  const blocked=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{
    sourceReady:true,rows:[{...base,memeSignal:{action:'READY',label:'⏳ READY'}}]
  },{now,requireBuySignal:true});
  assert.equal(blocked.results.opened,0);
  assert.equal(blocked.results.signalBlocked,1);

  const opened=applyMemecoinScoutSnapshot(createSpecialistWalletState(),{
    sourceReady:true,rows:[{...base,memeSignal:{action:'BUY',label:'🟢 KAUFEN',entryReadinessScore:.84}}]
  },{now,requireBuySignal:true});
  assert.equal(opened.results.opened,1);
  assert.equal(opened.results.signalBlocked,0);
  const p=opened.state.wallets[WALLET_4_MEME_SCOUT].positions[0];
  assert.equal(p.entrySignalAction,'BUY');
  assert.equal(p.entryMemeSignal.label,'🟢 KAUFEN');
  assert.equal(p.canExecuteLive,false);
});


test('user 99k/120s V1 matches only coins already above 99k before 120 seconds',()=>{
  const now=10_000_000;
  const good=evaluateUser99k60sEntry({
    priceUsd:.001,marketCap:105_000,pairCreatedAt:now-42_000
  },{now});
  assert.equal(good.version,USER_99K_60S_STRATEGY_VERSION);
  assert.equal(good.match,true);
  assert.equal(good.action,'BUY_SHADOW');
  assert.equal(good.observedTimeTo99kSeconds,42);
  assert.equal(good.canExecuteLive,false);

  const nearBoundary=evaluateUser99k60sEntry({
    priceUsd:.001,marketCap:150_000,pairCreatedAt:now-119_999
  },{now});
  assert.equal(nearBoundary.match,true);
  assert.equal(nearBoundary.action,'BUY_SHADOW');

  const old=evaluateUser99k60sEntry({
    priceUsd:.001,marketCap:150_000,pairCreatedAt:now-120_000
  },{now});
  assert.equal(old.match,false);
  assert.ok(old.blockers.includes('OLDER_THAN_MAX_AGE'));

  const small=evaluateUser99k60sEntry({
    priceUsd:.001,marketCap:98_999,pairCreatedAt:now-10_000
  },{now});
  assert.equal(small.match,false);
  assert.ok(small.blockers.includes('MARKET_CAP_BELOW_THRESHOLD'));
});

test('user 99k/60s V1 opens immediately in isolated W6 without changing W4 gate',()=>{
  const now=11_000_000;
  const snap={sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'FAST99',symbol:'FAST99',name:'Fast 99',
    priceUsd:.001,marketCap:120_000,pairCreatedAt:now-25_000,
    score:{stage:'RISK_ONLY',researchPriorityScore:.1,riskFlags:['LIQUIDITY_THIN']},
    security:{evidenceGate:'UNKNOWN',criticalRiskFlags:[],warningFlags:['SOURCE_UNAVAILABLE']},
    memeSignal:{action:'BLOCKED'}
  }]};
  const x=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),snap,{now,marginQuote:100});
  assert.equal(x.results.matched,1);
  assert.equal(x.results.opened,1);
  assert.equal(x.state.wallets[WALLET_6_USER_99K_60S].positions.length,1);
  assert.equal(x.state.wallets[WALLET_4_MEME_SCOUT].positions.length,0);
  const p=x.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.equal(p.entryAgeSeconds,25);
  assert.equal(p.observedTimeTo99kSeconds,25);
  assert.equal(p.entryMarketCapUsd,120_000);
  assert.equal(p.entryRule,'AGE_LT_120S_AND_MARKET_CAP_GTE_99K_IMMEDIATE');
  assert.equal(p.targetTracking,'OBSERVATIONAL_ONLY_NO_AUTO_PROFIT_EXIT');
  assert.deepEqual(p.profitTargetScenarios.map(x=>x.entryNotionalSol),[0.5,1,2,3,5,10,20,40,60,80]);
  assert.equal(p.minHoldSeconds,180);
  assert.equal(p.holdLab.length,30);
  assert.equal(p.canExecuteLive,false);
  assert.equal(x.results.entryFunnel.rowsSeen,1);
  assert.equal(x.results.entryFunnel.ageWithinLimit,1);
  assert.equal(x.results.entryFunnel.marketCapQualifiedAfterAge,1);
  assert.equal(x.results.entryFunnel.dataCompleteAfterThreshold,1);
  assert.equal(x.results.entryFunnel.eligible,1);
  assert.equal(x.results.entryFunnel.opened,1);
  assert.equal(x.results.entryFunnel.capitalVariantsStarted,10);
  assert.equal(x.results.entryFunnel.holdVariantsStarted,30);
});

test('W6 entry funnel exposes exactly where candidates fail before entry',()=>{
  const now=11_500_000;
  const x=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[
    {chainId:'solana',tokenAddress:'OLD',symbol:'OLD',priceUsd:1,marketCap:150_000,pairCreatedAt:now-120_000},
    {chainId:'solana',tokenAddress:'SMALL',symbol:'SMALL',priceUsd:1,marketCap:80_000,pairCreatedAt:now-20_000},
    {chainId:'solana',tokenAddress:'NOPRICE',symbol:'NOPRICE',marketCap:120_000,pairCreatedAt:now-20_000},
    {chainId:'solana',tokenAddress:'GOOD2',symbol:'GOOD2',priceUsd:1,marketCap:120_000,pairCreatedAt:now-20_000}
  ]},{now});
  assert.equal(x.results.entryFunnel.rowsSeen,4);
  assert.equal(x.results.entryFunnel.ageWithinLimit,3);
  assert.equal(x.results.entryFunnel.marketCapQualifiedAfterAge,2);
  assert.equal(x.results.entryFunnel.dataCompleteAfterThreshold,1);
  assert.equal(x.results.entryFunnel.eligible,1);
  assert.equal(x.results.entryFunnel.opened,1);
  assert.equal(x.results.entryBlockers.OLDER_THAN_MAX_AGE,1);
  assert.equal(x.results.entryBlockers.MARKET_CAP_BELOW_THRESHOLD,1);
  assert.equal(x.results.entryBlockers.PRICE_UNKNOWN,1);
  assert.equal(x.state.wallets[WALLET_6_USER_99K_60S].positions.length,1);
});

test('user 99k/60s V1 can apply a market-cap exit after the three-minute protection when an explicit floor is configured',()=>{
  const now=12_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'DROP',symbol:'DROP',liquidityUsd:100_000,priceUsd:1,marketCap:130_000,pairCreatedAt:now-20_000
  }]},{now,minExitMarketCapUsd:99_000}).state;
  const next=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'DROP',symbol:'DROP',liquidityUsd:100_000,priceUsd:.8,marketCap:90_000,pairCreatedAt:now-210_000
  }]},{now:now+190_000,minExitMarketCapUsd:99_000});
  assert.equal(next.results.closed,1);
  assert.equal(next.results.marketCapExit,1);
  assert.equal(next.state.wallets[WALLET_6_USER_99K_60S].positions.length,0);
  assert.equal(next.state.wallets[WALLET_6_USER_99K_60S].closed[0].closeReason,'USER_99K_60S_MCAP_TOO_SMALL');
});

test('user 99k/60s V1 observes a +10 SOL reference without auto-closing the position',()=>{
  const now=13_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'TEN',symbol:'TEN',priceUsd:1,marketCap:150_000,pairCreatedAt:now-15_000
  }]},{now,entryNotionalSol:80,targetPnlSol:10}).state;
  const next=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'TEN',symbol:'TEN',priceUsd:1.14,marketCap:171_000,pairCreatedAt:now-45_000
  }]},{now:now+30_000,entryNotionalSol:80,targetPnlSol:10});
  assert.equal(next.results.closed,0);
  assert.equal(next.state.wallets[WALLET_6_USER_99K_60S].positions.length,1);
  const p=next.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.ok(p.estimatedNetPnlSolBeforeSlippage>=10);
  assert.equal(p.targetTracking,'OBSERVATIONAL_ONLY_NO_AUTO_PROFIT_EXIT');
  assert.equal(p.profitTargetScenarios.find(x=>x.entryNotionalSol===80).targetHit,true);
});

test('user 99k/60s V1 tracks expanded 0.5/1/2/3/5/10/20/40/60/80 SOL profit-reference scenarios when actual stake varies',()=>{
  const now=14_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'SIZEGRID',symbol:'SIZEGRID',priceUsd:1,marketCap:120_000,pairCreatedAt:now-20_000
  }]},{now,targetPnlSol:10}).state;
  const next=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'SIZEGRID',symbol:'SIZEGRID',priceUsd:1.14,marketCap:150_000,pairCreatedAt:now-50_000
  }]},{now:now+30_000,targetPnlSol:10});
  const p=next.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  const s80=p.profitTargetScenarios.find(x=>x.entryNotionalSol===80);
  const s40=p.profitTargetScenarios.find(x=>x.entryNotionalSol===40);
  assert.equal(s80.targetHit,true);
  assert.equal(s40.targetHit,false);
  assert.ok(s80.targetPriceReturnApprox>.125);
  assert.equal(next.results.scenarioTargetHits,1);
});


test('user 99k/60s V1 does not invent a market-cap exit threshold',()=>{
  const now=15_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'NOFLOOR',symbol:'NOFLOOR',priceUsd:1,marketCap:130_000,pairCreatedAt:now-20_000
  }]},{now}).state;
  const next=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'NOFLOOR',symbol:'NOFLOOR',priceUsd:.7,marketCap:70_000,pairCreatedAt:now-50_000
  }]},{now:now+30_000});
  assert.equal(next.results.marketCapExit,0);
  assert.equal(next.state.wallets[WALLET_6_USER_99K_60S].positions.length,1);
  assert.equal(next.state.wallets[WALLET_6_USER_99K_60S].positions[0].marketCapExitTracking,'WAITING_FOR_OBSERVED_USER_EXIT_RULE');
});


test('W6 user-marked profit exit closes only the shadow position and records context',()=>{
  const now=16_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'USEREXIT',symbol:'USEREXIT',liquidityUsd:100_000,priceUsd:1,marketCap:130_000,pairCreatedAt:now-20_000
  }]},{now,entryNotionalSol:80}).state;
  const p=state.wallets[WALLET_6_USER_99K_60S].positions[0];
  state=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{chainId:'solana',tokenAddress:'USEREXIT',priceUsd:1.2,marketCap:180_000,liquidityUsd:100_000}]},{now:now+45_000}).state;
  const x=recordUser99k60sExitObservation(state,{
    positionKey:p.positionKey,reason:'USER_PROFIT_ENOUGH',now:now+45_000,priceUsd:1.2,marketCapUsd:180_000
  });
  assert.equal(x.recorded,true);
  assert.equal(x.state.wallets[WALLET_6_USER_99K_60S].positions.length,0);
  const closed=x.state.wallets[WALLET_6_USER_99K_60S].closed[0];
  assert.equal(closed.closeReason,'USER_99K_60S_PROFIT_ENOUGH');
  assert.equal(closed.userExitObservation.reason,'USER_PROFIT_ENOUGH');
  assert.equal(closed.userExitObservation.holdSeconds,45);
  assert.equal(closed.userExitObservation.marketCapUsd,180_000);
  assert.ok(closed.userExitObservation.estimatedNetPnlSolBeforeSlippage>15);
  assert.equal(closed.canExecuteLive,false);
});

test('W6 exit learner remains descriptive until at least 20 marked exits',()=>{
  const now=17_000_000;
  let state=createSpecialistWalletState();
  for(let i=0;i<2;i++){
    const token='LEARN'+i;
    state=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
      chainId:'solana',tokenAddress:token,symbol:token,liquidityUsd:100_000,priceUsd:1,marketCap:120_000,pairCreatedAt:now+i*1000-10_000
    }]},{now:now+i*1000}).state;
    const p=state.wallets[WALLET_6_USER_99K_60S].positions.find(x=>x.tokenAddress===token);
    state=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{chainId:'solana',tokenAddress:token,priceUsd:i===0?1.1:.85,marketCap:120_000,liquidityUsd:100_000}]},{now:now+i*1000+30_000}).state;
    state=recordUser99k60sExitObservation(state,{
      positionKey:p.positionKey,
      reason:i===0?'USER_PROFIT_ENOUGH':'USER_MCAP_TOO_SMALL',
      now:now+i*1000+30_000,
      priceUsd:i===0?1.1:.85,
      marketCapUsd:i===0?160_000:80_000
    }).state;
  }
  const s=user99k60sExitLearningSummary(state,{asOf:now+40_000});
  assert.equal(s.samples,2);
  assert.equal(s.profitEnough.samples,1);
  assert.equal(s.marketCapTooSmall.samples,1);
  assert.equal(s.ruleProposalReady,false);
  assert.equal(s.minimumSamplesBeforeRuleProposal,20);
  assert.equal(s.automaticPolicyMutation,false);
  assert.equal(s.canExecuteLive,false);
});


test('W6 loss-style market-cap exit is protected during the first three minutes',()=>{
  const now=18_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'PROTECT3M',symbol:'PROTECT3M',liquidityUsd:100_000,priceUsd:1,marketCap:120_000,pairCreatedAt:now-20_000
  }]},{now,minExitMarketCapUsd:99_000,minHoldSeconds:180}).state;

  const early=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'PROTECT3M',symbol:'PROTECT3M',liquidityUsd:100_000,priceUsd:.92,marketCap:90_000,pairCreatedAt:now-100_000
  }]},{now:now+120_000,minExitMarketCapUsd:99_000,minHoldSeconds:180});
  assert.equal(early.results.closed,0);
  assert.equal(early.state.wallets[WALLET_6_USER_99K_60S].positions.length,1);

  const later=applyUser99k60sStrategySnapshot(early.state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'PROTECT3M',symbol:'PROTECT3M',liquidityUsd:100_000,priceUsd:.90,marketCap:88_000,pairCreatedAt:now-210_000
  }]},{now:now+190_000,minExitMarketCapUsd:99_000,minHoldSeconds:180});
  assert.equal(later.results.closed,1);
  assert.equal(later.state.wallets[WALLET_6_USER_99K_60S].closed[0].closeReason,'USER_99K_60S_MCAP_TOO_SMALL');
});

test('W6 catastrophic fail-safe is blocked for 3m then closes extreme collapse',()=>{
  const now=18_500_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'CATA',symbol:'CATA',liquidityUsd:100_000,priceUsd:1,marketCap:130_000,pairCreatedAt:now-20_000
  }]},{now,minHoldSeconds:180}).state;

  const protectedDrop=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'CATA',symbol:'CATA',liquidityUsd:100_000,priceUsd:.05,marketCap:6_500,pairCreatedAt:now-140_000
  }]},{now:now+120_000,minHoldSeconds:180});
  assert.equal(protectedDrop.results.closed,0);

  const afterProtection=applyUser99k60sStrategySnapshot(protectedDrop.state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'CATA',symbol:'CATA',liquidityUsd:100_000,priceUsd:.05,marketCap:6_500,pairCreatedAt:now-210_000
  }]},{now:now+190_000,minHoldSeconds:180});
  assert.equal(afterProtection.results.closed,1);
  assert.equal(afterProtection.results.catastrophicExit,1);
  assert.equal(afterProtection.state.wallets[WALLET_6_USER_99K_60S].closed[0].closeReason,'USER_99K_60S_CATASTROPHIC_FAILSAFE');
  assert.equal(afterProtection.state.wallets[WALLET_6_USER_99K_60S].positions.length,0);
});

test('W6 hold lab compares 5m 10m and runner policies across ten SOL sizes',()=>{
  const now=19_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'HOLDGRID',symbol:'HOLDGRID',priceUsd:1,marketCap:120_000,liquidityUsd:100_000,pairCreatedAt:now-15_000
  }]},{now,minHoldSeconds:180,solPriceUsd:150}).state;

  const at5=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'HOLDGRID',symbol:'HOLDGRID',priceUsd:1.10,marketCap:145_000,liquidityUsd:110_000,pairCreatedAt:now-315_000
  }]},{now:now+300_000,minHoldSeconds:180,solPriceUsd:150});
  let p=at5.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.equal(p.holdLab.filter(x=>x.policyId==='HOLD_5M'&&x.status==='CLOSED').length,10);
  assert.equal(p.holdLab.filter(x=>x.policyId==='HOLD_10M'&&x.status==='OPEN').length,10);
  assert.equal(p.holdLab.filter(x=>x.policyId==='RUNNER'&&x.status==='OPEN').length,10);

  const at10=applyUser99k60sStrategySnapshot(at5.state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'HOLDGRID',symbol:'HOLDGRID',priceUsd:1.20,marketCap:165_000,liquidityUsd:120_000,pairCreatedAt:now-615_000
  }]},{now:now+600_000,minHoldSeconds:180,solPriceUsd:150});
  p=at10.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.equal(p.holdLab.filter(x=>x.policyId==='HOLD_10M'&&x.status==='CLOSED').length,10);
  assert.equal(p.holdLab.filter(x=>x.policyId==='RUNNER'&&x.status==='OPEN').length,10);
  assert.equal(p.holdLabSummary.closed,20);
  assert.equal(p.holdLabSummary.best.policyId,'HOLD_10M');
  assert.ok(p.holdLabSummary.best.estimatedSolNeededFor10SolReference>0);
  assert.equal(p.canExecuteLive,false);
});

test('W6 runner can stay open beyond ten minutes while the coin remains healthy',()=>{
  const now=20_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'RUNNERGOOD',symbol:'RUNNERGOOD',priceUsd:1,marketCap:120_000,liquidityUsd:100_000,pairCreatedAt:now-10_000
  }]},{now,minHoldSeconds:180,solPriceUsd:150}).state;
  const at12=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'RUNNERGOOD',symbol:'RUNNERGOOD',priceUsd:1.25,marketCap:180_000,liquidityUsd:130_000,pairCreatedAt:now-730_000
  }]},{now:now+720_000,minHoldSeconds:180,solPriceUsd:150});
  const p=at12.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.equal(p.holdLab.filter(x=>x.policyId==='RUNNER'&&x.status==='OPEN').length,10);
});


test('W6 capital lab penalizes oversized entries when liquidity impact is high',()=>{
  const now=21_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'IMPACT',symbol:'IMPACT',priceUsd:1,marketCap:120_000,liquidityUsd:60_000,pairCreatedAt:now-15_000
  }]},{now,solPriceUsd:150,minHoldSeconds:180}).state;
  const x=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'IMPACT',symbol:'IMPACT',priceUsd:1.30,marketCap:180_000,liquidityUsd:70_000,pairCreatedAt:now-315_000
  }]},{now:now+300_000,solPriceUsd:150,minHoldSeconds:180});
  const p=x.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  const s05=p.holdLab.find(s=>s.id==='HOLD_5M_0.5SOL');
  const s2=p.holdLab.find(s=>s.id==='HOLD_5M_2SOL');
  const s80=p.holdLab.find(s=>s.id==='HOLD_5M_80SOL');
  assert.equal(s05.status,'CLOSED');
  assert.equal(s2.status,'CLOSED');
  assert.equal(s80.status,'CLOSED');
  assert.equal(s2.priceImpactKnown,true);
  assert.equal(s80.priceImpactKnown,true);
  assert.ok(s80.entryImpactPct>s2.entryImpactPct);
  assert.ok(s05.capitalEfficiency>s2.capitalEfficiency);
  assert.ok(s2.capitalEfficiency>s80.capitalEfficiency);
  assert.equal(p.holdLabSummary.best.entryNotionalSol,0.5);
  assert.ok(p.holdLabSummary.entrySizingGuide.normalMaxEntrySol>6);
  assert.ok(p.holdLabSummary.entrySizingGuide.normalMaxEntrySol<6.3);
  assert.equal(p.holdLabSummary.entrySizingGuide.largestTestedNormalSol,5);
  assert.equal(p.holdLabSummary.entrySizingGuide.largestTestedAggressiveSol,10);
  assert.ok(p.holdLabSummary.bestAbsolutePnl);
  assert.ok(p.holdLabSummary.priceImpactCoverage>0);
});

test('W6 healthy runner may remain open after 30m and caps at 60m',()=>{
  const now=22_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'LONGRUN',symbol:'LONGRUN',priceUsd:1,marketCap:120_000,liquidityUsd:100_000,pairCreatedAt:now-10_000
  }]},{now,solPriceUsd:150,minHoldSeconds:180}).state;
  let x=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'LONGRUN',symbol:'LONGRUN',priceUsd:1.40,marketCap:190_000,liquidityUsd:130_000,pairCreatedAt:now-1_810_000
  }]},{now:now+1_800_000,solPriceUsd:150,minHoldSeconds:180});
  let p=x.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.equal(p.holdLab.filter(s=>s.policyId==='RUNNER'&&s.status==='OPEN').length,10);

  x=applyUser99k60sStrategySnapshot(x.state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'LONGRUN',symbol:'LONGRUN',priceUsd:1.50,marketCap:210_000,liquidityUsd:140_000,pairCreatedAt:now-3_610_000
  }]},{now:now+3_600_000,solPriceUsd:150,minHoldSeconds:180});
  p=x.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.equal(p.holdLab.filter(s=>s.policyId==='RUNNER'&&s.status==='CLOSED').length,10);
  assert.ok(p.holdLab.filter(s=>s.policyId==='RUNNER').every(s=>s.closeReason==='RUNNER_MAX_60M'));
});

test('W6 tracking memory cannot trigger an entry after the coin leaves the current trend feed',()=>{
  const now=12_500_000;
  const x=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[
    {
      chainId:'solana',tokenAddress:'OPENONLY',symbol:'OLDOPEN',priceUsd:1,marketCap:150000,
      pairCreatedAt:now-30_000,w6TrackingOnly:true
    },
    {
      chainId:'solana',tokenAddress:'REMEMBERED',symbol:'HOT',priceUsd:1,marketCap:120000,
      pairCreatedAt:now-45_000,candidateTracking:true,w6TrackingOnly:false,signalTrending:false,
      w6LaunchTracker:{firstObservedAgeSeconds:12,first99kObservedAgeSeconds:45,observed99kWithin60:true}
    }
  ]},{now,requireTrending:true});
  assert.equal(x.results.entryFunnel.rowsSeen,1);
  assert.equal(x.results.entryFunnel.eligible,0);
  assert.equal(x.results.entryBlockers.NOT_IN_TREND_FEED,1);
  assert.equal(x.results.opened,0);
});

test('specialist wallet summary strips bidi controls from persisted token labels',()=>{
  const now=12_900_000;
  const x=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'BIDITEST',symbol:'\u202eSA\u202e',name:'\u202eSpoof\u202e',
    priceUsd:1,marketCap:120000,pairCreatedAt:now-20_000
  }]},{now});
  const summary=specialistWalletSummary(x.state,{asOf:now});
  const p=summary.wallets[WALLET_6_USER_99K_60S].active[0];
  assert.equal(p.symbol,'SA');
  assert.equal(p.name,'Spoof');
});

test('W6 runtime market-cap mode can use a labelled free trend proxy without confusing it with exact GMGN',()=>{
  const now=12_950_000;
  const x=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'PROXY99K',symbol:'P99',priceUsd:.001,marketCap:120000,pairCreatedAt:now-25_000,
    signalTrending:true,gmgnExactTrend:false,trendRank:2,trendSource:'FREE_TRENDS_COMPOSITE_GECKO_DEXSCREENER',sourceSetup:'TRENDS_PROXY_RESEARCH'
  }]},{now,requireTrending:true,minMarketCapUsd:99_000,minGreenChangePct:null,requireExactGmgnGreen:false});
  assert.equal(x.results.opened,1);
  assert.equal(x.results.openedExactGmgn,0);
  assert.equal(x.results.openedTrendProxy,1);
  const p=x.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.equal(p.entryThresholdMode,'MARKET_CAP_USD');
  assert.equal(p.entryMarketCapUsd,120000);
  assert.equal(p.trendFidelityAtEntry,'FREE_TRENDS_PROXY');
  assert.equal(p.exactGmgnTrendAtEntry,false);
  assert.equal(p.trendSourceAtEntry,'FREE_TRENDS_COMPOSITE_GECKO_DEXSCREENER');
  assert.equal(p.sourceSetupAtEntry,'TRENDS_PROXY_RESEARCH');
});

test('W6 trend gate rejects a fresh 99k coin that is not in the trend feed',()=>{
  const now=13_000_000;
  const x=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'NOTREND',symbol:'NO',priceUsd:1,marketCap:120000,pairCreatedAt:now-20_000
  }]},{now,requireTrending:true});
  assert.equal(x.results.opened,0);
  assert.equal(x.results.entryBlockers.NOT_IN_TREND_FEED,1);
});

test('W6 exact setup requires current New Pair visibility in addition to trend age and market cap',()=>{
  const now=13_100_000;
  const wrongTab=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'TRENDONLY',symbol:'OLDTAB',priceUsd:1,marketCap:120000,pairCreatedAt:now-20_000,
    signalTrending:true,signalNewPair:false,trendRank:3
  }]},{now,requireTrending:true,requireNewPair:true});
  assert.equal(wrongTab.results.opened,0);
  assert.equal(wrongTab.results.entryBlockers.NOT_IN_NEW_PAIR_FEED,1);

  const x=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'NEWPAIRHOT',symbol:'HOT',priceUsd:1,marketCap:120000,pairCreatedAt:now-20_000,
    signalTrending:true,signalNewPair:true,trendRank:4,sourceSetup:'GMGN_TRENDING_NEW_PAIR_1M'
  }]},{now,requireTrending:true,requireNewPair:true});
  assert.equal(x.results.opened,1);
  const p=x.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.equal(p.trendRankAtEntry,4);
  assert.equal(p.trendVisibleAtEntry,true);
  assert.equal(p.newPairVisibleAtEntry,true);
  assert.equal(p.sourceSetupAtEntry,'GMGN_TRENDING_NEW_PAIR_1M');
});

test('W6 Trends 1m uses the green GMGN percentage threshold, not market cap',()=>{
  const now=13_200_000;
  const base={
    chainId:'solana',tokenAddress:'GREEN999K',symbol:'GREEN',priceUsd:.001,
    marketCap:47_800,pairCreatedAt:now-50_000,
    signalTrending:true,signalNewPair:false,gmgnExactTrend:true,gmgnExactOneMinutePerformance:true,trendRank:4,
    priceChangeSelectedPct:999_000,sourceSetup:'GMGN_TRENDS_1M'
  };
  const x=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{
    sourceReady:true,rows:[base]
  },{
    now,requireTrending:true,requireNewPair:false,
    minGreenChangePct:99_000,requireExactGmgnGreen:true
  });
  assert.equal(x.results.opened,1);
  assert.equal(x.results.entryFunnel.greenPercentKnown,1);
  assert.equal(x.results.entryFunnel.greenPercentQualifiedAfterAge,1);
  const p=x.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.equal(p.entryMarketCapUsd,47_800);
  assert.equal(p.entryGreenPercent,999_000);
  assert.equal(p.entryThresholdMode,'GMGN_GREEN_PERCENT');
  assert.equal(p.entryRule,'GMGN_TRENDS_1M_AND_AGE_LT_120S_AND_GREEN_PERCENT_GTE_99K_THEN_IMMEDIATE_ENTRY');
  assert.equal(p.sourceSetupAtEntry,'GMGN_TRENDS_1M');

  const exact99k=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{
    sourceReady:true,rows:[{...base,tokenAddress:'GREEN99K',priceChangeSelectedPct:99_000}]
  },{
    now,requireTrending:true,requireNewPair:false,
    minGreenChangePct:99_000,requireExactGmgnGreen:true
  });
  assert.equal(exact99k.results.opened,1);

  const tooLow=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{
    sourceReady:true,rows:[{...base,tokenAddress:'GREENLOW',marketCap:250_000,priceChangeSelectedPct:98_999}]
  },{
    now,requireTrending:true,requireNewPair:false,
    minGreenChangePct:99_000,requireExactGmgnGreen:true
  });
  assert.equal(tooLow.results.opened,0);
  assert.equal(tooLow.results.entryBlockers.GMGN_GREEN_PERCENT_BELOW_THRESHOLD,1);

  const fallback=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{
    sourceReady:true,rows:[{...base,tokenAddress:'NOTGMGN',gmgnExactTrend:false}]
  },{
    now,requireTrending:true,requireNewPair:false,
    minGreenChangePct:99_000,requireExactGmgnGreen:true
  });
  assert.equal(fallback.results.opened,0);
  assert.equal(fallback.results.entryBlockers.GMGN_EXACT_1M_REQUIRED,1);
});



test('wallet 6 runs the early-momentum size and hold challenger without changing execution policy',()=>{
  const now=5_000_000;
  const baseRow={
    chainId:'solana',tokenAddress:'EARLYLAB',symbol:'EARLYLAB',
    priceUsd:1,liquidityUsd:20_000,marketCap:120_000,pairCreatedAt:now-30_000,
    signalTrending:true,buysM5:20,sellsM5:8,priceChangeM5:35,
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[]}
  };
  let x=applyUser99k60sStrategySnapshot(
    createSpecialistWalletState(),
    {sourceReady:true,rows:[baseRow]},
    {now,solPriceUsd:150,requireTrending:true}
  );
  assert.equal(x.results.opened,1);
  let p=x.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.equal(p.earlyMomentumChallengerLab.execution,'SHADOW_ONLY');
  assert.equal(p.earlyMomentumChallengerLab.canExecuteLive,false);
  assert.equal(p.earlyMomentumChallengerLab.scenarios.length,35);
  assert.equal(p.earlyMomentumChallengerSummary.automaticPrimaryMutation,false);

  x=applyUser99k60sStrategySnapshot(
    x.state,
    {sourceReady:true,rows:[{...baseRow,priceUsd:1.05,liquidityUsd:19_000}]},
    {now:now+40_000,solPriceUsd:150,requireTrending:true}
  );
  assert.equal(x.results.earlyMomentumScenarioCloses,5);
  assert.equal(x.results.earlyMomentumEntryAgeCloses,0);

  x=applyUser99k60sStrategySnapshot(
    x.state,
    {sourceReady:true,rows:[{...baseRow,priceUsd:1.2,liquidityUsd:18_000}]},
    {now:now+240_000,solPriceUsd:150,requireTrending:true}
  );
  p=x.state.wallets[WALLET_6_USER_99K_60S].positions[0];
  assert.equal(x.results.earlyMomentumScenarioCloses,20);
  assert.ok(x.results.earlyMomentumEntryAgeCloses>=2);
  assert.equal(p.earlyMomentumChallengerSummary.closed,25);
  assert.ok(p.earlyMomentumChallengerSummary.bestCapitalEfficiency);
  assert.ok(p.earlyMomentumChallengerSummary.bestUser4SolPer10kHypothesis);
  assert.ok(p.earlyMomentumChallengerSummary.bestEntryAgeArm);
  assert.equal(p.canExecuteLive,false);
});


test('W6 separates observed mark PnL from liquidity-impact-adjusted executable PnL',()=>{
  const now=30_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'EXEC',symbol:'EXEC',priceUsd:1,marketCap:120_000,liquidityUsd:100_000,
    pairAddress:'POOL_EXEC',dexId:'pumpswap',pairCreatedAt:now-20_000
  }]},{now,entryNotionalSol:20,solPriceUsd:100}).state;

  state=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'EXEC',symbol:'EXEC',priceUsd:2,marketCap:240_000,liquidityUsd:80_000,
    pairAddress:'POOL_EXEC',dexId:'pumpswap',pairCreatedAt:now-30_000
  }]},{now:now+10_000,entryNotionalSol:20,solPriceUsd:100}).state;

  const summary=specialistWalletSummary(state,{asOf:now+10_000});
  const w=summary.wallets[WALLET_6_USER_99K_60S];
  const p=w.active[0];
  assert.ok(p.observedUnrealizedNetPnlQuote>0);
  assert.ok(p.executableUnrealizedNetPnlQuote>0);
  assert.ok(p.executableUnrealizedNetPnlQuote<p.observedUnrealizedNetPnlQuote);
  assert.equal(p.executionPnlStatus,'EXECUTABLE_MODELLED');
  assert.equal(p.executionPnlExecutable,true);
  assert.equal(p.entryPoolAddress,'POOL_EXEC');
  assert.equal(p.currentPoolAddress,'POOL_EXEC');
  assert.equal(w.executableCoverage,1);
  assert.equal(w.netPnlQuote,w.conservativeNetPnlQuote);
  assert.ok(w.observedNetPnlQuote>w.netPnlQuote);
  assert.equal(w.canExecuteLive,false);
});

test('W6 stale positive spot mark is not allowed to remain positive headline PnL',()=>{
  const now=31_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'STALE',symbol:'STALE',priceUsd:1,marketCap:120_000,liquidityUsd:100_000,
    pairAddress:'POOL_STALE',dexId:'pumpswap',pairCreatedAt:now-20_000
  }]},{now,entryNotionalSol:10,solPriceUsd:100}).state;

  state=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'STALE',symbol:'STALE',priceUsd:5,marketCap:600_000,liquidityUsd:90_000,
    pairAddress:'POOL_STALE',dexId:'pumpswap',pairCreatedAt:now-25_000
  }]},{now:now+5_000,entryNotionalSol:10,solPriceUsd:100}).state;

  const fresh=specialistWalletSummary(state,{asOf:now+5_000}).wallets[WALLET_6_USER_99K_60S];
  assert.ok(fresh.observedNetPnlQuote>0);
  assert.ok(fresh.netPnlQuote>0);

  const stale=specialistWalletSummary(state,{asOf:now+25_001}).wallets[WALLET_6_USER_99K_60S];
  assert.ok(stale.observedNetPnlQuote>0);
  assert.equal(stale.executableUnrealizedPnlQuote,null);
  assert.equal(stale.executableNetPnlQuote,null);
  assert.equal(stale.staleOpenPositions,1);
  assert.equal(stale.active[0].executionPnlStatus,'STALE_MARK');
  assert.equal(stale.active[0].executionPnlExecutable,false);
  assert.equal(stale.active[0].conservativeUnrealizedNetPnlQuote,0);
  assert.equal(stale.netPnlQuote,0);
});

test('W6 liquidity death marks the remaining shadow exposure as non-realizable loss',()=>{
  const now=32_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'DEAD',symbol:'DEAD',priceUsd:1,marketCap:120_000,liquidityUsd:100_000,
    pairAddress:'POOL_DEAD',dexId:'pumpswap',pairCreatedAt:now-20_000
  }]},{now,entryNotionalSol:10,solPriceUsd:100}).state;

  state=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'DEAD',symbol:'DEAD',priceUsd:20,marketCap:2_400_000,liquidityUsd:0,
    pairAddress:'POOL_DEAD',dexId:'pumpswap',pairCreatedAt:now-25_000
  }]},{now:now+5_000,entryNotionalSol:10,solPriceUsd:100}).state;

  const w=specialistWalletSummary(state,{asOf:now+5_000}).wallets[WALLET_6_USER_99K_60S];
  const p=state.wallets[WALLET_6_USER_99K_60S].closed[0];
  assert.equal(w.active.length,0);
  assert.ok(p.observedRealizedNetPnlQuote>0);
  assert.equal(p.closeReason,'W6_LIQUIDITY_GONE');
  assert.equal(p.exitProceedsQuote,0);
  assert.equal(p.realizedNetPnlQuote,-100.3);
  assert.equal(p.settlementStatus,'ZERO_RECOVERY_WRITE_OFF');
  assert.equal(w.canExecuteLive,false);
});


test('W6 persists a bounded full coin research dataset for later evaluation',()=>{
  const now=33_000_000;
  const entryRow={
    chainId:'solana',tokenAddress:'RESEARCH',pairAddress:'POOL_RESEARCH',dexId:'pumpswap',
    symbol:'RCH',name:'Research Coin',priceUsd:1,marketCap:120_000,fdv:125_000,liquidityUsd:100_000,
    volumeM5:12_000,volumeH1:30_000,volumeH24:80_000,buysM5:20,sellsM5:8,buysH1:55,sellsH1:30,
    priceChangeM5:18,priceChangeH1:44,pairCreatedAt:now-20_000,firstSeenAt:now-18_000,
    signalTrending:true,signalNewPair:true,signalBoost:true,signalProfile:true,boostAmount:50,
    trendRank:3,trendSource:'DEXSCREENER_LATEST_BOOSTS',ultraSource:'W6_MULTI_FEED_PLUS_DEXSCREENER_BATCH',
    sourceSetup:'TRENDS_PROXY_RESEARCH',marketCapSource:'DEXSCREENER',
    score:{stage:'NEW_NOW',researchPriorityScore:.88,ageMinutes:.33,attentionSignals:['NEW_POOL','BOOST'],riskFlags:['ULTRA_NEW_PAIR']},
    memeSignal:{action:'BUY',entryReadinessScore:.91,blockers:[],missing:[]},
    security:{evidenceGate:'PASS',criticalRiskFlags:[],warningFlags:[],holderState:{top10Share:.31,largestHolderShare:.08,holderCount:430}},
    directSocialAttention:{posts:4,uniqueAuthors:3,engagement:88,attentionBand:'RISING'},
    w6LaunchTracker:{firstObservedAgeSeconds:7,first99kObservedAgeSeconds:20,observed99kWithin120:true}
  };
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[entryRow]},{
    now,entryNotionalSol:10,solPriceUsd:100
  }).state;

  state=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    ...entryRow,priceUsd:1.4,marketCap:168_000,fdv:170_000,liquidityUsd:82_000,
    volumeM5:25_000,buysM5:35,sellsM5:12,priceChangeM5:40
  }]},{now:now+6_000,entryNotionalSol:10,solPriceUsd:100}).state;

  const summary=specialistWalletSummary(state,{asOf:now+6_000});
  const compact=summary.wallets[WALLET_6_USER_99K_60S].active[0].coinResearch;
  assert.equal(compact.version,'BIGGJ_W6_COIN_RESEARCH_DATASET_V1');
  assert.equal(compact.retainedObservations,2);
  assert.equal(compact.entrySnapshot.identity.pairAddress,'POOL_RESEARCH');
  assert.equal(compact.entrySnapshot.sourceFields.volumeM5,12_000);
  assert.equal(compact.entrySnapshot.security.evidenceGate,'PASS');
  assert.equal(compact.entrySnapshot.directSocialAttention.posts,4);
  assert.equal('observations' in compact,false);

  const archive=w6ResearchArchive(state,{asOf:now+6_000,tokenAddress:'RESEARCH'});
  assert.equal(archive.records,1);
  const record=archive.rows[0];
  assert.equal(record.research.observations.length,2);
  assert.equal(record.research.observations[0].phase,'ENTRY');
  assert.equal(record.research.observations[1].phase,'MARK');
  assert.equal(record.research.observations[1].marketCapUsd,168_000);
  assert.equal(record.research.observations[1].liquidityUsd,82_000);
  assert.equal(record.research.observations[1].security.top10Share,.31);
  assert.equal(record.research.observations[1].pairAddress,'POOL_RESEARCH');
  assert.equal(archive.canExecuteLive,false);
});

test('W6 research dataset records provider/feed gaps instead of silently losing them',()=>{
  const now=34_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'GAP',pairAddress:'POOL_GAP',dexId:'pumpswap',
    symbol:'GAP',priceUsd:1,marketCap:120_000,liquidityUsd:60_000,pairCreatedAt:now-20_000
  }]},{now,entryNotionalSol:5,solPriceUsd:100}).state;

  state=applyUser99k60sStrategySnapshot(state,{sourceReady:false,rows:[]},{now:now+20_000,entryNotionalSol:5,solPriceUsd:100}).state;
  const archive=w6ResearchArchive(state,{asOf:now+20_000,tokenAddress:'GAP'});
  const research=archive.rows[0].research;
  assert.equal(research.dataGapCountTotal,1);
  assert.equal(research.dataGaps.length,1);
  assert.equal(research.dataGaps[0].reason,'ROW_MISSING');
  assert.equal(research.dataGaps[0].sourceReady,false);

  const compact=specialistWalletSummary(state,{asOf:now+20_000}).wallets[WALLET_6_USER_99K_60S].active[0].coinResearch;
  assert.equal(compact.dataGapCountTotal,1);
  assert.equal(compact.retainedDataGaps,1);
});

test('W6 finalized coin research record survives the close for post-trade analysis',()=>{
  const now=35_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'CLOSEDATA',pairAddress:'POOL_CLOSE',dexId:'pumpswap',
    symbol:'CLS',priceUsd:1,marketCap:130_000,liquidityUsd:90_000,pairCreatedAt:now-20_000
  }]},{now,minExitMarketCapUsd:99_000,entryNotionalSol:5,solPriceUsd:100}).state;

  state=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'CLOSEDATA',pairAddress:'POOL_CLOSE',dexId:'pumpswap',
    symbol:'CLS',priceUsd:.7,marketCap:80_000,liquidityUsd:30_000,pairCreatedAt:now-210_000
  }]},{now:now+190_000,minExitMarketCapUsd:99_000,entryNotionalSol:5,solPriceUsd:100}).state;

  const archive=w6ResearchArchive(state,{asOf:now+190_000,tokenAddress:'CLOSEDATA'});
  assert.equal(archive.records,1);
  const record=archive.rows[0];
  assert.equal(record.status,'CLOSED');
  assert.equal(record.research.finalized,true);
  assert.equal(record.research.closeReason,'USER_99K_60S_MCAP_TOO_SMALL');
  assert.equal(record.research.observations.at(-1).phase,'EXIT');
  assert.equal(record.research.outcome.closePrice,.7);
  assert.equal(record.research.canExecuteLive,false);
});


test('W6 research analysis ranks only evidence-qualified cohorts and keeps policy mutation disabled',()=>{
  const state=JSON.parse(JSON.stringify(createSpecialistWalletState()));
  const wallet=state.wallets[WALLET_6_USER_99K_60S];
  const makeClosed=({id,age,mc,liq,size,impact,pnl,hold,trend=true})=>({
    walletId:WALLET_6_USER_99K_60S,
    positionKey:'W6:'+id,
    chainId:'solana',
    tokenAddress:id,
    symbol:id,
    status:'CLOSED',
    strategy:'JONAS_CLONE_V1',
    strategyVersion:'JONAS_CLONE_V1',
    strategyContract:'GMGN_NEW_PAIR_1M_GREEN_99K_HOLD_4M_V1',
    entryThresholdMode:'GMGN_GREEN_PERCENT',
    entryGreenPercent:100000,
    exactGmgnTrendAtEntry:true,
    targetHoldSeconds:240,
    openedAt:1_000_000,
    closedAt:1_000_000+hold*1000,
    initialMarginQuote:1000,
    marginQuote:1000,
    entryAgeSeconds:age,
    entryMarketCapUsd:mc,
    entryLiquidityUsd:liq,
    entryNotionalSol:size,
    entryDexId:'pumpswap',
    trendVisibleAtEntry:trend,
    realizedNetPnlQuote:pnl,
    observedRealizedNetPnlQuote:pnl,
    realizableRealizedNetPnlQuote:pnl,
    observedMfeReturnPct:pnl>0?.8:.1,
    observedMaeReturnPct:pnl>0?-.1:-.7,
    coinResearch:{
      version:'BIGGJ_W6_COIN_RESEARCH_DATASET_V1',
      observationCountTotal:12,
      dataGapCountTotal:0,
      entrySnapshot:{
        identity:{chainId:'solana',tokenAddress:id,pairAddress:'POOL_'+id,dexId:'pumpswap',symbol:id,name:id},
        sourceFields:{signalTrending:trend,signalNewPair:true,volumeM5:20_000,buysM5:30,sellsM5:10,priceChangeM5:25},
        score:{researchPriorityScore:.8},
        security:{evidenceGate:'PASS',holderState:{top10Share:.25,largestHolderShare:.08}},
        directSocialAttention:{engagement:100},
        observation:{
          phase:'ENTRY',ageSeconds:age,marketCapUsd:mc,liquidityUsd:liq,
          entryImpactPct:impact,volumeM5:20_000,buysM5:30,sellsM5:10,priceChangeM5:25
        }
      },
      observations:[]
    }
  });
  wallet.closed.push(
    makeClosed({id:'A1',age:20,mc:110_000,liq:150_000,size:5,impact:.02,pnl:500,hold:240}),
    makeClosed({id:'A2',age:25,mc:115_000,liq:160_000,size:5,impact:.02,pnl:300,hold:260}),
    makeClosed({id:'B1',age:100,mc:190_000,liq:30_000,size:20,impact:.12,pnl:-700,hold:360}),
    makeClosed({id:'B2',age:105,mc:200_000,liq:28_000,size:20,impact:.13,pnl:-500,hold:380})
  );

  const analysis=w6ResearchAnalysis(state,{asOf:2_000_000,minCohortSamples:2,minCorrelationSamples:5});
  assert.equal(analysis.counts.closed,4);
  assert.equal(analysis.counts.completeEntrySnapshots,4);
  assert.equal(analysis.evidenceReady,true);
  assert.equal(analysis.automaticPolicyMutation,false);
  assert.equal(analysis.recommendationAuthority,'RESEARCH_ONLY_REQUIRE_HUMAN_REVIEW_AND_OUT_OF_SAMPLE_CONFIRMATION');
  assert.ok(analysis.strongestPositiveCohorts.some(x=>x.dimension==='ageBucket'&&x.value==='LT_30S'));
  assert.ok(analysis.strongestNegativeCohorts.some(x=>x.dimension==='ageBucket'&&x.value==='90_120S'));
  assert.ok(analysis.cohorts.entryImpactBucket.some(x=>x.value==='LT_3PCT'&&x.samples===2&&x.averagePnlQuote>0));
  assert.ok(analysis.cohorts.entryImpactBucket.some(x=>x.value==='GTE_10PCT'&&x.samples===2&&x.averagePnlQuote<0));
  assert.ok(analysis.correlations.every(x=>x.evidenceReady===false));
  assert.equal(analysis.execution,'SHADOW_ONLY');
  assert.equal(analysis.canExecuteLive,false);
});

test('W6 research analysis stays COLLECTING when closed sample is below the evidence gate',()=>{
  const state=JSON.parse(JSON.stringify(createSpecialistWalletState()));
  state.wallets[WALLET_6_USER_99K_60S].closed.push({
    walletId:WALLET_6_USER_99K_60S,positionKey:'ONE',chainId:'solana',tokenAddress:'ONE',symbol:'ONE',
    status:'CLOSED',strategy:'JONAS_CLONE_V1',strategyVersion:'JONAS_CLONE_V1',
    strategyContract:'GMGN_NEW_PAIR_1M_GREEN_99K_HOLD_4M_V1',entryThresholdMode:'GMGN_GREEN_PERCENT',
    entryGreenPercent:100000,exactGmgnTrendAtEntry:true,targetHoldSeconds:240,
    openedAt:1_000,closedAt:181_000,initialMarginQuote:100,marginQuote:100,
    entryAgeSeconds:40,entryMarketCapUsd:120_000,entryLiquidityUsd:50_000,entryNotionalSol:5,
    realizedNetPnlQuote:10,observedRealizedNetPnlQuote:10,realizableRealizedNetPnlQuote:10,
    coinResearch:{version:'BIGGJ_W6_COIN_RESEARCH_DATASET_V1',observationCountTotal:3,dataGapCountTotal:1,entrySnapshot:null,observations:[]}
  });
  const analysis=w6ResearchAnalysis(state,{asOf:200_000,minCohortSamples:5,minCorrelationSamples:10});
  assert.equal(analysis.status,'COLLECTING');
  assert.equal(analysis.evidenceReady,false);
  assert.equal(analysis.counts.closed,1);
  assert.equal(analysis.counts.completeEntrySnapshots,0);
  assert.equal(analysis.counts.legacyOrIncompleteEntrySnapshots,1);
  assert.equal(analysis.counts.totalDataGaps,1);
  assert.equal(analysis.strongestPositiveCohorts.length,0);
  assert.equal(analysis.strongestNegativeCohorts.length,0);
});
