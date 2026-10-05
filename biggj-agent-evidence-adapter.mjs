export const BIGGJ_AGENT_EVIDENCE_ADAPTER_VERSION='BIGGJ_AGENT_EVIDENCE_ADAPTER_V1';

const SOURCES=[
  ['shadowCompetition','SHADOW_COMPETITION'],
  ['experimentGovernor','EXPERIMENT_GOVERNOR'],
  ['featureResearch','FEATURE_RESEARCH'],
  ['indicatorEvolution','INDICATOR_EVOLUTION'],
  ['learnedChallenger','LEARNED_CHALLENGER'],
  ['parallelStrategyWorlds','PARALLEL_STRATEGY_WORLDS'],
  ['walletResearchManager','WALLET_RESEARCH_MANAGER'],
  ['researchActivity','SHADOW_RESEARCH_ACTIVITY'],
  ['researchFactory','AUTONOMOUS_RESEARCH_FACTORY'],
  ['autonomousResearchFactory','AUTONOMOUS_RESEARCH_FACTORY']
];

function stableJson(value){
  if(value==null) return 'null';
  if(Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if(typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

function fingerprint(label,value){
  const s=`${label}:${stableJson(value)}`;
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return `fp_${(h>>>0).toString(16).padStart(8,'0')}`;
}

export function extractBiggjAgentEvidence(engineState={}, {pointInTimeAt=Date.now()}={}){
  const out=[];
  const seen=new Set();
  for(const [key,label] of SOURCES){
    const value=engineState?.[key];
    if(value==null) continue;
    const fp=fingerprint(label,value);
    if(seen.has(fp)) continue;
    seen.add(fp);
    out.push({
      source:label,
      kind:'ENGINE_SNAPSHOT',
      subject:key,
      data:value,
      pointInTimeAt,
      independentKey:`${label}:${fp}`,
      fingerprint:fp,
      authority:'EVIDENCE_ONLY'
    });
  }
  return out;
}

export function ingestBiggjEngineEvidence(bus, engineState={}, options={}){
  if(!bus?.addEvidence) throw new Error('AGENT_BUS_REQUIRED');
  const rows=extractBiggjAgentEvidence(engineState,options);
  const accepted=[];
  for(const row of rows){
    const ev=bus.addEvidence(row);
    accepted.push(ev);
    bus.publish({
      from:'observer-1',
      to:'orchestrator-1',
      type:'ENGINE_EVIDENCE_AVAILABLE',
      payload:{source:row.source,subject:row.subject,fingerprint:row.fingerprint},
      evidenceIds:[ev.evidenceId]
    });
  }
  return {
    version:BIGGJ_AGENT_EVIDENCE_ADAPTER_VERSION,
    ingested:accepted.length,
    evidenceIds:accepted.map(x=>x.evidenceId),
    sources:[...new Set(rows.map(x=>x.source))],
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    automaticPrimaryMutation:false
  };
}

export function buildBiggjAgentResearchContext(state={}){
  const researchFactory=state.autonomousResearchFactory||state.researchFactory||{};
  return {
    ...state,
    autonomousResearchFactory:researchFactory,
    agentEvidenceAdapter:{
      version:BIGGJ_AGENT_EVIDENCE_ADAPTER_VERSION,
      availableSources:SOURCES.map(([,label])=>label),
      execution:'SHADOW_ONLY',
      canExecuteLive:false
    }
  };
}
