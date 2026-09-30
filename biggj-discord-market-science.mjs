export const BIGGJ_DISCORD_MARKET_SCIENCE_VERSION='BIGGJ_DISCORD_MARKET_SCIENCE_V1';

export const BIGGJ_DISCORD_MARKET_SCIENCE_LAYOUT=Object.freeze([
  {category:'BIGGJ • CONTROL ROOM',channels:[
    {name:'science-home',topic:'BIGGJ Startpunkt: Knowledge Frontier, nächste Forschungsfrage, Science-Status und epistemische Grenzen.'},
    {name:'world-model',topic:'Globales World Model: PIT Market States, Association Topology, Information-Flow-Hypothesen, Forecastability und Latent-State Research.'},
    {name:'science-lab',topic:'Research Laboratory: Experimente, Widersprüche, Missing Variables, OOS-/Placebo-/Regime-Tests und nächste Forschungsarbeit.'},
    {name:'decision-intelligence',topic:'Downstream Decision Intelligence: Forecast Proof, TCX/RIFT Status und warum eine Entscheidung ENTER/WATCH/ABSTAIN lautet.'},
    {name:'autopilot-supervisor',topic:'Exception-only Autopilot Supervisor: zeigt, ob BIGGJ allein weiterlaufen kann und meldet nur echte menschliche Blocker.'}
  ]}
]);

export const BIGGJ_DISCORD_MARKET_SCIENCE_MARKERS=Object.freeze({
  science:'BIGGJ_DISCORD_SCIENCE_HOME_V1',
  world:'BIGGJ_DISCORD_WORLD_MODEL_V1',
  lab:'BIGGJ_DISCORD_SCIENCE_LAB_V1',
  decisions:'BIGGJ_DISCORD_DECISION_INTELLIGENCE_V1',
  autopilot:'BIGGJ_DISCORD_AUTOPILOT_SUPERVISOR_V1'
});

const arr=v=>Array.isArray(v)?v:[];
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clip=(v,max=900)=>{
  const s=String(v==null?'—':v).replace(/\s+/g,' ').trim()||'—';
  return s.length<=max?s:s.slice(0,Math.max(1,max-1))+'…';
};
const pct=v=>{
  const n=Number(v);
  return Number.isFinite(n)?Math.round(Math.max(0,Math.min(1,n))*100)+'%':'—';
};
const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('de-DE',{maximumFractionDigits:2}):'—';
const safeField=(name,value,inline=false)=>({name:clip(name,256),value:clip(value,1024),inline:Boolean(inline)});
function payload(title,description,fields,marker,components=[]){
  return {
    embeds:[{
      title,
      description:clip(description,4096),
      fields:arr(fields).slice(0,25),
      footer:{text:marker},
      timestamp:new Date().toISOString()
    }],
    components:arr(components).slice(0,5),
    allowedMentions:{parse:[]}
  };
}
const scienceNav=()=>[
  {type:1,components:[
    {type:2,style:1,label:'Science',custom_id:'dc7:science:home'},
    {type:2,style:2,label:'World Model',custom_id:'dc7:science:world'},
    {type:2,style:2,label:'Laboratory',custom_id:'dc7:science:lab'},
    {type:2,style:2,label:'Decisions',custom_id:'dc7:science:decisions'},
    {type:2,style:2,label:'Autopilot',custom_id:'dc7:science:autopilot'}
  ]}
];

export function buildBiggjDiscordScienceHomePayload(snapshot={}){
  const os=snapshot?.biggj||snapshot?.health?.biggjMarketScienceOs||{};
  const science=os?.science||{};
  const frontier=science?.frontier||{};
  const director=science?.director||{};
  const next=director?.nextResearchQuestion||null;
  const agenda=arr(director?.topAgenda).slice(0,5).map((x,i)=>
    (i+1)+'. **'+clip(x.kind||'RESEARCH',34)+'** · '+clip(x.question||x.title||'—',180)+
    '\n   '+clip(x.derivedStatus||'UNKNOWN',28)+' · next '+clip(x.nextExperimentType||'—',42)+' · info '+pct(x.expectedInformationGainProxy)
  ).join('\n\n')||'Keine priorisierte Science-Agenda.';
  return payload(
    'BIGGJ // MARKET SCIENCE',
    '**Das ist BIGGJ.** Trading ist nur eine nachgelagerte Anwendung. Der Kern baut überprüfbares Marktwissen und darf UNKNOWN als Ergebnis behalten.',
    [
      safeField('KNOWLEDGE FRONTIER',[
        'Theorien '+fmt(frontier.total)+' · Evidence '+fmt(frontier.evidence)+' · Experimente '+fmt(frontier.experiments),
        'Robust '+fmt(frontier.robust)+' · Broken '+fmt(frontier.broken)+' · Surprises '+fmt(frontier.surprises)
      ].join('\n')),
      safeField('NÄCHSTE FORSCHUNGSFRAGE',next
        ?'**'+clip(next.kind||'QUESTION',40)+'**\n'+clip(next.question||next.nextExperimentPurpose||'—',800)
        :'Noch keine priorisierte Forschungsfrage.'),
      safeField('TOP SCIENCE AGENDA',agenda),
      safeField('EPISTEMIC FIREWALL','Reality > models · Prediction ≠ explanation · Synthetic evidence ≠ real evidence · PnL kann keine Theorie promoten · UNKNOWN ist gültig.')
    ],
    BIGGJ_DISCORD_MARKET_SCIENCE_MARKERS.science,
    scienceNav()
  );
}

export function buildBiggjDiscordWorldModelPayload(snapshot={}){
  const os=snapshot?.biggj||snapshot?.health?.biggjMarketScienceOs||{};
  const world=os?.worldModel||{};
  const states=arr(world?.markets).slice(0,10).map(x=>
    '• **'+clip(String(x.symbol||'UNKNOWN').replace('USDT','/USDT'),20)+'** · '+clip(x.regime||'UNKNOWN',30)+' · '+clip(x.epistemicClass||'INFERRED',18)+
    (Number.isFinite(Number(x.score))?' · score '+pct(x.score):'')
  ).join('\n')||'Keine kanonischen Market States.';
  const assoc=world?.associationGraph||{};
  const flow=world?.informationFlowGraph||{};
  const pred=world?.predictabilityField||{};
  const latent=world?.latentStateDiscovery||{};
  const candidate=latent?.researchCandidate||{};
  const flowRows=arr(flow?.candidates||flow?.edges).slice(0,5).map(x=>
    '• '+clip(x.leader||x.from||'?',18)+' → '+clip(x.follower||x.to||'?',18)+' · lag '+fmt(x.lagBars)+' · ρ '+fmt(x.rho)
  ).join('\n')||'Keine Information-Flow-Kandidaten.';
  const predRows=arr(pred?.markets).slice(0,6).map(x=>
    '• '+clip(x.symbol,18)+' · '+clip(x.status||'UNKNOWN',22)+(Number.isFinite(Number(x.score))?' · '+pct(x.score):'')
  ).join('\n')||'Noch keine Forecastability-Details.';
  return payload(
    'BIGGJ // WORLD MODEL',
    '**Globale Marktansicht mit Evidence-Bounds.** Association/Lead-Lag sind keine Kausalität; ein MODELLED State Candidate besitzt keine Trading Authority.',
    [
      safeField('MARKET STATES · '+fmt(world.marketsObserved),states),
      safeField('TOPOLOGY',[
        'Association edges '+fmt(assoc?.edges?.length),
        'Information-flow status '+clip(flow?.status||'UNKNOWN',32),
        flowRows
      ].join('\n')),
      safeField('LATENT STATE',[
        'Canonical '+clip(latent?.status||'UNKNOWN',30),
        'Estimator promoted '+(latent?.estimatorPromoted===true?'YES':'NO'),
        candidate?.status==='RESEARCH_CANDIDATE'
          ?'Research candidate **'+clip(candidate.candidateKey||'UNNAMED',120)+'** · MODELLED · authority NONE'
          :'Kein ausreichend belegter Research Candidate.'
      ].join('\n')),
      safeField('FORECASTABILITY',[
        'Status '+clip(pred?.status||'UNKNOWN',34),
        predRows,
        'Forecast performance ≠ intrinsic predictability.'
      ].join('\n'))
    ],
    BIGGJ_DISCORD_MARKET_SCIENCE_MARKERS.world,
    scienceNav()
  );
}

export function buildBiggjDiscordScienceLabPayload(snapshot={}){
  const os=snapshot?.biggj||snapshot?.health?.biggjMarketScienceOs||{};
  const lab=os?.laboratory||{};
  const agenda=arr(lab?.agenda).slice(0,8).map((x,i)=>
    (i+1)+'. **'+clip(x.nextExperimentType||x.kind||'EXPERIMENT',44)+'**\n'+
    clip(x.question||x.nextExperimentPurpose||'—',260)+
    '\n   replication gap '+pct(x.replicationGap)+' · generalization gap '+pct(x.generalizationGap)
  ).join('\n\n')||'Keine Experiment-Priorität.';
  const missing=arr(lab?.dataRequests).slice(0,6).map(x=>
    '• **'+clip(x.variable||'UNKNOWN',48)+'** · '+fmt(x.surpriseCount)+' surprises · P '+pct(x.priority)
  ).join('\n')||'Keine wiederkehrenden Missing-Variable-Cluster.';
  return payload(
    'BIGGJ // SCIENTIFIC LAB',
    '**Hier versucht BIGGJ seine eigenen Ideen zu widerlegen.** OOS, Placebo, Ablation, Cross-Market und Cross-Regime – ohne automatische Theorie-Promotion.',
    [
      safeField('LAB STATUS',[
        'Experimente '+fmt(lab.experimentCount),
        'Factory '+clip(lab.factoryMode||'UNKNOWN',34),
        'Automatic '+fmt(lab.automaticResearchTasks)+' · Manual '+fmt(lab.manualResearchTasks)+' · Data-only '+fmt(lab.dataOnlyTasks)
      ].join('\n')),
      safeField('EXPERIMENT QUEUE',agenda),
      safeField('MISSING VARIABLES',missing),
      safeField('BOUNDARY','Synthetic worlds können Hypothesen stressen, zählen aber nicht als reale Evidence. Lab → PRIMARY mutation: BLOCKED.')
    ],
    BIGGJ_DISCORD_MARKET_SCIENCE_MARKERS.lab,
    scienceNav()
  );
}

export function buildBiggjDiscordDecisionPayload(snapshot={}){
  const os=snapshot?.biggj||snapshot?.health?.biggjMarketScienceOs||{};
  const d=os?.decisionIntelligence||{};
  const proof=d?.proof||{};
  const tcx=d?.tcx||{};
  const rift=d?.rift||{};
  return payload(
    'BIGGJ // DECISION INTELLIGENCE',
    '**Downstream-Anwendung des Science-Stacks.** TCX/RIFT darf validierte Erkenntnisse konsumieren, aber keine wissenschaftliche Wahrheit definieren.',
    [
      safeField('PROOF FEED',[
        'Live '+fmt(proof.live)+' · Awaiting '+fmt(proof.awaitingOutcome)+' · Resolved '+fmt(proof.resolved),
        'Hits '+fmt(proof.hits)+' · Misses '+fmt(proof.misses)+' · Invalid '+fmt(proof.invalid)+' · Learned '+fmt(proof.learned),
        'Hit rate ist kein Wahrheitszertifikat.'
      ].join('\n')),
      safeField('TCX',[
        'Role '+clip(tcx.role||'DECISION_APPLICATION',40),
        'Consumes validated science '+(tcx.consumesValidatedScience===true?'YES':'UNKNOWN'),
        'Scientific authority '+(tcx.scientificAuthority===true?'YES':'NO')
      ].join('\n'),true),
      safeField('RIFT',[
        'Role '+clip(rift.role||'MECHANISM_APPLICATION',40),
        'Scientific authority '+(rift.scientificAuthority===true?'YES':'NO')
      ].join('\n'),true),
      safeField('EXECUTION','SHADOW_ONLY · ABSTAIN first-class · real orders blocked')
    ],
    BIGGJ_DISCORD_MARKET_SCIENCE_MARKERS.decisions,
    scienceNav()
  );
}

export function buildBiggjDiscordAutopilotPayload(snapshot={}){
  const a=snapshot?.health?.biggjAutopilotSupervisor||{};
  const critical=arr(a?.critical);
  const warnings=arr(a?.warnings);
  const waiting=arr(a?.waiting);
  const status=String(a?.state||'UNKNOWN');
  return payload(
    'BIGGJ // AUTOPILOT SUPERVISOR',
    a?.humanActionRequired===true
      ?'**MENSCHLICHE AKTION ERFORDERLICH.** Nur die gelistete Ausnahme bearbeiten; normale Research-Loops nicht unterbrechen.'
      :'**Du musst aktuell nichts tun.** BIGGJ läuft autonom; passive Datensammlung ist kein Fehler.',
    [
      safeField('AUTOPILOT STATE',[
        '**'+clip(status,44)+'**',
        'Human action '+(a?.humanActionRequired===true?'YES':'NO'),
        'Notify human '+(a?.shouldNotifyHuman===true?'YES':'NO'),
        'Automation '+pct(a?.operator?.automationCoverage),
        'Operator '+clip(a?.operator?.mode||'UNKNOWN',38)+' · approvals '+fmt(a?.operator?.approvalRequired)+' · incidents '+fmt(a?.operator?.activeIncidents)
      ].join('\n')),
      safeField('RESEARCH',[
        'Factory '+clip(a?.research?.mode||'UNKNOWN',38),
        'Automatic '+fmt(a?.research?.automatic)+' · Manual '+fmt(a?.research?.manual)+' · Unowned '+fmt(a?.research?.unowned),
        'Data readiness '+pct(a?.research?.dataReadiness)+' · stalled '+fmt(a?.research?.stalledTasks),
        'Needs '+(arr(a?.research?.dataNeeds).join(', ')||'—')
      ].join('\n')),
      safeField('EXCEPTIONS',[
        'Critical: '+(critical.join(', ')||'none'),
        'Warnings: '+(warnings.join(', ')||'none'),
        'Waiting: '+(waiting.join(', ')||'none')
      ].join('\n')),
      safeField('NEXT ACTION',clip(a?.recommendation||'Continue autonomous operation.',800)),
      safeField('GUARDS','SHADOW_ONLY · canExecuteLive:false · automaticPrimaryMutation:false · no auto-promotion')
    ],
    BIGGJ_DISCORD_MARKET_SCIENCE_MARKERS.autopilot,
    scienceNav()
  );
}

export function buildBiggjDiscordMarketSciencePanelMap(snapshot={}){
  return [
    {channel:'science-home',marker:BIGGJ_DISCORD_MARKET_SCIENCE_MARKERS.science,payload:buildBiggjDiscordScienceHomePayload(snapshot)},
    {channel:'world-model',marker:BIGGJ_DISCORD_MARKET_SCIENCE_MARKERS.world,payload:buildBiggjDiscordWorldModelPayload(snapshot)},
    {channel:'science-lab',marker:BIGGJ_DISCORD_MARKET_SCIENCE_MARKERS.lab,payload:buildBiggjDiscordScienceLabPayload(snapshot)},
    {channel:'decision-intelligence',marker:BIGGJ_DISCORD_MARKET_SCIENCE_MARKERS.decisions,payload:buildBiggjDiscordDecisionPayload(snapshot)},
    {channel:'autopilot-supervisor',marker:BIGGJ_DISCORD_MARKET_SCIENCE_MARKERS.autopilot,payload:buildBiggjDiscordAutopilotPayload(snapshot)}
  ];
}

export function buildBiggjDiscordMarketSciencePayload(view,snapshot={}){
  const key=String(view||'science').toLowerCase();
  if(key==='world')return buildBiggjDiscordWorldModelPayload(snapshot);
  if(key==='lab')return buildBiggjDiscordScienceLabPayload(snapshot);
  if(key==='decisions')return buildBiggjDiscordDecisionPayload(snapshot);
  if(key==='autopilot')return buildBiggjDiscordAutopilotPayload(snapshot);
  return buildBiggjDiscordScienceHomePayload(snapshot);
}
