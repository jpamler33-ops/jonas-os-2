import { auditMarketSnapshot, auditWitnessReport, auditEngineResult, determineSafetyState } from './institutional-kernel.mjs';

function clone(x){ return JSON.parse(JSON.stringify(x)); }

export function baselineChaosFixture(now=1_000_000){
  return {
    now,
    market:{
      symbol:'BTCUSDT',price:100,bid:99.99,ask:100.01,spreadBps:2,imbalance:0.2,
      timestamp:now-100,availableAt:now-50,source:'CHAOS_FIXTURE',version:'v1'
    },
    witness:{
      externalWitnessCount:2,agreementScore:0.82,independentWitnessSatisfied:true,
      sourceIndependence:'MULTI_VENUE_INDEPENDENT',distinctVenues:['BINANCE','OKX','KRAKEN'],
      contradictions:[],rejected:[],witnessErrors:[]
    },
    engine:{
      version:'MTL_V1',action:'ABSTAIN',execution:'SHADOW_ONLY',
      hypothesis:{candidate:'FORCED_FLOW',gate:'HYPOTHESIS_SUPPORTED',causalStatus:'NOT_IDENTIFIED',evidenceStrength:0.72},
      audit:{contradictionScore:0.08,modalityCoverage:1},
      lattice:{novelty:0.2,transitionEntropy:0.3,transitionCoherence:0.72,support:12}
    },
    health:{ledgerHealthy:true,fabricHealthy:true,registryHealthy:true}
  };
}

function evaluate(f){
  const marketAudit=auditMarketSnapshot(f.market,{now:f.now,maxAgeMs:15_000});
  const witnessAudit=auditWitnessReport(f.witness);
  const engineAudit=auditEngineResult(f.engine);
  const safety=determineSafetyState({
    marketAudit,witnessAudit,engineAudit,
    ledgerHealthy:f.health.ledgerHealthy,
    fabricHealthy:f.health.fabricHealthy,
    registryHealthy:f.health.registryHealthy
  });
  return {marketAudit,witnessAudit,engineAudit,safety};
}

const SCENARIOS={
  BASELINE:{
    expected:'NORMAL',
    mutate:f=>f
  },
  PRIMARY_STALE:{
    expected:'SAFE_STOP',
    mutate:f=>{ f.market.availableAt=f.now-60_000; return f; }
  },
  CROSSED_BOOK:{
    expected:'SAFE_STOP',
    mutate:f=>{ f.market.bid=101; f.market.ask=100; return f; }
  },
  FUTURE_TIMESTAMP:{
    expected:'SAFE_STOP',
    mutate:f=>{ f.market.timestamp=f.now+10_000; return f; }
  },
  INVALID_IMBALANCE:{
    expected:'SAFE_STOP',
    mutate:f=>{ f.market.imbalance=2.5; return f; }
  },
  OKX_KRAKEN_OUTAGE:{
    expected:'DEGRADED',
    mutate:f=>{
      f.witness.externalWitnessCount=0;
      f.witness.agreementScore=0;
      f.witness.independentWitnessSatisfied=false;
      f.witness.sourceIndependence='SINGLE_PROVIDER_MULTI_MODALITY';
      f.witness.witnessErrors=[{source:'OKX',error:'synthetic outage'},{source:'KRAKEN',error:'synthetic outage'}];
      return f;
    }
  },
  CROSS_VENUE_DISAGREEMENT:{
    expected:'DEGRADED',
    mutate:f=>{
      f.witness.independentWitnessSatisfied=false;
      f.witness.agreementScore=0.3;
      f.witness.contradictions=['PRICE_DISLOCATION_OKX','FLOW_DIVERGENCE_KRAKEN'];
      return f;
    }
  },
  ENGINE_EXECUTION_VIOLATION:{
    expected:'SAFE_STOP',
    mutate:f=>{ f.engine.execution='LIVE'; return f; }
  },
  ENGINE_ACTION_VIOLATION:{
    expected:'SAFE_STOP',
    mutate:f=>{ f.engine.action='BUY'; return f; }
  },
  CAUSAL_STATUS_VIOLATION:{
    expected:'SAFE_STOP',
    mutate:f=>{ f.engine.hypothesis.causalStatus='CONFIRMED'; return f; }
  },
  AUDIT_LEDGER_CORRUPTION:{
    expected:'SAFE_STOP',
    mutate:f=>{ f.health.ledgerHealthy=false; return f; }
  },
  MARKET_FABRIC_CORRUPTION:{
    expected:'SAFE_STOP',
    mutate:f=>{ f.health.fabricHealthy=false; return f; }
  },
  RELEASE_REGISTRY_CORRUPTION:{
    expected:'SAFE_STOP',
    mutate:f=>{ f.health.registryHealthy=false; return f; }
  },
  MULTI_SYSTEM_FAILURE:{
    expected:'SAFE_STOP',
    mutate:f=>{
      f.health.ledgerHealthy=false;
      f.health.fabricHealthy=false;
      f.health.registryHealthy=false;
      f.market.availableAt=f.now-120_000;
      f.witness.externalWitnessCount=0;
      f.witness.independentWitnessSatisfied=false;
      f.witness.witnessErrors=[{source:'OKX',error:'synthetic outage'}];
      return f;
    }
  }
};

export function chaosScenarioNames(){ return Object.keys(SCENARIOS); }

export function runChaosScenario(name,{now=1_000_000}={}){
  const spec=SCENARIOS[String(name)];
  if(!spec) throw new Error(`Unknown chaos scenario: ${name}`);
  const fixture=clone(baselineChaosFixture(now));
  const mutated=spec.mutate(fixture);
  const result=evaluate(mutated);
  const invariantOk=result.safety.canExecute===false && result.safety.executionMode==='SHADOW_ONLY';
  const pass=result.safety.state===spec.expected && invariantOk;
  return {
    name:String(name),
    expectedState:spec.expected,
    actualState:result.safety.state,
    pass,
    invariantOk,
    canResearch:result.safety.canResearch,
    canExecute:result.safety.canExecute,
    hardReasons:result.safety.hardReasons,
    softReasons:result.safety.softReasons,
    marketErrors:result.marketAudit.errors,
    witnessWarnings:result.witnessAudit.warnings,
    engineErrors:result.engineAudit.errors
  };
}

export function runChaosSuite({now=1_000_000}={}){
  const results=chaosScenarioNames().map(name=>runChaosScenario(name,{now}));
  const passed=results.filter(x=>x.pass).length;
  return {
    version:'CHAOS_V1',
    mode:'SYNTHETIC_SIDE_EFFECT_FREE',
    total:results.length,
    passed,
    failed:results.length-passed,
    passRate:results.length?passed/results.length:0,
    executionInvariant:results.every(x=>x.invariantOk),
    results
  };
}

export const CHAOS_ENGINEERING_VERSION='CHAOS_V1';
