import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import {
  PARALLEL_STRATEGY_WORLDS_VERSION,
  createParallelStrategyWorlds,
  refreshParallelStrategyWorlds,
  parallelStrategyWorldProfile,
  parallelStrategyWorldsSummary,
  loadParallelStrategyWorlds,
  saveParallelStrategyWorlds
} from './parallel-strategy-worlds.mjs';

const BASE=[
  {id:'SCOUT',label:'Scout',horizonSelection:'MAX_EDGE',minExpectedReturn:.0012,minDirectionalProbability:.54,minProbabilityEdge:.06,notionalMultiplier:.30,assetClasses:['CORE','MEME']},
  {id:'BALANCED',label:'Balanced',horizonSelection:'MAX_RETURN',minExpectedReturn:.002,minDirectionalProbability:.56,minProbabilityEdge:.08,notionalMultiplier:.50,assetClasses:['CORE','MEME']},
  {id:'DEFENSIVE',label:'Defensive',horizonSelection:'SHORTEST',minExpectedReturn:.0035,minDirectionalProbability:.64,minProbabilityEdge:.16,notionalMultiplier:.65,assetClasses:['CORE','MEME']},
  {id:'EDGE_HUNTER',label:'Edge Hunter',horizonSelection:'MAX_EDGE',minExpectedReturn:.003,minDirectionalProbability:.60,minProbabilityEdge:.14,notionalMultiplier:.85,assetClasses:['CORE','MEME']},
  {id:'RETURN_HUNTER',label:'Return Hunter',horizonSelection:'MAX_RETURN',minExpectedReturn:.004,minDirectionalProbability:.60,minProbabilityEdge:.12,notionalMultiplier:.85,assetClasses:['CORE','MEME']},
  {id:'LONG_VIEW',label:'Long View',horizonSelection:'LONGEST',minExpectedReturn:.003,minDirectionalProbability:.58,minProbabilityEdge:.10,notionalMultiplier:.75,assetClasses:['CORE','MEME']},
  {id:'MEME_SPECIALIST',label:'Meme Specialist',horizonSelection:'MAX_EDGE',minExpectedReturn:.006,minDirectionalProbability:.66,minProbabilityEdge:.20,notionalMultiplier:.55,assetClasses:['MEME']}
];

function closed({strategyId,genomeId,i,pnl=1,ret=.01}){
  return {
    status:'CLOSED',
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    leagueStrategyId:strategyId,
    leagueGenomeId:genomeId,
    symbol:['BTCUSDT','ETHUSDT','SOLUSDT'][i%3],
    closedAt:1_000_000+i*60_000,
    realizedNetPnlQuote:pnl,
    realizedReturnPct:ret
  };
}

test('creates one isolated world per strategy with independent genome lineage',()=>{
  const s=createParallelStrategyWorlds(BASE,{now:1});
  assert.equal(s.version,PARALLEL_STRATEGY_WORLDS_VERSION);
  assert.equal(s.worlds.length,BASE.length);
  assert.equal(new Set(s.worlds.map(x=>x.currentGenome.genomeId)).size,BASE.length);
  assert.equal(s.automaticPrimaryMutation,false);
  assert.equal(s.canExecuteLive,false);
});

test('does not evolve a world before forward shadow sample floor',()=>{
  const s=createParallelStrategyWorlds(BASE,{now:1});
  const scout=s.worlds.find(x=>x.strategyId==='SCOUT');
  const rows=Array.from({length:7},(_,i)=>closed({strategyId:'SCOUT',genomeId:scout.currentGenome.genomeId,i,pnl:1,ret:.01}));
  const r=refreshParallelStrategyWorlds(s,{baseStrategies:BASE,leaguePositions:rows,asOf:2_000_000,minClosedPerGeneration:8});
  assert.equal(r.changed,true);
  const after=r.state.worlds.find(x=>x.strategyId==='SCOUT');
  assert.equal(after.generation,1);
  assert.equal(after.currentGenome.status,'MEASURING');
});

test('evolves exactly one bounded parameter after a completed forward generation',()=>{
  const s=createParallelStrategyWorlds(BASE,{now:1});
  const scout=s.worlds.find(x=>x.strategyId==='SCOUT');
  const rows=Array.from({length:8},(_,i)=>closed({
    strategyId:'SCOUT',
    genomeId:scout.currentGenome.genomeId,
    i,
    pnl:i<3?-2:1,
    ret:i<3?-.02:.01
  }));
  const r=refreshParallelStrategyWorlds(s,{baseStrategies:BASE,leaguePositions:rows,asOf:2_000_000,minClosedPerGeneration:8});
  assert.equal(r.changed,true);
  const after=r.state.worlds.find(x=>x.strategyId==='SCOUT');
  assert.equal(after.generation,2);
  assert.equal(after.history.length,1);
  assert.equal(after.history[0].evidence.closed,8);
  assert.equal(after.currentGenome.parentGenomeId,scout.currentGenome.genomeId);
  assert.equal(after.currentGenome.mutation.oneFactor,true);
  const before=after.history[0].profile;
  const next=after.currentGenome.profile;
  const changedFields=['minExpectedReturn','minDirectionalProbability','minProbabilityEdge','horizonSelection']
    .filter(k=>String(before[k])!==String(next[k]));
  assert.equal(changedFields.length,1);
  assert.equal(changedFields[0],after.currentGenome.mutation.field);
  assert.equal(after.currentGenome.status,'AWAITING_FORWARD_TRADES');
});

test('legacy positions without genome identity cannot drive self-mutation',()=>{
  const s=createParallelStrategyWorlds(BASE,{now:1});
  const rows=Array.from({length:50},(_,i)=>({
    ...closed({strategyId:'EDGE_HUNTER',genomeId:'',i,pnl:5,ret:.05}),
    leagueGenomeId:null
  }));
  const r=refreshParallelStrategyWorlds(s,{baseStrategies:BASE,leaguePositions:rows,asOf:2_000_000,minClosedPerGeneration:8});
  const edge=r.state.worlds.find(x=>x.strategyId==='EDGE_HUNTER');
  assert.equal(edge.generation,1);
  assert.equal(edge.currentGenome.evidence.closed,0);
});

test('world profile overlays only research strategy parameters and preserves asset classes',()=>{
  const s=createParallelStrategyWorlds(BASE,{now:1});
  const p=parallelStrategyWorldProfile(s,'EDGE_HUNTER',BASE.find(x=>x.id==='EDGE_HUNTER'));
  assert.equal(p.strategyId,'EDGE_HUNTER');
  assert.ok(p.genomeId);
  assert.equal(p.generation,1);
  assert.deepEqual(p.profile.assetClasses,['CORE','MEME']);
  assert.equal(p.profile.notionalMultiplier,.85);
});

test('world council can expose independent convergence without calling it validation',()=>{
  let s=createParallelStrategyWorlds(BASE,{now:1});
  const rows=[];
  for(const id of ['SCOUT','BALANCED']){
    const w=s.worlds.find(x=>x.strategyId===id);
    for(let i=0;i<8;i++) rows.push(closed({strategyId:id,genomeId:w.currentGenome.genomeId,i,pnl:-2,ret:-.02}));
  }
  s=refreshParallelStrategyWorlds(s,{baseStrategies:BASE,leaguePositions:rows,asOf:2_000_000,minClosedPerGeneration:8}).state;
  const summary=parallelStrategyWorldsSummary(s);
  assert.equal(summary.worldCount,BASE.length);
  assert.equal(summary.canExecuteLive,false);
  for(const c of summary.council.convergences) assert.match(c.meaning,/NOT_VALIDATION/);
});

test('temporal discoveries expand research context but do not gain authority',()=>{
  const s=createParallelStrategyWorlds(BASE,{now:1});
  const r=refreshParallelStrategyWorlds(s,{
    baseStrategies:BASE,
    leaguePositions:[],
    temporalTemple:{transitionLaws:{candidates:[{validated:true,fromState:'S17',toState:'S45',forwardHorizon:'4h'}]}},
    learnedChallenger:{topRule:{ruleId:'lc_x',status:'QUALIFIED'}},
    asOf:2_000_000
  });
  const edge=r.state.worlds.find(x=>x.strategyId==='EDGE_HUNTER');
  assert.ok(edge.extensions.some(x=>x.id==='TEMPORAL_TRANSITION_CONTEXT'&&x.authority==='NONE'));
  assert.ok(edge.extensions.some(x=>x.id==='LEARNED_RULE_CROSS_POLLINATION'&&x.authority==='NONE'));
});

test('parallel world state persists and reloads',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'biggj-worlds-'));
  const file=path.join(dir,'worlds.json');
  const s=createParallelStrategyWorlds(BASE,{now:1});
  await saveParallelStrategyWorlds(file,s);
  const loaded=await loadParallelStrategyWorlds(file,{baseStrategies:BASE,now:2});
  assert.equal(loaded.healthy,true);
  assert.equal(loaded.state.worlds.length,BASE.length);
  assert.equal(loaded.state.canExecuteLive,false);
});
