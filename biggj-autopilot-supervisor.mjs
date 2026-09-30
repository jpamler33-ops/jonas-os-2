import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_AUTOPILOT_SUPERVISOR_VERSION='BIGGJ_AUTOPILOT_SUPERVISOR_V1';

const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const txt=(v,f='')=>{const s=String(v??'').trim();return s||f;};
const arr=v=>Array.isArray(v)?v:[];
const deepFreeze=v=>{
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v))deepFreeze(x);
  }
  return v;
};
const coreFingerprint=core=>deepFreeze({...core,fingerprint:sha256(core)});

export function buildBiggjAutopilotSupervisor(snapshot={}, {asOf=Date.now()}={}){
  const h=snapshot?.health||{};
  const readiness=h?.operationalReadiness||{};
  const operator=h?.autonomousOperator||{};
  const factory=h?.autonomousResearchFactory||{};
  const world=h?.biggjWorldModel||{};
  const epistemic=h?.biggjEpistemicKernel||{};
  const rulebook=h?.biggjRulebook?.runtime||{};
  const discord=h?.discord||h?.discordBridge||{};
  const persistence={
    forecast:h?.institutionalForecastRuntime?.healthy!==false,
    shadowOms:h?.shadowOms?.healthy!==false,
    shadowPortfolio:h?.shadowPortfolio?.healthy!==false,
    livingResearch:h?.biggjLivingResearch?.healthy!==false,
    epistemic:h?.biggjEpistemicKernel?.healthy!==false
  };

  const critical=[];
  const warnings=[];
  const waiting=[];
  if(readiness?.ready!==true)critical.push('OPERATIONAL_READINESS_NOT_READY');
  if(operator?.operatorNeeded===true)critical.push('OPERATOR_REQUIRED');
  if(finite(operator?.approvalRequired)>0)critical.push('APPROVAL_REQUIRED');
  if(finite(operator?.activeIncidents)>0)critical.push('ACTIVE_INCIDENTS');
  if(rulebook?.state&&String(rulebook.state).toUpperCase()!=='PASS')critical.push('RULEBOOK_NOT_PASS');
  if(world?.healthy===false)critical.push('WORLD_MODEL_UNHEALTHY');
  if(epistemic?.healthy===false)critical.push('EPISTEMIC_KERNEL_UNHEALTHY');
  for(const [name,ok] of Object.entries(persistence))if(ok===false)critical.push('PERSISTENCE_'+name.toUpperCase()+'_UNHEALTHY');

  const manual=finite(factory?.manual);
  if(manual>0)critical.push('MANUAL_RESEARCH_TASKS');
  if(finite(factory?.unowned)>0)critical.push('UNOWNED_RESEARCH_TASKS');

  if(String(factory?.mode||'').toUpperCase()==='DATA_QUALITY_BLOCKED'){
    if(operator?.waitingForData===true){
      waiting.push('MORE_POINT_IN_TIME_DATA');
    }else{
      warnings.push('DATA_QUALITY_BLOCKED');
    }
  }
  if(String(operator?.mode||'').toUpperCase()==='WAITING_FOR_DATA')waiting.push('OPERATOR_WAITING_FOR_DATA');
  if(finite(factory?.researchLeverage?.stalledTasks)>0||finite(factory?.leverage?.stalledTaskCount)>0){
    warnings.push('STALLED_RESEARCH_TASKS');
  }
  if(finite(operator?.automationCoverage,1)<1)warnings.push('AUTOMATION_COVERAGE_BELOW_100');
  if(discord?.ready===false)warnings.push('DISCORD_NOT_READY');

  let state='AUTOPILOT';
  if(critical.length)state='ESCALATION_REQUIRED';
  else if(warnings.length)state='AUTOPILOT_DEGRADED';
  else if(waiting.length)state='WAITING_FOR_DATA';

  const humanActionRequired=critical.length>0;
  const recommendation=humanActionRequired
    ?'Resolve only the listed critical exception; do not interrupt normal research loops.'
    :waiting.length
      ?'No human action. Continue autonomous PIT evidence collection and outcome resolution.'
      :'No human action. Continue autonomous operation.';

  const core={
    version:BIGGJ_AUTOPILOT_SUPERVISOR_VERSION,
    asOf:finite(asOf),
    state,
    humanActionRequired,
    shouldNotifyHuman:humanActionRequired,
    operator:{
      mode:txt(operator?.mode,'UNKNOWN'),
      operatorNeeded:operator?.operatorNeeded===true,
      approvalRequired:finite(operator?.approvalRequired),
      activeIncidents:finite(operator?.activeIncidents),
      automationCoverage:finite(operator?.automationCoverage,0),
      waitingForData:operator?.waitingForData===true,
      humanJobRemaining:txt(operator?.humanJobRemaining,'EXCEPTIONS_ONLY')
    },
    research:{
      mode:txt(factory?.mode,'UNKNOWN'),
      automatic:finite(factory?.automatic),
      manual,
      unowned:finite(factory?.unowned),
      dataNeeds:arr(factory?.dataNeeds).map(String).slice(0,12),
      dataReadiness:finite(factory?.researchLeverage?.dataReadiness??factory?.leverage?.dataState?.readiness,0),
      stalledTasks:finite(factory?.researchLeverage?.stalledTasks??factory?.leverage?.stalledTaskCount,0)
    },
    science:{
      worldModelHealthy:world?.healthy!==false,
      worldModelVersion:txt(world?.version,'UNKNOWN'),
      epistemicHealthy:epistemic?.healthy!==false,
      epistemicVersion:txt(epistemic?.version,'UNKNOWN'),
      rulebookState:txt(rulebook?.state,'UNKNOWN')
    },
    persistence,
    critical,
    warnings,
    waiting:[...new Set(waiting)],
    recommendation,
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    semantics:{
      waitingForDataIsNotFailure:true,
      stalledResearchIsNotHumanWorkByDefault:true,
      humanEscalationOnlyForExplicitExceptions:true,
      supervisorDoesNotPromoteModelsOrTheories:true
    }
  };
  return coreFingerprint(core);
}

export function biggjAutopilotSupervisorSummary(state={}){
  if(state?.version!==BIGGJ_AUTOPILOT_SUPERVISOR_VERSION)throw new Error('BIGGJ_AUTOPILOT_SUPERVISOR_INVALID');
  return deepFreeze({
    version:state.version,
    asOf:state.asOf,
    state:state.state,
    humanActionRequired:state.humanActionRequired,
    shouldNotifyHuman:state.shouldNotifyHuman,
    operator:state.operator,
    research:state.research,
    science:state.science,
    persistence:state.persistence,
    critical:state.critical,
    warnings:state.warnings,
    waiting:state.waiting,
    recommendation:state.recommendation,
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    fingerprint:state.fingerprint
  });
}
