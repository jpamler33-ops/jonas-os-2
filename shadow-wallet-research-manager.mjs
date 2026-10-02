import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';

export const SHADOW_WALLET_RESEARCH_MANAGER_VERSION='TCX_SHADOW_WALLET_RESEARCH_MANAGER_V1';

const EPS=1e-12;
const RESEARCH_MODES=new Set(['CHALLENGER','ABSTAIN_PROBE','COVERAGE_PROBE','EXPLORATION']);

export const WALLET_RESEARCH_WHEELS=Object.freeze([
  Object.freeze({
    id:'MIN_DIRECTIONAL_PROBABILITY',
    label:'Directional Probability',
    field:'directionalProbability',
    compare:'GTE',
    values:Object.freeze([.58,.62,.66,.70])
  }),
  Object.freeze({
    id:'MIN_PROBABILITY_EDGE',
    label:'Probability Edge',
    field:'probabilityEdge',
    compare:'GTE',
    values:Object.freeze([.10,.14,.18,.22])
  }),
  Object.freeze({
    id:'MIN_EXPECTED_RETURN',
    label:'Expected Return',
    field:'expectedReturnAbs',
    compare:'GTE',
    values:Object.freeze([.0025,.004,.006,.008])
  }),
  Object.freeze({
    id:'MAX_HORIZON_MS',
    label:'Maximum Horizon',
    field:'horizonMs',
    compare:'LTE',
    values:Object.freeze([60*60_000,15*60_000,5*60_000])
  }),
  Object.freeze({
    id:'MIN_DISCOVERY_STRENGTH',
    label:'Discovery Strength',
    field:'discoveryStrength',
    compare:'GTE',
    values:Object.freeze([.55,.65,.75])
  })
]);

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,Number(v)));}
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;}
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) freeze(x);
  }
  return v;
}
function clone(v){return structuredClone(v);}
function researchClosed(ledger){
  return (ledger?.positions||[])
    .filter(p=>
      p&&
      p.execution==='SHADOW_ONLY'&&
      p.canExecuteLive===false&&
      p.status==='CLOSED'&&
      RESEARCH_MODES.has(String(p.entryMode||'').toUpperCase())&&
      finite(p.realizedReturnPct)!=null&&
      finite(p.realizedNetPnlQuote)!=null
    )
    .sort((a,b)=>Number(a.closedAt||0)-Number(b.closedAt||0));
}
function maxDrawdownPct(rows){
  let equity=1,peak=1,maxDd=0;
  for(const row of rows){
    const r=clamp(finite(row.realizedReturnPct,0),-.95,5);
    equity*=1+r;
    peak=Math.max(peak,equity);
    if(peak>EPS) maxDd=Math.max(maxDd,(peak-equity)/peak);
  }
  return maxDd;
}
function metrics(rows){
  const xs=Array.isArray(rows)?rows:[];
  const wins=xs.filter(x=>finite(x.realizedNetPnlQuote,0)>0);
  const losses=xs.filter(x=>finite(x.realizedNetPnlQuote,0)<0);
  const returns=xs.map(x=>finite(x.realizedReturnPct,0));
  const pnl=xs.map(x=>finite(x.realizedNetPnlQuote,0));
  const grossProfitReturn=wins.reduce((s,x)=>s+Math.max(0,finite(x.realizedReturnPct,0)),0);
  const grossLossReturn=Math.abs(losses.reduce((s,x)=>s+Math.min(0,finite(x.realizedReturnPct,0)),0));
  const profitFactor=grossLossReturn>EPS
    ?grossProfitReturn/grossLossReturn
    :grossProfitReturn>EPS?3:null;
  const expectancyReturn=mean(returns);
  const winRate=xs.length?wins.length/xs.length:null;
  const dd=maxDrawdownPct(xs);
  const pfTerm=profitFactor==null?0:clamp(Math.log(Math.max(.05,profitFactor))/Math.log(2),-1,1);
  const returnTerm=expectancyReturn==null?0:Math.tanh(expectancyReturn/.004);
  const winTerm=winRate==null?0:2*winRate-1;
  const ddPenalty=clamp(dd/.08,0,1);
  const qualityScore=.45*returnTerm+.25*pfTerm+.15*winTerm-.15*ddPenalty;
  return freeze({
    trades:xs.length,
    wins:wins.length,
    losses:losses.length,
    winRate,
    expectancyReturn,
    expectancyQuote:mean(pnl),
    profitFactor,
    maxDrawdownPct:dd,
    averageWinReturn:wins.length?mean(wins.map(x=>finite(x.realizedReturnPct,0))):null,
    averageLossReturn:losses.length?mean(losses.map(x=>finite(x.realizedReturnPct,0))):null,
    qualityScore
  });
}
function wheel(index){
  const n=WALLET_RESEARCH_WHEELS.length;
  return WALLET_RESEARCH_WHEELS[((Number(index)||0)%n+n)%n];
}
function epochId({walletId,epochNumber,cycle,wheelId,value,startedAt}){
  return 'wre_'+sha256({walletId,epochNumber,cycle,wheelId,value,startedAt}).slice(0,20);
}
function experimentFor({walletId,epochNumber,cycle,wheelIndex,valueIndex,startedAt}){
  const w=wheel(wheelIndex);
  const idx=Math.max(0,Math.min(w.values.length-1,Number(valueIndex)||0));
  const value=w.values[idx];
  return {
    epochId:epochId({walletId,epochNumber,cycle,wheelId:w.id,value,startedAt}),
    startedAt:Number(startedAt),
    wheelIndex:Number(wheelIndex)||0,
    valueIndex:idx,
    wheelId:w.id,
    wheelLabel:w.label,
    field:w.field,
    compare:w.compare,
    value
  };
}
function normalizeConstraint(x){
  if(!x||typeof x!=='object') return null;
  const w=WALLET_RESEARCH_WHEELS.find(y=>y.id===String(x.wheelId||''));
  if(!w) return null;
  const value=finite(x.value);
  if(value==null) return null;
  return {
    wheelId:w.id,
    wheelLabel:w.label,
    field:w.field,
    compare:w.compare,
    value,
    lockedAt:finite(x.lockedAt),
    sourceEpochId:String(x.sourceEpochId||'')
  };
}
function candidateField(candidate,field){
  if(field==='expectedReturnAbs') return Math.abs(finite(candidate?.expectedReturn,0));
  return finite(candidate?.[field]);
}
function passesConstraint(candidate,constraint){
  const value=candidateField(candidate,constraint.field);
  if(value==null) return false;
  if(constraint.compare==='LTE') return value<=Number(constraint.value);
  return value>=Number(constraint.value);
}
function nextExperiment(state,{asOf,locked=false}={}){
  const current=state.activeExperiment;
  let wheelIndex=Number(current?.wheelIndex||0);
  let valueIndex=Number(current?.valueIndex||0);
  let cycle=Number(state.cycle||1);
  if(locked){
    wheelIndex++;
    valueIndex=0;
  }else{
    valueIndex++;
    const w=wheel(wheelIndex);
    if(valueIndex>=w.values.length){
      wheelIndex++;
      valueIndex=0;
    }
  }
  if(wheelIndex>=WALLET_RESEARCH_WHEELS.length){
    wheelIndex=0;
    valueIndex=0;
    cycle++;
  }
  const epochNumber=Math.max(1,Number(state.epochNumber||1)+1);
  return {
    epochNumber,
    cycle,
    activeExperiment:experimentFor({
      walletId:state.walletId,
      epochNumber,
      cycle,
      wheelIndex,
      valueIndex,
      startedAt:asOf
    })
  };
}

export function createShadowWalletResearchManager({
  walletId='RESEARCH_CHALLENGER',
  asOf=Date.now()
}={}){
  const t=Number(asOf);
  if(!Number.isFinite(t)) throw new Error('WALLET_MANAGER_ASOF_REQUIRED');
  const epochNumber=1,cycle=1;
  return freeze({
    version:SHADOW_WALLET_RESEARCH_MANAGER_VERSION,
    walletId:String(walletId),
    revision:0,
    createdAt:t,
    updatedAt:t,
    epochNumber,
    cycle,
    status:'COLLECTING',
    lockedConstraints:[],
    activeExperiment:experimentFor({
      walletId:String(walletId),
      epochNumber,
      cycle,
      wheelIndex:0,
      valueIndex:0,
      startedAt:t
    }),
    history:[],
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    automaticProductionPromotion:false
  });
}

function sanitizeState(input,{asOf=Date.now()}={}){
  if(!input||input.version!==SHADOW_WALLET_RESEARCH_MANAGER_VERSION){
    return createShadowWalletResearchManager({asOf});
  }
  const locked=(input.lockedConstraints||[]).map(normalizeConstraint).filter(Boolean);
  const current=input.activeExperiment;
  const active=current&&WALLET_RESEARCH_WHEELS.some(x=>x.id===current.wheelId)
    ?{
      ...current,
      startedAt:finite(current.startedAt,Number(asOf)),
      value:finite(current.value)
    }
    :experimentFor({
      walletId:String(input.walletId||'RESEARCH_CHALLENGER'),
      epochNumber:Math.max(1,Number(input.epochNumber||1)),
      cycle:Math.max(1,Number(input.cycle||1)),
      wheelIndex:0,
      valueIndex:0,
      startedAt:Number(asOf)
    });
  return freeze({
    ...clone(input),
    walletId:String(input.walletId||'RESEARCH_CHALLENGER'),
    revision:Math.max(0,Number(input.revision||0)),
    epochNumber:Math.max(1,Number(input.epochNumber||1)),
    cycle:Math.max(1,Number(input.cycle||1)),
    lockedConstraints:locked,
    activeExperiment:active,
    history:Array.isArray(input.history)?input.history.slice(-120):[],
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    automaticProductionPromotion:false
  });
}

export function walletResearchCandidateDecision(state,candidate){
  const s=sanitizeState(state,{asOf:Date.now()});
  if(candidate?.execution!=='SHADOW_ONLY'||candidate?.canExecuteLive!==false){
    return freeze({allowed:false,reason:'SHADOW_CANDIDATE_REQUIRED',arm:'BLOCKED',execution:'SHADOW_ONLY',canExecuteLive:false});
  }
  for(const constraint of s.lockedConstraints){
    if(!passesConstraint(candidate,constraint)){
      return freeze({
        allowed:false,
        reason:'LOCKED_CONSTRAINT_NOT_MET',
        arm:'BLOCKED',
        failedConstraint:constraint,
        epochId:s.activeExperiment.epochId,
        execution:'SHADOW_ONLY',
        canExecuteLive:false
      });
    }
  }
  const decisionKey=String(candidate.challengerDecisionKey||candidate.decisionKey||sha256(candidate));
  const bucket=parseInt(sha256({epochId:s.activeExperiment.epochId,decisionKey}).slice(0,8),16)%2;
  const arm=bucket===0?'CONTROL':'EXPERIMENT';
  const activeConstraint={
    wheelId:s.activeExperiment.wheelId,
    wheelLabel:s.activeExperiment.wheelLabel,
    field:s.activeExperiment.field,
    compare:s.activeExperiment.compare,
    value:s.activeExperiment.value
  };
  const treatmentPass=arm==='CONTROL'||passesConstraint(candidate,activeConstraint);
  return freeze({
    allowed:treatmentPass,
    reason:treatmentPass?'WALLET_RESEARCH_ADMITTED':'ACTIVE_EXPERIMENT_FILTERED',
    arm,
    epochId:s.activeExperiment.epochId,
    epochNumber:s.epochNumber,
    cycle:s.cycle,
    activeConstraint,
    lockedConstraints:s.lockedConstraints,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

function epochRows(state,ledger){
  const id=String(state.activeExperiment?.epochId||'');
  return researchClosed(ledger).filter(x=>String(x.walletResearchEpochId||'')===id);
}
function armRows(rows,arm){
  return rows.filter(x=>String(x.walletResearchArm||'').toUpperCase()===arm);
}
function shouldReview({control,experiment,ageMs,targetArmTrades,minTimedArmTrades,maxEpochMs}){
  if(control.trades>=targetArmTrades&&experiment.trades>=targetArmTrades) return true;
  return ageMs>=maxEpochMs&&control.trades>=minTimedArmTrades&&experiment.trades>=minTimedArmTrades;
}
function compareArms(control,experiment,{
  minImprovementScore=.06,
  maxDrawdownWorsening=.015
}={}){
  const improvementScore=Number(experiment.qualityScore||0)-Number(control.qualityScore||0);
  const expectancyImproved=
    finite(experiment.expectancyReturn,-Infinity)>finite(control.expectancyReturn,-Infinity);
  const pfControl=finite(control.profitFactor,0);
  const pfExperiment=finite(experiment.profitFactor,0);
  const qualityBreadth=
    pfExperiment>=pfControl*.95||
    finite(experiment.winRate,0)>finite(control.winRate,0);
  const drawdownSafe=
    finite(experiment.maxDrawdownPct,0)<=finite(control.maxDrawdownPct,0)+Number(maxDrawdownWorsening||0);
  const lock=
    improvementScore>=Number(minImprovementScore||0)&&
    expectancyImproved&&
    qualityBreadth&&
    drawdownSafe;
  return {
    lock,
    improvementScore,
    expectancyImproved,
    qualityBreadth,
    drawdownSafe,
    verdict:lock?'LOCK':'REJECT'
  };
}

export function refreshShadowWalletResearchManager(input,ledger,{
  asOf=Date.now(),
  targetArmTrades=25,
  minTimedArmTrades=8,
  maxEpochMs=4*60*60_000,
  minImprovementScore=.06,
  maxDrawdownWorsening=.015
}={}){
  const t=Number(asOf);
  if(!Number.isFinite(t)) throw new Error('WALLET_MANAGER_ASOF_REQUIRED');
  const state=sanitizeState(input,{asOf:t});
  const rows=epochRows(state,ledger);
  const control=metrics(armRows(rows,'CONTROL'));
  const experiment=metrics(armRows(rows,'EXPERIMENT'));
  const ageMs=Math.max(0,t-Number(state.activeExperiment.startedAt||t));
  const due=shouldReview({
    control,experiment,ageMs,
    targetArmTrades:Math.max(5,Number(targetArmTrades)||25),
    minTimedArmTrades:Math.max(3,Number(minTimedArmTrades)||8),
    maxEpochMs:Math.max(60_000,Number(maxEpochMs)||4*60*60_000)
  });
  if(!due){
    return {
      state,
      changed:false,
      reviewed:false,
      decision:null,
      control,
      experiment,
      ageMs
    };
  }

  const decision=compareArms(control,experiment,{minImprovementScore,maxDrawdownWorsening});
  const lockedConstraints=[...state.lockedConstraints];
  if(decision.lock){
    const current=state.activeExperiment;
    const priorIndex=lockedConstraints.findIndex(x=>x.wheelId===current.wheelId);
    const lock={
      wheelId:current.wheelId,
      wheelLabel:current.wheelLabel,
      field:current.field,
      compare:current.compare,
      value:current.value,
      lockedAt:t,
      sourceEpochId:current.epochId
    };
    if(priorIndex>=0) lockedConstraints[priorIndex]=lock;
    else lockedConstraints.push(lock);
  }
  const transition=nextExperiment(state,{asOf:t,locked:decision.lock});
  const historyEntry={
    epochId:state.activeExperiment.epochId,
    epochNumber:state.epochNumber,
    cycle:state.cycle,
    startedAt:state.activeExperiment.startedAt,
    reviewedAt:t,
    ageMs,
    wheelId:state.activeExperiment.wheelId,
    wheelLabel:state.activeExperiment.wheelLabel,
    value:state.activeExperiment.value,
    control,
    experiment,
    decision
  };
  const next=freeze({
    ...clone(state),
    revision:Number(state.revision||0)+1,
    updatedAt:t,
    epochNumber:transition.epochNumber,
    cycle:transition.cycle,
    status:'COLLECTING',
    lockedConstraints,
    activeExperiment:transition.activeExperiment,
    history:[...(state.history||[]),historyEntry].slice(-120),
    lastDecision:historyEntry,
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    automaticProductionPromotion:false
  });
  return {
    state:next,
    changed:true,
    reviewed:true,
    decision,
    control,
    experiment,
    ageMs
  };
}

export function shadowWalletResearchManagerSummary(state,ledger,{
  asOf=Date.now(),
  targetArmTrades=25,
  maxEpochMs=4*60*60_000
}={}){
  const s=sanitizeState(state,{asOf});
  const rows=epochRows(s,ledger);
  const control=metrics(armRows(rows,'CONTROL'));
  const experiment=metrics(armRows(rows,'EXPERIMENT'));
  const ageMs=Math.max(0,Number(asOf)-Number(s.activeExperiment.startedAt||asOf));
  const remainingControl=Math.max(0,Number(targetArmTrades||25)-control.trades);
  const remainingExperiment=Math.max(0,Number(targetArmTrades||25)-experiment.trades);
  const last=s.history?.at?.(-1)||s.lastDecision||null;
  const core={
    version:SHADOW_WALLET_RESEARCH_MANAGER_VERSION,
    walletId:s.walletId,
    status:s.status,
    epochNumber:s.epochNumber,
    cycle:s.cycle,
    epochId:s.activeExperiment.epochId,
    activeExperiment:{
      wheelId:s.activeExperiment.wheelId,
      wheelLabel:s.activeExperiment.wheelLabel,
      field:s.activeExperiment.field,
      compare:s.activeExperiment.compare,
      value:s.activeExperiment.value
    },
    lockedConstraints:s.lockedConstraints,
    control,
    experiment,
    ageMs,
    review:{
      targetArmTrades:Number(targetArmTrades||25),
      remainingControl,
      remainingExperiment,
      dueAt:Number(s.activeExperiment.startedAt||asOf)+Number(maxEpochMs||4*60*60_000)
    },
    lastDecision:last,
    completedEpochs:(s.history||[]).length,
    method:'ONE_FACTOR_RANDOMIZED_CONTROL_RATCHET',
    objective:'IMPROVE_EXPECTANCY_PROFIT_FACTOR_AND_STABILITY_NOT_WIN_RATE_ALONE',
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    automaticProductionPromotion:false
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export async function loadShadowWalletResearchManager(filePath,{asOf=Date.now()}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(parsed?.version!==SHADOW_WALLET_RESEARCH_MANAGER_VERSION) throw new Error('WALLET_RESEARCH_MANAGER_VERSION_MISMATCH');
    return {state:sanitizeState(parsed,{asOf}),healthy:true,error:null};
  }catch(err){
    if(err?.code==='ENOENT'){
      return {state:createShadowWalletResearchManager({asOf}),healthy:true,error:null};
    }
    try{await rename(filePath,filePath+'.corrupt-'+Date.now());}catch{}
    return {
      state:createShadowWalletResearchManager({asOf}),
      healthy:false,
      error:err instanceof Error?err.message:String(err)
    };
  }
}

export async function saveShadowWalletResearchManager(filePath,state){
  await mkdir(path.dirname(filePath),{recursive:true});
  const body={...clone(state),updatedAt:Date.now(),execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false};
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(body),'utf8');
  await rename(tmp,filePath);
  return freeze(body);
}
