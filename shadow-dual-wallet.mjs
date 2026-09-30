import { sha256 } from './institutional-kernel.mjs';

export const SHADOW_DUAL_WALLET_VERSION='TCX_SHADOW_DUAL_WALLET_V1';
export const NORMAL_WALLET_ID='NORMAL';
export const LAB_WALLET_ID='LAB';
export const LAB_UNCONSTRAINED_ENTRY_MODE='LAB_UNCONSTRAINED';
export const LAB_UNCONSTRAINED_ENTRY_ROLE='LAB_UNCONSTRAINED_ENTRY';

export const LAB_RESEARCH_ENTRY_MODES=Object.freeze([
  'CHALLENGER',
  'ABSTAIN_PROBE',
  'COVERAGE_PROBE',
  'EXPLORATION',
  LAB_UNCONSTRAINED_ENTRY_MODE
]);

const EPS=1e-12;
function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) freeze(x);
  }
  return v;
}
function modeOf(row){return String(row?.entryMode||'STANDARD').toUpperCase();}
export function isLabWalletEntryMode(mode=''){
  return LAB_RESEARCH_ENTRY_MODES.includes(String(mode||'').toUpperCase());
}
export function shadowWalletIdForPosition(row={}){
  const explicit=String(row?.walletId||'').toUpperCase();
  if(explicit===LAB_WALLET_ID) return LAB_WALLET_ID;
  if(explicit===NORMAL_WALLET_ID) return NORMAL_WALLET_ID;
  return isLabWalletEntryMode(modeOf(row))?LAB_WALLET_ID:NORMAL_WALLET_ID;
}

function pnlStats(rows=[]){
  const closed=rows.filter(p=>p?.status==='CLOSED');
  const open=rows.filter(p=>p?.status==='OPEN');
  const realized=closed.reduce((s,p)=>s+finite(p?.realizedNetPnlQuote,0),0);
  const unrealized=open.reduce((s,p)=>s+finite(p?.lastMark?.unrealizedNetPnlQuote,0),0);
  const wins=closed.filter(p=>finite(p?.realizedNetPnlQuote,0)>0);
  const losses=closed.filter(p=>finite(p?.realizedNetPnlQuote,0)<0);
  const grossProfit=wins.reduce((s,p)=>s+finite(p?.realizedNetPnlQuote,0),0);
  const grossLoss=Math.abs(losses.reduce((s,p)=>s+finite(p?.realizedNetPnlQuote,0),0));
  const currentCapitalAtRisk=open.reduce((s,p)=>s+Math.max(0,finite(p?.entryQuote,0)),0);
  const cumulativeCapitalUsed=rows.reduce((s,p)=>s+Math.max(0,finite(p?.entryQuote,0)),0);
  return {
    openPositions:open.length,
    closedTrades:closed.length,
    wins:wins.length,
    losses:losses.length,
    winRate:closed.length?wins.length/closed.length:null,
    realizedPnlQuote:realized,
    unrealizedPnlQuote:unrealized,
    netPnlQuote:realized+unrealized,
    grossProfitQuote:grossProfit,
    grossLossQuote:grossLoss,
    profitFactor:grossLoss>EPS?grossProfit/grossLoss:null,
    expectancyQuote:closed.length?realized/closed.length:null,
    currentCapitalAtRiskQuote:currentCapitalAtRisk,
    cumulativeCapitalUsedQuote:cumulativeCapitalUsed
  };
}

function modeStats(rows=[]){
  const byMode={};
  for(const p of rows){
    const mode=modeOf(p);
    byMode[mode]??={open:0,closed:0,realizedPnlQuote:0};
    if(p?.status==='OPEN') byMode[mode].open++;
    if(p?.status==='CLOSED'){
      byMode[mode].closed++;
      byMode[mode].realizedPnlQuote+=finite(p?.realizedNetPnlQuote,0);
    }
  }
  return byMode;
}

function activeRows(rows=[]){
  return rows.filter(p=>p?.status==='OPEN').sort((a,b)=>Number(b?.openedAt||0)-Number(a?.openedAt||0)).slice(0,30).map(p=>({
    positionId:String(p?.positionId||''),
    symbol:String(p?.symbol||''),
    side:String(p?.side||''),
    entryMode:modeOf(p),
    walletId:shadowWalletIdForPosition(p),
    entryQuote:finite(p?.entryQuote),
    entryPrice:finite(p?.entryPrice),
    horizonId:String(p?.horizonId||''),
    admissionGate:String(p?.admissionGate||'UNKNOWN'),
    openedAt:finite(p?.openedAt),
    plannedExitAt:finite(p?.plannedExitAt),
    unrealizedNetPnlQuote:finite(p?.lastMark?.unrealizedNetPnlQuote),
    unrealizedReturnPct:finite(p?.lastMark?.unrealizedReturnPct)
  }));
}

export function shadowDualWalletSummary(ledger,{asOf=Date.now(),minimumProofTrades=30}={}){
  const rows=(Array.isArray(ledger?.positions)?ledger.positions:[]).filter(p=>
    p&&p.execution==='SHADOW_ONLY'&&p.canExecuteLive===false&&['OPEN','CLOSED'].includes(String(p.status||''))
  );
  const normalRows=rows.filter(p=>shadowWalletIdForPosition(p)===NORMAL_WALLET_ID);
  const labRows=rows.filter(p=>shadowWalletIdForPosition(p)===LAB_WALLET_ID);
  const normal=pnlStats(normalRows);
  const lab=pnlStats(labRows);
  const recoveryDebt=Math.max(0,-lab.realizedPnlQuote);
  const retainedSurplus=Math.max(0,lab.realizedPnlQuote);
  const recoveryCoverage=lab.grossLossQuote>EPS
    ?Math.min(1,lab.grossProfitQuote/lab.grossLossQuote)
    :1;
  const proofN=Math.max(1,Math.floor(Number(minimumProofTrades)||30));
  const objectiveStatus=lab.closedTrades<proofN
    ?'BUILDING_SAMPLE'
    :(lab.realizedPnlQuote>0&&Number(lab.profitFactor||0)>1?'LONG_TERM_POSITIVE_SO_FAR':recoveryDebt>0?'RECOVERY_REQUIRED':'NOT_PROVEN');
  const core={
    version:SHADOW_DUAL_WALLET_VERSION,
    asOf:Number(asOf),
    normal:{
      walletId:NORMAL_WALLET_ID,
      capitalModel:'BOUNDED_SHADOW_PORTFOLIO',
      initialEquityQuote:Math.max(1,finite(ledger?.initialEquityQuote,10_000)),
      ...normal,
      byMode:modeStats(normalRows),
      active:activeRows(normalRows),
      objective:'PRIMARY_SHADOW_PERFORMANCE_WITH_GOVERNED_RISK'
    },
    lab:{
      walletId:LAB_WALLET_ID,
      capitalModel:'UNLIMITED_VIRTUAL_CAPITAL_FACILITY',
      capitalLimitQuote:null,
      ...lab,
      currentRecoveryDebtQuote:recoveryDebt,
      retainedSurplusQuote:retainedSurplus,
      recoveryCoverage,
      objectiveStatus,
      minimumProofTrades:proofN,
      byMode:modeStats(labRows),
      active:activeRows(labRows),
      objective:'RECOVER_ALL_REALIZED_DEFICITS_AND_ESTABLISH_POSITIVE_LONG_RUN_EXPECTANCY',
      primaryPerformanceExcluded:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    canExecuteLive:false,
    automaticPrimaryMutation:false
  };
  return freeze({...core,fingerprint:sha256(core)});
}

function safeIssuance(issuance,{now,maxAgeMs}){
  if(!issuance||issuance.executionMode!=='SHADOW_ONLY'||issuance.canExecute!==false){
    return 'ISSUANCE_SAFETY_INVARIANT_INVALID';
  }
  if(String(issuance?.trace?.safety?.state||'UNKNOWN').toUpperCase()!=='NORMAL'){
    return 'DATA_SAFETY_NOT_NORMAL';
  }
  const generatedAt=finite(issuance.generatedAt);
  if(generatedAt==null||generatedAt>now) return 'ISSUANCE_TIME_INVALID';
  if(now-generatedAt>maxAgeMs) return 'ISSUANCE_STALE';
  if(!String(issuance.forecastFingerprint||'')) return 'FORECAST_FINGERPRINT_MISSING';
  return null;
}

export function deriveUnconstrainedLabWalletCandidate(issuance,{
  now=Date.now(),
  maxAgeMs=30*60_000,
  notionalQuote=500,
  existingDecisionKeys=[]
}={}){
  const at=Number(now);
  const blocked=safeIssuance(issuance,{now:at,maxAgeMs:Math.max(60_000,Number(maxAgeMs)||30*60_000)});
  if(blocked) return freeze({
    version:SHADOW_DUAL_WALLET_VERSION,
    eligible:false,
    reason:blocked,
    walletId:LAB_WALLET_ID,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    canExecuteLive:false
  });
  const used=new Set((existingDecisionKeys||[]).map(String));
  const rows=(Array.isArray(issuance?.forecast?.horizons)?issuance.forecast.horizons:[])
    .map(h=>{
      const direction=String(h?.direction||'').toUpperCase();
      const horizonMs=Math.max(0,finite(h?.horizonMs,0));
      const expectedReturn=finite(h?.expectedReturn,0);
      if(!['UP','DOWN'].includes(direction)||!(horizonMs>=60_000)) return null;
      const core={
        version:SHADOW_DUAL_WALLET_VERSION,
        symbol:String(issuance.symbol||'').toUpperCase(),
        forecastFingerprint:String(issuance.forecastFingerprint||''),
        horizonId:String(h?.horizonId||''),
        direction,
        generatedAt:Number(issuance.generatedAt)
      };
      const labDecisionKey='lab_'+sha256(core).slice(0,28);
      return {
        h,direction,horizonMs,expectedReturn,labDecisionKey,
        score:Math.abs(expectedReturn)
      };
    })
    .filter(Boolean)
    .filter(x=>!used.has(x.labDecisionKey))
    .sort((a,b)=>(b.score-a.score)||(b.horizonMs-a.horizonMs));
  const best=rows[0]||null;
  if(!best) return freeze({
    version:SHADOW_DUAL_WALLET_VERSION,
    eligible:false,
    reason:'NO_DIRECTIONAL_LAB_HYPOTHESIS',
    walletId:LAB_WALLET_ID,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    canExecuteLive:false
  });
  const admissionGate=String(issuance?.admission?.gate||issuance?.gate||'UNKNOWN').toUpperCase();
  const calibrationStatus=String(best.h?.calibration?.status||'UNKNOWN').toUpperCase();
  const candidate={
    version:SHADOW_DUAL_WALLET_VERSION,
    eligible:true,
    reason:'UNCONSTRAINED_RESEARCH_CANDIDATE',
    walletId:LAB_WALLET_ID,
    entryMode:LAB_UNCONSTRAINED_ENTRY_MODE,
    role:LAB_UNCONSTRAINED_ENTRY_ROLE,
    symbol:String(issuance.symbol||'').toUpperCase(),
    side:best.direction==='UP'?'BUY':'SELL',
    direction:best.direction,
    horizonId:String(best.h?.horizonId||''),
    horizonMs:best.horizonMs,
    expectedReturn:best.expectedReturn,
    notionalQuote:Math.max(1,Number(notionalQuote)||500),
    labDecisionKey:best.labDecisionKey,
    issuanceId:String(issuance.issuanceId||''),
    forecastFingerprint:String(issuance.forecastFingerprint||''),
    generatedAt:Number(issuance.generatedAt),
    admissionGate,
    calibrationStatus,
    horizonGate:String(best.h?.gate||'UNKNOWN').toUpperCase(),
    capitalFacility:'UNLIMITED_VIRTUAL',
    capitalRiskPolicy:'NO_CAPITAL_DRAWDOWN_OR_ACADEMY_LIMITS',
    horizonOnlyExit:true,
    primaryPerformanceExcluded:true,
    counterfactualOnly:admissionGate==='ABSTAIN',
    epistemicBoundary:'POINT_IN_TIME_AND_DATA_SAFETY_STILL_REQUIRED',
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false,
    canExecuteLive:false
  };
  return freeze({...candidate,fingerprint:sha256(candidate)});
}
