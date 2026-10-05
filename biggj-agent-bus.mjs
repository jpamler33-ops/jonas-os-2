// BIGGJ Agent Bus V1
// Research-only coordination layer. No live execution authority.

export const BIGGJ_AGENT_BUS_VERSION = 'BIGGJ_AGENT_BUS_V1';

export const AGENT_ROLES = Object.freeze([
  'OBSERVER',
  'HYPOTHESIS',
  'EXPERIMENT',
  'RED_TEAM',
  'JUDGE',
  'ORCHESTRATOR'
]);

const VALID_DECISIONS = new Set(['REJECT', 'MORE_DATA', 'CHALLENGER', 'ABSTAIN']);

function now() { return Date.now(); }
function id(prefix='msg') { return `${prefix}_${now()}_${Math.random().toString(36).slice(2,10)}`; }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

export class BiggjAgentBus {
  constructor({maxMessages=5000,maxTasks=2000}={}) {
    this.maxMessages=maxMessages;
    this.maxTasks=maxTasks;
    this.agents=new Map();
    this.tasks=[];
    this.messages=[];
    this.evidence=new Map();
    this.audit=[];
  }

  registerAgent({agentId,role,capabilities=[]}={}) {
    if (!agentId) throw new Error('AGENT_ID_REQUIRED');
    if (!AGENT_ROLES.includes(role)) throw new Error('INVALID_AGENT_ROLE');
    const row={agentId,role,capabilities:[...new Set(capabilities)],registeredAt:now(),status:'READY'};
    this.agents.set(agentId,row);
    this.#audit('AGENT_REGISTERED',row);
    return clone(row);
  }

  enqueueTask({type,subject,payload={},priority=0.5,requestedBy='ORCHESTRATOR',requires=[]}={}) {
    if (!type || !subject) throw new Error('TASK_TYPE_AND_SUBJECT_REQUIRED');
    const task={taskId:id('task'),type,subject,payload:clone(payload),priority:Number(priority)||0,requestedBy,requires:[...new Set(requires)],status:'QUEUED',createdAt:now(),claimedBy:null,completedAt:null,result:null};
    this.tasks.push(task);
    this.tasks.sort((a,b)=>b.priority-a.priority||a.createdAt-b.createdAt);
    if (this.tasks.length>this.maxTasks) this.tasks.splice(this.maxTasks);
    this.#audit('TASK_QUEUED',{taskId:task.taskId,type,subject,priority:task.priority});
    return clone(task);
  }

  claimTask(agentId) {
    const agent=this.agents.get(agentId);
    if (!agent) throw new Error('UNKNOWN_AGENT');
    const task=this.tasks.find(t=>t.status==='QUEUED' && (!t.requires.length || t.requires.some(r=>agent.capabilities.includes(r)||r===agent.role)));
    if (!task) return null;
    task.status='RUNNING'; task.claimedBy=agentId; task.claimedAt=now();
    this.#audit('TASK_CLAIMED',{taskId:task.taskId,agentId});
    return clone(task);
  }

  completeTask({taskId,agentId,result,evidenceIds=[]}={}) {
    const task=this.tasks.find(t=>t.taskId===taskId);
    if (!task) throw new Error('UNKNOWN_TASK');
    if (task.claimedBy!==agentId) throw new Error('TASK_OWNER_MISMATCH');
    task.status='COMPLETED'; task.completedAt=now(); task.result=clone(result); task.evidenceIds=[...new Set(evidenceIds)];
    this.#audit('TASK_COMPLETED',{taskId,agentId,evidenceIds:task.evidenceIds});
    return clone(task);
  }

  publish({from,to='ALL',type,payload={},evidenceIds=[]}={}) {
    if (!from || !type) throw new Error('MESSAGE_FROM_AND_TYPE_REQUIRED');
    const message={messageId:id('msg'),from,to,type,payload:clone(payload),evidenceIds:[...new Set(evidenceIds)],createdAt:now()};
    this.messages.push(message);
    if (this.messages.length>this.maxMessages) this.messages.splice(0,this.messages.length-this.maxMessages);
    this.#audit('MESSAGE_PUBLISHED',{messageId:message.messageId,from,to,type});
    return clone(message);
  }

  addEvidence({source,kind,subject,data,pointInTimeAt,independentKey=null}={}) {
    if (!source || !kind || !subject || pointInTimeAt==null) throw new Error('EVIDENCE_PROVENANCE_REQUIRED');
    const evidenceId=id('ev');
    const row={evidenceId,source,kind,subject,data:clone(data),pointInTimeAt:Number(pointInTimeAt),independentKey,recordedAt:now(),immutable:true};
    this.evidence.set(evidenceId,row);
    this.#audit('EVIDENCE_ADDED',{evidenceId,source,kind,subject});
    return clone(row);
  }

  judge({agentId,hypothesisId,decision,reason,evidenceIds=[],replicationAgentIds=[]}={}) {
    const agent=this.agents.get(agentId);
    if (!agent || agent.role!=='JUDGE') throw new Error('JUDGE_ROLE_REQUIRED');
    if (!VALID_DECISIONS.has(decision)) throw new Error('INVALID_DECISION');
    const independentReplications=new Set(replicationAgentIds.filter(x=>x && x!==agentId)).size;
    const promotionBlocked=decision==='CHALLENGER' && independentReplications<1;
    const finalDecision=promotionBlocked?'MORE_DATA':decision;
    const row={hypothesisId,decision:finalDecision,requestedDecision:decision,reason,evidenceIds:[...new Set(evidenceIds)],independentReplications,promotionBlocked,execution:'SHADOW_ONLY',canExecuteLive:false,automaticPrimaryMutation:false,at:now()};
    this.#audit('JUDGE_DECISION',row);
    return clone(row);
  }

  snapshot() {
    return {
      version:BIGGJ_AGENT_BUS_VERSION,
      generatedAt:now(),
      agents:[...this.agents.values()].map(clone),
      queue:{queued:this.tasks.filter(x=>x.status==='QUEUED').length,running:this.tasks.filter(x=>x.status==='RUNNING').length,completed:this.tasks.filter(x=>x.status==='COMPLETED').length},
      evidenceCount:this.evidence.size,
      messageCount:this.messages.length,
      auditCount:this.audit.length,
      execution:'SHADOW_ONLY',
      canExecuteLive:false,
      automaticPrimaryMutation:false
    };
  }

  #audit(type,data) {
    this.audit.push({auditId:id('audit'),type,data:clone(data),at:now()});
    if (this.audit.length>10000) this.audit.splice(0,this.audit.length-10000);
  }
}

export function createDefaultBiggjAgentBus() {
  const bus=new BiggjAgentBus();
  bus.registerAgent({agentId:'observer-1',role:'OBSERVER',capabilities:['PIT_DATA','MARKET_STATE','DATA_GAPS']});
  bus.registerAgent({agentId:'hypothesis-1',role:'HYPOTHESIS',capabilities:['PATTERN_MINING','HYPOTHESIS_GENERATION']});
  bus.registerAgent({agentId:'experiment-1',role:'EXPERIMENT',capabilities:['WALK_FORWARD','COUNTERFACTUAL','SHADOW_TEST']});
  bus.registerAgent({agentId:'red-team-1',role:'RED_TEAM',capabilities:['LEAKAGE','OVERFIT','CONFOUNDERS']});
  bus.registerAgent({agentId:'judge-1',role:'JUDGE',capabilities:['EVIDENCE_GRADING','REPLICATION_GATE']});
  bus.registerAgent({agentId:'orchestrator-1',role:'ORCHESTRATOR',capabilities:['TASK_ROUTING','DEDUPLICATION','PRIORITIZATION']});
  return bus;
}
