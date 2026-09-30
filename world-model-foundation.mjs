import {sha256} from './institutional-kernel.mjs';
export const WORLD_MODEL_FOUNDATION_VERSION='TCX_WORLD_MODEL_FOUNDATION_V1';
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
const bucket=(x,lo=.33,hi=.66)=>x>=hi?'HIGH':x<=lo?'LOW':'MID';
function latestReturn(rows,bars=12){const xs=(rows||[]).filter(x=>finite(x?.close)!=null).slice(-(bars+1));if(xs.length<2)return null;const a=Number(xs[0].close),b=Number(xs.at(-1).close);return a>0?(b/a-1):null;}

export function buildMarketGraph({correlationModel,seriesBySymbol={},asOf=Date.now(),minCorrelation=.35}={}){
 const nodes=Object.entries(seriesBySymbol).map(([symbol,rows])=>({symbol,return1h:latestReturn(rows,12),samples:rows?.length||0}));
 const edges=[];
 for(const [key,p] of Object.entries(correlationModel?.pairs||{})){
  if(p?.evidenceReady!==true)continue;const rho=finite(p.effectiveAbsCorrelation);if(rho==null||rho<minCorrelation)continue;
  const [a,b]=key.split('|');edges.push({a,b,strength:rho,samples:Number(p.samples||0),stressStrength:Math.abs(Number(p.shrunkStress||0)),relation:'ROBUST_ASSOCIATION'});
 }
 edges.sort((a,b)=>b.strength-a.strength);
 const core={version:WORLD_MODEL_FOUNDATION_VERSION,asOf:Number(asOf),nodes,edges:edges.slice(0,80),meaning:'POINT_IN_TIME_ASSOCIATION_GRAPH_NOT_CAUSAL_GRAPH',execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false};
 return freeze({...core,fingerprint:sha256(core)});
}

export function buildCapitalRotation({seriesBySymbol={},assetClassBySymbol={},asOf=Date.now(),minAssetsPerClass=2}={}){
 const groups=new Map();
 for(const [symbol,rows] of Object.entries(seriesBySymbol)){const cls=String(assetClassBySymbol[symbol]||'OTHER').toUpperCase();const r=latestReturn(rows,12);if(r==null)continue;if(!groups.has(cls))groups.set(cls,[]);groups.get(cls).push({symbol,r});}
 const classes=[...groups.entries()].map(([assetClass,rows])=>{const rs=rows.map(x=>x.r).sort((a,b)=>a-b),m=rs[Math.floor(rs.length/2)]??0;return {assetClass,assets:rows.length,medianReturn1h:m,breadthUp:rows.filter(x=>x.r>0).length/rows.length,evidenceReady:rows.length>=minAssetsPerClass};}).sort((a,b)=>b.medianReturn1h-a.medianReturn1h);
 const ready=classes.filter(x=>x.evidenceReady);const leader=ready[0]||null,laggard=ready.at(-1)||null;
 const spread=leader&&laggard?leader.medianReturn1h-laggard.medianReturn1h:null;
 const core={version:WORLD_MODEL_FOUNDATION_VERSION,asOf:Number(asOf),classes,leader,laggard,rotationStrength:spread==null?null:clamp(Math.abs(spread)/.03),status:ready.length>=2?'OBSERVED_CROSS_SECTION':'INSUFFICIENT',meaning:'RELATIVE_PRICE_ROTATION_NOT_CAPITAL_FLOW_PROOF',execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false};
 return freeze({...core,fingerprint:sha256(core)});
}

export function buildRegimeGenome({state,rotation=null,graph=null}={}){
 const d=state?.dashboard||{},a=state?.analysis||{};
 const trend=clamp(Math.abs(Number(d.biasScore||0))/6);
 const pressure=clamp(Math.abs(Number(d.pressureScore||50)-50)/50);
 const volatility=clamp(Number(d.atrPct||0)/3);
 const liquidity=clamp(1-Math.min(1,Number(d.spreadBps||10)/15));
 const rotationScore=clamp(rotation?.rotationStrength||0);
 const network=clamp((graph?.edges?.length||0)/20);
 const stress=clamp(.35*volatility+.30*(1-liquidity)+.20*pressure+.15*rotationScore);
 const dimensions={trend,pressure,volatility,liquidity,rotation:rotationScore,networkCoupling:network,stress};
 const genomeKey=['T'+bucket(trend),'P'+bucket(pressure),'V'+bucket(volatility),'L'+bucket(liquidity),'R'+bucket(rotationScore),'S'+bucket(stress)].join('|');
 const core={version:WORLD_MODEL_FOUNDATION_VERSION,symbol:state?.symbol||null,asOf:Number(state?.availableAt||Date.now()),genomeKey,dimensions,legacyRegime:String(d.regime||a.regime||'UNKNOWN'),epistemic:'DERIVED_STATE_VECTOR',execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false};
 return freeze({...core,fingerprint:sha256(core)});
}

export function renderWorldModelFoundation({graph,rotation,genome}={}){
 const pc=x=>Math.round(Number(x||0)*100);
 const lines=['TCX // WORLD MODEL FOUNDATION','━━━━━━━━━━━━━━━━━━━━','',
 'REGIME GENOME',String(genome?.genomeKey||'—'),
 'Trend '+pc(genome?.dimensions?.trend)+' · Vol '+pc(genome?.dimensions?.volatility)+' · Liquidity '+pc(genome?.dimensions?.liquidity),
 'Pressure '+pc(genome?.dimensions?.pressure)+' · Rotation '+pc(genome?.dimensions?.rotation)+' · Stress '+pc(genome?.dimensions?.stress),'',
 'MARKET GRAPH','Nodes '+Number(graph?.nodes?.length||0)+' · robust edges '+Number(graph?.edges?.length||0)];
 for(const e of (graph?.edges||[]).slice(0,4))lines.push('• '+e.a.replace('USDT','')+' ↔ '+e.b.replace('USDT','')+' · '+pc(e.strength));
 lines.push('','CAPITAL ROTATION',String(rotation?.status||'—'));
 for(const r of (rotation?.classes||[]).slice(0,5))lines.push('• '+r.assetClass+' · '+(r.medianReturn1h>=0?'+':'')+(r.medianReturn1h*100).toFixed(2)+'% · breadth '+pc(r.breadthUp));
 lines.push('','Graph edges = association, NOT causality.','Rotation = relative price behavior, NOT proof of actual money flow.','SHADOW_ONLY · REAL ORDERS BLOCKED');
 return lines.join('\n').slice(0,4096);
}
