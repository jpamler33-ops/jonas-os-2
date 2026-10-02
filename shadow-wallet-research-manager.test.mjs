import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHADOW_WALLET_RESEARCH_MANAGER_VERSION,
  createShadowWalletResearchManager,
  walletResearchCandidateDecision,
  refreshShadowWalletResearchManager,
  shadowWalletResearchManagerSummary
} from './shadow-wallet-research-manager.mjs';

function candidate(i,overrides={}){
  return {
    challengerDecisionKey:'decision-'+i,
    directionalProbability:.60,
    probabilityEdge:.12,
    expectedReturn:.004,
    horizonMs:15*60_000,
    discoveryStrength:.70,
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    ...overrides
  };
}
function closed(i,{epochId,arm,pnl=1,ret=.004,closedAt=10_000+i}={}){
  return {
    positionId:'p'+i,
    status:'CLOSED',
    entryMode:'CHALLENGER',
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    walletResearchEpochId:epochId,
    walletResearchArm:arm,
    realizedNetPnlQuote:pnl,
    realizedReturnPct:ret,
    closedAt
  };
}
function armCandidate(state,arm,overrides={}){
  for(let i=0;i<10_000;i++){
    const c=candidate(i,overrides);
    const d=walletResearchCandidateDecision(state,c);
    if(d.arm===arm) return {candidate:c,decision:d};
  }
  throw new Error('ARM_NOT_FOUND');
}

test('manager starts fail-closed in shadow-only mode with one active wheel',()=>{
  const s=createShadowWalletResearchManager({asOf:1000});
  assert.equal(s.version,SHADOW_WALLET_RESEARCH_MANAGER_VERSION);
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.canExecute,false);
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.automaticPrimaryMutation,false);
  assert.equal(s.automaticProductionPromotion,false);
  assert.equal(s.epochNumber,1);
  assert.equal(s.activeExperiment.wheelId,'MIN_DIRECTIONAL_PROBABILITY');
});

test('control and experiment share locked policy while only experiment receives the active one-factor filter',()=>{
  const s=createShadowWalletResearchManager({asOf:1000});
  const control=armCandidate(s,'CONTROL',{directionalProbability:.56});
  const experiment=armCandidate(s,'EXPERIMENT',{directionalProbability:.56});
  assert.equal(control.decision.allowed,true);
  assert.equal(experiment.decision.allowed,false);
  assert.equal(experiment.decision.reason,'ACTIVE_EXPERIMENT_FILTERED');
  assert.equal(experiment.decision.activeConstraint.wheelId,'MIN_DIRECTIONAL_PROBABILITY');

  const passing=armCandidate(s,'EXPERIMENT',{directionalProbability:.64});
  assert.equal(passing.decision.allowed,true);
  assert.equal(passing.decision.epochId,s.activeExperiment.epochId);
});

test('a materially better experiment is locked and the next epoch changes only the next wheel',()=>{
  const s=createShadowWalletResearchManager({asOf:1000});
  const id=s.activeExperiment.epochId;
  const positions=[];
  for(let i=0;i<25;i++){
    positions.push(closed(i,{epochId:id,arm:'CONTROL',pnl:-1,ret:-.003,closedAt:2000+i}));
    positions.push(closed(100+i,{epochId:id,arm:'EXPERIMENT',pnl:2,ret:.006,closedAt:3000+i}));
  }
  const out=refreshShadowWalletResearchManager(s,{positions},{
    asOf:5000,targetArmTrades:25,minImprovementScore:.03
  });
  assert.equal(out.reviewed,true);
  assert.equal(out.decision.lock,true);
  assert.equal(out.state.lockedConstraints.length,1);
  assert.equal(out.state.lockedConstraints[0].wheelId,'MIN_DIRECTIONAL_PROBABILITY');
  assert.equal(out.state.epochNumber,2);
  assert.equal(out.state.activeExperiment.wheelId,'MIN_PROBABILITY_EDGE');
  assert.notEqual(out.state.activeExperiment.epochId,id);
  assert.equal(out.state.history.length,1);
});

test('a worse experiment is rejected and the same wheel turns to its next value',()=>{
  const s=createShadowWalletResearchManager({asOf:1000});
  const id=s.activeExperiment.epochId;
  const positions=[];
  for(let i=0;i<25;i++){
    positions.push(closed(i,{epochId:id,arm:'CONTROL',pnl:2,ret:.006,closedAt:2000+i}));
    positions.push(closed(100+i,{epochId:id,arm:'EXPERIMENT',pnl:-1,ret:-.003,closedAt:3000+i}));
  }
  const out=refreshShadowWalletResearchManager(s,{positions},{asOf:5000,targetArmTrades:25});
  assert.equal(out.reviewed,true);
  assert.equal(out.decision.lock,false);
  assert.equal(out.state.lockedConstraints.length,0);
  assert.equal(out.state.activeExperiment.wheelId,'MIN_DIRECTIONAL_PROBABILITY');
  assert.equal(out.state.activeExperiment.valueIndex,1);
  assert.equal(out.state.activeExperiment.value,.62);
});

test('each tactic reset creates a fresh epoch without deleting prior evidence',()=>{
  const s=createShadowWalletResearchManager({asOf:1000});
  const id=s.activeExperiment.epochId;
  const positions=[];
  for(let i=0;i<25;i++){
    positions.push(closed(i,{epochId:id,arm:'CONTROL',pnl:2,ret:.006}));
    positions.push(closed(100+i,{epochId:id,arm:'EXPERIMENT',pnl:-1,ret:-.003}));
  }
  const first=refreshShadowWalletResearchManager(s,{positions},{asOf:5000,targetArmTrades:25});
  const summary=shadowWalletResearchManagerSummary(first.state,{positions},{asOf:5100,targetArmTrades:25});
  assert.equal(summary.control.trades,0);
  assert.equal(summary.experiment.trades,0);
  assert.equal(summary.completedEpochs,1);
  assert.equal(summary.lastDecision.epochId,id);
});

test('review can trigger on elapsed time but still requires evidence in both arms',()=>{
  const s=createShadowWalletResearchManager({asOf:1000});
  const id=s.activeExperiment.epochId;
  const positions=[];
  for(let i=0;i<8;i++){
    positions.push(closed(i,{epochId:id,arm:'CONTROL',pnl:-1,ret:-.003}));
    positions.push(closed(100+i,{epochId:id,arm:'EXPERIMENT',pnl:2,ret:.006}));
  }
  const early=refreshShadowWalletResearchManager(s,{positions},{
    asOf:1000+2*60*60_000,targetArmTrades:25,minTimedArmTrades:8,maxEpochMs:4*60*60_000
  });
  assert.equal(early.reviewed,false);
  const timed=refreshShadowWalletResearchManager(s,{positions},{
    asOf:1000+4*60*60_000+1,targetArmTrades:25,minTimedArmTrades:8,maxEpochMs:4*60*60_000
  });
  assert.equal(timed.reviewed,true);
  assert.equal(timed.decision.lock,true);
});

test('manager objective explicitly optimizes robust edge rather than win rate alone',()=>{
  const s=createShadowWalletResearchManager({asOf:1000});
  const summary=shadowWalletResearchManagerSummary(s,{positions:[]},{asOf:2000});
  assert.equal(summary.method,'ONE_FACTOR_RANDOMIZED_CONTROL_RATCHET');
  assert.equal(summary.objective,'IMPROVE_EXPECTANCY_PROFIT_FACTOR_AND_STABILITY_NOT_WIN_RATE_ALONE');
  assert.equal(summary.canExecuteLive,false);
});
