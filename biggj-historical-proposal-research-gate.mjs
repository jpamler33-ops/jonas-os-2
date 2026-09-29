import { sha256 } from './institutional-kernel.mjs';
import { BIGGJ_SEED_CAPABILITIES } from './biggj-capability-map.mjs';
import { canonicalSkillLeverage } from './biggj-skill-dependency-graph.mjs';
import { biggjHistoricalResearchProposals } from './biggj-historical-idea-migration.mjs';

export const BIGGJ_HISTORICAL_PROPOSAL_RESEARCH_GATE_VERSION='BIGGJ_HISTORICAL_PROPOSAL_RESEARCH_GATE_V1';

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
const uniq=xs=>[...new Set((xs||[]).map(String))];
const finalized=core=>deepFreeze({...core,fingerprint:sha256(core)});
const capabilityIds=new Set(BIGGJ_SEED_CAPABILITIES.map(x=>x.id));

const contract=(title,spec)=>({title,...spec});

export const BIGGJ_HISTORICAL_RESEARCH_CONTRACTS=deepFreeze([
  contract('CLAIM_ASSUMPTION_GRAPH',{
    question:'Does explicitly linking material claims to assumptions expose hidden assumption load and improve audit/revision quality beyond a flat provenance trace?',
    hypothesis:'A claim-to-assumption graph will detect unsupported or stale assumption dependence earlier and reduce unresolved audit defects versus a provenance-only baseline.',
    falsifier:'Across preregistered replay and forward-shadow audits, the graph produces no material lift in detected unsupported assumptions, revision precision, or reproducibility after controlling for extra complexity.',
    dependencies:['PROVENANCE_CHAIN','RESEARCH_TRACE_VIEW','ASSUMPTION_FRESHNESS'],
    proposalDependencies:[],
    requiredData:['frozen decision traces','claims','explicit assumptions','evidence lineage','later revisions/invalidations'],
    baselines:['flat provenance chain without assumption edges','manual assumption list'],
    pitRequirements:['assumption existence time','claim creation time','evidence availableAt','no post-outcome assumption insertion into the original trace'],
    scientificGuards:['future leakage','post-hoc relabeling','coverage gaps','assumption duplication','common-cause evidence'],
    forwardShadowDesign:'Attach the graph to new research traces in a shadow-only audit lane; pre-register defect definitions and compare detection/revision metrics against the current trace representation.',
    killCriteria:['no incremental audit defects found','high false-positive assumption links','operator/research overhead exceeds measurable information gain','graph cannot preserve PIT chronology'],
    strategicImpact:.98,informationValue:.92,falsifiability:.95,dataReadiness:.95,generality:.98,complexityCost:.28
  }),
  contract('LEAVE_ONE_OUT_ROBUSTNESS',{
    question:'Which BIGGJ conclusions collapse when one evidence lineage, feature family, symbol, regime, method family or winner is removed?',
    hypothesis:'Leave-one-out stress will identify fragile conclusions that pass aggregate validation because they depend disproportionately on one lineage or winner.',
    falsifier:'Prospective audits find no meaningful difference between ordinary scientific guards and leave-one-out stress, or detected fragility does not predict subsequent instability.',
    dependencies:['SCIENTIFIC_GUARD_ORCHESTRATION','EVIDENCE_INDEPENDENCE','DETERMINISTIC_REPLAY','COMMON_CAUSE_GUARD'],
    proposalDependencies:[],
    requiredData:['candidate evidence sets','lineage graph','symbol/regime labels','winner contribution','replayable evaluation outputs'],
    baselines:['current winner-removal stress','ordinary concentration checks'],
    pitRequirements:['frozen candidate version','frozen evidence set as of evaluation time','no survivor-only cohort reconstruction'],
    scientificGuards:['multiple testing','selection bias','lineage dependence','winner dependence','chronological stability'],
    forwardShadowDesign:'Run leave-one-out diagnostics on every new candidate evaluation without changing candidate behavior; compare flagged fragility with later forward instability.',
    killCriteria:['duplicates existing winner-removal/concentration guards without new information','runtime cost is disproportionate','fragility score is uncalibrated and non-predictive'],
    strategicImpact:.98,informationValue:.95,falsifiability:.98,dataReadiness:.90,generality:.96,complexityCost:.34
  }),
  contract('CAUSAL_EPISODE_MEMORY',{
    question:'Does storing mechanism-centered episodes improve strict-past analogue retrieval, failure decomposition and hypothesis generation beyond chart-window memory?',
    hypothesis:'Mechanism-centered episode memory will retrieve more decision-relevant historical analogues and produce more stable failure explanations than price-pattern-only memory.',
    falsifier:'Strict-past evaluation shows no incremental retrieval quality, forecast calibration, mechanism discrimination or post-trade explanation quality versus current episode memory.',
    dependencies:['POST_TRADE_REVERSE_ENGINEERING','DETERMINISTIC_REPLAY','STATE_CHANGE_ATTRIBUTION','PROVENANCE_CHAIN','IDENTIFIABILITY'],
    proposalDependencies:[],
    requiredData:['canonical world state snapshots','constraint/mechanism states','forecast traces','shadow trade outcomes','later realized stress outcomes'],
    baselines:['existing episode memory','price/indicator analogue search'],
    pitRequirements:['strict-past retrieval only','episode fields frozen at observation time','later outcomes stored separately from original episode state'],
    scientificGuards:['future leakage','mechanism story hindsight','analogue selection bias','effective sample size','common-cause dependence'],
    forwardShadowDesign:'Write new mechanism episodes prospectively; evaluate retrieval usefulness only on later unseen episodes.',
    killCriteria:['mechanism fields are too sparse or unstable','no lift over simpler state/price memory','post-hoc labels dominate similarity','storage complexity outweighs information gain'],
    strategicImpact:.93,informationValue:.91,falsifiability:.89,dataReadiness:.78,generality:.92,complexityCost:.48
  }),
  contract('INTERVENTION_VALUE_MAP',{
    question:'Which next observation, data source or stress test would reduce decision-relevant mechanism uncertainty the most?',
    hypothesis:'Expected information-value ranking will reduce critical uncertainty faster per unit research cost than FIFO or intuition-based research selection.',
    falsifier:'Across preregistered research campaigns, information-value selection does not reduce calibrated uncertainty, disagreement or unresolved mechanism alternatives faster than baseline selection.',
    dependencies:['INFORMATION_VALUE_PRIORITIZATION','UNCERTAINTY_DECOMPOSITION','EXPERIMENT_DESIGN','DECISION_UNDER_DISAGREEMENT'],
    proposalDependencies:['MECHANISM_POSTERIOR_GRAPH'],
    requiredData:['current competing hypotheses','uncertainty decomposition','candidate observations/tests','estimated cost/latency','post-observation uncertainty'],
    baselines:['FIFO research queue','highest-confidence-first','highest-uncertainty-first'],
    pitRequirements:['candidate interventions defined before result','cost and expected information gain frozen before execution','no hindsight ranking'],
    scientificGuards:['adaptive overfitting','research selection bias','cost leakage','double-counted evidence','common-cause observations'],
    forwardShadowDesign:'Run as a shadow research scheduler alongside the existing queue and compare uncertainty reduction without allowing it to alter PRIMARY research policy.',
    killCriteria:['estimated information value is uncalibrated','scheduler repeatedly selects redundant evidence','no improvement per unit cost/time','depends on unavailable mechanism posterior'],
    strategicImpact:.97,informationValue:.99,falsifiability:.88,dataReadiness:.55,generality:.96,complexityCost:.64
  }),
  contract('MECHANISM_ENSEMBLE',{
    question:'Do multiple plausible hidden-mechanism reconstructions expose underidentification and improve robustness compared with one selected mechanism story?',
    hypothesis:'An ensemble will reduce false mechanism certainty and better identify episodes where directional conclusions are robust despite mechanism ambiguity.',
    falsifier:'Out-of-sample mechanism/stress evaluation shows no improvement in calibration, ambiguity detection or robustness versus a single best-fit reconstruction.',
    dependencies:['IDENTIFIABILITY','EVIDENCE_INDEPENDENCE','DISAGREEMENT_ENGINE','CONSTRAINT_MAP','STATE_UNCERTAINTY'],
    proposalDependencies:[],
    requiredData:['canonical world states','constraint candidates','mechanism outputs','observed stress outcomes','model lineage'],
    baselines:['single highest-scoring mechanism reconstruction','simple microstructure baselines'],
    pitRequirements:['candidate mechanism family frozen before evaluation','strict-past parameter estimation','later outcomes separated'],
    scientificGuards:['model multiplicity','shared-method dependence','selection bias','underidentification','overconfident aggregation'],
    forwardShadowDesign:'Generate competing reconstructions prospectively and score agreement/dispersion against later stress outcomes without trading-policy influence.',
    killCriteria:['ensemble members are not meaningfully diverse','dispersion adds no calibration value','ranking is unstable across small specification changes','computational cost is excessive'],
    strategicImpact:.94,informationValue:.94,falsifiability:.89,dataReadiness:.64,generality:.88,complexityCost:.68
  }),
  contract('MECHANISM_POSTERIOR_GRAPH',{
    question:'Can BIGGJ maintain calibrated weights over competing mechanism graphs instead of committing to a single hidden explanation?',
    hypothesis:'Posterior-weighted mechanism graphs will improve uncertainty calibration and revision quality when hidden market mechanisms are underidentified.',
    falsifier:'Posterior weights are uncalibrated, collapse to arbitrary model priors, or fail to improve prospective mechanism/stress predictions over an unweighted ensemble.',
    dependencies:['IDENTIFIABILITY','CALIBRATED_PROBABILITY','FORECAST_REVISION','EVIDENCE_INDEPENDENCE'],
    proposalDependencies:['MECHANISM_ENSEMBLE'],
    requiredData:['mechanism ensemble outputs','prospective observation likelihoods','revision events','stress outcomes','method lineage'],
    baselines:['uniform mechanism ensemble','single best mechanism','simple Bayesian/score weighting baseline'],
    pitRequirements:['priors/version frozen','updates use only newly available observations','full posterior revision ledger'],
    scientificGuards:['prior sensitivity','model misspecification','shared-model ancestry','likelihood leakage','posterior overconfidence'],
    forwardShadowDesign:'Maintain posterior weights in shadow on future mechanism episodes and measure calibration/revision quality.',
    killCriteria:['weights driven mainly by arbitrary priors','no calibration lift over uniform ensemble','posterior becomes falsely concentrated under shared model error'],
    strategicImpact:.92,informationValue:.96,falsifiability:.86,dataReadiness:.46,generality:.84,complexityCost:.82
  }),
  contract('REFLEXIVITY_WITNESS_ENSEMBLE',{
    question:'Do methodologically distinct reflexivity witnesses provide incremental, independent evidence about amplification risk?',
    hypothesis:'A lineage-aware witness ensemble will distinguish robust reflexive stress from apparent agreement produced by correlated methods.',
    falsifier:'Independent-witness aggregation provides no OOS lift in stress classification/calibration over the strongest single witness after dependence controls.',
    dependencies:['REFLEXIVITY','EVIDENCE_INDEPENDENCE','COMMON_CAUSE_GUARD','CASCADE_DYNAMICS','LIQUIDITY_ELASTICITY'],
    proposalDependencies:[],
    requiredData:['finite-shock outputs','local feedback diagnostics','self-excitation metrics','flow persistence','liquidity withdrawal','cross-venue propagation','observed liquidation chains'],
    baselines:['strongest single witness','naive equal-weight witness average'],
    pitRequirements:['method outputs frozen as-of event','method lineage declared before aggregation','outcomes observed later'],
    scientificGuards:['method-family dependence','multiple testing','shared input common causes','selection of favorable witnesses'],
    forwardShadowDesign:'Issue a reflexivity witness packet on new episodes and compare calibration with single-method baselines.',
    killCriteria:['witnesses share effectively the same information','no incremental calibration','method availability too sparse','aggregation becomes opaque'],
    strategicImpact:.89,informationValue:.90,falsifiability:.90,dataReadiness:.55,generality:.76,complexityCost:.72
  }),
  contract('PRICE_TIME_CONSTRAINT_SURFACE',{
    question:'Does representing constraints over price and time with decay improve forced-flow reconstruction beyond static price levels?',
    hypothesis:'A price-time constraint surface will improve prospective localization of forced-flow activation and reduce stale constraint mass versus static levels.',
    falsifier:'No OOS lift in observed forced-flow timing/localization after controlling for model complexity and data availability.',
    dependencies:['CONSTRAINT_MAP','PIT_EVENT_CLOCK','PATTERN_HALF_LIFE','STATE_UNCERTAINTY','FORCED_FLOW'],
    proposalDependencies:[],
    requiredData:['constraint observations/proxies','price path','availableAt timestamps','activation outcomes','decay calibration episodes'],
    baselines:['static price constraint levels','fixed time-to-live constraints'],
    pitRequirements:['availableAt enforced','decay parameters trained only on prior episodes','no future activation labels in state'],
    scientificGuards:['staleness','hidden-position overclaim','parameter overfit','venue/regime concentration'],
    forwardShadowDesign:'Build surfaces prospectively and score localization of later observed stress/forced-flow events.',
    killCriteria:['time dimension adds no incremental information','decay estimates unstable','surface appears precise while inputs remain underidentified'],
    strategicImpact:.87,informationValue:.84,falsifiability:.92,dataReadiness:.69,generality:.72,complexityCost:.58
  }),
  contract('LATENT_MARKET_ENERGY',{
    question:'Can a bounded latent constrained-flow diagnostic summarize unreleased pressure without pretending to be probability or physical energy?',
    hypothesis:'A preregistered latent-pressure score combining constrained flow, proximity, urgency and liquidity impact will add OOS information about stress outcomes beyond its component features.',
    falsifier:'The score has no incremental OOS information after component controls, is unstable across reasonable specifications, or merely re-labels volatility/positioning proxies.',
    dependencies:['FORCED_FLOW','CONSTRAINT_MAP','LIQUIDITY_ELASTICITY','IDENTIFIABILITY'],
    proposalDependencies:[],
    requiredData:['constraint mass proxies','distance/proximity','urgency/half-life','liquidity elasticity','observed stress outcomes'],
    baselines:['component-wise forced-flow features','realized volatility','OI/funding/liquidation baselines'],
    pitRequirements:['score components available at issuance','formula/version frozen','later stress outcomes held out'],
    scientificGuards:['known-factor conditioning','proxy redundancy','specification multiverse','regime concentration','causal overclaim'],
    forwardShadowDesign:'Issue the diagnostic prospectively as MODELLED context only; test incremental information against strong baselines.',
    killCriteria:['no incremental OOS information','score dominated by one known component','unstable sign/rank across periods','misread as probability despite contract'],
    strategicImpact:.82,informationValue:.83,falsifiability:.95,dataReadiness:.67,generality:.69,complexityCost:.46
  }),
  contract('MINIMUM_CASCADE_TRIGGER',{
    question:'Can BIGGJ estimate a stable bounded finite-shock threshold for modeled cascade activation?',
    hypothesis:'Under specified liquidity/constraint states, estimated minimum cascade triggers will correlate prospectively with observed stress sensitivity better than local linear stability metrics alone.',
    falsifier:'Thresholds are unstable, non-identifiable, or fail to add OOS stress information beyond volatility/liquidity baselines.',
    dependencies:['CASCADE_DYNAMICS','LIQUIDITY_ELASTICITY','EXPERIMENT_DESIGN','TAIL_STRESS'],
    proposalDependencies:['PRICE_TIME_CONSTRAINT_SURFACE'],
    requiredData:['constraint state','liquidity state','finite-shock simulator','observed later stress outcomes'],
    baselines:['local linear/spectral diagnostic','realized volatility + depth baseline'],
    pitRequirements:['search bounds preregistered','initial state frozen','later outcome excluded from threshold search'],
    scientificGuards:['search overfit','threshold cherry-picking','underidentification','simulation-to-reality overclaim'],
    forwardShadowDesign:'Estimate thresholds for new episodes without policy influence and compare with later stress realization.',
    killCriteria:['threshold changes materially under tiny model perturbations','no OOS lift','search bounds drive result','insufficient observed validation events'],
    strategicImpact:.78,informationValue:.79,falsifiability:.91,dataReadiness:.48,generality:.62,complexityCost:.69
  }),
  contract('CASCADE_BASIN',{
    question:'Does mapping shock size and liquidity state to absorption/criticality/amplification provide stable, useful stress structure?',
    hypothesis:'Cascade basin boundaries will organize prospective stress outcomes better than a single scalar cascade score.',
    falsifier:'Basin classifications are unstable, add no OOS information, or depend mainly on arbitrary simulator thresholds.',
    dependencies:['CASCADE_DYNAMICS','LIQUIDITY_ELASTICITY','TAIL_STRESS','STATE_UNCERTAINTY'],
    proposalDependencies:['MINIMUM_CASCADE_TRIGGER'],
    requiredData:['finite-shock grid','liquidity state','constraint state','observed stress outcomes'],
    baselines:['single cascade reproduction score','volatility/depth stress grid'],
    pitRequirements:['grid/protocol preregistered','initial state frozen','no outcome-conditioned basin boundary fitting'],
    scientificGuards:['grid search multiplicity','threshold sensitivity','model misspecification','regime concentration'],
    forwardShadowDesign:'Generate basin maps on future episodes and test whether classifications predict later observable stress categories.',
    killCriteria:['boundaries are not stable','no incremental OOS information','computational cost dominates','basin labels create false precision'],
    strategicImpact:.74,informationValue:.76,falsifiability:.88,dataReadiness:.43,generality:.58,complexityCost:.76
  }),
  contract('ABSORPTION_RESERVE',{
    question:'Can BIGGJ estimate how much modeled counterflow/liquidity is required to prevent a defined cascade?',
    hypothesis:'Absorption reserve will provide a useful dual fragility measure that improves stress ranking beyond cascade probability proxies or current depth alone.',
    falsifier:'Reserve estimates are unstable, non-calibratable, or add no OOS information about observed absorption versus cascade outcomes.',
    dependencies:['ABSORPTION','LIQUIDITY_ELASTICITY','CASCADE_DYNAMICS','TAIL_STRESS'],
    proposalDependencies:['CASCADE_BASIN'],
    requiredData:['liquidity state','aggressive flow','absorption events','finite-shock simulator','later stress outcomes'],
    baselines:['visible depth','order-book imbalance','cascade reproduction score'],
    pitRequirements:['liquidity snapshot frozen','counterflow intervention protocol preregistered','outcome held out'],
    scientificGuards:['counterfactual overclaim','hidden liquidity','venue fragmentation','parameter sensitivity'],
    forwardShadowDesign:'Estimate reserve on new stress episodes and compare with subsequent observed absorption/failure.',
    killCriteria:['reserve mainly mirrors visible depth','unobservable hidden liquidity dominates','no OOS discrimination'],
    strategicImpact:.70,informationValue:.73,falsifiability:.87,dataReadiness:.41,generality:.54,complexityCost:.72
  }),
  contract('MEME_RUG_RISK_INTELLIGENCE',{
    question:'Can BIGGJ identify memecoin integrity/liquidity fragility separately from momentum opportunity without contaminating general strategy evidence?',
    hypothesis:'A dedicated integrity-risk layer using governed on-chain/liquidity evidence will identify high-risk meme episodes that momentum-only signals fail to distinguish.',
    falsifier:'Prospective evaluation shows no incremental detection of severe liquidity/integrity failures over simple liquidity, concentration and age baselines.',
    dependencies:['MEME_MOMENTUM','ONCHAIN_INTELLIGENCE','LIQUIDITY_MAP','SOURCE_TRUST','ENTITY_FLOW_INTELLIGENCE'],
    proposalDependencies:[],
    requiredData:['token liquidity/depth','holder/entity concentration where verified','contract/public metadata','on-chain flows','venue availability','later liquidity/integrity outcomes'],
    baselines:['minimum liquidity threshold','holder concentration baseline','token age baseline','momentum-only model'],
    pitRequirements:['only public data available before event','no later scam/rug labels leaked into features','entity labels availability-timestamped'],
    scientificGuards:['label leakage','selection bias','survivorship bias','unverified entity inference','small-sample concentration'],
    forwardShadowDesign:'Produce a separate risk flag in memecoin research shadow lanes; never convert it directly into live execution.',
    killCriteria:['reliable labels unavailable','features are mostly post-event','no lift over simple baselines','false positives make signal unusable'],
    strategicImpact:.76,informationValue:.80,falsifiability:.90,dataReadiness:.58,generality:.40,complexityCost:.61
  }),
  contract('GOVERNED_EXPERIMENT_BLUEPRINTS',{
    question:'Can bounded declarative experiment blueprints increase reproducibility and research velocity without allowing arbitrary self-modifying code?',
    hypothesis:'A small allow-listed blueprint schema will reduce experiment-spec drift and improve reproducibility versus free-form experiment construction.',
    falsifier:'Blueprints add bureaucracy without measurable reproducibility, review or setup-time benefits, or require unsafe arbitrary-code escape hatches.',
    dependencies:['EXPERIMENT_DESIGN','VERSIONED_CANDIDATES','CONSTITUTION_ENFORCEMENT','CHANGE_REVIEW','REPRODUCIBLE_PROMOTION_AUDIT'],
    proposalDependencies:[],
    requiredData:['historical experiment specs','candidate configs','audit records','setup/reproduction failures'],
    baselines:['current hand-authored experiment configuration','free-form research notes'],
    pitRequirements:['blueprint version frozen before run','result cannot mutate its own design','all parameter changes versioned'],
    scientificGuards:['researcher degrees of freedom','silent schema expansion','post-result edits','unbounded code execution'],
    forwardShadowDesign:'Use blueprints for a bounded subset of new research experiments and compare reproducibility/setup defects.',
    killCriteria:['requires arbitrary code execution','no reduction in spec drift','schema becomes too rigid for valid experiments','audit overhead dominates benefit'],
    strategicImpact:.90,informationValue:.88,falsifiability:.86,dataReadiness:.86,generality:.95,complexityCost:.49
  }),
  contract('RESEARCH_POLICY_GENOME',{
    question:'Can explicit bounded research-policy challengers improve research allocation/process quality without optimizing away scientific safeguards?',
    hypothesis:'Versioned research-policy candidates evaluated under immutable safeguards will improve information gain and research efficiency without increasing scientific violations or monoculture.',
    falsifier:'Candidate policies do not improve preregistered research-process metrics, regress independent benchmark clusters, increase guard failures, or converge toward monoculture.',
    dependencies:['VERSIONED_CANDIDATES','STRESS_PROMOTION','REASONING_DIVERSITY_AUDIT','CONSTITUTION_ENFORCEMENT','REPRODUCIBLE_PROMOTION_AUDIT'],
    proposalDependencies:['GOVERNED_EXPERIMENT_BLUEPRINTS'],
    requiredData:['research queue history','experiment outcomes','guard outcomes','resource use','information-gain metrics','policy version lineage'],
    baselines:['current fixed research-priority policy','simple hand-tuned policy variants'],
    pitRequirements:['policy frozen before campaign','benchmark/holdout separation','no self-edit after results','all changes versioned'],
    scientificGuards:['Goodhart risk','meta-overfitting','benchmark leakage','monoculture','guard relaxation','resource gaming'],
    forwardShadowDesign:'Run policy challengers only on isolated research scheduling simulations/shadow campaigns; no PRIMARY mutation.',
    killCriteria:['improvements disappear on sealed holdout','scientific guard rate worsens','policy family monoculture rises','benefit comes from simply running more experiments'],
    strategicImpact:.92,informationValue:.89,falsifiability:.84,dataReadiness:.72,generality:.94,complexityCost:.74
  })
]);

function assertFiniteScore(v,name,title){
  if(!Number.isFinite(Number(v))||Number(v)<0||Number(v)>1) throw new Error('invalid '+name+' for '+title);
}

export function validateBiggjHistoricalResearchContracts(){
  const recovered=biggjHistoricalResearchProposals().proposals;
  const recoveredTitles=new Set(recovered.map(x=>x.title));
  const contractTitles=new Set();
  const reasons=[];
  for(const c of BIGGJ_HISTORICAL_RESEARCH_CONTRACTS){
    if(contractTitles.has(c.title)) reasons.push('DUPLICATE_CONTRACT:'+c.title);
    contractTitles.add(c.title);
    if(!recoveredTitles.has(c.title)) reasons.push('NOT_RECOVERED_PROPOSAL:'+c.title);
    for(const d of c.dependencies||[]) if(!capabilityIds.has(d)) reasons.push('UNKNOWN_DEPENDENCY:'+c.title+':'+d);
    for(const p of c.proposalDependencies||[]) if(!recoveredTitles.has(p)) reasons.push('UNKNOWN_PROPOSAL_DEPENDENCY:'+c.title+':'+p);
    for(const field of ['question','hypothesis','falsifier','forwardShadowDesign']){
      if(!String(c[field]||'').trim()) reasons.push('MISSING_'+field.toUpperCase()+':'+c.title);
    }
    for(const field of ['requiredData','baselines','pitRequirements','scientificGuards','killCriteria']){
      if(!Array.isArray(c[field])||c[field].length===0) reasons.push('MISSING_'+field.toUpperCase()+':'+c.title);
    }
    for(const field of ['strategicImpact','informationValue','falsifiability','dataReadiness','generality','complexityCost']){
      try{assertFiniteScore(c[field],field,c.title);}catch(e){reasons.push(String(e.message));}
    }
  }
  for(const title of recoveredTitles) if(!contractTitles.has(title)) reasons.push('MISSING_CONTRACT:'+title);

  return finalized({
    version:BIGGJ_HISTORICAL_PROPOSAL_RESEARCH_GATE_VERSION,
    ok:reasons.length===0,
    reasons,
    recoveredProposalCount:recoveredTitles.size,
    contractCount:contractTitles.size,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

function readiness(contract){
  const blockingProposalDependencies=uniq(contract.proposalDependencies||[]);
  return {
    researchable:true,
    implementationReady:blockingProposalDependencies.length===0,
    blockingProposalDependencies
  };
}

function priority(contract){
  const parentLeverage=canonicalSkillLeverage(
    biggjHistoricalResearchProposals().proposals.find(x=>x.title===contract.title)?.parentCapabilityId
  ).score;
  const score=
    .22*parentLeverage+
    .22*contract.informationValue+
    .18*contract.generality+
    .15*contract.falsifiability+
    .13*contract.dataReadiness+
    .10*contract.strategicImpact-
    .12*contract.complexityCost;
  return {
    parentLeverage,
    score:clamp(score)
  };
}

export function biggjHistoricalProposalResearchQueue(){
  const validity=validateBiggjHistoricalResearchContracts();
  if(!validity.ok) throw new Error('historical research contracts invalid: '+validity.reasons.join(','));
  const recovered=new Map(biggjHistoricalResearchProposals().proposals.map(x=>[x.title,x]));
  const rows=BIGGJ_HISTORICAL_RESEARCH_CONTRACTS.map(c=>{
    const p=priority(c);
    const ready=readiness(c);
    const recovery=recovered.get(c.title);
    return {
      title:c.title,
      parentCapabilityId:recovery.parentCapabilityId,
      researchPriority:p.score,
      parentDependencyLeverage:p.parentLeverage,
      informationValue:c.informationValue,
      generality:c.generality,
      falsifiability:c.falsifiability,
      dataReadiness:c.dataReadiness,
      strategicImpact:c.strategicImpact,
      complexityCost:c.complexityCost,
      researchable:ready.researchable,
      implementationReady:ready.implementationReady,
      blockingProposalDependencies:ready.blockingProposalDependencies,
      sourceIdeaIds:[...recovery.sourceIdeaIds],
      sourceTitles:[...recovery.sourceTitles],
      question:c.question,
      hypothesis:c.hypothesis,
      falsifier:c.falsifier
    };
  }).sort((a,b)=>
    Number(b.implementationReady)-Number(a.implementationReady)||
    b.researchPriority-a.researchPriority||
    b.informationValue-a.informationValue||
    a.title.localeCompare(b.title)
  );

  return finalized({
    version:BIGGJ_HISTORICAL_PROPOSAL_RESEARCH_GATE_VERSION,
    scoringStatus:'MODELLED_RESEARCH_PLANNING_HEURISTIC_NOT_EVIDENCE',
    formula:'0.22*parentLeverage + 0.22*informationValue + 0.18*generality + 0.15*falsifiability + 0.13*dataReadiness + 0.10*strategicImpact - 0.12*complexityCost',
    queue:rows,
    recommendedFirstResearch:rows[0]?.title||null,
    automaticImplementation:false,
    automaticPromotion:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}

export function biggjHistoricalResearchContract(title){
  const id=String(title||'').toUpperCase();
  const c=BIGGJ_HISTORICAL_RESEARCH_CONTRACTS.find(x=>x.title===id);
  if(!c) throw new Error('historical research contract missing');
  const queue=biggjHistoricalProposalResearchQueue();
  const ranking=queue.queue.find(x=>x.title===id);
  return finalized({
    version:BIGGJ_HISTORICAL_PROPOSAL_RESEARCH_GATE_VERSION,
    ...c,
    parentCapabilityId:ranking.parentCapabilityId,
    researchPriority:ranking.researchPriority,
    parentDependencyLeverage:ranking.parentDependencyLeverage,
    researchable:ranking.researchable,
    implementationReady:ranking.implementationReady,
    blockingProposalDependencies:ranking.blockingProposalDependencies,
    sourceIdeaIds:ranking.sourceIdeaIds,
    sourceTitles:ranking.sourceTitles,
    epistemicStatus:'RESEARCH_PROPOSAL_NOT_VALIDATED',
    automaticImplementation:false,
    automaticPromotion:false,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false
  });
}
