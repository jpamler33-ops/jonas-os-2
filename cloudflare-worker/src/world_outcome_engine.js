export const WORLD_OUTCOME_ENGINE_VERSION="1.0.0";

function finite(x){return Number.isFinite(Number(x));}
function mean(xs){
  const v=(xs||[]).map(Number).filter(Number.isFinite);
  return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
}
function quantile(xs,q){
  const v=(xs||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!v.length)return null;
  const i=Math.max(0,Math.min(v.length-1,Math.floor((v.length-1)*q)));
  return v[i];
}
function sign(x,deadband=0.001){
  const v=Number(x);
  if(!Number.isFinite(v)||Math.abs(v)<deadband)return 0;
  return v>0?1:-1;
}
function weighted(items,key){
  let s=0,w=0;
  for(const x of items||[]){
    const v=Number(x?.[key]),p=Number(x?.weight??x?.probability??0);
    if(Number.isFinite(v)&&Number.isFinite(p)&&p>0){s+=v*p;w+=p;}
  }
  return w>0?s/w:null;
}
function entropy(probs){
  let h=0;
  for(const p of probs||[]){
    const x=Number(p);
    if(x>0&&Number.isFinite(x))h-=x*Math.log2(x);
  }
  return h;
}

export function buildTokenOutcomeProfiles(rows=[]){
  const usable=(rows||[]).filter(r=>r?.token_id);
  if(!usable.length)return{
    status:"LEARNING",version:WORLD_OUTCOME_ENGINE_VERSION,n:0,profiles:{},thresholds:{}
  };

  const abs60=usable.map(r=>Math.abs(Number(r.ret_fwd_60m))).filter(Number.isFinite);
  const atr=usable.map(r=>Number(r.atr_pct)).filter(Number.isFinite);
  const liq=usable.map(r=>Number(r.liq_5m)).filter(Number.isFinite);
  const thresholds={
    expansionAbs60P75:quantile(abs60,.75),
    highVolAtrP75:quantile(atr,.75),
    liquidationP75:quantile(liq,.75)
  };

  const grouped=new Map();
  for(const r of usable){
    const k=String(r.token_id);
    if(!grouped.has(k))grouped.set(k,[]);
    grouped.get(k).push(r);
  }

  const profiles={};
  for(const [token,xs] of grouped){
    const r15=xs.map(r=>Number(r.ret_fwd_15m)).filter(Number.isFinite);
    const r60=xs.map(r=>Number(r.ret_fwd_60m)).filter(Number.isFinite);
    const r240=xs.map(r=>Number(r.ret_fwd_240m)).filter(Number.isFinite);
    const tokenAtr=xs.map(r=>Number(r.atr_pct)).filter(Number.isFinite);
    const tokenLiq=xs.map(r=>Number(r.liq_5m)).filter(Number.isFinite);

    const fakeoutPairs=xs.filter(r=>
      finite(r.ret_fwd_15m)&&finite(r.ret_fwd_60m)&&
      sign(r.ret_fwd_15m)!==0&&sign(r.ret_fwd_60m)!==0
    );
    const fakeouts=fakeoutPairs.filter(r=>sign(r.ret_fwd_15m)!==sign(r.ret_fwd_60m)).length;

    const expansionEligible=r60.filter(Number.isFinite);
    const expansion=thresholds.expansionAbs60P75===null?0:
      expansionEligible.filter(v=>Math.abs(v)>=Number(thresholds.expansionAbs60P75)).length;

    const volEligible=tokenAtr.filter(Number.isFinite);
    const highVol=thresholds.highVolAtrP75===null?0:
      volEligible.filter(v=>v>=Number(thresholds.highVolAtrP75)).length;

    const liqEligible=tokenLiq.filter(Number.isFinite);
    const liqStress=thresholds.liquidationP75===null?0:
      liqEligible.filter(v=>v>=Number(thresholds.liquidationP75)).length;

    profiles[token]={
      token,
      n:xs.length,
      n15:r15.length,n60:r60.length,n240:r240.length,
      avgForward15m:mean(r15),
      avgForward60m:mean(r60),
      avgForward240m:mean(r240),
      medianAbs60m:quantile(r60.map(Math.abs),.5),
      p80Abs60m:quantile(r60.map(Math.abs),.8),
      positive60mRate:r60.length?r60.filter(v=>v>0).length/r60.length:null,
      expansionRate:expansionEligible.length?expansion/expansionEligible.length:null,
      highVolRate:volEligible.length?highVol/volEligible.length:null,
      liquidationStressRate:liqEligible.length?liqStress/liqEligible.length:null,
      fakeoutProxyRate:fakeoutPairs.length?fakeouts/fakeoutPairs.length:null,
      avgAtrPct:mean(tokenAtr),
      avgLiquidation5m:mean(tokenLiq),
      evidence:xs.length>=50?"USABLE":xs.length>=15?"EARLY":"LEARNING"
    };
  }

  return{
    status:usable.length>=300?"ACTIVE":usable.length>=80?"EARLY":"LEARNING",
    version:WORLD_OUTCOME_ENGINE_VERSION,
    n:usable.length,
    uniqueTokens:Object.keys(profiles).length,
    thresholds,
    profiles,
    definitions:{
      expansionRate:"Share of token observations whose absolute following 60m return is at or above the global 75th percentile.",
      fakeoutProxyRate:"Share where the signed 15m move and signed 60m move reverse each other, excluding small deadband moves.",
      liquidationStressRate:"Share of observations with current 5m liquidation notional at or above the global 75th percentile.",
      highVolRate:"Share of observations with ATR% at or above the global 75th percentile."
    }
  };
}

export function attachWorldOutcomeProfiles(world,profileReport){
  if(!world?.paths?.length)return{
    status:"LEARNING",version:WORLD_OUTCOME_ENGINE_VERSION,world:null,worlds:[]
  };
  const profiles=profileReport?.profiles||{};
  const worlds=(world.paths||[]).map(path=>{
    const perStep=(path.path||[]).map((token,i)=>({
      step:i+1,token,profile:profiles[String(token)]||null
    }));
    const covered=perStep.filter(x=>x.profile);
    const metrics=covered.map(x=>({...x.profile,weight:1}));
    return{
      worldRank:path.worldRank,
      probability:Number(path.probability||0),
      path:path.path,
      profileCoverage:path.path?.length?covered.length/path.path.length:0,
      evidenceMinN:covered.length?Math.min(...covered.map(x=>Number(x.profile.n||0))):0,
      regimeProfile:{
        avgForward60mAssociation:weighted(metrics,"avgForward60m"),
        typicalAbs60m:weighted(metrics,"medianAbs60m"),
        p80Abs60m:weighted(metrics,"p80Abs60m"),
        positive60mRate:weighted(metrics,"positive60mRate"),
        expansionRisk:weighted(metrics,"expansionRate"),
        highVolRisk:weighted(metrics,"highVolRate"),
        liquidationStressRisk:weighted(metrics,"liquidationStressRate"),
        fakeoutProxyRisk:weighted(metrics,"fakeoutProxyRate")
      },
      steps:perStep
    };
  });

  const weightedWorlds=worlds.map(x=>({
    ...x.regimeProfile,weight:Number(x.probability||0)
  }));

  return{
    status:worlds.some(x=>x.profileCoverage>=0.5)?"ACTIVE":"LEARNING",
    version:WORLD_OUTCOME_ENGINE_VERSION,
    originTs:world.originTs??null,
    horizonBuilt:world.horizonBuilt??null,
    aggregate:{
      avgForward60mAssociation:weighted(weightedWorlds,"avgForward60mAssociation"),
      typicalAbs60m:weighted(weightedWorlds,"typicalAbs60m"),
      p80Abs60m:weighted(weightedWorlds,"p80Abs60m"),
      positive60mRate:weighted(weightedWorlds,"positive60mRate"),
      expansionRisk:weighted(weightedWorlds,"expansionRisk"),
      highVolRisk:weighted(weightedWorlds,"highVolRisk"),
      liquidationStressRisk:weighted(weightedWorlds,"liquidationStressRisk"),
      fakeoutProxyRisk:weighted(weightedWorlds,"fakeoutProxyRisk")
    },
    worlds,
    note:"World outcome metrics are historical regime associations attached to predicted state paths. They are not additive price forecasts."
  };
}

function componentSimilarity(a,b){
  if(!a||!b)return null;
  const keys=[...new Set([...Object.keys(a),...Object.keys(b)])];
  let compared=0,matched=0;
  for(const k of keys){
    const x=a[k],y=b[k];
    if(x===undefined||y===undefined||x===null||y===null||x==="U"||y==="U")continue;
    compared++;
    if(String(x)===String(y))matched++;
  }
  return compared?matched/compared:null;
}

export function trackWorldReality({world,resolutions=[],tokenComponents={}}={}){
  const actual=(resolutions||[])
    .filter(r=>r?.actual_token&&finite(r.step_n))
    .sort((a,b)=>Number(a.step_n)-Number(b.step_n));
  if(!world?.paths?.length||!actual.length)return{
    status:"LEARNING",resolvedSteps:actual.length,worlds:[],dominant:null
  };

  const scored=[];
  for(const path of world.paths){
    let logScore=Math.log(Math.max(1e-12,Number(path.probability||0)));
    let similaritySum=0,compared=0,exact=0;
    const trace=[];
    for(const r of actual){
      const step=Number(r.step_n);
      const predicted=path.path?.[step-1];
      if(!predicted)continue;
      const actualToken=String(r.actual_token);
      let sim;
      if(String(predicted)===actualToken){
        sim=1;exact++;
      }else{
        const comp=componentSimilarity(
          tokenComponents[String(predicted)],
          tokenComponents[actualToken]
        );
        sim=comp===null?0:comp;
      }
      compared++;
      similaritySum+=sim;
      const likelihood=Math.max(0.02,0.04+0.96*sim);
      logScore+=Math.log(likelihood);
      trace.push({step,predicted,actual:actualToken,similarity:sim,likelihood});
    }
    scored.push({
      worldRank:path.worldRank,
      priorProbability:Number(path.probability||0),
      path:path.path,
      comparedSteps:compared,
      exactMatches:exact,
      meanTokenSimilarity:compared?similaritySum/compared:null,
      logPosteriorScore:logScore,
      trace
    });
  }

  const maxLog=Math.max(...scored.map(x=>x.logPosteriorScore));
  const weights=scored.map(x=>Math.exp(x.logPosteriorScore-maxLog));
  const z=weights.reduce((a,b)=>a+b,0)||1;
  scored.forEach((x,i)=>x.posteriorProbability=weights[i]/z);
  scored.sort((a,b)=>b.posteriorProbability-a.posteriorProbability);

  const probs=scored.map(x=>x.posteriorProbability);
  const h=entropy(probs);
  const maxH=scored.length>1?Math.log2(scored.length):0;
  const normH=maxH>0?h/maxH:0;
  const top=scored[0]||null,second=scored[1]||null;
  const gap=top&&second?top.posteriorProbability-second.posteriorProbability:top?.posteriorProbability??null;
  const locked=actual.length>=3&&Number(top?.posteriorProbability||0)>=0.70&&Number(gap||0)>=0.25;

  return{
    status:actual.length>=3?"ACTIVE":"EARLY",
    resolvedSteps:actual.length,
    posteriorEntropyBits:h,
    posteriorNormalizedEntropy:normH,
    dominant:top,
    runnerUp:second,
    posteriorGap:gap,
    lockIn:locked,
    worlds:scored.slice(0,12),
    note:"World reality tracking is a similarity-weighted posterior over previously generated token paths, not a claim that one future is certain."
  };
}
