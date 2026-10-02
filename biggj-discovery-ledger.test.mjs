import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import {
  BIGGJ_DISCOVERY_LEDGER_VERSION,
  createBiggjDiscoveryLedger,
  refreshBiggjDiscoveryLedger,
  biggjDiscoveryLedgerSummary,
  loadBiggjDiscoveryLedger,
  saveBiggjDiscoveryLedger
} from './biggj-discovery-ledger.mjs';

function temple({lawStatus='COLLECTING',lawSamples=10,validated=false,robust=false,withNilometer=true,withInvariant=true}={}){
  const candidate={
    from:'15m',to:'30m',fromState:'S17',toState:'S45',forwardHorizon:'1h',
    independentCases:lawSamples,holdoutCases:Math.max(0,lawSamples-6),contextsEligible:2,
    direction:'POSITIVE',
    validation:{medianReturn:.12,positiveRate:.7},
    confidenceSupported:robust,validated,robust,status:lawStatus
  };
  return {
    transitionLaws:{
      candidates:lawStatus==='COLLECTING'?[]:[candidate],
      collecting:lawStatus==='COLLECTING'?[{
        from:'15m',to:'30m',fromState:'S17',toState:'S45',forwardHorizon:'1h',
        samples:lawSamples,required:22
      }]:[]
    },
    nilometers:{
      oneHour:{
        horizon:'1h',
        candidates:withNilometer?[{
          featureId:'logLiquidity',trainSamples:30,validationSamples:12,trainRho:.42,
          validationRho:.31,direction:'HIGHER_ASSOCIATED_WITH_HIGHER_RETURN',
          informationScore:.36,status:'NILOMETER_CANDIDATE'
        }]:[]
      },
      fourHour:{horizon:'4h',candidates:[]}
    },
    invariants:{
      from:'15m',to:'1h',
      candidates:withInvariant?[{
        stateId:'S63',contexts:2,samples:12,direction:'POSITIVE',
        invariant:true,status:'SCALE_INVARIANT_CANDIDATE'
      }]:[]
    }
  };
}
function factory({patternStatus='WALK_FORWARD_VALIDATED',validationSamples=10}={}){
  return {
    patternMiner:{
      walkForward1h:{
        horizon:'1h',
        patterns:[{
          pattern:'SECURITY:solana|UNKNOWN|LIQ_LT10K',
          validated:patternStatus==='WALK_FORWARD_VALIDATED',
          status:patternStatus,
          train:{samples:30,averageReturn:-.30},
          validation:{samples:validationSamples,averageReturn:-.28,medianReturn:-.20,positiveRate:.1,severeLossRate:.3}
        }]
      },
      walkForward4h:{horizon:'4h',patterns:[]}
    }
  };
}
function worlds({completed=false}={}){
  return {
    worlds:[{
      worldId:'WORLD_EDGE_HUNTER',
      strategyId:'EDGE_HUNTER',
      label:'Edge Hunter',
      doctrine:{name:'Edge World'},
      recentGenerations:completed?[{
        generation:1,
        genomeId:'wg_1',
        mutation:{field:'minProbabilityEdge',before:.14,after:.155,direction:'TIGHTEN'},
        evidence:{closed:8,winRate:.625,meanReturn:.02,expectancyQuote:1.2,maxDrawdownPct:.08},
        status:'COMPLETED_FORWARD_SHADOW_GENERATION'
      }]:[]
    }]
  };
}

test('creates durable first-seen entries from multiple discovery sources',()=>{
  const start=createBiggjDiscoveryLedger({now:1});
  const r=refreshBiggjDiscoveryLedger(start,{
    temporalTemple:temple(),
    evidenceFactory:factory(),
    parallelWorlds:worlds({completed:true}),
    asOf:10
  });
  assert.equal(r.changed,true);
  assert.equal(r.delta.newEntries,5);
  const summary=biggjDiscoveryLedgerSummary(r.state,{asOf:10});
  assert.equal(summary.version,BIGGJ_DISCOVERY_LEDGER_VERSION);
  assert.equal(summary.total,5);
  assert.ok(summary.topDiscoveries.some(x=>x.type==='TRANSITION_LAW'&&x.currentStatus==='COLLECTING'));
  assert.ok(summary.topDiscoveries.some(x=>x.type==='WALK_FORWARD_PATTERN'));
  assert.ok(summary.topDiscoveries.some(x=>x.type==='NILOMETER_PROXY'));
  assert.ok(summary.topDiscoveries.some(x=>x.type==='SCALE_INVARIANT'));
  assert.ok(summary.topDiscoveries.some(x=>x.type==='WORLD_GENERATION'));
  assert.equal(summary.canExecuteLive,false);
  assert.equal(summary.automaticPromotion,false);
});

test('same hypothesis advances through lifecycle instead of creating duplicate entries',()=>{
  let state=createBiggjDiscoveryLedger({now:1});
  state=refreshBiggjDiscoveryLedger(state,{
    temporalTemple:temple({lawStatus:'COLLECTING',lawSamples:12}),
    evidenceFactory:factory(),
    asOf:100
  }).state;
  const first=state.entries.find(x=>x.type==='TRANSITION_LAW');
  assert.equal(first.currentStatus,'COLLECTING');

  const r=refreshBiggjDiscoveryLedger(state,{
    temporalTemple:temple({lawStatus:'FORWARD_LAW_CANDIDATE',lawSamples:28,validated:true}),
    evidenceFactory:factory(),
    asOf:200
  });
  const laws=r.state.entries.filter(x=>x.type==='TRANSITION_LAW');
  assert.equal(laws.length,1);
  assert.equal(laws[0].currentStatus,'FORWARD_LAW_CANDIDATE');
  assert.equal(laws[0].validated,true);
  assert.ok(laws[0].events.some(x=>x.kind==='STATUS_CHANGE'&&x.previousStatus==='COLLECTING'));
  assert.equal(r.delta.statusChanges,1);
});

test('falsification is preserved as a useful discovery lifecycle state',()=>{
  let state=createBiggjDiscoveryLedger({now:1});
  state=refreshBiggjDiscoveryLedger(state,{
    temporalTemple:temple({lawStatus:'FORWARD_LAW_CANDIDATE',lawSamples:30,validated:true}),
    evidenceFactory:factory(),
    asOf:100
  }).state;
  state=refreshBiggjDiscoveryLedger(state,{
    temporalTemple:temple({lawStatus:'FAILED_FORWARD_VALIDATION',lawSamples:36,validated:false}),
    evidenceFactory:factory({patternStatus:'FAILED_VALIDATION',validationSamples:14}),
    asOf:200
  }).state;
  const s=biggjDiscoveryLedgerSummary(state,{asOf:200});
  assert.ok(s.falsified>=2);
  assert.ok(s.recentlyFalsified.some(x=>x.type==='TRANSITION_LAW'&&x.currentStatus==='FAILED_FORWARD_VALIDATION'));
  assert.ok(s.recentlyFalsified.some(x=>x.type==='WALK_FORWARD_PATTERN'&&x.currentStatus==='FAILED_VALIDATION'));
});

test('sample milestones create sparse lifecycle events instead of one event per refresh',()=>{
  let state=createBiggjDiscoveryLedger({now:1});
  state=refreshBiggjDiscoveryLedger(state,{
    temporalTemple:temple({lawStatus:'COLLECTING',lawSamples:8,withNilometer:false,withInvariant:false}),
    evidenceFactory:{patternMiner:{walkForward1h:{horizon:'1h',patterns:[]},walkForward4h:{horizon:'4h',patterns:[]}}},
    asOf:100
  }).state;
  const key=state.entries[0].key;
  const events1=state.entries[0].events.length;

  state=refreshBiggjDiscoveryLedger(state,{
    temporalTemple:temple({lawStatus:'COLLECTING',lawSamples:9,withNilometer:false,withInvariant:false}),
    evidenceFactory:{patternMiner:{walkForward1h:{horizon:'1h',patterns:[]},walkForward4h:{horizon:'4h',patterns:[]}}},
    asOf:110
  }).state;
  assert.equal(state.entries.find(x=>x.key===key).events.length,events1);

  state=refreshBiggjDiscoveryLedger(state,{
    temporalTemple:temple({lawStatus:'COLLECTING',lawSamples:16,withNilometer:false,withInvariant:false}),
    evidenceFactory:{patternMiner:{walkForward1h:{horizon:'1h',patterns:[]},walkForward4h:{horizon:'4h',patterns:[]}}},
    asOf:120
  }).state;
  assert.ok(state.entries.find(x=>x.key===key).events.some(x=>x.kind==='SAMPLE_MILESTONE'&&x.sampleBucket===16));
});

test('robust transition law sorts to top but still has no authority',()=>{
  let state=createBiggjDiscoveryLedger({now:1});
  state=refreshBiggjDiscoveryLedger(state,{
    temporalTemple:temple({lawStatus:'ROBUST_FORWARD_LAW_CANDIDATE',lawSamples:48,validated:true,robust:true}),
    evidenceFactory:factory(),
    asOf:100
  }).state;
  const s=biggjDiscoveryLedgerSummary(state,{asOf:100});
  assert.equal(s.robust,1);
  assert.equal(s.topDiscoveries[0].type,'TRANSITION_LAW');
  assert.equal(s.topDiscoveries[0].currentStatus,'ROBUST_FORWARD_LAW_CANDIDATE');
  assert.equal(s.topDiscoveries[0].authority,'NONE');
});

test('ledger persists and reloads',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'biggj-discovery-ledger-'));
  const file=path.join(dir,'ledger.json');
  let state=createBiggjDiscoveryLedger({now:1});
  state=refreshBiggjDiscoveryLedger(state,{
    temporalTemple:temple(),evidenceFactory:factory(),parallelWorlds:worlds({completed:true}),asOf:100
  }).state;
  await saveBiggjDiscoveryLedger(file,state);
  const loaded=await loadBiggjDiscoveryLedger(file,{now:200});
  assert.equal(loaded.healthy,true);
  assert.equal(loaded.state.entries.length,state.entries.length);
  assert.equal(loaded.state.version,BIGGJ_DISCOVERY_LEDGER_VERSION);
});
