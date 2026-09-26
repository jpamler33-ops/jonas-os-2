function finite(x){return Number.isFinite(Number(x));}
function mean(xs){const v=(xs||[]).map(Number).filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;}
function weightedMean(items,valueKey,weightKey="weight"){
  let s=0,w=0;
  for(const x of items||[]){
    const v=Number(x?.[valueKey]),wt=Number(x?.[weightKey]);
    if(Number.isFinite(v)&&Number.isFinite(wt)&&wt>0){s+=v*wt;w+=wt;}
  }
  return w>0?s/w:null;
}
function topDistribution(rows,weightKey="weight",limit=5){
  const m=new Map(),total=(rows||[]).reduce((s,x)=>s+Number(x?.[weightKey]||0),0);
  for(const r of rows||[]){
    const t=String(r.nextToken||"");
    const w=Number(r?.[weightKey]||0);
    if(!t||!(w>0))continue;
    m.set(t,(m.get(t)||0)+w);
  }
  return [...m.entries()]
    .map(([token,w])=>({token,probability:total>0?w/total:null,weight:w}))
    .sort((a,b)=>b.weight-a.weight).slice(0,limit);
}
function hamming(a,b,keys,ignored){
  let mismatch=0,compared=0;
  for(const k of keys){
    if(k===ignored)continue;
    const x=a?.[k],y=b?.[k];
    if(x===undefined||x===null||y===undefined||y===null||x==="U"||y==="U")continue;
    compared++;
    if(String(x)!==String(y))mismatch++;
  }
  return{mismatch,compared};
}

export const GRAMMAR_COUNTERFACTUAL_VERSION="1.0.0";

export function grammarCounterfactuals({
  current,
  history=[],
  components=[
    "leverage","flow","liq","premium","basis","depth","optionsSkew","agreement","vol","macro"
  ],
  minComparable=5,
  maxMismatch=3
}={}){
  if(!current?.components)return{
    status:"LEARNING",version:GRAMMAR_COUNTERFACTUAL_VERSION,current:null,features:[]
  };

  const keys=Object.keys(current.components);
  const rows=(history||[]).filter(x=>x?.components&&x.tokenId);
  const features=[];

  for(const feature of components){
    const actual=current.components?.[feature];
    if(actual===undefined||actual===null||actual==="U")continue;
    const alternatives=[...new Set(
      rows.map(r=>r.components?.[feature])
        .filter(v=>v!==undefined&&v!==null&&v!=="U"&&String(v)!==String(actual))
        .map(String)
    )];
    const altReports=[];

    for(const alt of alternatives){
      const matches=[];
      for(const r of rows){
        if(String(r.components?.[feature])!==alt)continue;
        const d=hamming(current.components,r.components,keys,feature);
        if(d.compared<minComparable||d.mismatch>maxMismatch)continue;
        const weight=Math.exp(-1.15*d.mismatch)*(d.compared/Math.max(minComparable,keys.length-1));
        matches.push({...r,weight,mismatch:d.mismatch,compared:d.compared});
      }
      if(matches.length<5)continue;

      matches.sort((a,b)=>b.weight-a.weight);
      const best=matches.slice(0,200);
      const avg60=weightedMean(best,"ret60");
      const avg15=weightedMean(best,"ret15");
      const avg240=weightedMean(best,"ret240");
      const next=topDistribution(best);

      altReports.push({
        alternative:alt,
        n:best.length,
        effectiveWeight:best.reduce((s,x)=>s+Number(x.weight||0),0),
        avgMismatch:mean(best.map(x=>x.mismatch)),
        weightedForward15m:avg15,
        weightedForward60m:avg60,
        weightedForward240m:avg240,
        nextStateDistribution:next,
        evidence:best.length>=30?"USABLE":best.length>=10?"EARLY":"LEARNING"
      });
    }

    if(!altReports.length)continue;
    altReports.sort((a,b)=>Number(b.effectiveWeight||0)-Number(a.effectiveWeight||0));
    features.push({
      feature,
      actual:String(actual),
      alternatives:altReports,
      strongestAlternative:altReports[0]
    });
  }

  return{
    status:features.length?"ACTIVE":"LEARNING",
    version:GRAMMAR_COUNTERFACTUAL_VERSION,
    current:{
      tokenId:current.tokenId,
      grammar:current.grammar,
      components:current.components
    },
    features,
    warning:"These are matched historical alternatives, not causal estimates. Changing one component in matched history does not prove that component caused the different outcome."
  };
}
