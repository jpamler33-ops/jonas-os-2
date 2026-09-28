import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { sha256, canonicalJson } from './institutional-kernel.mjs';
import { deriveAutonomousShadowTrade, AUTONOMOUS_SHADOW_TRADER_VERSION } from './autonomous-shadow-trader.mjs';
import {
  shadowPositionFromEntryOrder, markShadowPosition, closeShadowPosition,
  shadowPortfolioSummary
} from './shadow-portfolio-ledger.mjs';

export const SHADOW_STRATEGY_LEAGUE_VERSION='TCX_SHADOW_STRATEGY_LEAGUE_V1';
export const SHADOW_STRATEGY_LEAGUE_SCHEMA_VERSION=1;

export const SHADOW_STRATEGIES=Object.freeze([
  Object.freeze({
    id:'DEFENSIVE',label:'Defensive',
    horizonSelection:'SHORTEST',
    minExpectedReturn:.0035,minDirectionalProbability:.64,minProbabilityEdge:.16,
    notionalMultiplier:.65,assetClasses:['CORE','MEME']
  }),
  Object.freeze({
    id:'EDGE_HUNTER',label:'Edge Hunter',
    horizonSelection:'MAX_EDGE',
    minExpectedReturn:.003,minDirectionalProbability:.60,minProbabilityEdge:.14,
    notionalMultiplier:.85,assetClasses:['CORE','MEME']
  }),
  Object.freeze({
    id:'RETURN_HUNTER',label:'Return Hunter',
    horizonSelection:'MAX_RETURN',
    minExpectedReturn:.004,minDirectionalProbability:.60,minProbabilityEdge:.12,
    notionalMultiplier:.85,assetClasses:['CORE','MEME']
  }),
  Object.freeze({
    id:'LONG_VIEW',label:'Long View',
    horizonSelection:'LONGEST',
    minExpectedReturn:.003,minDirectionalProbability:.58,minProbabilityEdge:.10,
    notionalMultiplier:.75,assetClasses:['CORE','MEME']
  }),
  Object.freeze({
    id:'MEME_SPECIALIST',label:'Meme Specialist',
    horizonSelection:'MAX_EDGE',
    minExpectedReturn:.006,minDirectionalProbability:.66,minProbabilityEdge:.20,
    notionalMultiplier:.55,assetClasses:['MEME']
  })
]);

const EPS=1e-12;
function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) freeze(x);
  }
  return v;
}
function byId(id){ return SHADOW_STRATEGIES.find(x=>x.id===String(id))||null; }
function dayKey(epoch){ return new Date(Number(epoch)).toISOString().slice(0,10); }

export function createEmptyStrategyLeagueLedger({
  initialEquityPerStrategy=5_000
}={}){
  return {
    schemaVersion:SHADOW_STRATEGY_LEAGUE_SCHEMA_VERSION,
    version:SHADOW_STRATEGY_LEAGUE_VERSION,
    initialEquityPerStrategy:Math.max(100,Number(initialEquityPerStrategy)||5_000),
    positions:[],
    updatedAt:Date.now(),
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

function sanitizeLeaguePosition(p){
  if(!p||typeof p!=='object') return null;
  if(p.execution!=='SHADOW_ONLY'||p.canExecuteLive!==false) return null;
  if(!byId(p.leagueStrategyId)) return null;
  if(!['OPEN','CLOSED'].includes(String(p.status))) return null;
  if(!(finite(p.entryQuote)>0)||!(finite(p.qtyBase)>0)) return null;
  return p;
}

export function leaguePositionFromEntryOrder(order,{openedAt=null}={}){
  if(String(order?.strategyMeta?.role||'').toUpperCase()!=='LEAGUE_ENTRY'){
    throw new Error('LEAGUE_ENTRY_ORDER_REQUIRED');
  }
  const strategyId=String(order.strategyMeta?.leagueStrategyId||'');
  const strategy=byId(strategyId);
  if(!strategy) throw new Error('LEAGUE_STRATEGY_UNKNOWN');
  const base=shadowPositionFromEntryOrder(order,{
    openedAt,
    acceptedRoles:['LEAGUE_ENTRY']
  });
  const sampleCore={
    strategyId,
    symbol:base.symbol,
    horizonId:base.horizonId,
    forecastFingerprint:base.forecastFingerprint,
    issuanceId:base.issuanceId
  };
  return {
    ...base,
    leagueStrategyId:strategyId,
    leagueStrategyLabel:strategy.label,
    leagueDecisionKey:String(order.strategyMeta?.leagueDecisionKey||''),
    leagueSampleKey:'ls_'+sha256(sampleCore).slice(0,24),
    leagueAllocationWeight:finite(order.strategyMeta?.leagueAllocationWeight),
    leagueNotionalMultiplier:finite(order.strategyMeta?.leagueNotionalMultiplier),
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

export function reconcileStrategyLeagueEntries(ledger,orders,{now=Date.now()}={}){
  const next=ledger?.version===SHADOW_STRATEGY_LEAGUE_VERSION
    ? structuredClone(ledger)
    : createEmptyStrategyLeagueLedger();
  const known=new Set(next.positions.map(p=>String(p.entryOrderId)));
  let added=0;
  for(const order of Array.isArray(orders)?orders:[]){
    if(String(order?.strategyMeta?.role||'').toUpperCase()!=='LEAGUE_ENTRY') continue;
    if(known.has(String(order.id))) continue;
    if(!(finite(order.fillBase)>EPS)||!(finite(order.avgFillPrice)>0)) continue;
    try{
      const p=leaguePositionFromEntryOrder(order,{
        openedAt:finite(order.updatedAt,finite(order.createdAt,now))
      });
      next.positions.push(p);
      known.add(String(order.id));
      added++;
    }catch{}
  }
  if(added) next.updatedAt=Number(now);
  return {ledger:next,added,changed:added>0};
}

export function replaceStrategyLeaguePosition(ledger,position){
  const next=structuredClone(ledger);
  const i=next.positions.findIndex(p=>p.positionId===position.positionId);
  if(i<0) throw new Error('LEAGUE_POSITION_NOT_FOUND');
  next.positions[i]=structuredClone(position);
  next.updatedAt=Date.now();
  return next;
}

function strategyAccount(ledger,strategyId,{asOf=Date.now()}={}){
  const strategy=byId(strategyId);
  if(!strategy) throw new Error('LEAGUE_STRATEGY_UNKNOWN');
  const positions=(ledger?.positions||[])
    .map(sanitizeLeaguePosition).filter(Boolean)
    .filter(p=>p.leagueStrategyId===strategyId);
  const initial=Math.max(100,Number(ledger?.initialEquityPerStrategy)||5_000);
  const summary=shadowPortfolioSummary({
    initialEquityQuote:initial,
    positions
  },{asOf});
  const closed=positions.filter(p=>p.status==='CLOSED');
  const independentDecisions=new Set(closed.map(p=>String(p.leagueSampleKey||p.entryOrderId))).size;
  const tradingDays=new Set(closed.map(p=>dayKey(p.closedAt))).size;
  const bySymbol=new Map();
  for(const p of closed) bySymbol.set(p.symbol,(bySymbol.get(p.symbol)||0)+1);
  const maxSymbolTrades=closed.length?Math.max(...bySymbol.values()):0;
  const symbolConcentration=closed.length?maxSymbolTrades/closed.length:0;
  const eligibleForAllocation=
    closed.length>=30&&
    independentDecisions>=30&&
    tradingDays>=7&&
    symbolConcentration<=.60;

  const pf=summary.profitFactor;
  const pfScore=pf==null
    ? (summary.realizedPnlQuote>0&&closed.length>=10?.80:.20)
    : clamp((Number(pf)-.75)/.75,0,1);
  const returnScore=clamp((Number(summary.returnPct||0)+.02)/.08,0,1);
  const ddScore=clamp(1-Number(summary.maxDrawdownPct||0)/.10,0,1);
  const consistency=clamp(Number(summary.winRate||0)/.60,0,1);
  const performanceScore=clamp(
    .35*pfScore+.30*returnScore+.20*ddScore+.15*consistency,
    0,1
  );
  const riskHold=Number(summary.maxDrawdownPct||0)>.12;

  return {
    strategyId,
    label:strategy.label,
    profile:strategy,
    summary,
    independentDecisions,
    tradingDays,
    symbolConcentration,
    eligibleForAllocation,
    performanceScore,
    riskHold,
    positions
  };
}

export function strategyLeagueSummary(ledger,{asOf=Date.now()}={}){
  const accounts=SHADOW_STRATEGIES.map(s=>strategyAccount(ledger,s.id,{asOf}));
  const eligible=accounts.filter(x=>x.eligibleForAllocation&&!x.riskHold);
  const n=accounts.length;
  const equal=1/n;
  const weights=new Map(accounts.map(x=>[x.strategyId,equal]));
  let allocationMode='EQUAL_EXPLORATION';

  if(eligible.length>=2){
    allocationMode='EVIDENCE_WEIGHTED';
    const floor=.08;
    const remaining=Math.max(0,1-floor*n);
    const scoreSum=eligible.reduce((s,x)=>s+Math.max(.05,x.performanceScore),0);
    for(const a of accounts) weights.set(a.strategyId,floor);
    for(const a of eligible){
      const extra=remaining*Math.max(.05,a.performanceScore)/scoreSum;
      weights.set(a.strategyId,floor+extra);
    }
  }

  const rows=accounts.map(a=>{
    const allocationWeight=weights.get(a.strategyId)||0;
    const status=a.riskHold
      ?'RISK_HOLD'
      :a.eligibleForAllocation
        ?(a.performanceScore>=.55?'PROVEN':'PROBATION')
        :'CHALLENGER';
    return {
      strategyId:a.strategyId,
      label:a.label,
      status,
      allocationWeight,
      performanceScore:a.performanceScore,
      eligibleForAllocation:a.eligibleForAllocation,
      independentDecisions:a.independentDecisions,
      tradingDays:a.tradingDays,
      symbolConcentration:a.symbolConcentration,
      riskHold:a.riskHold,
      account:{
        initialEquityQuote:a.summary.initialEquityQuote,
        equityQuote:a.summary.equityQuote,
        netPnlQuote:a.summary.netPnlQuote,
        returnPct:a.summary.returnPct,
        openPositions:a.summary.openPositions,
        closedTrades:a.summary.closedTrades,
        winRate:a.summary.winRate,
        profitFactor:a.summary.profitFactor,
        expectancyQuote:a.summary.expectancyQuote,
        maxDrawdownPct:a.summary.maxDrawdownPct
      }
    };
  }).sort((a,b)=>b.allocationWeight-a.allocationWeight||b.performanceScore-a.performanceScore);

  const core={
    version:SHADOW_STRATEGY_LEAGUE_VERSION,
    asOf:Number(asOf),
    allocationMode,
    strategyCount:n,
    eligibleStrategies:eligible.length,
    initialEquityPerStrategy:Math.max(100,Number(ledger?.initialEquityPerStrategy)||5_000),
    totalInitialVirtualCapital:Math.max(100,Number(ledger?.initialEquityPerStrategy)||5_000)*n,
    strategies:rows,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'VIRTUAL_STRATEGY_COMPETITION_NOT_REAL_CAPITAL_ALLOCATION'
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function deriveStrategyLeagueCandidates(issuance,ledger,{
  now=Date.now(),
  assetClass='CORE',
  baseNotionalQuote=50,
  memeMinExpectedReturn=.0035,
  memeMinDirectionalProbability=.60,
  memeMinProbabilityEdge=.12
}={}){
  const cls=String(assetClass||'CORE').toUpperCase();
  const summary=strategyLeagueSummary(ledger,{asOf:now});
  const byStrategy=new Map(summary.strategies.map(x=>[x.strategyId,x]));
  const candidates=[];

  for(const strategy of SHADOW_STRATEGIES){
    if(!strategy.assetClasses.includes(cls)) continue;
    const account=byStrategy.get(strategy.id);
    if(!account||account.riskHold) continue;

    const minExpectedReturn=Math.max(
      strategy.minExpectedReturn,
      cls==='MEME'?memeMinExpectedReturn:0
    );
    const minDirectionalProbability=Math.max(
      strategy.minDirectionalProbability,
      cls==='MEME'?memeMinDirectionalProbability:0
    );
    const minProbabilityEdge=Math.max(
      strategy.minProbabilityEdge,
      cls==='MEME'?memeMinProbabilityEdge:0
    );

    const relativeAllocation=account.allocationWeight*SHADOW_STRATEGIES.length;
    const rawNotional=Math.max(1,Number(baseNotionalQuote)||50)
      *relativeAllocation
      *strategy.notionalMultiplier;
    const accountCap=Math.max(1,Number(account.account.equityQuote||0)*.01);
    const notionalQuote=Math.max(1,Math.min(rawNotional,accountCap));

    const decision=deriveAutonomousShadowTrade(issuance,{
      now,
      notionalQuote,
      minExpectedReturn,
      minDirectionalProbability,
      minProbabilityEdge,
      cautionMinExpectedReturn:Math.max(minExpectedReturn,.0045),
      cautionMinDirectionalProbability:Math.max(minDirectionalProbability,.66),
      cautionMinProbabilityEdge:Math.max(minProbabilityEdge,.18),
      horizonSelection:strategy.horizonSelection
    });
    if(!decision.eligible) continue;

    const leagueDecisionKey=sha256({
      baseDecisionKey:decision.decisionKey,
      strategyId:strategy.id,
      leagueVersion:SHADOW_STRATEGY_LEAGUE_VERSION
    });
    candidates.push(freeze({
      ...decision,
      leagueStrategyId:strategy.id,
      leagueStrategyLabel:strategy.label,
      leagueDecisionKey,
      leagueAllocationWeight:account.allocationWeight,
      leagueNotionalMultiplier:strategy.notionalMultiplier,
      leaguePerformanceScore:account.performanceScore,
      leagueStatus:account.status,
      assetClass:cls,
      role:'LEAGUE_ENTRY',
      execution:'SHADOW_ONLY',
      canExecuteLive:false
    }));
  }
  return freeze({
    version:SHADOW_STRATEGY_LEAGUE_VERSION,
    generatedAt:Number(now),
    summary,
    candidates,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function markStrategyLeaguePosition(position,book,{at=Date.now(),feeBps=10}={}){
  return markShadowPosition(position,book,{at,feeBps});
}

export function closeStrategyLeaguePosition(position,{reason,at=Date.now()}={}){
  return closeShadowPosition(position,{reason,at});
}

export async function loadStrategyLeagueLedger(filePath,{initialEquityPerStrategy=5_000}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(
      parsed?.schemaVersion!==SHADOW_STRATEGY_LEAGUE_SCHEMA_VERSION||
      parsed?.version!==SHADOW_STRATEGY_LEAGUE_VERSION
    ) throw new Error('STRATEGY_LEAGUE_SCHEMA_MISMATCH');
    return {
      ledger:{
        ...parsed,
        initialEquityPerStrategy:Math.max(100,Number(parsed.initialEquityPerStrategy)||initialEquityPerStrategy),
        positions:(parsed.positions||[]).map(sanitizeLeaguePosition).filter(Boolean),
        execution:'SHADOW_ONLY',
        canExecuteLive:false
      },
      healthy:true,recoveredFromCorrupt:false,error:null
    };
  }catch(err){
    if(err?.code==='ENOENT'){
      return {
        ledger:createEmptyStrategyLeagueLedger({initialEquityPerStrategy}),
        healthy:true,recoveredFromCorrupt:false,error:null
      };
    }
    try{ await rename(filePath,filePath+'.corrupt-'+Date.now()); }catch{}
    return {
      ledger:createEmptyStrategyLeagueLedger({initialEquityPerStrategy}),
      healthy:false,recoveredFromCorrupt:true,
      error:err instanceof Error?err.message:String(err)
    };
  }
}

export async function saveStrategyLeagueLedger(filePath,ledger,{maxPositions=20_000}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const body={
    schemaVersion:SHADOW_STRATEGY_LEAGUE_SCHEMA_VERSION,
    version:SHADOW_STRATEGY_LEAGUE_VERSION,
    initialEquityPerStrategy:Math.max(100,Number(ledger?.initialEquityPerStrategy)||5_000),
    positions:(ledger?.positions||[]).map(sanitizeLeaguePosition).filter(Boolean).slice(-Math.max(500,Number(maxPositions)||20_000)),
    updatedAt:Date.now(),
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,canonicalJson(body),{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return body;
}
