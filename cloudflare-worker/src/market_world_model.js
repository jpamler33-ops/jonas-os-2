export const MARKET_WORLD_MODEL_VERSION="1.0.0";

function clamp(x,lo=0,hi=1){return Math.max(lo,Math.min(hi,Number(x)));}
function entropyBits(probs){
  let h=0;
  for(const p of probs||[]){
    const x=Number(p);
    if(x>0&&Number.isFinite(x))h-=x*Math.log2(x);
  }
  return h;
}
function normalizeDistribution(items){
  const total=(items||[]).reduce((s,x)=>s+Number(x.probability||0),0);
  if(!(total>0))return[];
  return items.map(x=>({...x,probability:Number(x.probability||0)/total}));
}
function topMarginal(map,total){
  const rows=[...map.entries()].map(([token,mass])=>({
    token,probability:total>0?mass/total:0,mass
  })).sort((a,b)=>b.probability-a.probability);
  return rows;
}

export function buildMarketWorld({
  history=[],
  predictor,
  horizon=12,
  beamWidth=24,
  branchWidth=4,
  minBranchProbability=0.015,
  maxOrder=5
}={}){
  const H=Math.max(2,Math.min(24,Number(horizon||12)));
  const B=Math.max(4,Math.min(80,Number(beamWidth||24)));
  const W=Math.max(2,Math.min(8,Number(branchWidth||4)));
  const baseHistory=(history||[]).map(String).filter(Boolean).slice(-Math.max(1,maxOrder));
  if(typeof predictor!=="function"||!baseHistory.length){
    return{
      status:"LEARNING",version:MARKET_WORLD_MODEL_VERSION,
      horizon:H,paths:[],steps:[],divergence:null
    };
  }

  let beams=[{
    path:[],
    history:[...baseHistory],
    probability:1,
    logProbability:0,
    entropyTrace:[],
    supportTrace:[]
  }];
  const steps=[];
  let retainedMass=1;

  for(let step=1;step<=H;step++){
    const expanded=[];
    for(const beam of beams){
      const pred=predictor(beam.history,maxOrder);
      const distribution=(pred?.distribution||[])
        .filter(x=>Number(x.probability)>=minBranchProbability)
        .slice(0,W);
      if(!distribution.length)continue;
      const norm=normalizeDistribution(distribution);
      for(const option of norm){
        const p=Math.max(1e-12,Number(option.probability));
        expanded.push({
          path:[...beam.path,String(option.token)],
          history:[...beam.history,String(option.token)].slice(-maxOrder),
          probability:beam.probability*p,
          logProbability:beam.logProbability+Math.log(p),
          entropyTrace:[...beam.entropyTrace,pred.entropyBits??null],
          supportTrace:[...beam.supportTrace,pred.support??0]
        });
      }
    }

    if(!expanded.length)break;
    expanded.sort((a,b)=>b.logProbability-a.logProbability);
    beams=expanded.slice(0,B);

    const rawMass=beams.reduce((s,b)=>s+b.probability,0);
    retainedMass*=rawMass>0?Math.min(1,rawMass):0;
    const renorm=rawMass>0?1/rawMass:1;
    for(const b of beams)b.probability*=renorm;

    const marginal=new Map();
    for(const b of beams){
      const token=b.path.at(-1);
      marginal.set(token,(marginal.get(token)||0)+b.probability);
    }
    const distribution=topMarginal(marginal,1);
    const h=entropyBits(distribution.map(x=>x.probability));
    const maxH=distribution.length>1?Math.log2(distribution.length):0;
    const normalizedEntropy=maxH>0?h/maxH:0;
    const top1=distribution[0]||null;
    const top2=distribution[1]||null;
    const gap=top1&&top2?top1.probability-top2.probability:top1?.probability??null;

    steps.push({
      step,
      distribution:distribution.slice(0,10),
      top1,
      top2,
      entropyBits:h,
      normalizedEntropy,
      branchGap:gap,
      activeWorlds:beams.length,
      status:normalizedEntropy>=0.75||Number(top1?.probability||0)<0.40
        ?"DIVERGENT"
        : normalizedEntropy>=0.50||Number(top1?.probability||0)<0.58
        ?"BRANCHING"
        :"CONCENTRATED"
    });
  }

  const pathRows=[...beams]
    .sort((a,b)=>b.probability-a.probability)
    .map((b,i)=>({
      worldRank:i+1,
      probability:b.probability,
      path:b.path,
      averagePredictiveEntropy:b.entropyTrace.filter(Number.isFinite).length
        ?b.entropyTrace.filter(Number.isFinite).reduce((a,x)=>a+x,0)/b.entropyTrace.filter(Number.isFinite).length
        :null,
      minimumContextSupport:b.supportTrace.filter(Number.isFinite).length
        ?Math.min(...b.supportTrace.filter(Number.isFinite))
        :null
    }));

  const divergence=steps.find(s=>s.status==="DIVERGENT")||
    steps.find(s=>s.status==="BRANCHING")||null;

  const finalMass=new Map();
  for(const p of pathRows){
    const token=p.path.at(-1);
    if(token)finalMass.set(token,(finalMass.get(token)||0)+p.probability);
  }
  const attractors=topMarginal(finalMass,1).slice(0,8);

  const consensusPath=steps.map(s=>s.top1?.token).filter(Boolean);
  const consensusProbability=steps.length
    ?Math.exp(steps.reduce((sum,s)=>sum+Math.log(Math.max(1e-12,Number(s.top1?.probability||1e-12))),0)/steps.length)
    :null;

  return{
    status:steps.length>=Math.min(H,6)?"ACTIVE":"LEARNING",
    version:MARKET_WORLD_MODEL_VERSION,
    horizonRequested:H,
    horizonBuilt:steps.length,
    beamWidth:B,
    branchWidth:W,
    retainedMassEstimate:retainedMass,
    currentContext:baseHistory,
    consensusPath,
    consensusGeometricProbability:consensusProbability,
    paths:pathRows,
    steps,
    divergence:divergence?{
      step:divergence.step,
      status:divergence.status,
      top1:divergence.top1,
      top2:divergence.top2,
      normalizedEntropy:divergence.normalizedEntropy,
      branchGap:divergence.branchGap
    }:null,
    attractors,
    worldUncertainty:steps.length
      ?steps.reduce((s,x)=>s+Number(x.normalizedEntropy||0),0)/steps.length
      :null,
    warning:"This is a probabilistic rollout over learned market-state tokens, not a price forecast. Beam pruning means retained paths are an approximation of the full state tree."
  };
}

export function scoreWorldStep(step,actualToken){
  const dist=step?.distribution||[];
  const idx=dist.findIndex(x=>String(x.token)===String(actualToken));
  const probability=idx>=0?Number(dist[idx].probability||0):0;
  const floor=1e-6;
  return{
    step:Number(step?.step||0),
    actualToken:String(actualToken||""),
    probability,
    rank:idx>=0?idx+1:null,
    top1:idx===0,
    top3:idx>=0&&idx<3,
    surpriseBits:-Math.log2(Math.max(floor,probability))
  };
}

export function worldCalibration(resolutions=[]){
  const rows=(resolutions||[]).filter(r=>Number.isFinite(Number(r.step_n)));
  if(!rows.length)return{status:"LEARNING",n:0,byStep:[]};

  const grouped=new Map();
  for(const r of rows){
    const step=Number(r.step_n);
    if(!grouped.has(step))grouped.set(step,[]);
    grouped.get(step).push(r);
  }
  const byStep=[...grouped.entries()].sort((a,b)=>a[0]-b[0]).map(([step,xs])=>{
    const n=xs.length;
    const hit1=xs.filter(x=>Number(x.hit1)===1).length/n;
    const hit3=xs.filter(x=>Number(x.hit3)===1).length/n;
    const avgProb=xs.reduce((s,x)=>s+Number(x.actual_probability||0),0)/n;
    const avgSurprise=xs.reduce((s,x)=>s+Number(x.surprise_bits||0),0)/n;
    return{
      step,n,top1Accuracy:hit1,top3Accuracy:hit3,
      meanActualProbability:avgProb,
      crossEntropyBits:avgSurprise,
      perplexity:Math.pow(2,avgSurprise)
    };
  });

  return{
    status:rows.length>=100?"ACTIVE":rows.length>=30?"EARLY":"LEARNING",
    n:rows.length,
    byStep,
    warning:"Calibration describes historical token-rollout accuracy by horizon. It does not imply future price-prediction accuracy."
  };
}
