import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { sha256, canonicalJson } from './institutional-kernel.mjs';

export const SHADOW_PORTFOLIO_LEDGER_VERSION='TCX_SHADOW_PORTFOLIO_LEDGER_V1';
export const SHADOW_PORTFOLIO_SCHEMA_VERSION=1;
export const SHADOW_PORTFOLIO_CAPABILITIES=Object.freeze({
  execution:'SHADOW_ONLY',
  canExecuteLive:false,
  exchangeOrderSubmission:false,
  exitModel:'PUBLIC_ORDER_BOOK_DEPTH_SIMULATION'
});

const EPS=1e-12;
function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function round12(v){return Math.round(Number(v)*1e12)/1e12;}
function deepFreeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

export function deriveShadowRiskPlan(expectedReturn,{
  minTakeProfitPct=0.003,
  maxTakeProfitPct=0.03,
  minStopLossPct=0.002,
  maxStopLossPct=0.02,
  rewardRisk=1.5
}={}){
  const expected=Math.abs(finite(expectedReturn,0));
  const takeProfitPct=clamp(
    Math.max(Number(minTakeProfitPct)||0,expected*0.75),
    Number(minTakeProfitPct)||0.003,
    Number(maxTakeProfitPct)||0.03
  );
  const stopLossPct=clamp(
    takeProfitPct/Math.max(1,Number(rewardRisk)||1.5),
    Number(minStopLossPct)||0.002,
    Number(maxStopLossPct)||0.02
  );
  return deepFreeze({
    takeProfitPct,
    stopLossPct,
    rewardRisk:takeProfitPct/stopLossPct,
    epistemic:'SHADOW_RESEARCH_RISK_POLICY_NOT_INVESTMENT_ADVICE'
  });
}

function validAutoEntryOrder(order,{acceptedRoles=['ENTRY']}={}){
  const role=String(order?.strategyMeta?.role||'ENTRY').toUpperCase();
  return Boolean(
    order&&
    order.execution==='SHADOW_ONLY'&&
    order.canExecuteLive===false&&
    String(order.strategyMeta?.strategy||'')==='TCX_AUTONOMOUS_SHADOW_TRADER_V1'&&
    acceptedRoles.map(String).map(x=>x.toUpperCase()).includes(role)&&
    finite(order.fillBase)>EPS&&
    finite(order.avgFillPrice)>0&&
    finite(order.fillQuote)>0
  );
}

export function shadowPositionFromEntryOrder(order,{openedAt=null,acceptedRoles=['ENTRY']}={}){
  if(!validAutoEntryOrder(order,{acceptedRoles})) throw new Error('AUTO_SHADOW_ENTRY_ORDER_REQUIRED');
  const openAt=finite(openedAt,finite(order.updatedAt,finite(order.createdAt,Date.now())));
  const horizonMs=Math.max(60_000,finite(order.strategyMeta?.horizonMs,15*60_000));
  const plan=deriveShadowRiskPlan(order.strategyMeta?.expectedReturn);
  const side=String(order.side).toUpperCase()==='BUY'?'LONG':'SHORT';
  const coreId={
    entryOrderId:String(order.id),
    symbol:String(order.symbol).toUpperCase(),
    side,
    openedAt:openAt
  };
  return {
    positionId:'sp_'+sha256(coreId).slice(0,18),
    entryOrderId:String(order.id),
    symbol:String(order.symbol).toUpperCase(),
    side,
    entrySide:String(order.side).toUpperCase(),
    qtyBase:round12(order.fillBase),
    entryPrice:Number(order.avgFillPrice),
    entryQuote:Number(order.fillQuote),
    entryFeesQuote:Number(order.feesQuote||0),
    openedAt:openAt,
    horizonMs,
    plannedExitAt:openAt+horizonMs,
    takeProfitPct:plan.takeProfitPct,
    stopLossPct:plan.stopLossPct,
    expectedReturn:finite(order.strategyMeta?.expectedReturn),
    directionalProbability:finite(order.strategyMeta?.directionalProbability),
    probabilityEdge:finite(order.strategyMeta?.probabilityEdge),
    admissionGate:String(order.strategyMeta?.admissionGate||'UNKNOWN'),
    issuanceId:String(order.strategyMeta?.issuanceId||''),
    forecastFingerprint:String(order.strategyMeta?.forecastFingerprint||''),
    horizonId:String(order.strategyMeta?.horizonId||''),
    assetClass:String(order.strategyMeta?.assetClass||'CORE').toUpperCase(),
    entryMode:String(order.strategyMeta?.entryMode||'STANDARD').toUpperCase(),
    exploration:['EXPLORATION','ABSTAIN_PROBE'].includes(String(order.strategyMeta?.entryMode||'').toUpperCase()),
    probeOnly:String(order.strategyMeta?.entryMode||'').toUpperCase()==='ABSTAIN_PROBE',
    probeAdmissionReasons:Array.isArray(order.strategyMeta?.probeAdmissionReasons)
      ?order.strategyMeta.probeAdmissionReasons.map(String).slice(0,12)
      :[],
    challengerRuleId:String(order.strategyMeta?.challengerRuleId||''),
    challengerDecisionKey:String(order.strategyMeta?.challengerDecisionKey||''),
    challengerEngineVersion:String(order.strategyMeta?.challengerEngineVersion||''),
    challengerRuleStatus:String(order.strategyMeta?.challengerRuleStatus||''),
    challengerDiscoveryStrength:finite(order.strategyMeta?.challengerDiscoveryStrength),
    challengerSourceSamples:finite(order.strategyMeta?.challengerSourceSamples),
    challengerForwardSamples:finite(order.strategyMeta?.challengerForwardSamples),
    entryRegimeBrainVersion:String(order.strategyMeta?.entryRegimeBrainVersion||''),
    entryRegimeKey:String(order.strategyMeta?.entryRegimeKey||''),
    entryRegimeFingerprint:String(order.strategyMeta?.entryRegimeFingerprint||''),
    entryRegimeConfidence:finite(order.strategyMeta?.entryRegimeConfidence),
    entryRegimeState:order.strategyMeta?.entryRegimeState&&typeof order.strategyMeta.entryRegimeState==='object'
      ?JSON.parse(JSON.stringify(order.strategyMeta.entryRegimeState))
      :null,
    entryStressLabVersion:String(order.strategyMeta?.entryStressLabVersion||''),
    entryStressStatus:String(order.strategyMeta?.entryStressStatus||''),
    entryStressSamples:finite(order.strategyMeta?.entryStressSamples),
    entryStressMultiplier:finite(order.strategyMeta?.entryStressMultiplier),
    entryStressRobustnessScore:finite(order.strategyMeta?.entryStressRobustnessScore),
    entryStressFailedChecks:Array.isArray(order.strategyMeta?.entryStressFailedChecks)
      ?[...order.strategyMeta.entryStressFailedChecks].map(String).slice(0,20)
      :[],
    entryQualityLearnerVersion:String(order.strategyMeta?.entryQualityLearnerVersion||''),
    entryQualityLabel:String(order.strategyMeta?.entryQualityLabel||'UNKNOWN'),
    entryQualityScore:finite(order.strategyMeta?.entryQualityScore),
    entryQualityConfidence:finite(order.strategyMeta?.entryQualityConfidence),
    entryQualitySamples:finite(order.strategyMeta?.entryQualitySamples),
    entryLearningValue:finite(order.strategyMeta?.entryLearningValue),
    entryDiscoveryScore:finite(order.strategyMeta?.entryDiscoveryScore),
    trainingSupervisorVersion:String(order.strategyMeta?.trainingSupervisorVersion||''),
    trainingMissionId:String(order.strategyMeta?.trainingMissionId||''),
    trainingMissionType:String(order.strategyMeta?.trainingMissionType||''),
    trainingRiskMultiplier:finite(order.strategyMeta?.trainingRiskMultiplier),
    academyStage:String(order.strategyMeta?.academyStage||''),
    academyAchievedLevel:finite(order.strategyMeta?.academyAchievedLevel),
    strategyLane:String(order.strategyMeta?.strategyLane||[
      String(order.symbol).toUpperCase(),
      String(order.strategyMeta?.horizonId||''),
      String(order.side).toUpperCase()
    ].join(':')),
    status:'OPEN',
    closeReason:null,
    lastMark:null,
    closedAt:null,
    exitPrice:null,
    exitQuote:null,
    exitFeesQuote:null,
    realizedGrossPnlQuote:null,
    realizedNetPnlQuote:null,
    realizedReturnPct:null,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

export function simulateShadowPositionExit(position,book,{feeBps=10}={}){
  if(position?.execution!=='SHADOW_ONLY'||position?.canExecuteLive!==false) throw new Error('SHADOW_POSITION_REQUIRED');
  const qty=Math.max(0,finite(position.qtyBase,0));
  if(!(qty>EPS)) throw new Error('POSITION_QTY_INVALID');
  const isLong=String(position.side).toUpperCase()==='LONG';
  const levels=(isLong?book?.bids:book?.asks)||[];
  let remaining=qty,filledBase=0,filledQuote=0;
  const fills=[];
  for(const row of levels){
    const price=finite(row?.[0]),available=finite(row?.[1]);
    if(!(price>0&&available>0)) continue;
    const take=Math.min(remaining,available);
    if(take<=EPS) continue;
    const quote=take*price;
    fills.push({price,baseQty:take,quoteQty:quote});
    filledBase+=take;
    filledQuote+=quote;
    remaining-=take;
    if(remaining<=EPS) break;
  }
  const fillRatio=clamp(filledBase/qty,0,1);
  const avgExitPrice=filledBase>EPS?filledQuote/filledBase:null;
  const exitFeesQuote=filledQuote*Math.max(0,Number(feeBps)||0)/10000;
  const entryQuote=Number(position.entryQuote);
  const grossPnlQuote=isLong?filledQuote-entryQuote*(filledBase/qty):entryQuote*(filledBase/qty)-filledQuote;
  const allocatedEntryFees=Number(position.entryFeesQuote||0)*(filledBase/qty);
  const netPnlQuote=grossPnlQuote-allocatedEntryFees-exitFeesQuote;
  const basis=entryQuote*(filledBase/qty);
  const returnPct=basis>0?netPnlQuote/basis:null;
  return {
    fullyExecutable:fillRatio>=1-1e-9,
    fillRatio,
    filledBase,
    filledQuote,
    avgExitPrice,
    exitFeesQuote,
    grossPnlQuote,
    netPnlQuote,
    returnPct,
    fills,
    feeBps:Number(feeBps)||0,
    exitSide:isLong?'SELL':'BUY',
    epistemic:'PUBLIC_ORDER_BOOK_DEPTH_SIMULATION'
  };
}

export function markShadowPosition(position,book,{at=Date.now(),feeBps=10}={}){
  if(String(position?.status||'')!=='OPEN') return {position,trigger:null,changed:false};
  const exit=simulateShadowPositionExit(position,book,{feeBps});
  const markAt=finite(at,Date.now());
  const mark={
    markedAt:markAt,
    fullyExecutable:exit.fullyExecutable,
    fillRatio:exit.fillRatio,
    executableExitPrice:exit.avgExitPrice,
    unrealizedGrossPnlQuote:exit.grossPnlQuote,
    unrealizedNetPnlQuote:exit.netPnlQuote,
    unrealizedReturnPct:exit.returnPct,
    estimatedExitFeesQuote:exit.exitFeesQuote,
    source:String(book?.source||'UNKNOWN'),
    availableAt:finite(book?.availableAt,markAt),
    epistemic:exit.epistemic
  };
  const next={...position,lastMark:mark};
  if(!exit.fullyExecutable) return {position:next,trigger:null,changed:true,reason:'EXIT_LIQUIDITY_INSUFFICIENT'};

  let trigger=null;
  const ret=finite(exit.returnPct,0);
  if(ret<=-Math.abs(Number(position.stopLossPct)||0)) trigger='STOP_LOSS';
  else if(ret>=Math.abs(Number(position.takeProfitPct)||0)) trigger='TAKE_PROFIT';
  else if(markAt>=Number(position.plannedExitAt||Infinity)) trigger='HORIZON_EXIT';
  return {position:next,trigger,changed:true,exit};
}

export function closeShadowPosition(position,{reason='MANUAL_RESEARCH_EXIT',at=Date.now()}={}){
  if(String(position?.status||'')!=='OPEN') return position;
  const m=position.lastMark;
  if(!m?.fullyExecutable||!(finite(m.executableExitPrice)>0)) throw new Error('FULL_EXECUTABLE_MARK_REQUIRED');
  const qty=Number(position.qtyBase);
  const exitQuote=Number(m.executableExitPrice)*qty;
  const gross=String(position.side).toUpperCase()==='LONG'
    ? exitQuote-Number(position.entryQuote)
    : Number(position.entryQuote)-exitQuote;
  const exitFees=Number(m.estimatedExitFeesQuote||0);
  const net=gross-Number(position.entryFeesQuote||0)-exitFees;
  const basis=Number(position.entryQuote);
  return {
    ...position,
    status:'CLOSED',
    closeReason:String(reason),
    closedAt:finite(at,finite(m.markedAt,Date.now())),
    exitPrice:Number(m.executableExitPrice),
    exitQuote,
    exitFeesQuote:exitFees,
    realizedGrossPnlQuote:gross,
    realizedNetPnlQuote:net,
    realizedReturnPct:basis>0?net/basis:null,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

export function createEmptyShadowPortfolioLedger({initialEquityQuote=10_000}={}){
  return {
    schemaVersion:SHADOW_PORTFOLIO_SCHEMA_VERSION,
    version:SHADOW_PORTFOLIO_LEDGER_VERSION,
    initialEquityQuote:Math.max(1,Number(initialEquityQuote)||10_000),
    positions:[],
    updatedAt:Date.now(),
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

function sanitizePosition(p){
  if(!p||typeof p!=='object'||!String(p.positionId||'')) return null;
  if(p.execution!=='SHADOW_ONLY'||p.canExecuteLive!==false) return null;
  if(!['OPEN','CLOSED'].includes(String(p.status))) return null;
  if(!['LONG','SHORT'].includes(String(p.side))) return null;
  if(!(finite(p.qtyBase)>0)||!(finite(p.entryPrice)>0)||!(finite(p.entryQuote)>0)) return null;
  return p;
}

export function reconcileShadowPortfolioEntries(ledger,orders,{now=Date.now()}={}){
  const base=ledger&&ledger.version===SHADOW_PORTFOLIO_LEDGER_VERSION
    ? structuredClone(ledger)
    : createEmptyShadowPortfolioLedger();
  const known=new Set(base.positions.map(p=>String(p.entryOrderId)));
  let added=0;
  for(const order of Array.isArray(orders)?orders:[]){
    if(!validAutoEntryOrder(order,{acceptedRoles:['ENTRY','EXPLORATION_ENTRY','ABSTAIN_PROBE_ENTRY','LEARNED_CHALLENGER_ENTRY']})||known.has(String(order.id))) continue;
    const p=shadowPositionFromEntryOrder(order,{
      openedAt:finite(order.updatedAt,finite(order.createdAt,now)),
      acceptedRoles:['ENTRY','EXPLORATION_ENTRY','ABSTAIN_PROBE_ENTRY','LEARNED_CHALLENGER_ENTRY']
    });
    base.positions.push(p);
    known.add(String(order.id));
    added++;
  }
  if(added) base.updatedAt=Number(now);
  return {ledger:base,added,changed:added>0};
}

export function replaceShadowPortfolioPosition(ledger,position){
  const next=structuredClone(ledger);
  const i=next.positions.findIndex(p=>p.positionId===position.positionId);
  if(i<0) throw new Error('POSITION_NOT_FOUND');
  next.positions[i]=structuredClone(position);
  next.updatedAt=Date.now();
  return next;
}

export function shadowResearchProbeSummary(ledger,{asOf=Date.now()}={}){
  const rows=(ledger?.positions||[]).map(sanitizePosition).filter(Boolean)
    .filter(p=>String(p.entryMode||'').toUpperCase()==='ABSTAIN_PROBE');
  const open=rows.filter(p=>p.status==='OPEN');
  const closed=rows.filter(p=>p.status==='CLOSED');
  const realized=closed.reduce((s,p)=>s+Number(p.realizedNetPnlQuote||0),0);
  const unrealized=open.reduce((s,p)=>s+Number(p.lastMark?.unrealizedNetPnlQuote||0),0);
  const wins=closed.filter(p=>Number(p.realizedNetPnlQuote||0)>0).length;
  const losses=closed.filter(p=>Number(p.realizedNetPnlQuote||0)<0).length;
  const core={
    version:SHADOW_PORTFOLIO_LEDGER_VERSION,
    asOf:Number(asOf),
    openPositions:open.length,
    closedTrades:closed.length,
    wins,losses,
    winRate:closed.length?wins/closed.length:null,
    realizedPnlQuote:realized,
    unrealizedPnlQuote:unrealized,
    netPnlQuote:realized+unrealized,
    active:open.map(p=>({
      positionId:p.positionId,symbol:p.symbol,side:p.side,entryPrice:p.entryPrice,
      horizonId:p.horizonId,openedAt:p.openedAt,plannedExitAt:p.plannedExitAt,
      unrealizedNetPnlQuote:finite(p.lastMark?.unrealizedNetPnlQuote),
      admissionGate:p.admissionGate,
      probeAdmissionReasons:p.probeAdmissionReasons||[]
    })),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'ABSTAIN_PROBE_LEARNING_ONLY_EXCLUDED_FROM_PRIMARY_PERFORMANCE'
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function shadowPortfolioSummary(ledger,{asOf=Date.now()}={}){
  const positions=(ledger?.positions||[]).map(sanitizePosition).filter(Boolean)
    .filter(p=>!['CHALLENGER','ABSTAIN_PROBE'].includes(String(p.entryMode||'STANDARD').toUpperCase()));
  const open=positions.filter(p=>p.status==='OPEN');
  const closed=positions.filter(p=>p.status==='CLOSED').sort((a,b)=>Number(a.closedAt)-Number(b.closedAt));
  const realized=closed.reduce((s,p)=>s+Number(p.realizedNetPnlQuote||0),0);
  const unrealized=open.reduce((s,p)=>s+Number(p.lastMark?.unrealizedNetPnlQuote||0),0);
  const initial=Math.max(1,Number(ledger?.initialEquityQuote)||10_000);
  const net=realized+unrealized;
  const wins=closed.filter(p=>Number(p.realizedNetPnlQuote)>0);
  const losses=closed.filter(p=>Number(p.realizedNetPnlQuote)<0);
  const grossProfit=wins.reduce((s,p)=>s+Number(p.realizedNetPnlQuote),0);
  const grossLoss=Math.abs(losses.reduce((s,p)=>s+Number(p.realizedNetPnlQuote),0));
  const profitFactor=grossLoss>EPS?grossProfit/grossLoss:null;
  const winRate=closed.length?wins.length/closed.length:null;
  const expectancy=closed.length?realized/closed.length:null;

  let equity=initial,peak=initial,maxDrawdownQuote=0,maxDrawdownPct=0;
  for(const p of closed){
    equity+=Number(p.realizedNetPnlQuote||0);
    peak=Math.max(peak,equity);
    const dd=Math.max(0,peak-equity);
    if(dd>maxDrawdownQuote) maxDrawdownQuote=dd;
    if(peak>0) maxDrawdownPct=Math.max(maxDrawdownPct,dd/peak);
  }
  const byReason={};
  for(const p of closed) byReason[p.closeReason]=(byReason[p.closeReason]||0)+1;
  const core={
    version:SHADOW_PORTFOLIO_LEDGER_VERSION,
    asOf:Number(asOf),
    initialEquityQuote:initial,
    equityQuote:initial+net,
    realizedPnlQuote:realized,
    unrealizedPnlQuote:unrealized,
    netPnlQuote:net,
    returnPct:net/initial,
    openPositions:open.length,
    closedTrades:closed.length,
    wins:wins.length,
    losses:losses.length,
    winRate,
    profitFactor,
    expectancyQuote:expectancy,
    maxDrawdownQuote,
    maxDrawdownPct,
    byCloseReason:byReason,
    active:open.map(p=>({
      positionId:p.positionId,symbol:p.symbol,side:p.side,entryPrice:p.entryPrice,
      qtyBase:p.qtyBase,openedAt:p.openedAt,plannedExitAt:p.plannedExitAt,
      stopLossPct:p.stopLossPct,takeProfitPct:p.takeProfitPct,
      unrealizedNetPnlQuote:finite(p.lastMark?.unrealizedNetPnlQuote),
      unrealizedReturnPct:finite(p.lastMark?.unrealizedReturnPct)
    })),
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}


function zonedParts(epoch,timeZone){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date(epoch));
  const get=type=>parts.find(x=>x.type===type)?.value;
  const weekday={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[get('weekday')];
  return {
    year:Number(get('year')),month:Number(get('month')),day:Number(get('day')),
    hour:Number(get('hour')),minute:Number(get('minute')),second:Number(get('second')),
    weekday
  };
}

function zonedEpoch({year,month,day,hour=0,minute=0,second=0},timeZone){
  let guess=Date.UTC(year,month-1,day,hour,minute,second);
  for(let i=0;i<3;i++){
    const p=zonedParts(guess,timeZone);
    const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    const target=Date.UTC(year,month-1,day,hour,minute,second);
    const diff=represented-target;
    if(Math.abs(diff)<1000) break;
    guess-=diff;
  }
  return guess;
}

function periodWindow(period,asOf,timeZone='UTC'){
  const end=Number(asOf);
  if(!Number.isFinite(end)) throw new Error('ASOF_INVALID');
  try{ new Intl.DateTimeFormat('en',{timeZone}).format(new Date(end)); }
  catch{ throw new Error('TIMEZONE_INVALID'); }
  const p=String(period||'DAY').toUpperCase();
  if(p==='ALL') return {period:'ALL',startAt:0,endAt:end,label:'Gesamt',timeZone};
  const local=zonedParts(end,timeZone);
  let y=local.year,m=local.month,d=local.day;
  if(p==='WEEK'){
    const delta=(local.weekday+6)%7;
    const x=new Date(Date.UTC(y,m-1,d-delta));
    y=x.getUTCFullYear();m=x.getUTCMonth()+1;d=x.getUTCDate();
  }else if(p==='MONTH'){
    d=1;
  }else if(p!=='DAY'){
    throw new Error('PERIOD_INVALID');
  }
  return {
    period:p,
    startAt:zonedEpoch({year:y,month:m,day:d},timeZone),
    endAt:end,
    label:p==='DAY'?'Heute':p==='WEEK'?'Diese Woche':'Dieser Monat',
    timeZone
  };
}

function tradeStats(rows){
  const closed=rows.filter(p=>p.status==='CLOSED');
  const realized=closed.reduce((sum,p)=>sum+Number(p.realizedNetPnlQuote||0),0);
  const wins=closed.filter(p=>Number(p.realizedNetPnlQuote)>0);
  const losses=closed.filter(p=>Number(p.realizedNetPnlQuote)<0);
  const breakeven=closed.length-wins.length-losses.length;
  const grossProfit=wins.reduce((sum,p)=>sum+Number(p.realizedNetPnlQuote||0),0);
  const grossLoss=Math.abs(losses.reduce((sum,p)=>sum+Number(p.realizedNetPnlQuote||0),0));
  const avgWin=wins.length?grossProfit/wins.length:null;
  const avgLoss=losses.length?grossLoss/losses.length:null;
  const best=closed.length?closed.slice().sort((a,b)=>Number(b.realizedNetPnlQuote||0)-Number(a.realizedNetPnlQuote||0))[0]:null;
  const worst=closed.length?closed.slice().sort((a,b)=>Number(a.realizedNetPnlQuote||0)-Number(b.realizedNetPnlQuote||0))[0]:null;
  return {
    trades:closed.length,wins:wins.length,losses:losses.length,breakeven,
    winRate:closed.length?wins.length/closed.length:null,
    realizedPnlQuote:realized,
    grossProfitQuote:grossProfit,
    grossLossQuote:grossLoss,
    profitFactor:grossLoss>EPS?grossProfit/grossLoss:null,
    expectancyQuote:closed.length?realized/closed.length:null,
    avgWinQuote:avgWin,
    avgLossQuote:avgLoss,
    bestTrade:best?{symbol:best.symbol,pnlQuote:Number(best.realizedNetPnlQuote||0),returnPct:finite(best.realizedReturnPct),assetClass:best.assetClass||'CORE'}:null,
    worstTrade:worst?{symbol:worst.symbol,pnlQuote:Number(worst.realizedNetPnlQuote||0),returnPct:finite(worst.realizedReturnPct),assetClass:worst.assetClass||'CORE'}:null
  };
}

export function shadowPortfolioPeriodStats(ledger,{period='DAY',asOf=Date.now(),timeZone='UTC'}={}){
  const window=periodWindow(period,asOf,timeZone);
  const positions=(ledger?.positions||[]).map(sanitizePosition).filter(Boolean)
    .filter(p=>!['CHALLENGER','ABSTAIN_PROBE'].includes(String(p.entryMode||'STANDARD').toUpperCase()));
  const entered=positions.filter(p=>Number(p.openedAt)>=window.startAt&&Number(p.openedAt)<=window.endAt);
  const closed=positions.filter(p=>p.status==='CLOSED'&&Number(p.closedAt)>=window.startAt&&Number(p.closedAt)<=window.endAt);
  const base=tradeStats(closed);

  const bySymbol={};
  const byAssetClass={};
  const bySide={LONG:0,SHORT:0};
  for(const p of closed){
    const symbol=String(p.symbol);
    const assetClass=String(p.assetClass||'CORE').toUpperCase();
    (bySymbol[symbol]??=[]).push(p);
    (byAssetClass[assetClass]??=[]).push(p);
    if(p.side==='LONG'||p.side==='SHORT') bySide[p.side]++;
  }
  const symbolStats=Object.fromEntries(
    Object.entries(bySymbol).map(([k,v])=>[k,tradeStats(v)])
  );
  const assetClassStats=Object.fromEntries(
    Object.entries(byAssetClass).map(([k,v])=>[k,tradeStats(v)])
  );

  const core={
    version:SHADOW_PORTFOLIO_LEDGER_VERSION,
    period:window.period,
    label:window.label,
    startAt:window.startAt,
    endAt:window.endAt,
    timeZone:window.timeZone,
    entries:entered.length,
    openEntries:entered.filter(p=>p.status==='OPEN').length,
    ...base,
    bySide,
    bySymbol:symbolStats,
    byAssetClass:assetClassStats,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function shadowPortfolioStatistics(ledger,{asOf=Date.now(),timeZone='UTC'}={}){
  const periods=['DAY','WEEK','MONTH','ALL'];
  return deepFreeze(Object.fromEntries(periods.map(period=>[
    period,shadowPortfolioPeriodStats(ledger,{period,asOf,timeZone})
  ])));
}

export function verifyShadowPortfolioSummary(value){
  try{
    const reasons=[];
    if(value?.version!==SHADOW_PORTFOLIO_LEDGER_VERSION) reasons.push('VERSION_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.canExecuteLive!==false) reasons.push('EXECUTION_INVARIANT_INVALID');
    const {fingerprint,...core}=value||{};
    const expected=sha256(core);
    if(fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['SUMMARY_INVALID',err instanceof Error?err.message:String(err)]};
  }
}

export async function loadShadowPortfolioLedger(filePath,{initialEquityQuote=10_000}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(parsed?.schemaVersion!==SHADOW_PORTFOLIO_SCHEMA_VERSION||parsed?.version!==SHADOW_PORTFOLIO_LEDGER_VERSION){
      throw new Error('SHADOW_PORTFOLIO_SCHEMA_MISMATCH');
    }
    const positions=(Array.isArray(parsed.positions)?parsed.positions:[]).map(sanitizePosition).filter(Boolean);
    return {
      ledger:{
        ...parsed,
        positions,
        initialEquityQuote:Math.max(1,Number(parsed.initialEquityQuote)||initialEquityQuote),
        execution:'SHADOW_ONLY',
        canExecuteLive:false
      },
      healthy:true,
      recoveredFromCorrupt:false,
      error:null
    };
  }catch(err){
    if(err?.code==='ENOENT'){
      return {ledger:createEmptyShadowPortfolioLedger({initialEquityQuote}),healthy:true,recoveredFromCorrupt:false,error:null};
    }
    try{await rename(filePath,filePath+'.corrupt-'+Date.now());}catch{}
    return {
      ledger:createEmptyShadowPortfolioLedger({initialEquityQuote}),
      healthy:false,
      recoveredFromCorrupt:true,
      error:err instanceof Error?err.message:String(err)
    };
  }
}

export async function saveShadowPortfolioLedger(filePath,ledger,{maxPositions=5000}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const positions=(ledger?.positions||[]).map(sanitizePosition).filter(Boolean).slice(-Math.max(100,Number(maxPositions)||5000));
  const body={
    schemaVersion:SHADOW_PORTFOLIO_SCHEMA_VERSION,
    version:SHADOW_PORTFOLIO_LEDGER_VERSION,
    initialEquityQuote:Math.max(1,Number(ledger?.initialEquityQuote)||10_000),
    positions,
    updatedAt:Date.now(),
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,canonicalJson(body),{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return body;
}
