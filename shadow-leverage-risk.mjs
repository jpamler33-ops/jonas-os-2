import { sha256 } from './institutional-kernel.mjs';

export const SHADOW_LEVERAGE_RISK_VERSION='TCX_SHADOW_LEVERAGE_RISK_V1';
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};

export function evaluateShadowLeverageRisk({
  requestedLeverage=1,assetClass='CORE',volatilityPct=.01,stopDistancePct=.02,
  maintenanceMarginRate=.005,drawdownPct=0,portfolioCorrelation=.5,
  fundingRate8h=0,expectedHoldingHours=1,stressMovePct=.05
}={}){
  const meme=String(assetClass).toUpperCase()==='MEME';
  const hardCap=meme?2:3;
  const vol=Math.max(.0001,finite(volatilityPct,.01));
  const stop=Math.max(.001,finite(stopDistancePct,.02));
  const mmr=clamp(maintenanceMarginRate,0,.25);
  const dd=clamp(drawdownPct,0,1);
  const corr=clamp(Math.abs(portfolioCorrelation),0,1);
  const stress=Math.max(stop,finite(stressMovePct,.05));
  const fundingCost=Math.abs(finite(fundingRate8h))*Math.max(0,finite(expectedHoldingHours,1))/8;

  const volCap=clamp(.03/vol,1,hardCap);
  const stopCap=clamp(.12/stop,1,hardCap);
  const drawdownCap=dd>=.15?1:dd>=.10?1.25:dd>=.06?1.75:hardCap;
  const correlationCap=corr>=.85?1.25:corr>=.70?1.75:hardCap;
  const fundingCap=fundingCost>=.002?1:fundingCost>=.001?1.5:hardCap;
  const stressCap=clamp(.20/stress,1,hardCap);
  const riskCap=Math.min(hardCap,volCap,stopCap,drawdownCap,correlationCap,fundingCap,stressCap);
  const allowedLeverage=Math.min(clamp(requestedLeverage,1,hardCap),riskCap);
  const approxLiquidationDistancePct=Math.max(0,1/allowedLeverage-mmr);
  const requiredBuffer=Math.max(stress*1.5,stop*2);
  const blockers=[];
  if(dd>=.20) blockers.push('DRAWDOWN_HARD_STOP');
  if(approxLiquidationDistancePct<=requiredBuffer) blockers.push('LIQUIDATION_BUFFER_INSUFFICIENT');
  if(!Number.isFinite(allowedLeverage)||allowedLeverage<1) blockers.push('INVALID_LEVERAGE');
  const approved=blockers.length===0;
  const core={version:SHADOW_LEVERAGE_RISK_VERSION,approved,
    requestedLeverage:finite(requestedLeverage,1),allowedLeverage:approved?allowedLeverage:1,riskCap,
    caps:{hardCap,volCap,stopCap,drawdownCap,correlationCap,fundingCap,stressCap},
    approxLiquidationDistancePct,requiredBuffer,fundingCost,blockers,
    execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,
    note:'SIMULATION_ONLY_NOT_EXCHANGE_LIQUIDATION_FORMULA'};
  return freeze({...core,fingerprint:sha256(core)});
}
