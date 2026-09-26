export const MARKET_GRAMMAR_VERSION="1.0.0";

function clamp(x,lo=0,hi=1){return Math.max(lo,Math.min(hi,Number(x)));}
function entropyBits(probs){
  let h=0;
  for(const p of probs||[]){
    const x=Number(p);
    if(x>0&&Number.isFinite(x))h-=x*Math.log2(x);
  }
  return h;
}
function contextKey(history,order){
  if(order===0)return"*";
  return (history||[]).slice(-order).join(">");
}

export function grammarContexts(history,maxOrder=5){
  const xs=(history||[]).map(String).filter(Boolean);
  const max=Math.min(Math.max(0,Number(maxOrder||5)),xs.length);
  const out=[{order:0,key:"*"}];
  for(let n=1;n<=max;n++)out.push({order:n,key:contextKey(xs,n)});
  return out;
}

export function combineBackoffDistributions({
  vocabulary=[],
  unigramCounts={},
  contextCounts=[],
  alpha=0.25
}={}){
  const vocab=[...new Set((vocabulary||[]).map(String).filter(Boolean))];
  if(!vocab.length)return{
    vocabulary:[],distribution:[],entropyBits:null,normalizedEntropy:null,
    effectiveOrder:0,support:0,branchingFactor:0
  };

  const total0=vocab.reduce((s,t)=>s+Number(unigramCounts?.[t]||0),0);
  const denom0=total0+alpha*vocab.length;
  let probs=new Map(vocab.map(t=>[
    t,
    denom0>0?(Number(unigramCounts?.[t]||0)+alpha)/denom0:1/vocab.length
  ]));

  let effectiveOrder=0;
  let effectiveSupport=total0;

  const sorted=[...(contextCounts||[])].sort((a,b)=>Number(a.order)-Number(b.order));
  for(const ctx of sorted){
    const order=Number(ctx.order||0);
    if(order<=0)continue;
    const counts=ctx.counts||{};
    const support=vocab.reduce((s,t)=>s+Number(counts[t]||0),0);
    if(!(support>0))continue;

    const empirical=new Map();
    const denom=support+alpha*vocab.length;
    for(const t of vocab)empirical.set(t,(Number(counts[t]||0)+alpha)/denom);

    // Longer contexts need progressively more support before they dominate.
    const required=10*Math.pow(1.65,Math.max(0,order-1));
    const lambda=clamp(support/(support+required),0,0.92);
    const next=new Map();
    for(const t of vocab){
      next.set(t,(1-lambda)*Number(probs.get(t)||0)+lambda*Number(empirical.get(t)||0));
    }
    probs=next;

    if(support>=Math.max(6,required*0.6)){
      effectiveOrder=order;
      effectiveSupport=support;
    }
  }

  const sum=[...probs.values()].reduce((a,b)=>a+b,0)||1;
  const distribution=[...probs.entries()]
    .map(([token,probability])=>({token,probability:probability/sum}))
    .sort((a,b)=>b.probability-a.probability);

  const h=entropyBits(distribution.map(x=>x.probability));
  const maxH=vocab.length>1?Math.log2(vocab.length):0;
  return{
    vocabulary:vocab,
    distribution,
    entropyBits:h,
    normalizedEntropy:maxH>0?h/maxH:0,
    effectiveOrder,
    support:effectiveSupport,
    branchingFactor:distribution.filter(x=>x.probability>=0.05).length
  };
}

export function scoreObservedToken(prediction,observed,totalSeen=0){
  const token=String(observed||"");
  const hit=prediction?.distribution?.find(x=>x.token===token);
  const floor=1/Math.max(2000,Number(totalSeen||0)*200);
  const probability=Math.max(floor,Number(hit?.probability||0));
  const surpriseBits=-Math.log2(probability);
  const rank=prediction?.distribution?.findIndex(x=>x.token===token)??-1;
  return{
    token,
    probability,
    surpriseBits,
    rank:rank>=0?rank+1:null,
    top1:rank===0,
    top3:rank>=0&&rank<3
  };
}

export function empiricalSurprisePercentile(value,history=[]){
  const x=Number(value);
  const xs=(history||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!Number.isFinite(x)||!xs.length)return null;
  let n=0;for(const v of xs)if(v<=x)n++;
  return n/xs.length;
}

export function grammarBreakStatus({
  percentile,
  probability,
  support,
  resolvedSample
}={}){
  const p=Number(percentile),prob=Number(probability);
  const n=Number(resolvedSample||0),s=Number(support||0);
  if(n<50||s<8)return"LEARNING";
  if(Number.isFinite(p)&&p>=0.99&&Number.isFinite(prob)&&prob<=0.01)return"GRAMMAR_BREAK";
  if(Number.isFinite(p)&&p>=0.95)return"UNUSUAL";
  if(Number.isFinite(p)&&p>=0.85)return"RARE";
  return"EXPECTED";
}

export function nextStateForecast(prediction,topN=8){
  const d=(prediction?.distribution||[]).slice(0,Math.max(1,Number(topN||8)));
  return{
    modelVersion:MARKET_GRAMMAR_VERSION,
    top:d,
    top1:d[0]||null,
    entropyBits:prediction?.entropyBits??null,
    normalizedEntropy:prediction?.normalizedEntropy??null,
    effectiveOrder:prediction?.effectiveOrder??0,
    support:prediction?.support??0,
    branchingFactor:prediction?.branchingFactor??0,
    certainty:prediction?.normalizedEntropy===null||prediction?.normalizedEntropy===undefined
      ?null
      :1-Number(prediction.normalizedEntropy)
  };
}

export function grammarDrift(resolvedRows=[]){
  const rows=(resolvedRows||[])
    .filter(r=>Number.isFinite(Number(r.surprise_bits)))
    .sort((a,b)=>Number(a.resolved_ts||a.origin_ts)-Number(b.resolved_ts||b.origin_ts));
  if(rows.length<60)return{status:"LEARNING",n:rows.length};

  const recent=rows.slice(-30).map(r=>Number(r.surprise_bits));
  const base=rows.slice(-180,-30).map(r=>Number(r.surprise_bits));
  if(base.length<30)return{status:"LEARNING",n:rows.length};

  const avg=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
  const recentCrossEntropy=avg(recent);
  const baselineCrossEntropy=avg(base);
  const ratio=baselineCrossEntropy>0?recentCrossEntropy/baselineCrossEntropy:null;
  return{
    status:ratio!==null&&ratio>=1.5?"GRAMMAR_DRIFT":
      ratio!==null&&ratio>=1.2?"WATCH":"STABLE",
    n:rows.length,
    recentCrossEntropyBits:recentCrossEntropy,
    baselineCrossEntropyBits:baselineCrossEntropy,
    recentPerplexity:Math.pow(2,recentCrossEntropy),
    baselinePerplexity:Math.pow(2,baselineCrossEntropy),
    ratio
  };
}
