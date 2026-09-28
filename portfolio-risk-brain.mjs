import { sha256 } from './institutional-kernel.mjs';
export const PORTFOLIO_RISK_BRAIN_VERSION='TCX_PORTFOLIO_RISK_BRAIN_V1';
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
const dir=s=>String(s||'').toUpperCase()==='SELL'?-1:1;
export function evaluatePortfolioRiskBrain(ledger,candidate,{equityQuote=10000,maxGrossExposurePct=.60,maxDirectionalExposurePct=.40,maxSameAssetDirectionPct=.30,maxCorrelatedPositions=4}={}){
 const equity=Math.max(1,finite(equityQuote,ledger?.initialEquityQuote||10000));
 const open=(ledger?.positions||[]).filter(p=>p?.status==='OPEN'&&!['COVERAGE_PROBE','ABSTAIN_PROBE','CHALLENGER'].includes(String(p.entryMode||'STANDARD').toUpperCase()));
 const rows=open.map(p=>{const exposure=Math.max(0,finite(p.leveragedExposureQuote,p.entryQuote||p.notionalQuote||0));return{symbol:String(p.symbol||''),side:String(p.side||'').toUpperCase(),assetClass:String(p.assetClass||p.strategyMeta?.assetClass||'CORE').toUpperCase(),exposure};});
 const proposed=Math.max(0,finite(candidate.exposureQuote,candidate.notionalQuote||0)),side=String(candidate.side||'').toUpperCase(),assetClass=String(candidate.assetClass||'CORE').toUpperCase();
 const gross=rows.reduce((s,x)=>s+x.exposure,0),sameDirection=rows.filter(x=>dir(x.side)===dir(side)).reduce((s,x)=>s+x.exposure,0),sameAssetDirection=rows.filter(x=>x.assetClass===assetClass&&dir(x.side)===dir(side)).reduce((s,x)=>s+x.exposure,0);
 const correlatedCount=rows.filter(x=>x.assetClass===assetClass&&dir(x.side)===dir(side)).length;
 const caps={gross:equity*maxGrossExposurePct,directional:equity*maxDirectionalExposurePct,sameAssetDirection:equity*maxSameAssetDirectionPct};
 const headroom=Math.max(0,Math.min(caps.gross-gross,caps.directional-sameDirection,caps.sameAssetDirection-sameAssetDirection));
 const concentrationBlocked=correlatedCount>=maxCorrelatedPositions;
 const allowedExposureQuote=concentrationBlocked?0:Math.min(proposed,headroom);
 const multiplier=proposed>0?allowedExposureQuote/proposed:0,blocked=allowedExposureQuote<=0;
 const reasons=[];if(gross+proposed>caps.gross)reasons.push('GROSS_EXPOSURE_CAP');if(sameDirection+proposed>caps.directional)reasons.push('DIRECTIONAL_STACK_CAP');if(sameAssetDirection+proposed>caps.sameAssetDirection)reasons.push('ASSET_DIRECTION_CAP');if(concentrationBlocked)reasons.push('CORRELATED_POSITION_COUNT_CAP');
 const core={version:PORTFOLIO_RISK_BRAIN_VERSION,blocked,allowedExposureQuote,multiplier,reasons,openPositions:rows.length,correlatedCount,current:{grossExposureQuote:gross,sameDirectionExposureQuote:sameDirection,sameAssetDirectionExposureQuote:sameAssetDirection},caps,execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,meaning:'PORTFOLIO_CONCENTRATION_GUARD_USING_CONSERVATIVE_BUCKET_CORRELATION'};
 return freeze({...core,fingerprint:sha256(core)});
}
