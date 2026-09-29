const mean=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
const quantile=(xs,q)=>{const a=[...xs].sort((a,b)=>a-b);if(!a.length)return 0;return a[Math.min(a.length-1,Math.floor((a.length-1)*q))];};

export function fitRegimeModel(rows){
 const vol=rows.map(r=>r.features.volatility_12??0),trend=rows.map(r=>Math.abs(r.features.ret_12??0));
 return Object.freeze({volLow:quantile(vol,.33),volHigh:quantile(vol,.67),trendHigh:quantile(trend,.67)});
}
export function classifyRegime(features,m){
 const v=features.volatility_12??0,t=Math.abs(features.ret_12??0);
 const vol=v>=m.volHigh?'HIGH_VOL':v<=m.volLow?'LOW_VOL':'MID_VOL';
 const structure=t>=m.trendHigh?'TREND':'RANGE';return `${vol}_${structure}`;
}
function thresholdCandidates(rows,feature){const xs=rows.map(r=>r.features[feature]).filter(Number.isFinite);return [.2,.35,.5,.65,.8].map(q=>quantile(xs,q));}
export function discoverCompoundRules(trainRows,{topFeatures=8,minSupport=25,maxRules=30}={}){
 if(!trainRows.length)return [];
 const regimeModel=fitRegimeModel(trainRows);const keys=Object.keys(trainRows[0].features).slice(0,topFeatures);const rules=[];
 for(let a=0;a<keys.length;a++)for(let b=a+1;b<keys.length;b++){
  const fa=keys[a],fb=keys[b];for(const ta of thresholdCandidates(trainRows,fa))for(const tb of thresholdCandidates(trainRows,fb))for(const sa of [-1,1])for(const sb of [-1,1]){
   const hit=trainRows.filter(r=>(sa>0?r.features[fa]>=ta:r.features[fa]<=ta)&&(sb>0?r.features[fb]>=tb:r.features[fb]<=tb));if(hit.length<minSupport)continue;
   const base=mean(trainRows.map(r=>r.label.largeMove?1:0)),rate=mean(hit.map(r=>r.label.largeMove?1:0));
   const regimes={};for(const r of hit){const g=classifyRegime(r.features,regimeModel);(regimes[g]??=[]).push(r);}const best=Object.entries(regimes).map(([regime,rs])=>({regime,n:rs.length,rate:mean(rs.map(r=>r.label.largeMove?1:0))})).sort((x,y)=>y.rate-x.rate)[0];
   rules.push({features:[fa,fb],thresholds:[ta,tb],sides:[sa,sb],support:hit.length,baseRate:base,trainRate:rate,lift:base?rate/base:0,bestRegime:best??null,regimeModel});
  }
 }
 return rules.sort((x,y)=>(y.lift*Math.log1p(y.support))-(x.lift*Math.log1p(x.support))).slice(0,maxRules);
}
export function evaluateRule(rule,rows){const [fa,fb]=rule.features,[ta,tb]=rule.thresholds,[sa,sb]=rule.sides;const hit=rows.filter(r=>(sa>0?r.features[fa]>=ta:r.features[fa]<=ta)&&(sb>0?r.features[fb]>=tb:r.features[fb]<=tb));const base=mean(rows.map(r=>r.label.largeMove?1:0)),rate=mean(hit.map(r=>r.label.largeMove?1:0));return Object.freeze({support:hit.length,baseRate:base,rate,lift:base&&hit.length?rate/base:0});}
export function walkForwardCompoundDiscovery(rows,{train=300,test=100,topFeatures=8,minSupport=25,maxRules=20}={}){
 const folds=[];for(let end=train;end+test<=rows.length;end+=test){const tr=rows.slice(end-train,end),te=rows.slice(end,end+test),rules=discoverCompoundRules(tr,{topFeatures,minSupport,maxRules});folds.push({trainFrom:tr[0]?.asOf,trainTo:tr.at(-1)?.asOf,testFrom:te[0]?.asOf,testTo:te.at(-1)?.asOf,rules:rules.map(rule=>({rule,test:evaluateRule(rule,te)}))});}return folds;
}
