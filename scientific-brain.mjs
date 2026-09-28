export const SCIENTIFIC_BRAIN_VERSION='TCX_SCIENTIFIC_BRAIN_V1';
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
const pct=v=>n(v)==null?'—':Math.round(Number(v)*100)+'%';

export function validateDiscoveredPatterns(patterns,{minIndependentCases=20,minDirectionalHitRate=.56,minRobustness=.55}={}){
 const rows=(patterns?.patterns||[]).map(p=>{
  const reasons=[];
  if(Number(p.independentCases||0)<minIndependentCases)reasons.push('INDEPENDENT_SAMPLE_TOO_SMALL');
  if(Number(p.directionalHitRate||0)<minDirectionalHitRate)reasons.push('DIRECTIONAL_STABILITY_TOO_LOW');
  if(Number(p.robustness||0)<minRobustness)reasons.push('ROBUSTNESS_TOO_LOW');
  const status=reasons.length?'RESEARCH_ONLY':'VALIDATION_CANDIDATE';
  return {...p,validationStatus:status,validationReasons:reasons};
 });
 return freeze({version:SCIENTIFIC_BRAIN_VERSION,patterns:rows,validatedForResearch:rows.filter(x=>x.validationStatus==='VALIDATION_CANDIDATE').length,execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false});
}

export function buildModelLeague({strategyLeague=null,accuracy=null,patterns=null,memory=null}={}){
 const members=[];
 for(const s of strategyLeague?.strategies||[])members.push({id:'STRATEGY_'+s.strategyId,kind:'SHADOW_STRATEGY',samples:Number(s.independentDecisions||0),score:clamp(s.performanceScore),status:s.status||'UNKNOWN'});
 if(accuracy?.ready)members.push({id:'FORECAST_ENGINE',kind:'CALIBRATED_FORECAST',samples:Number(accuracy?.evaluation?.overall?.n||accuracy?.resolved||0),score:clamp(1-Number(accuracy?.evaluation?.overall?.brierScore??.5)),status:'MEASURED'});
 for(const p of (patterns?.patterns||[]).filter(x=>x.validationStatus==='VALIDATION_CANDIDATE').slice(0,5))members.push({id:p.patternId,kind:'DISCOVERED_PATTERN',samples:Number(p.independentCases||0),score:clamp(p.robustness),status:'RESEARCH'});
 if(memory?.summary?.n)members.push({id:'EPISODE_ANALOG',kind:'HISTORICAL_ANALOG',samples:Number(memory.summary.n),score:clamp(Math.min(1,memory.summary.n/60)),status:memory.evidenceStatus});
 members.sort((a,b)=>b.score-a.score||b.samples-a.samples);
 return freeze({version:SCIENTIFIC_BRAIN_VERSION,members,leader:members[0]||null,meaning:'EVIDENCE_COMPARISON_NOT_CAPITAL_ALLOCATION',execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false});
}

export function diagnoseScientificBrain({state=null,accuracy=null,memory=null,patterns=null,twin=null,league=null}={}){
 const issues=[];
 const age=n(state?.availableAt)==null?Infinity:Math.max(0,Date.now()-Number(state.availableAt));
 if(age>120000)issues.push({severity:'HIGH',id:'STALE_MARKET_STATE'});
 if(!accuracy?.ready)issues.push({severity:'MEDIUM',id:'FORECAST_ACCURACY_NOT_MATURE'});
 if(!memory||memory.evidenceStatus==='INSUFFICIENT')issues.push({severity:'MEDIUM',id:'EPISODE_MEMORY_THIN'});
 if(!(patterns?.patterns||[]).some(x=>x.validationStatus==='VALIDATION_CANDIDATE'))issues.push({severity:'LOW',id:'NO_VALIDATION_READY_PATTERN'});
 if(twin?.status!=='ACTIVE')issues.push({severity:'MEDIUM',id:'DIGITAL_TWIN_INSUFFICIENT'});
 if(!(league?.members||[]).length)issues.push({severity:'MEDIUM',id:'MODEL_LEAGUE_EMPTY'});
 const high=issues.some(x=>x.severity==='HIGH'),med=issues.filter(x=>x.severity==='MEDIUM').length;
 const gate=high?'ABSTAIN':med>=2?'CAUTION':'PASS';
 return freeze({version:SCIENTIFIC_BRAIN_VERSION,gate,issues,execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false});
}

export function buildBullBearDebate({setup=null,risk=null,memory=null,patterns=null,twin=null,diagnostics=null}={}){
 const bull=[],bear=[],uncertainty=[];
 if(setup?.direction==='UP')bull.push('Current structure bias is UP'); else if(setup?.direction==='DOWN')bear.push('Current structure bias is DOWN'); else uncertainty.push('Structure is neutral');
 const counts=memory?.counts||{};if((counts.up||0)>(counts.down||0))bull.push('Similar matured episodes skewed upward');if((counts.down||0)>(counts.up||0))bear.push('Similar matured episodes skewed downward');
 for(const p of (patterns?.patterns||[]).filter(x=>x.validationStatus==='VALIDATION_CANDIDATE').slice(0,3)){(p.direction==='UP'?bull:bear).push('Validated-research pattern '+p.patternId+' points '+p.direction);}
 if(risk?.status==='HIGH')bear.push('Risk layer is HIGH'); else if(risk?.status==='ELEVATED')uncertainty.push('Risk layer is elevated');
 if(diagnostics?.gate!=='PASS')uncertainty.push('Scientific diagnostics: '+diagnostics.gate);
 if(twin?.branches?.length<2)uncertainty.push('Digital Twin has insufficient branch coverage');
 const bullScore=clamp(bull.length/(bull.length+bear.length+uncertainty.length+1)),bearScore=clamp(bear.length/(bull.length+bear.length+uncertainty.length+1));
 return freeze({version:SCIENTIFIC_BRAIN_VERSION,bull,bear,uncertainty,bullScore,bearScore,epistemic:'ARGUMENT_BALANCE_NOT_DIRECTIONAL_PROBABILITY',execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false});
}

export function buildMetaJudge({setup=null,risk=null,debate=null,diagnostics=null,league=null}={}){
 const reasons=[];
 if(diagnostics?.gate==='ABSTAIN')reasons.push('SCIENTIFIC_DIAGNOSTIC_ABSTAIN');
 if(risk?.status==='HIGH')reasons.push('RISK_HIGH');
 if(setup?.status==='ABSTAIN')reasons.push('SETUP_ABSTAIN');
 const disagreement=Math.min(debate?.bullScore||0,debate?.bearScore||0);
 if(disagreement>=.25)reasons.push('BULL_BEAR_CONFLICT');
 if(!league?.leader)reasons.push('NO_MODEL_EVIDENCE');
 const status=reasons.length?'ABSTAIN':diagnostics?.gate==='CAUTION'||risk?.status==='ELEVATED'?'WATCH':'WATCH';
 return freeze({version:SCIENTIFIC_BRAIN_VERSION,status,reasons,leader:league?.leader||null,whatWouldChangeMind:['fresh contradictory structure evidence','material risk-state change','new matured outcomes changing calibration or pattern validation'],execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false});
}

export function renderScientificBrain({validation,league,diagnostics,debate,judge}={}){
 const lines=['TCX // SCIENTIFIC BRAIN','━━━━━━━━━━━━━━━━━━━━','',
 'PATTERN LAB   '+Number(validation?.validatedForResearch||0)+' validation-ready',
 'MODEL LEAGUE  '+Number(league?.members?.length||0)+' evidence members',
 'DIAGNOSTICS   '+String(diagnostics?.gate||'—'),
 'META-JUDGE    '+String(judge?.status||'ABSTAIN'),'',
 'BULL CASE'];
 lines.push(...((debate?.bull||[]).slice(0,3).map(x=>'• '+x).length?debate.bull.slice(0,3).map(x=>'• '+x):['• no strong bull evidence']));
 lines.push('','BEAR CASE',...((debate?.bear||[]).slice(0,3).map(x=>'• '+x).length?debate.bear.slice(0,3).map(x=>'• '+x):['• no strong bear evidence']));
 lines.push('','UNCERTAINTY',...((debate?.uncertainty||[]).slice(0,3).map(x=>'• '+x).length?debate.uncertainty.slice(0,3).map(x=>'• '+x):['• no extra diagnostic warning']));
 if(league?.leader)lines.push('','Evidence leader '+league.leader.id+' · score '+pct(league.leader.score)+' · n='+league.leader.samples);
 lines.push('','Bull/Bear scores are argument balance, NOT market probabilities.','Scientific Brain may only downgrade evidence or ABSTAIN.','SHADOW_ONLY · REAL ORDERS BLOCKED');
 return lines.join('\n').slice(0,4096);
}
