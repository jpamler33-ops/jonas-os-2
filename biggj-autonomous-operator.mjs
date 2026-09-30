
import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_AUTONOMOUS_OPERATOR_VERSION='TCX_BIGGJ_AUTONOMOUS_OPERATOR_V1';

export const DEFAULT_AUTONOMOUS_OPERATOR_POLICY=Object.freeze({
  startupGraceMs:120_000,
  actionCooldownMs:300_000,
  maxRecoveryAttempts:3,
  maxActionsPerCycle:3,
  maxIncidentHistory:96,
  maxRecoveryHistory:64
});

function finite(v,f=0){
  const n=Number(v);
  return Number.isFinite(n)?n:f;
}
function arr(v){ return Array.isArray(v)?v:[]; }
function clone(v){ return v==null?v:structuredClone(v); }
function uniq(xs){ return [...new Set(arr(xs).filter(Boolean).map(String))]; }

const PASSIVE_DATA_NEEDS=new Set([
  'MORE_POINT_IN_TIME_DATA',
  'FORWARD_SHADOW_OBSERVATIONS',
  'INDEPENDENT_EPISODES',
  'REGIME_DIVERSITY',
  'LABELLED_FORWARD_OUTCOMES',
  'FRESH_FORWARD_EVIDENCE',
  'OOS_FORECAST_OUTCOMES',
  'CHALLENGER_FORWARD_TRADES',
  'INDEPENDENT_SHADOW_TRADES',
  'MULTI_REGIME_OUTCOMES',
  'FEATURE_COMPLETE_FORWARD_ROWS'
]);

function isPassiveDataWait(factorySummary,assessments,tasks){
  const needs=arr(factorySummary?.dataNeeds).map(String);
  if(String(factorySummary?.mode)!=='RESEARCH_STALLED')return false;
  if(!needs.length||!tasks.length)return false;
  if(!needs.every(x=>PASSIVE_DATA_NEEDS.has(x)))return false;
  if(!tasks.every(x=>x?.automaticShadowEligible===true&&x?.manualReviewRequired!==true))return false;
  return assessments.every(x=>['HEALTHY','WARMING_UP','BACKPRESSURE'].includes(String(x?.state)));
}

function finalized(core){
  return Object.freeze({...core,fingerprint:sha256(core)});
}
function verifyFingerprint(value){
  if(!value||typeof value!=='object')return false;
  const {fingerprint,...core}=value;
  return fingerprint===sha256(core);
}

function incidentKey(kind,subject){ return String(kind)+'|'+String(subject||'SYSTEM'); }

function freshestOperation(operationNames,operations={}){
  let best=null;
  for(const name of arr(operationNames)){
    const op=operations?.[name];
    if(!op)continue;
    const row={name,...op};
    if(!best||finite(row.lastAt,-1)>finite(best.lastAt,-1))best=row;
  }
  return best;
}

function taskOwnerAssessment(task,{operations,ownerPolicies,uptimeMs,asOf,policy}){
  if(task?.manualReviewRequired===true){
    return {
      taskId:task.taskId,
      subject:task.subject,
      handler:task.autoHandler||null,
      state:'APPROVAL_REQUIRED',
      reason:'MANUAL_GOVERNANCE_REVIEW_REQUIRED',
      recoveryAction:null
    };
  }
  const handler=String(task?.autoHandler||'');
  if(!handler){
    return {
      taskId:task.taskId,
      subject:task.subject,
      handler:null,
      state:'UNOWNED',
      reason:'NO_AUTOMATIC_HANDLER',
      recoveryAction:null
    };
  }
  const owner=ownerPolicies?.[handler]||null;
  if(!owner){
    return {
      taskId:task.taskId,
      subject:task.subject,
      handler,
      state:'UNOWNED',
      reason:'HANDLER_POLICY_MISSING',
      recoveryAction:null
    };
  }
  if(owner.enabled===false){
    return {
      taskId:task.taskId,
      subject:task.subject,
      handler,
      state:'DISABLED',
      reason:'REQUIRED_HANDLER_DISABLED',
      recoveryAction:owner.recoveryAction||null
    };
  }
  const freshest=freshestOperation(owner.operations,operations);
  if(!freshest){
    if(finite(uptimeMs)<finite(policy.startupGraceMs)){
      return {
        taskId:task.taskId,subject:task.subject,handler,
        state:'WARMING_UP',reason:'OWNER_HAS_NOT_REPORTED_WITHIN_STARTUP_GRACE',
        recoveryAction:null
      };
    }
    return {
      taskId:task.taskId,subject:task.subject,handler,
      state:'STALE',reason:'OWNER_HEARTBEAT_MISSING',
      recoveryAction:owner.recoveryAction||null
    };
  }
  const ageMs=Math.max(0,finite(asOf)-finite(freshest.lastAt));
  const maxSilentMs=Math.max(15_000,finite(owner.maxSilentMs,300_000));
  if(ageMs>maxSilentMs){
    return {
      taskId:task.taskId,subject:task.subject,handler,
      state:'STALE',reason:'OWNER_HEARTBEAT_STALE',
      lastOperation:freshest.name,lastAt:freshest.lastAt,ageMs,maxSilentMs,
      recoveryAction:owner.recoveryAction||null
    };
  }
  if(freshest.lastError){
    const signal=String(freshest.lastError);
    if(signal.startsWith('DEFERRED_')||signal.startsWith('SKIPPED_')){
      return {
        taskId:task.taskId,subject:task.subject,handler,
        state:'BACKPRESSURE',reason:signal,
        lastOperation:freshest.name,lastAt:freshest.lastAt,ageMs,maxSilentMs,
        recoveryAction:null
      };
    }
    return {
      taskId:task.taskId,subject:task.subject,handler,
      state:'ERROR',reason:'OWNER_LAST_OPERATION_ERROR',
      lastOperation:freshest.name,lastAt:freshest.lastAt,ageMs,maxSilentMs,
      error:signal,
      recoveryAction:owner.recoveryAction||null
    };
  }
  return {
    taskId:task.taskId,subject:task.subject,handler,
    state:'HEALTHY',reason:'OWNER_ACTIVE',
    lastOperation:freshest.name,lastAt:freshest.lastAt,ageMs,maxSilentMs,
    recoveryAction:null
  };
}

function updateIncident(memory,key,{kind,subject,reason,asOf,recoveryAction,policy}){
  const prior=memory?.[key]||null;
  return {
    key,
    kind,
    subject:String(subject||'SYSTEM'),
    reason:String(reason||'UNKNOWN'),
    firstSeenAt:finite(prior?.firstSeenAt,asOf),
    lastSeenAt:asOf,
    cycles:finite(prior?.cycles,0)+1,
    recoveryAttempts:finite(prior?.recoveryAttempts,0),
    lastRecoveryAt:finite(prior?.lastRecoveryAt,null),
    recoveryAction:recoveryAction||prior?.recoveryAction||null,
    exhausted:finite(prior?.recoveryAttempts,0)>=finite(policy.maxRecoveryAttempts,3)
  };
}

function maybeRecoveryAction(incident,{asOf,policy}){
  if(!incident?.recoveryAction)return null;
  if(incident.recoveryAttempts>=policy.maxRecoveryAttempts)return null;
  if(incident.lastRecoveryAt!=null&&asOf-incident.lastRecoveryAt<policy.actionCooldownMs)return null;
  return Object.freeze({
    actionId:'opact_'+sha256({
      kind:incident.kind,
      subject:incident.subject,
      action:incident.recoveryAction,
      attempt:incident.recoveryAttempts+1
    }).slice(0,24),
    type:String(incident.recoveryAction),
    incidentKey:incident.key,
    subject:incident.subject,
    attempt:incident.recoveryAttempts+1,
    reversible:true,
    productionMutationAllowed:false,
    canExecuteLive:false
  });
}

function markPlannedRecoveries(incidents,actions,asOf,policy){
  const next={...incidents};
  for(const action of actions){
    const row=next[action.incidentKey];
    if(!row)continue;
    next[action.incidentKey]={
      ...row,
      recoveryAttempts:finite(row.recoveryAttempts,0)+1,
      lastRecoveryAt:asOf,
      exhausted:finite(row.recoveryAttempts,0)+1>=finite(policy?.maxRecoveryAttempts,3)
    };
  }
  return next;
}

export function createBiggjAutonomousOperator({asOf=Date.now()}={}){
  const t=finite(asOf,Date.now());
  return finalized({
    version:BIGGJ_AUTONOMOUS_OPERATOR_VERSION,
    createdAt:t,
    updatedAt:t,
    revision:0,
    mode:'INITIALIZING',
    operatorNeeded:false,
    humanJobRemaining:'SYSTEM_STARTUP_ONLY',
    incidents:{},
    ownerAssessments:[],
    plannedActions:[],
    recoveryHistory:[],
    lastReason:'INITIALIZED',
    safety:{
      execution:'SHADOW_ONLY',
      canExecute:false,
      canExecuteLive:false,
      automaticPrimaryMutation:false,
      automaticPromotion:false,
      automaticSkillTransition:false,
      reversibleRecoveryOnly:true
    }
  });
}

export function verifyBiggjAutonomousOperator(state){
  const reasons=[];
  if(state?.version!==BIGGJ_AUTONOMOUS_OPERATOR_VERSION)reasons.push('VERSION_INVALID');
  if(state?.safety?.execution!=='SHADOW_ONLY')reasons.push('EXECUTION_MODE_INVALID');
  if(state?.safety?.canExecute!==false||state?.safety?.canExecuteLive!==false)reasons.push('LIVE_EXECUTION_MUST_BE_FALSE');
  if(state?.safety?.automaticPrimaryMutation!==false)reasons.push('PRIMARY_MUTATION_MUST_BE_FALSE');
  if(state?.safety?.automaticPromotion!==false)reasons.push('AUTOMATIC_PROMOTION_MUST_BE_FALSE');
  if(state?.safety?.automaticSkillTransition!==false)reasons.push('AUTOMATIC_SKILL_TRANSITION_MUST_BE_FALSE');
  if(!Array.isArray(state?.ownerAssessments))reasons.push('OWNER_ASSESSMENTS_INVALID');
  if(!Array.isArray(state?.plannedActions))reasons.push('PLANNED_ACTIONS_INVALID');
  if(state?.incidents==null||typeof state.incidents!=='object'||Array.isArray(state.incidents))reasons.push('INCIDENTS_INVALID');
  if(!verifyFingerprint(state))reasons.push('FINGERPRINT_MISMATCH');
  return {ok:reasons.length===0,reasons};
}

export function refreshBiggjAutonomousOperator(state,{
  factorySummary=null,
  operations={},
  ownerPolicies={},
  uptimeMs=0,
  asOf=Date.now(),
  reason='PERIODIC_OPERATOR_CYCLE',
  policy={}
}={}){
  const base=state||createBiggjAutonomousOperator({asOf});
  const verified=verifyBiggjAutonomousOperator(base);
  if(!verified.ok)throw new Error('autonomous operator invalid: '+verified.reasons.join(','));
  const t=finite(asOf,Date.now());
  const p={...DEFAULT_AUTONOMOUS_OPERATOR_POLICY,...(policy||{})};
  const tasks=arr(factorySummary?.nextTasks);
  const assessments=tasks.map(task=>taskOwnerAssessment(task,{operations,ownerPolicies,uptimeMs,asOf:t,policy:p}));

  const activeKeys=new Set();
  let incidents={};
  const add=(kind,subject,reason,recoveryAction=null)=>{
    const key=incidentKey(kind,subject);
    activeKeys.add(key);
    incidents[key]=updateIncident(base.incidents,key,{kind,subject,reason,asOf:t,recoveryAction,policy:p});
  };

  for(const row of assessments){
    if(row.state==='APPROVAL_REQUIRED')add('APPROVAL_REQUIRED',row.subject,row.reason,null);
    else if(row.state==='UNOWNED')add('AUTOMATION_GAP',row.subject,row.reason,null);
    else if(row.state==='DISABLED')add('OWNER_DISABLED',row.subject,row.reason,row.recoveryAction);
    else if(row.state==='STALE'||row.state==='ERROR')add('OWNER_UNHEALTHY',row.subject,row.reason,row.recoveryAction);
  }

  const factoryMode=String(factorySummary?.mode||'UNINITIALIZED');
  const waitingForData=isPassiveDataWait(factorySummary,assessments,tasks);
  if(factoryMode==='RESEARCH_STALLED'&&!waitingForData){
    add('RESEARCH_STALLED','RESEARCH_FACTORY','NO_MEASURABLE_RESEARCH_PROGRESS','REFRESH_RESEARCH_STACK');
  }
  if(factoryMode==='MANUAL_REVIEW_REQUIRED'&&!assessments.some(x=>x.state==='APPROVAL_REQUIRED')){
    add('APPROVAL_REQUIRED','RESEARCH_FACTORY','MANUAL_REVIEW_REQUIRED',null);
  }
  if(factoryMode==='DATA_QUALITY_BLOCKED'){
    add('DATA_QUALITY_BLOCKED','RESEARCH_DATA','GOVERNANCE_OR_COVERAGE_BLOCKED',null);
  }
  if(factoryMode==='AUTOMATION_GAP'){
    add('AUTOMATION_GAP','RESEARCH_FACTORY','FACTORY_HAS_UNOWNED_TASKS',null);
  }

  const actions=[];
  for(const row of Object.values(incidents).sort((a,b)=>b.cycles-a.cycles||a.key.localeCompare(b.key))){
    const action=maybeRecoveryAction(row,{asOf:t,policy:p});
    if(action&&actions.length<p.maxActionsPerCycle)actions.push(action);
  }
  incidents=markPlannedRecoveries(incidents,actions,t,p);

  const escalationIncidents=Object.values(incidents).filter(x=>
    x.kind==='APPROVAL_REQUIRED'||
    x.kind==='AUTOMATION_GAP'||
    (x.kind==='OWNER_DISABLED'&&!x.recoveryAction)||
    (x.kind==='OWNER_UNHEALTHY'&&!x.recoveryAction&&x.cycles>=3)||
    (x.kind==='DATA_QUALITY_BLOCKED'&&x.cycles>=3)||
    x.recoveryAttempts>=p.maxRecoveryAttempts
  );

  const operatorNeeded=escalationIncidents.length>0;
  let mode='HANDS_OFF';
  if(operatorNeeded)mode='ESCALATION_REQUIRED';
  else if(actions.length)mode='SELF_HEALING';
  else if(waitingForData)mode='WAITING_FOR_DATA';
  else if(Object.keys(incidents).length)mode='AUTO_MONITORING';
  else if(factoryMode==='MANUAL_REVIEW_REQUIRED')mode='ESCALATION_REQUIRED';

  const humanJobRemaining=operatorNeeded
    ?uniq(escalationIncidents.map(x=>x.kind)).join(',')
    :'EXCEPTIONS_ONLY';

  const recoveryHistory=arr(base.recoveryHistory)
    .map(row=>{
      if(!['EXECUTED','EXECUTED_UNRESOLVED'].includes(String(row?.result))||!row?.incidentKey)return row;
      if(!incidents[row.incidentKey]){
        return {...row,result:'VERIFIED_RESOLVED',verifiedAt:t};
      }
      return {...row,result:'EXECUTED_UNRESOLVED',verifiedAt:t};
    })
    .slice(-(p.maxRecoveryHistory-1));
  for(const action of actions){
    recoveryHistory.push({
      at:t,
      actionId:action.actionId,
      incidentKey:action.incidentKey,
      type:action.type,
      subject:action.subject,
      attempt:action.attempt,
      result:'PLANNED'
    });
  }

  const core={
    version:BIGGJ_AUTONOMOUS_OPERATOR_VERSION,
    createdAt:finite(base.createdAt,t),
    updatedAt:t,
    revision:finite(base.revision,0)+1,
    mode,
    operatorNeeded,
    humanJobRemaining,
    factoryMode,
    waitingForData,
    factoryOperatorDataOnly:factorySummary?.operatorDataOnly===true,
    automationCoverage:tasks.length?assessments.filter(x=>!['UNOWNED','DISABLED'].includes(x.state)).length/tasks.length:1,
    incidents:Object.fromEntries(Object.entries(incidents).slice(-p.maxIncidentHistory)),
    ownerAssessments:assessments,
    plannedActions:actions,
    recoveryHistory,
    lastReason:String(reason),
    safety:{
      execution:'SHADOW_ONLY',
      canExecute:false,
      canExecuteLive:false,
      automaticPrimaryMutation:false,
      automaticPromotion:false,
      automaticSkillTransition:false,
      reversibleRecoveryOnly:true
    }
  };
  return Object.freeze({
    changed:true,
    state:finalized(core),
    actions:Object.freeze(actions)
  });
}

export function recordBiggjAutonomousOperatorActionResults(state,results,{asOf=Date.now()}={}){
  const v=verifyBiggjAutonomousOperator(state);
  if(!v.ok)throw new Error('autonomous operator invalid: '+v.reasons.join(','));
  const t=finite(asOf,Date.now());
  const byId=new Map(arr(results).map(x=>[String(x.actionId),x]));
  const history=arr(state.recoveryHistory).map(row=>{
    const result=byId.get(String(row.actionId));
    if(!result)return row;
    return {
      ...row,
      completedAt:t,
      result:result.ok===true?'EXECUTED':'FAILED',
      error:result.ok===true?null:String(result.error||'UNKNOWN').slice(0,240)
    };
  }).slice(-DEFAULT_AUTONOMOUS_OPERATOR_POLICY.maxRecoveryHistory);
  const {fingerprint,...rest}=state;
  return finalized({...rest,updatedAt:t,revision:finite(state.revision)+1,recoveryHistory:history,plannedActions:[]});
}

export function biggjAutonomousOperatorSummary(state){
  const v=verifyBiggjAutonomousOperator(state);
  const incidents=Object.values(state?.incidents||{});
  return Object.freeze({
    version:BIGGJ_AUTONOMOUS_OPERATOR_VERSION,
    healthy:v.ok,
    reasons:v.reasons,
    mode:String(state?.mode||'UNINITIALIZED'),
    operatorNeeded:state?.operatorNeeded===true,
    humanJobRemaining:String(state?.humanJobRemaining||'UNKNOWN'),
    factoryMode:String(state?.factoryMode||'UNKNOWN'),
    waitingForData:state?.waitingForData===true,
    automationCoverage:finite(state?.automationCoverage,0),
    activeIncidents:incidents.length,
    approvalRequired:incidents.filter(x=>x.kind==='APPROVAL_REQUIRED').length,
    selfHealing:arr(state?.plannedActions).length,
    exhaustedRecoveries:incidents.filter(x=>x.exhausted===true).length,
    verifiedResolvedRecoveries:arr(state?.recoveryHistory).filter(x=>x?.result==='VERIFIED_RESOLVED').length,
    unresolvedRecoveries:arr(state?.recoveryHistory).filter(x=>x?.result==='EXECUTED_UNRESOLVED').length,
    ownerAssessments:arr(state?.ownerAssessments).slice(0,12),
    plannedActions:arr(state?.plannedActions).slice(0,8),
    recoveryHistory:arr(state?.recoveryHistory).slice(-12),
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    automaticPromotion:false,
    automaticSkillTransition:false
  });
}

export async function loadBiggjAutonomousOperator(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const raw=await readFile(filePath,'utf8');
    const state=JSON.parse(raw);
    const v=verifyBiggjAutonomousOperator(state);
    if(!v.ok)throw new Error(v.reasons.join(','));
    return state;
  }catch(err){
    if(err?.code==='ENOENT')return createBiggjAutonomousOperator();
    try{await rename(filePath,filePath+'.corrupt-'+Date.now());}catch{}
    return createBiggjAutonomousOperator();
  }
}

export async function saveBiggjAutonomousOperator(filePath,state){
  const v=verifyBiggjAutonomousOperator(state);
  if(!v.ok)throw new Error('autonomous operator invalid: '+v.reasons.join(','));
  await mkdir(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return state;
}
