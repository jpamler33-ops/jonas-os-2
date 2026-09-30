import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_MARKET_SCIENCE_OS_VERSION='BIGGJ_MARKET_SCIENCE_OS_V1';

export const BIGGJ_ARCHITECTURE_LAYERS=Object.freeze([
  'REALITY',
  'EPISTEMIC_KERNEL',
  'MARKET_SCIENCE',
  'WORLD_MODEL',
  'LABORATORY',
  'DECISION_INTELLIGENCE',
  'TCX_RIFT_APPLICATION',
  'SHADOW_TRADING'
]);

const txt=(v,f='')=>{
  const s=String(v??'').trim();
  return s||f;
};
const finite=(v,f=0)=>{
  const n=Number(v);
  return Number.isFinite(n)?n:f;
};
const uniq=xs=>[...new Set((Array.isArray(xs)?xs:[]).map(x=>txt(x)).filter(Boolean))].sort();
const deepFreeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
};
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const coreFingerprint=core=>deepFreeze({...core,fingerprint:sha256(core)});

export const BIGGJ_ARCHITECTURE_CONTRACT=deepFreeze({
  identity:{
    canonicalName:'BIGGJ',
    systemClass:'AUTONOMOUS_MARKET_SCIENCE_AND_DECISION_INTELLIGENCE_SYSTEM',
    shortDescription:'Market Science OS that discovers, challenges and validates market knowledge before decision applications consume it.',
    canonicalHome:'SCIENCE',
    tradingIsApplication:true,
    tcxIsBiggj:false,
    tcxRole:'DECISION_APPLICATION',
    riftRole:'MARKET_MECHANISM_APPLICATION'
  },
  layerOrder:BIGGJ_ARCHITECTURE_LAYERS,
  dependencyRules:[
    'REALITY_MAY_FEED_SCIENCE',
    'SCIENCE_MAY_FEED_WORLD_MODEL',
    'WORLD_MODEL_MAY_FEED_LABORATORY',
    'VALIDATED_SCIENCE_MAY_FEED_DECISION_INTELLIGENCE',
    'DECISION_INTELLIGENCE_MAY_FEED_TCX_RIFT',
    'TCX_RIFT_MAY_FEED_SHADOW_TRADING',
    'TRADING_RESULTS_MAY_RETURN_AS_EVIDENCE_ONLY',
    'TRADING_PNL_MUST_NOT_DIRECTLY_MUTATE_SCIENTIFIC_TRUTH'
  ],
  forbiddenEdges:[
    'SHADOW_TRADING->EPISTEMIC_KERNEL:AUTHORITY',
    'SHADOW_TRADING->MARKET_SCIENCE:TRUTH',
    'PNL->THEORY_PROMOTION',
    'SYNTHETIC_EVIDENCE->REAL_EVIDENCE',
    'DECISION_APPLICATION->PRIMARY_SCIENCE_MUTATION'
  ],
  safety:{
    execution:'SHADOW_ONLY',
    abstainFirstClass:true,
    canExecute:false,
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    automaticTheoryPromotion:false,
    automaticTheoryKill:false
  }
});

function regimeDistribution(rows){
  const counts=new Map();
  for(const row of rows||[]){
    const regime=txt(row?.regime,'UNKNOWN').toUpperCase();
    counts.set(regime,(counts.get(regime)||0)+1);
  }
  return [...counts.entries()]
    .map(([regime,count])=>({regime,count}))
    .sort((a,b)=>b.count-a.count||a.regime.localeCompare(b.regime));
}

function marketStateRows(rows){
  return (Array.isArray(rows)?rows:[]).slice(0,30).map(row=>({
    symbol:txt(row?.symbol,'UNKNOWN'),
    status:txt(row?.status,'UNKNOWN'),
    regime:txt(row?.regime,'UNKNOWN'),
    witnessAgreement:Number.isFinite(Number(row?.witnessAgreement))?Number(row.witnessAgreement):null,
    support:finite(row?.support,0),
    score:Number.isFinite(Number(row?.score))?Number(row.score):null,
    epistemicClass:'INFERRED',
    source:'MARKET_RADAR'
  }));
}

function theoryFrontier(epistemicSummary={},directorSummary={}){
  const counts=epistemicSummary?.derivedStatusCounts||{};
  return {
    total:finite(epistemicSummary?.theoryCount),
    hypotheses:finite(counts.HYPOTHESIS),
    observedEffects:finite(counts.OBSERVED_EFFECT),
    replicated:finite(counts.REPLICATED),
    robust:finite(counts.ROBUST),
    provisionalLaws:finite(counts.PROVISIONAL_LAW),
    broken:finite(counts.BROKEN),
    evidence:finite(epistemicSummary?.evidenceCount),
    experiments:finite(epistemicSummary?.experimentCount),
    surprises:finite(epistemicSummary?.surpriseCount),
    nextQuestion:clone(directorSummary?.nextResearchQuestion||null)
  };
}

function labView(epistemicSummary={},directorSummary={},factorySummary={}){
  return {
    experimentCount:finite(epistemicSummary?.experimentCount),
    agenda:clone(directorSummary?.topAgenda||[]),
    dataRequests:clone(directorSummary?.topDataRequests||[]),
    theoryCompetitionCount:finite(directorSummary?.theoryCompetitionCount),
    factoryMode:txt(factorySummary?.mode,'UNKNOWN'),
    automaticResearchTasks:finite(factorySummary?.automatic),
    manualResearchTasks:finite(factorySummary?.manual),
    dataOnlyTasks:finite(factorySummary?.dataOnly),
    automaticExperimentLaunchAllowed:false,
    syntheticWorldsCountAsEvidence:false,
    primaryMutationAllowed:false
  };
}

function proofSummary(proofFeed={}){
  const c=proofFeed?.counts||{};
  return {
    live:finite(c.live),
    awaitingOutcome:finite(c.awaitingOutcome),
    resolved:finite(c.resolved),
    committed:finite(c.committed),
    hits:finite(c.hits),
    misses:finite(c.misses),
    invalid:finite(c.invalid),
    learned:finite(c.learned),
    semantics:{
      hitRateIsNotScientificTruth:true,
      forecastProofDoesNotAuthorizeExecution:true
    }
  };
}

function tradingApplication(portfolio={}){
  return {
    application:'SHADOW_TRADING',
    role:'DOWNSTREAM_DECISION_APPLICATION',
    equityQuote:Number.isFinite(Number(portfolio?.equityQuote))?Number(portfolio.equityQuote):null,
    netPnlQuote:Number.isFinite(Number(portfolio?.netPnlQuote))?Number(portfolio.netPnlQuote):null,
    openPositions:finite(portfolio?.openPositions),
    closedTrades:finite(portfolio?.closedTrades),
    researchActivity:clone(portfolio?.researchActivity||null),
    scientificAuthority:false,
    canMutateTheory:false,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

export function verifyBiggjArchitectureContract(contract=BIGGJ_ARCHITECTURE_CONTRACT){
  const reasons=[];
  const order=Array.isArray(contract?.layerOrder)?contract.layerOrder:[];
  if(order.join('|')!==BIGGJ_ARCHITECTURE_LAYERS.join('|')) reasons.push('LAYER_ORDER_INVALID');
  if(contract?.identity?.canonicalName!=='BIGGJ') reasons.push('IDENTITY_INVALID');
  if(contract?.identity?.tradingIsApplication!==true) reasons.push('TRADING_MUST_BE_APPLICATION');
  if(contract?.identity?.tcxIsBiggj!==false) reasons.push('TCX_IDENTITY_BOUNDARY_INVALID');
  if(contract?.safety?.execution!=='SHADOW_ONLY') reasons.push('EXECUTION_MODE_INVALID');
  if(contract?.safety?.canExecute!==false) reasons.push('LIVE_EXECUTION_AUTHORITY_INVALID');
  if(contract?.safety?.canExecuteLive!==false) reasons.push('LIVE_EXECUTION_INVALID');
  if(contract?.safety?.automaticPrimaryMutation!==false) reasons.push('PRIMARY_MUTATION_INVALID');
  if(!Array.isArray(contract?.forbiddenEdges)||!contract.forbiddenEdges.includes('PNL->THEORY_PROMOTION')) reasons.push('PNL_FIREWALL_MISSING');
  return {ok:reasons.length===0,reasons};
}

export function buildBiggjMarketScienceOs({
  epistemicSummary={},
  scienceDirectorSummary={},
  livingResearchSummary={},
  researchFactorySummary={},
  marketRadar={},
  globalIntel={},
  proofFeed={},
  portfolio={},
  operationalReadiness={},
  asOf=Date.now()
}={}){
  const contractCheck=verifyBiggjArchitectureContract();
  if(!contractCheck.ok) throw new Error('BIGGJ_ARCHITECTURE_CONTRACT_INVALID:'+contractCheck.reasons.join(','));

  const t=finite(asOf,NaN);
  if(!Number.isFinite(t)) throw new Error('BIGGJ_MARKET_SCIENCE_OS_ASOF_INVALID');

  const markets=marketStateRows(marketRadar?.rows||[]);
  const frontier=theoryFrontier(epistemicSummary,scienceDirectorSummary);
  const scienceReady=
    txt(epistemicSummary?.version).length>0&&
    txt(scienceDirectorSummary?.version).length>0;
  const worldReady=markets.length>0;
  const laboratoryReady=Array.isArray(scienceDirectorSummary?.topAgenda);
  const decisionReady=txt(proofFeed?.version).length>0||finite(proofFeed?.counts?.resolved)>0;

  const core={
    version:BIGGJ_MARKET_SCIENCE_OS_VERSION,
    asOf:t,
    identity:clone(BIGGJ_ARCHITECTURE_CONTRACT.identity),
    architecture:{
      layerOrder:clone(BIGGJ_ARCHITECTURE_LAYERS),
      dependencyRules:clone(BIGGJ_ARCHITECTURE_CONTRACT.dependencyRules),
      forbiddenEdges:clone(BIGGJ_ARCHITECTURE_CONTRACT.forbiddenEdges),
      canonicalFlow:'REALITY -> EPISTEMIC_KERNEL -> MARKET_SCIENCE -> WORLD_MODEL -> LABORATORY -> DECISION_INTELLIGENCE -> TCX_RIFT_APPLICATION -> SHADOW_TRADING'
    },
    science:{
      role:'CORE',
      ready:scienceReady,
      frontier,
      livingResearch:{
        revision:finite(livingResearchSummary?.revision),
        researchRequired:finite(livingResearchSummary?.researchRequired),
        activeAgendaItems:finite(livingResearchSummary?.activeAgendaItems),
        discoveredResearchOnlySkills:finite(livingResearchSummary?.discoveredResearchOnlySkills),
        integrity:txt(livingResearchSummary?.integrity,'UNKNOWN')
      },
      director:{
        researchFingerprint:scienceDirectorSummary?.researchFingerprint||null,
        knowledgeFrontier:clone(scienceDirectorSummary?.knowledgeFrontier||{}),
        nextResearchQuestion:clone(scienceDirectorSummary?.nextResearchQuestion||null),
        topAgenda:clone(scienceDirectorSummary?.topAgenda||[]),
        topDataRequests:clone(scienceDirectorSummary?.topDataRequests||[])
      }
    },
    worldModel:{
      role:'CORE',
      ready:worldReady,
      marketsObserved:markets.length,
      markets,
      regimeDistribution:regimeDistribution(markets),
      latestIntelligence:clone((globalIntel?.recent||[]).slice(0,12)),
      latentStateDiscovery:{
        status:'NOT_YET_IMPLEMENTED',
        reason:'No canonical latent-state engine is promoted yet; do not fabricate hidden states.'
      },
      informationFlowGraph:{
        status:'NOT_YET_IMPLEMENTED',
        reason:'Cross-market directed information propagation has not yet passed a canonical implementation gate.'
      },
      predictabilityField:{
        status:'NOT_YET_IMPLEMENTED',
        reason:'No canonical market-by-horizon predictability field is promoted yet.'
      }
    },
    laboratory:{
      role:'CORE',
      ready:laboratoryReady,
      ...labView(epistemicSummary,scienceDirectorSummary,researchFactorySummary)
    },
    decisionIntelligence:{
      role:'DOWNSTREAM_APPLICATION',
      ready:decisionReady,
      proof:proofSummary(proofFeed),
      tcx:{
        role:'DECISION_APPLICATION',
        consumesValidatedScience:true,
        scientificAuthority:false
      },
      rift:{
        role:'MECHANISM_APPLICATION',
        scientificAuthority:false
      }
    },
    trading:tradingApplication(portfolio),
    readiness:{
      runtimeReady:operationalReadiness?.ready===true,
      scienceReady,
      worldReady,
      laboratoryReady,
      decisionReady,
      canonicalHome:'SCIENCE'
    },
    safety:clone(BIGGJ_ARCHITECTURE_CONTRACT.safety),
    semantics:{
      biggjIsNotATradingBot:true,
      tradingIsDownstreamApplication:true,
      pnlCannotPromoteTheory:true,
      unimplementedWorldModelCapabilitiesRemainExplicitlyUnknown:true,
      scienceMayReturnUnknown:true
    }
  };
  return coreFingerprint(core);
}

export function biggjMarketScienceOsSummary(os){
  if(os?.version!==BIGGJ_MARKET_SCIENCE_OS_VERSION) throw new Error('BIGGJ_MARKET_SCIENCE_OS_INVALID');
  return deepFreeze({
    version:os.version,
    asOf:os.asOf,
    identity:os.identity,
    architecture:os.architecture,
    science:os.science,
    worldModel:os.worldModel,
    laboratory:os.laboratory,
    decisionIntelligence:os.decisionIntelligence,
    trading:os.trading,
    readiness:os.readiness,
    safety:os.safety,
    semantics:os.semantics,
    fingerprint:os.fingerprint
  });
}
