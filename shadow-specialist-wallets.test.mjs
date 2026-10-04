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


test('user 99k/60s V1 matches only coins already above 99k within 60 seconds',()=>{
  const now=10_000_000;
  const good=evaluateUser99k60sEntry({
    priceUsd:.001,marketCap:105_000,pairCreatedAt:now-42_000
  },{now});
  assert.equal(good.version,USER_99K_60S_STRATEGY_VERSION);
  assert.equal(good.match,true);
  assert.equal(good.action,'BUY_SHADOW');
  assert.equal(good.observedTimeTo99kSeconds,42);
  assert.equal(good.canExecuteLive,false);

  const old=evaluateUser99k60sEntry({
    priceUsd:.001,marketCap:150_000,pairCreatedAt:now-61_000
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
  assert.equal(p.entryRule,'AGE_LTE_60S_AND_MARKET_CAP_GTE_99K_IMMEDIATE');
  assert.equal(p.targetTracking,'OBSERVATIONAL_ONLY_NO_AUTO_PROFIT_EXIT');
  assert.deepEqual(p.profitTargetScenarios.map(x=>x.entryNotionalSol),[10,20,40,80]);
  assert.equal(p.canExecuteLive,false);
});

test('user 99k/60s V1 can apply a market-cap exit only when an explicit floor is configured',()=>{
  const now=12_000_000;
  let state=applyUser99k60sStrategySnapshot(createSpecialistWalletState(),{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'DROP',symbol:'DROP',priceUsd:1,marketCap:130_000,pairCreatedAt:now-20_000
  }]},{now,minExitMarketCapUsd:99_000}).state;
  const next=applyUser99k60sStrategySnapshot(state,{sourceReady:true,rows:[{
    chainId:'solana',tokenAddress:'DROP',symbol:'DROP',priceUsd:.8,marketCap:90_000,pairCreatedAt:now-50_000
  }]},{now:now+30_000,minExitMarketCapUsd:99_000});
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

test('user 99k/60s V1 tracks separate 10/20/40/80 SOL profit-target scenarios when actual stake varies',()=>{
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
    chainId:'solana',tokenAddress:'USEREXIT',symbol:'USEREXIT',priceUsd:1,marketCap:130_000,pairCreatedAt:now-20_000
  }]},{now,entryNotionalSol:80}).state;
  const p=state.wallets[WALLET_6_USER_99K_60S].positions[0];
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
      chainId:'solana',tokenAddress:token,symbol:token,priceUsd:1,marketCap:120_000,pairCreatedAt:now+i*1000-10_000
    }]},{now:now+i*1000}).state;
    const p=state.wallets[WALLET_6_USER_99K_60S].positions.find(x=>x.tokenAddress===token);
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
