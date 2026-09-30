import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_TRADING_ACADEMY_VERSION='BIGGJ_TRADING_ACADEMY_V2';

const PRIMARY_EXCLUDED=new Set(['CHALLENGER','ABSTAIN_PROBE','COVERAGE_PROBE','EXPLORATION']);
const finite=(v,f=null)=>v===null||v===undefined||v===''?f:(Number.isFinite(Number(v))?Number(v):f);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,finite(v,a)));
const avg=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};

function primaryClosed(ledger){
  return (ledger?.positions||[])
    .filter(p=>
      p&&p.status==='CLOSED'&&p.execution==='SHADOW_ONLY'&&p.canExecuteLive===false&&
      !PRIMARY_EXCLUDED.has(String(p.entryMode||'STANDARD').toUpperCase())
    )
    .sort((a,b)=>Number(a.closedAt||0)-Number(b.closedAt||0));
}

function rate(rows,predicate){
  return rows.length?rows.filter(predicate).length/rows.length:0;
}
function entropyScore(values){
  const xs=values.map(x=>String(x||'UNKNOWN')).filter(Boolean);
  if(xs.length<2)return 0;
  const counts=new Map();
  for(const x of xs)counts.set(x,(counts.get(x)||0)+1);
  if(counts.size<=1)return 0;
  let h=0;
  for(const n of counts.values()){
    const p=n/xs.length;
    h-=p*Math.log(p);
  }
  return clamp(h/Math.log(Math.min(counts.size,xs.length)));
}
function uniqueKnown(rows,getter){
  return new Set(rows.map(getter).filter(x=>x!=null&&String(x).trim()&&String(x).toUpperCase()!=='UNKNOWN')).size;
}
function comp(id,value,known=true,weight=1){
  return {id,value:known?clamp(value):null,known:Boolean(known),weight:Number(weight)||1};
}
function skill(id,label,components){
  const known=components.filter(x=>x.known);
  const knownWeight=known.reduce((s,x)=>s+x.weight,0);
  const totalWeight=components.reduce((s,x)=>s+x.weight,0)||1;
  const score=knownWeight?known.reduce((s,x)=>s+x.value*x.weight,0)/knownWeight:0;
  const coverage=knownWeight/totalWeight;
  return freeze({
    id,label,
    score:clamp(score),
    coverage:clamp(coverage),
    confidence:clamp(coverage*(known.length/Math.max(1,components.length))),
    components
  });
}

function policyTagged(p){
  return String(p?.tradingPolicyVersion||'').startsWith('BIGGJ_TRADING_POLICY_')&&
    String(p?.forecastFingerprint||'').length>=16&&
    String(p?.issuanceId||'').length>0&&
    String(p?.horizonId||'').length>0;
}
function trustedLifecycle(p){
  return p?.lifecycleEvidence?.trusted===true&&
    Number.isFinite(Number(p.lifecycleEvidence?.thesisHealth))&&
    Number.isFinite(Number(p.lifecycleEvidence?.oppositeThesisStrength));
}
function hasAttribution(p){
  return Boolean(p?.tradeAttribution&&typeof p.tradeAttribution==='object');
}
function cleanLeverage(p){
  return finite(p?.leverage,1)<=1.000001;
}
function thesisQuality(p){
  const prob=finite(p?.directionalProbability);
  const edge=finite(p?.probabilityEdge);
  const setup=finite(p?.setupScore);
  const parts=[];
  if(prob!=null)parts.push(clamp((prob-.50)/.20));
  if(edge!=null)parts.push(clamp(edge/.20));
  if(setup!=null)parts.push(clamp(setup));
  return parts.length?avg(parts):null;
}
function captureQuality(p){
  const c=finite(p?.captureEfficiency);
  if(c==null)return null;
  return clamp((c+.25)/1.25);
}
function processTradeScore(p){
  const components=[
    comp('policy_lineage',policyTagged(p)?1:0,true,1.4),
    comp('thesis_quality',thesisQuality(p)??0,thesisQuality(p)!=null,1.1),
    comp('risk_discipline',cleanLeverage(p)?1:0,true,1.2),
    comp('lifecycle_review',trustedLifecycle(p)?1:0,policyTagged(p),1.1),
    comp('trade_attribution',hasAttribution(p)?1:0,true,1.0),
    comp('capture_quality',captureQuality(p)??0,captureQuality(p)!=null,.8)
  ];
  const known=components.filter(x=>x.known);
  const w=known.reduce((s,x)=>s+x.weight,0);
  const total=components.reduce((s,x)=>s+x.weight,0);
  const score=w?known.reduce((s,x)=>s+x.value*x.weight,0)/w:0;
  return {
    score:clamp(score),
    coverage:clamp(w/total),
    components
  };
}

function academySkills(rows,academy,supervisor){
  const recent=rows.slice(-50);
  const policyRows=recent.filter(policyTagged);
  const thesisValues=recent.map(thesisQuality).filter(Number.isFinite);
  const captures=recent.map(captureQuality).filter(Number.isFinite);
  const attributedRate=rate(recent,hasAttribution);
  const missionRate=rate(recent,p=>String(p.trainingMissionId||'').length>0);
  const lifecycleRate=policyRows.length?rate(policyRows,trustedLifecycle):0;
  const noLegacyHorizon=policyRows.length?rate(policyRows,p=>String(p.closeReason||'')!=='HORIZON_EXIT'):0;
  const learningValues=recent.map(p=>finite(p.entryLearningValue)).filter(Number.isFinite);
  const qualityScores=recent.map(p=>finite(p.entryQualityScore)).filter(Number.isFinite);
  const drawdown=finite(academy?.metrics?.maxDrawdownPct);
  const riskMult=finite(supervisor?.risk?.multiplier);

  return [
    skill('THESIS','Thesis Engineering',[
      comp('policy_lineage',rate(recent,policyTagged),recent.length>0,1.4),
      comp('thesis_strength',avg(thesisValues)??0,thesisValues.length>=3,1.2),
      comp('forecast_trace',rate(recent,p=>Boolean(p.forecastFingerprint&&p.issuanceId)),recent.length>0,1)
    ]),
    skill('RISK','Risk Discipline',[
      comp('one_x_primary',rate(recent,cleanLeverage),recent.length>0,1.4),
      comp('drawdown_control',drawdown==null?0:1-clamp(drawdown/.10),drawdown!=null,1.2),
      comp('supervisor_risk',riskMult==null?0:clamp(riskMult),riskMult!=null,1)
    ]),
    skill('EXECUTION','Execution Quality',[
      comp('capture_efficiency',avg(captures)??0,captures.length>=5,1.4),
      comp('execution_evidence',captures.length/Math.max(8,recent.length),recent.length>0,1),
      comp('attribution',attributedRate,recent.length>0,1)
    ]),
    skill('ADAPTATION','Market Adaptation',[
      comp('symbol_diversity',entropyScore(recent.map(p=>p.symbol)),recent.length>=8,1),
      comp('side_diversity',entropyScore(recent.map(p=>p.side)),recent.length>=8,1),
      comp('horizon_diversity',entropyScore(recent.map(p=>p.horizonId)),recent.length>=8,1),
      comp('regime_diversity',entropyScore(recent.map(p=>p.entryRegimeKey)),recent.length>=8,1.2)
    ]),
    skill('MANAGEMENT','Position Management',[
      comp('trusted_reviews',lifecycleRate,policyRows.length>=3,1.4),
      comp('nonlegacy_exit',noLegacyHorizon,policyRows.length>=3,1),
      comp('capture',avg(captures)??0,captures.length>=5,1)
    ]),
    skill('LEARNING','Learning Loop',[
      comp('trade_attribution',attributedRate,recent.length>0,1.2),
      comp('training_mission_lineage',missionRate,recent.length>0,1),
      comp('learning_value',avg(learningValues)??0,learningValues.length>=5,1),
      comp('quality_memory',avg(qualityScores)??0,qualityScores.length>=5,1)
    ])
  ];
}

const RANKS=Object.freeze([
  {id:'INITIATE',label:'Initiate',minTrades:0,minMastery:0},
  {id:'SCOUT',label:'Market Scout',minTrades:10,minMastery:.30},
  {id:'ANALYST',label:'Evidence Analyst',minTrades:25,minMastery:.42},
  {id:'TACTICIAN',label:'Shadow Tactician',minTrades:50,minMastery:.52},
  {id:'OPERATOR',label:'BIGGJ Operator',minTrades:100,minMastery:.62},
  {id:'STRATEGIST',label:'System Strategist',minTrades:200,minMastery:.72},
  {id:'ARCHITECT',label:'Research Architect',minTrades:350,minMastery:.80}
]);

function rankFor(rows,mastery){
  let rank=RANKS[0];
  for(const r of RANKS){
    if(rows.length>=r.minTrades&&mastery>=r.minMastery)rank=r;
  }
  return rank;
}

function masteryXp(rows){
  const policy=rows.filter(policyTagged).length;
  const reviewed=rows.filter(trustedLifecycle).length;
  const attributed=rows.filter(hasAttribution).length;
  const quality=rows.filter(p=>finite(p.entryQualityScore)!=null).length;
  return rows.length*30+policy*20+reviewed*25+attributed*20+quality*10;
}

function missionFor(skills,rows){
  const recent=rows.slice(-20);
  const weakest=[...skills].sort((a,b)=>(a.score*a.coverage)-(b.score*b.coverage))[0]||skills[0];
  const map={
    THESIS:{
      title:'QUEST // THESIS WITHOUT EXCUSES',
      objective:'Baue eine saubere Forecast→Horizon→Policy-Lineage auf. Kein Entry soll nur wegen späterem PnL gut aussehen.',
      checks:[
        {label:'12 aktuelle PRIMARY-Fälle',value:Math.min(12,recent.length),target:12},
        {label:'≥ 85% Policy-Lineage',value:rate(recent,policyTagged),target:.85},
        {label:'≥ 8 Thesis-Qualitätswerte',value:recent.filter(p=>thesisQuality(p)!=null).length,target:8}
      ]
    },
    RISK:{
      title:'QUEST // ZERO HERO LEVERAGE',
      objective:'Beweise Disziplin: PRIMARY bleibt 1×; Risiko wird nicht hochgedreht, um schlechte Setups zu retten.',
      checks:[
        {label:'15 aktuelle PRIMARY-Fälle',value:Math.min(15,recent.length),target:15},
        {label:'≥ 95% bei 1×',value:rate(recent,cleanLeverage),target:.95},
        {label:'Verlustserie ≤ 3',value:Math.max(0,3-(recent.slice().reverse().findIndex(p=>Number(p.realizedNetPnlQuote||0)>=0))),target:3}
      ]
    },
    EXECUTION:{
      title:'QUEST // CAPTURE THE MOVE',
      objective:'Nicht nur Richtung treffen: Exit-Qualität und Capture-Efficiency müssen messbar werden.',
      checks:[
        {label:'8 Trades mit Capture-Evidenz',value:recent.filter(p=>captureQuality(p)!=null).length,target:8},
        {label:'Attribution ≥ 80%',value:rate(recent,hasAttribution),target:.80},
        {label:'Ø Capture ≥ 50%',value:avg(recent.map(captureQuality).filter(Number.isFinite))||0,target:.50}
      ]
    },
    ADAPTATION:{
      title:'QUEST // BREAK THE COMFORT ZONE',
      objective:'Robustheit über Marktphasen statt Coin-/Richtungs-Abhängigkeit. Keine Trades erzwingen.',
      checks:[
        {label:'3 Symbole',value:uniqueKnown(recent,p=>p.symbol),target:3},
        {label:'2 Richtungen',value:uniqueKnown(recent,p=>p.side),target:2},
        {label:'3 Regimes',value:uniqueKnown(recent,p=>p.entryRegimeKey),target:3},
        {label:'2 Horizonte',value:uniqueKnown(recent,p=>p.horizonId),target:2}
      ]
    },
    MANAGEMENT:{
      title:'QUEST // THESIS LIVES OR DIES',
      objective:'Horizont ist Review, nicht Timer. Positionen sollen auf Thesis-Evidenz reagieren statt blind auszulaufen.',
      checks:[
        {label:'10 Policy-Trades',value:recent.filter(policyTagged).length,target:10},
        {label:'≥ 80% trusted Lifecycle Reviews',value:rate(recent.filter(policyTagged),trustedLifecycle),target:.80},
        {label:'Legacy HORIZON_EXIT ≤ 10%',value:1-rate(recent.filter(policyTagged),p=>String(p.closeReason||'')==='HORIZON_EXIT'),target:.90}
      ]
    },
    LEARNING:{
      title:'QUEST // EVERY TRADE PAYS TUITION',
      objective:'Jeder abgeschlossene Trade soll eine verwertbare Spur für Attribution, Mission und Lernmodell hinterlassen.',
      checks:[
        {label:'Attribution ≥ 90%',value:rate(recent,hasAttribution),target:.90},
        {label:'Mission-Lineage ≥ 80%',value:rate(recent,p=>Boolean(p.trainingMissionId)),target:.80},
        {label:'8 Quality-Memory-Fälle',value:recent.filter(p=>finite(p.entryQualityScore)!=null).length,target:8}
      ]
    }
  };
  const mission=map[weakest.id]||map.THESIS;
  const normalized=mission.checks.map(x=>({
    ...x,
    progress:clamp(Number(x.target)>0?Number(x.value)/Number(x.target):1)
  }));
  return freeze({
    skillId:weakest.id,
    title:mission.title,
    objective:mission.objective,
    progress:normalized.length?avg(normalized.map(x=>x.progress)):0,
    checks:normalized
  });
}

function bossChallenge(rank,rows,skills,academy){
  const recent=rows.slice(-50);
  const avgProcess=avg(recent.map(p=>processTradeScore(p).score))||0;
  const policyRate=rate(recent,policyTagged);
  const attributionRate=rate(recent,hasAttribution);
  const reviewRate=rate(recent.filter(policyTagged),trustedLifecycle);
  const dd=finite(academy?.metrics?.maxDrawdownPct,1);
  let id='BOSS_CLEAN_PROCESS',title='BOSS I // CLEAN PROCESS',checks=[
    {label:'20 PRIMARY-Trades',value:Math.min(20,recent.length),target:20},
    {label:'Policy-Lineage ≥ 85%',value:policyRate,target:.85},
    {label:'Attribution ≥ 85%',value:attributionRate,target:.85},
    {label:'Process Score ≥ 65%',value:avgProcess,target:.65}
  ];
  if(['TACTICIAN','OPERATOR'].includes(rank.id)){
    id='BOSS_REGIME_SHIFT';title='BOSS II // REGIME SHIFT';checks=[
      {label:'30 PRIMARY-Trades',value:Math.min(30,recent.length),target:30},
      {label:'3 Symbole',value:uniqueKnown(recent,p=>p.symbol),target:3},
      {label:'3 Regimes',value:uniqueKnown(recent,p=>p.entryRegimeKey),target:3},
      {label:'2 Richtungen',value:uniqueKnown(recent,p=>p.side),target:2},
      {label:'Process Score ≥ 70%',value:avgProcess,target:.70},
      {label:'Drawdown ≤ 6%',value:dd<=.06?1:clamp(.06/Math.max(dd,.0001)),target:1}
    ];
  }else if(['STRATEGIST','ARCHITECT'].includes(rank.id)){
    id='BOSS_ADVERSARIAL_OPERATOR';title='BOSS III // ADVERSARIAL OPERATOR';checks=[
      {label:'50 PRIMARY-Trades',value:Math.min(50,recent.length),target:50},
      {label:'Policy-Lineage ≥ 95%',value:policyRate,target:.95},
      {label:'Trusted Reviews ≥ 80%',value:reviewRate,target:.80},
      {label:'Attribution ≥ 95%',value:attributionRate,target:.95},
      {label:'Process Score ≥ 78%',value:avgProcess,target:.78},
      {label:'Skill Coverage ≥ 75%',value:avg(skills.map(s=>s.coverage))||0,target:.75}
    ];
  }
  const normalized=checks.map(x=>({...x,progress:clamp(Number(x.value)/Math.max(Number(x.target),1e-12))}));
  const progress=avg(normalized.map(x=>x.progress))||0;
  return freeze({
    id,title,
    progress,
    passed:normalized.every(x=>x.progress>=.999999),
    checks:normalized,
    reward:'BADGE + NEXT DRILL SET ONLY · NEVER AUTO-RISK-UPGRADE'
  });
}

function debrief(rows){
  const p=rows.at(-1);
  if(!p)return freeze({available:false});
  const process=processTradeScore(p);
  const pnl=finite(p.realizedNetPnlQuote,0);
  const grade=process.score>=.80?'A':process.score>=.65?'B':process.score>=.50?'C':'D';
  const outcome=pnl>0?'WIN':pnl<0?'LOSS':'FLAT';
  const classification=
    process.score>=.72&&pnl<0?'CLEAN_LOSS':
    process.score<.50&&pnl>0?'LUCKY_WIN_PROCESS_DEBT':
    process.score>=.72&&pnl>0?'CLEAN_WIN':
    pnl<0?'LEARNING_LOSS':'MIXED_PROCESS';
  const missing=process.components.filter(x=>!x.known||x.value<.5).map(x=>x.id).slice(0,4);
  return freeze({
    available:true,
    positionId:String(p.positionId||''),
    symbol:String(p.symbol||''),
    side:String(p.side||''),
    outcome,
    pnlQuote:pnl,
    processScore:process.score,
    evidenceCoverage:process.coverage,
    grade,
    classification,
    closeReason:String(p.closeReason||'UNKNOWN'),
    missing,
    lesson:classification==='LUCKY_WIN_PROCESS_DEBT'
      ?'Gewinn zählt nicht als Beweis für einen sauberen Prozess.'
      :classification==='CLEAN_LOSS'
        ?'Verlust bei sauberem Prozess ist verwertbare Evidenz, kein automatischer Fehler.'
        :'Bewerte zuerst Prozess und Evidenz, danach erst das Ergebnis.'
  });
}

export function buildBiggjTradingAcademy(ledger,{
  academy=null,
  supervisor=null,
  asOf=Date.now()
}={}){
  const rows=primaryClosed(ledger);
  const skills=academySkills(rows,academy,supervisor);
  const covered=skills.filter(s=>s.coverage>0);
  const mastery=covered.length?avg(covered.map(s=>s.score*(.70+.30*s.coverage))):0;
  const evidenceCoverage=skills.length?avg(skills.map(s=>s.coverage)):0;
  const rank=rankFor(rows,mastery);
  const xp=masteryXp(rows);
  const level=Math.max(1,Math.min(99,1+Math.floor(xp/500)));
  const mission=missionFor(skills,rows);
  const boss=bossChallenge(rank,rows,skills,academy);
  const lastDebrief=debrief(rows);
  const processScores=rows.slice(-50).map(processTradeScore);
  const core={
    version:BIGGJ_TRADING_ACADEMY_VERSION,
    asOf:Number(asOf),
    rank,
    level,
    xp,
    mastery:clamp(mastery),
    evidenceCoverage:clamp(evidenceCoverage),
    sampleCount:rows.length,
    skills,
    mission,
    boss,
    debrief:lastDebrief,
    rollingProcess:{
      sampleCount:processScores.length,
      score:processScores.length?avg(processScores.map(x=>x.score)):0,
      evidenceCoverage:processScores.length?avg(processScores.map(x=>x.coverage)):0
    },
    legacyAcademyStage:String(academy?.activeStage||'UNKNOWN'),
    trainingRiskMultiplier:finite(supervisor?.risk?.multiplier),
    riskGuard:{
      coreAllowed:academy?.guard?.coreAllowed!==false,
      memeAllowed:academy?.guard?.memeAllowed!==false,
      blockers:Array.isArray(academy?.guard?.blockers)?academy.guard.blockers.map(String).slice(0,12):[],
      memeBlockers:Array.isArray(academy?.guard?.memeBlockers)?academy.guard.memeBlockers.map(String).slice(0,12):[]
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    canExecuteLive:false,
    changesPrimaryPolicy:false,
    meaning:'PROCESS_MASTERY_AND_TRAINING_DIAGNOSTIC_NOT_PROFIT_GUARANTEE_OR_REAL_MONEY_APPROVAL'
  };
  return freeze({...core,fingerprint:sha256(core)});
}

function bar(v,width=10){
  const n=Math.round(clamp(v)*width);
  return '█'.repeat(n)+'░'.repeat(Math.max(0,width-n));
}
function pct(v){return Math.round(clamp(v)*100)+'%';}
function fmt(v,d=2){return Number.isFinite(Number(v))?Number(v).toFixed(d):'—';}

export function renderBiggjTradingAcademy(model){
  const x=model||{};
  const lines=[
    '🧠 BIGGJ TRADING ACADEMY // V2',
    '━━━━━━━━━━━━━━━━━━━━',
    'RANK   '+String(x.rank?.label||'Initiate').toUpperCase(),
    'LEVEL  '+Number(x.level||1)+'   ·   XP '+Number(x.xp||0),
    'MASTERY '+pct(x.mastery)+'   ·   EVIDENCE '+pct(x.evidenceCoverage),
    'PRIMARY CASES '+Number(x.sampleCount||0),
    '',
    'SKILL GRID'
  ];
  for(const s of x.skills||[]){
    lines.push(
      s.label.toUpperCase(),
      bar(s.score)+' '+pct(s.score)+' · evidence '+pct(s.coverage)
    );
  }
  lines.push(
    '',
    'ACTIVE QUEST',
    String(x.mission?.title||'—'),
    String(x.mission?.objective||''),
    'Progress '+bar(x.mission?.progress||0,12)+' '+pct(x.mission?.progress||0)
  );
  for(const c of (x.mission?.checks||[]).slice(0,4)){
    lines.push((c.progress>=.999?'✓ ':'· ')+c.label+' · '+pct(c.progress));
  }
  lines.push(
    '',
    'BOSS CHALLENGE',
    String(x.boss?.title||'—')+' · '+(x.boss?.passed?'CLEARED':'ACTIVE'),
    'Progress '+bar(x.boss?.progress||0,12)+' '+pct(x.boss?.progress||0)
  );
  lines.push(
    '',
    'RISK GUARD',
    'Core '+(x.riskGuard?.coreAllowed?'READY':'PAUSED')+' · Meme '+(x.riskGuard?.memeAllowed?'READY':'PAUSED'),
    ...(x.riskGuard?.blockers?.length?['Blocker: '+x.riskGuard.blockers.join(', ')]:[]),
    ...(x.riskGuard?.memeBlockers?.length&&!x.riskGuard?.memeAllowed?['Meme: '+x.riskGuard.memeBlockers.join(', ')]:[])
  );
  const d=x.debrief;
  if(d?.available){
    lines.push(
      '',
      'LAST DEBRIEF',
      d.symbol+' '+d.side+' · '+d.outcome+' · Process '+d.grade+' ('+pct(d.processScore)+')',
      'Class: '+String(d.classification).replaceAll('_',' '),
      'Exit: '+d.closeReason,
      'PnL: '+(d.pnlQuote>=0?'+':'')+fmt(d.pnlQuote,2)+' USDT',
      d.lesson
    );
  }
  lines.push(
    '',
    'Academy bewertet PROCESS > einzelnes PnL.',
    'Boss-Clears erhöhen niemals automatisch echtes oder simuliertes Risiko.',
    'SHADOW_ONLY · canExecuteLive:false'
  );
  return lines.join('\n').slice(0,4096);
}

export function verifyBiggjTradingAcademy(value){
  try{
    const reasons=[];
    if(value?.version!==BIGGJ_TRADING_ACADEMY_VERSION)reasons.push('VERSION_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.canExecute!==false||value?.canExecuteLive!==false)reasons.push('EXECUTION_INVARIANT_INVALID');
    if(value?.changesPrimaryPolicy!==false)reasons.push('PRIMARY_POLICY_MUTATION_FORBIDDEN');
    const {fingerprint,...core}=value||{};
    const expected=sha256(core);
    if(fingerprint!==expected)reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['ACADEMY_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
