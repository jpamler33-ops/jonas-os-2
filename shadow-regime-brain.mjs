import { sha256 } from './institutional-kernel.mjs';

export const SHADOW_REGIME_BRAIN_VERSION='TCX_SHADOW_REGIME_BRAIN_V1';

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v); return Number.isFinite(n)?n:fallback;
}
function clamp(v,a=0,b=1){ return Math.max(a,Math.min(b,Number(v))); }
function mean(xs){ return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0; }
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v); for(const x of Object.values(v)) freeze(x);
  }
  return v;
}
function normToken(v,fallback='UNKNOWN'){
  const s=String(v??'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return s||fallback;
}
function trendBucket(v){
  const x=normToken(v);
  if(x.includes('BULL')||x.includes('UP')||x.includes('LONG')) return 'UP';
  if(x.includes('BEAR')||x.includes('DOWN')||x.includes('SHORT')) return 'DOWN';
  if(x.includes('RANGE')||x.includes('CHOP')||x.includes('SIDE')||x.includes('MIX')) return 'CHOP';
  return 'NEUTRAL';
}
function volatilityBucket(v){
  const x=normToken(v);
  if(x.includes('EXTREME')||x.includes('PANIC')) return 'EXTREME';
  if(x.includes('HIGH')||x.includes('EXPAND')) return 'HIGH';
  if(x.includes('LOW')||x.includes('COMPRESS')) return 'LOW';
  if(x.includes('NORMAL')||x.includes('MID')) return 'NORMAL';
  return 'UNKNOWN';
}
function liquidityBucket(v){
  const x=normToken(v);
  if(x.includes('THIN')||x.includes('POOR')||x.includes('STRESS')) return 'THIN';
  if(x.includes('DEEP')||x.includes('STRONG')||x.includes('HEALTH')) return 'DEEP';
  if(x.includes('NORMAL')||x.includes('MID')) return 'NORMAL';
  return 'UNKNOWN';
}
function pressureBucket(v){
  const n=finite(v);
  if(n==null) return 'UNKNOWN';
  if(n>=70) return 'BUY_HEAVY';
  if(n<=30) return 'SELL_HEAVY';
  return 'BALANCED';
}

export function deriveShadowRegimeFingerprint({
  regimeId='UNKNOWN',
  regimeConfidence=null,
  mtfBias='UNKNOWN',
  pressureScore=null,
  volatilityState='UNKNOWN',
  liquidityState='UNKNOWN',
  fundingState='UNKNOWN',
  liquidationState='UNKNOWN',
  narrativeState='UNKNOWN',
  assetClass='CORE'
}={}){
  const components={
    regime:normToken(regimeId),
    trend:trendBucket(mtfBias||regimeId),
    volatility:volatilityBucket(volatilityState||regimeId),
    liquidity:liquidityBucket(liquidityState),
    pressure:pressureBucket(pressureScore),
    funding:normToken(fundingState),
    liquidation:normToken(liquidationState),
    narrative:normToken(narrativeState),
    assetClass:normToken(assetClass,'CORE')
  };
  const known=Object.values(components).filter(x=>x!=='UNKNOWN').length;
  const confidence=clamp(
    .55*clamp(finite(regimeConfidence,.5))+
    .45*(known/Object.keys(components).length)
  );
  const regimeKey=[
    components.assetClass,components.regime,components.trend,
    components.volatility,components.liquidity,components.pressure
  ].join('|');
  const core={
    version:SHADOW_REGIME_BRAIN_VERSION,
    components,regimeKey,confidence,
    execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false
  };
  return freeze({...core,fingerprint:sha256(core)});
}

function closedRows(ledger){
  return (ledger?.positions||[]).filter(p=>
    p&&p.execution==='SHADOW_ONLY'&&p.canExecuteLive===false&&p.status==='CLOSED'&&
    finite(p.realizedReturnPct)!=null&&finite(p.realizedNetPnlQuote)!=null&&
    String(p.entryRegimeKey||'').length>0
  );
}
function stats(rows,{priorStrength=12}={}){
  const n=rows.length,wins=rows.filter(x=>Number(x.realizedNetPnlQuote||0)>0).length;
  const posteriorWinRate=(wins+.5*priorStrength)/(n+priorStrength);
  const rawMeanReturn=mean(rows.map(x=>Number(x.realizedReturnPct||0)));
  const shrinkedMeanReturn=rawMeanReturn*(n/(n+10));
  return {n,wins,posteriorWinRate,rawMeanReturn,shrinkedMeanReturn};
}

export function buildRegimeStrategyMatrix(ledger,{minSamples=6}={}){
  const rows=closedRows(ledger);
  const global=stats(rows);
  const map=new Map();
  for(const p of rows){
    const strategyId=String(p.challengerRuleId||p.strategyLane||'BASELINE');
    const key=String(p.entryRegimeKey)+'::'+strategyId;
    const a=map.get(key)||[]; a.push(p); map.set(key,a);
  }
  const cells=[];
  for(const [key,xs] of map){
    const [regimeKey,strategyId]=key.split('::');
    const s=stats(xs);
    const winLift=s.posteriorWinRate-global.posteriorWinRate;
    const returnLift=s.shrinkedMeanReturn-global.shrinkedMeanReturn;
    const confidence=clamp(s.n/(s.n+12));
    let status='INSUFFICIENT';
    if(s.n>=minSamples){
      if(s.posteriorWinRate>=.54&&s.shrinkedMeanReturn>0) status='FAVORED';
      else if(s.posteriorWinRate<=.46||s.shrinkedMeanReturn<-.001) status='AVOID';
      else status='NEUTRAL';
    }
    cells.push({
      regimeKey,strategyId,...s,winLift,returnLift,confidence,status,
      score:clamp(.45*s.posteriorWinRate+.30*(.5+.5*Math.tanh(s.shrinkedMeanReturn/.006))+.25*confidence)
    });
  }
  cells.sort((a,b)=>b.score-a.score||b.n-a.n);
  const core={
    version:SHADOW_REGIME_BRAIN_VERSION,
    samples:rows.length,global,cells,
    favored:cells.filter(x=>x.status==='FAVORED').slice(0,10),
    avoid:cells.filter(x=>x.status==='AVOID').sort((a,b)=>a.score-b.score).slice(0,10),
    execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,
    meaning:'REGIME_CONDITIONAL_SHADOW_PERFORMANCE_MATRIX'
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function regimeDecisionForStrategy(matrix,regime,strategyId){
  const cell=(matrix?.cells||[]).find(x=>
    x.regimeKey===String(regime?.regimeKey||'')&&x.strategyId===String(strategyId||'')
  )||null;
  if(!cell){
    return freeze({
      version:SHADOW_REGIME_BRAIN_VERSION,status:'UNKNOWN',multiplier:.65,
      reason:'NO_REGIME_FORWARD_EVIDENCE',samples:0,
      execution:'SHADOW_ONLY',canExecuteLive:false
    });
  }
  const multiplier=cell.status==='FAVORED'?1.15:cell.status==='AVOID'?0:cell.status==='NEUTRAL'?.75:.5;
  return freeze({
    version:SHADOW_REGIME_BRAIN_VERSION,status:cell.status,multiplier,
    reason:'REGIME_STRATEGY_MATRIX',samples:cell.n,posteriorWinRate:cell.posteriorWinRate,
    shrinkedMeanReturn:cell.shrinkedMeanReturn,score:cell.score,
    execution:'SHADOW_ONLY',canExecuteLive:false
  });
}

export function regimeBrainSummary(matrix,currentRegime=null){
  const current=String(currentRegime?.regimeKey||'');
  const currentCells=(matrix?.cells||[]).filter(x=>x.regimeKey===current);
  return freeze({
    version:SHADOW_REGIME_BRAIN_VERSION,
    samples:Number(matrix?.samples||0),
    regimes:new Set((matrix?.cells||[]).map(x=>x.regimeKey)).size,
    currentRegime:currentRegime?{
      regimeKey:currentRegime.regimeKey,
      confidence:currentRegime.confidence,
      components:currentRegime.components
    }:null,
    currentFavored:currentCells.filter(x=>x.status==='FAVORED').slice(0,3),
    currentAvoid:currentCells.filter(x=>x.status==='AVOID').slice(0,3),
    execution:'SHADOW_ONLY',canExecuteLive:false
  });
}
