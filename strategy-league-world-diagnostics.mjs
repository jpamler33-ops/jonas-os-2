import { deriveAutonomousShadowTrade } from './autonomous-shadow-trader.mjs';
import { SHADOW_STRATEGIES, strategyLeagueSummary } from './shadow-strategy-league.mjs';

function cls(v){return String(v||'CORE').toUpperCase();}
function worldProfile(worldState,strategy){
  const w=(worldState?.worlds||[]).find(x=>String(x?.strategyId)===String(strategy.id));
  const p=w?.currentGenome?.profile||strategy;
  return {worldId:w?.worldId||('WORLD_'+strategy.id),genomeId:w?.currentGenome?.genomeId||null,generation:Number(w?.generation||1),profile:p};
}
function gateReason(decision){
  const r=String(decision?.reason||decision?.admissionGate?.reason||'').toUpperCase();
  if(r.includes('PROB')) return 'PROBABILITY_GATE';
  if(r.includes('EDGE')) return 'EDGE_GATE';
  if(r.includes('RETURN')) return 'RETURN_GATE';
  if(r.includes('FORECAST')||r.includes('HORIZON')||r.includes('ISSUANCE')) return 'FORECAST_GATE';
  return 'NO_CANDIDATE';
}

export function diagnoseStrategyLeagueWorldCandidates(issuance,ledger,{
  now=Date.now(),assetClass='CORE',baseNotionalQuote=50,
  memeMinExpectedReturn=.0025,memeMinDirectionalProbability=.57,memeMinProbabilityEdge=.09,
  worldState=null
}={}){
  const asset=cls(assetClass);const summary=strategyLeagueSummary(ledger,{asOf:now});
  const byStrategy=new Map(summary.strategies.map(x=>[x.strategyId,x]));const rows=[];
  for(const base of SHADOW_STRATEGIES){
    const world=worldProfile(worldState,base);const strategy={...base,...world.profile};
    let reason=null;let eligible=false;let decision=null;
    if(!strategy.assetClasses.includes(asset)) reason='ASSET_CLASS_FILTER';
    const account=byStrategy.get(strategy.id);
    if(!reason&&(!account||account.riskHold)) reason='STRATEGY_RISK_HOLD';
    if(!reason){
      const minExpectedReturn=Math.max(strategy.minExpectedReturn,asset==='MEME'?memeMinExpectedReturn:0);
      const minDirectionalProbability=Math.max(strategy.minDirectionalProbability,asset==='MEME'?memeMinDirectionalProbability:0);
      const minProbabilityEdge=Math.max(strategy.minProbabilityEdge,asset==='MEME'?memeMinProbabilityEdge:0);
      const relativeAllocation=account.allocationWeight*SHADOW_STRATEGIES.length;
      const rawNotional=Math.max(1,Number(baseNotionalQuote)||50)*relativeAllocation*strategy.notionalMultiplier;
      const accountCap=Math.max(1,Number(account.account.equityQuote||0)*.01);
      decision=deriveAutonomousShadowTrade(issuance,{now,notionalQuote:Math.max(1,Math.min(rawNotional,accountCap)),minExpectedReturn,minDirectionalProbability,minProbabilityEdge,cautionMinExpectedReturn:Math.max(minExpectedReturn,strategy.id==='SCOUT'?.0025:.0035),cautionMinDirectionalProbability:Math.max(minDirectionalProbability,strategy.id==='SCOUT'?.59:.62),cautionMinProbabilityEdge:Math.max(minProbabilityEdge,strategy.id==='SCOUT'?.11:.14),horizonSelection:strategy.horizonSelection});
      eligible=decision.eligible===true;if(!eligible) reason=gateReason(decision);
    }
    rows.push({worldId:world.worldId,genomeId:world.genomeId,generation:world.generation,strategyId:strategy.id,eligible,reason:eligible?'CANDIDATE':reason,decisionReason:decision?.reason||null,execution:'SHADOW_ONLY',canExecuteLive:false});
  }
  return {generatedAt:Number(now),rows,eligibleWorlds:rows.filter(x=>x.eligible).length,blockedWorlds:rows.filter(x=>!x.eligible).length,execution:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false,canExecuteLive:false};
}
