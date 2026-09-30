const safe=(n,d=0)=>Number.isFinite(Number(n))?Number(n):d;
const ret=(a,b)=>a?b/a-1:0;
const mean=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
const sd=x=>{if(x.length<2)return 0;const m=mean(x);return Math.sqrt(mean(x.map(v=>(v-m)**2)));};

export function extractPastOnlyFeatures(candles,index,{lookbacks=[3,6,12,24]}={}){
 if(index<1||index>=candles.length) throw new Error('BIGGJ_DISCOVERY_INDEX_INVALID');
 const now=candles[index], out={};
 for(const n of lookbacks){
  const start=Math.max(0,index-n);const w=candles.slice(start,index+1);const closes=w.map(c=>safe(c.close));const vols=w.map(c=>safe(c.volume));const rs=[];for(let i=1;i<closes.length;i++)rs.push(ret(closes[i-1],closes[i]));
  out[`ret_${n}`]=ret(closes[0],closes.at(-1));out[`volatility_${n}`]=sd(rs);out[`volume_ratio_${n}`]=mean(vols.slice(-Math.min(3,vols.length)))/(mean(vols)||1);
  const hi=Math.max(...w.map(c=>safe(c.high)));const lo=Math.min(...w.map(c=>safe(c.low)));out[`range_position_${n}`]=hi===lo?.5:(safe(now.close)-lo)/(hi-lo);
 }
 const body=Math.abs(safe(now.close)-safe(now.open));const range=Math.max(1e-12,safe(now.high)-safe(now.low));out.body_fraction=body/range;out.close_direction=Math.sign(safe(now.close)-safe(now.open));
 return Object.freeze(out);
}

export function labelFutureMove(candles,index,horizon,{largeMoveQuantileThreshold=.01}={}){
 if(index+horizon>=candles.length) return null;const r=ret(safe(candles[index].close),safe(candles[index+horizon].close));return Object.freeze({returnPct:r,direction:Math.sign(r),largeMove:Math.abs(r)>=largeMoveQuantileThreshold});
}

export function buildDiscoveryRows(candles,{horizon=3,lookbacks=[3,6,12,24],largeMoveThreshold=.01}={}){
 const rows=[];const warm=Math.max(...lookbacks);
 for(let i=warm;i<candles.length-horizon;i++){const label=labelFutureMove(candles,i,horizon,{largeMoveQuantileThreshold:largeMoveThreshold});rows.push(Object.freeze({asOf:candles[i].closeTime,features:extractPastOnlyFeatures(candles,i,{lookbacks}),label}));}
 return rows;
}

export function rankFeatures(rows,{minSamples=50}={}){
 if(rows.length<minSamples)return [];
 const keys=Object.keys(rows[0]?.features??{});const large=rows.filter(r=>r.label.largeMove),normal=rows.filter(r=>!r.label.largeMove);
 if(!large.length||!normal.length)return [];
 return keys.map(feature=>{const a=large.map(r=>r.features[feature]),b=normal.map(r=>r.features[feature]);const ma=mean(a),mb=mean(b),pooled=Math.sqrt((sd(a)**2+sd(b)**2)/2)||1e-12;return {feature,largeMoveMean:ma,normalMean:mb,effectSize:(ma-mb)/pooled,samples:rows.length};}).sort((x,y)=>Math.abs(y.effectSize)-Math.abs(x.effectSize));
}

export function walkForwardFeatureDiscovery(rows,{train=300,test=100,topK=8}={}){
 const folds=[];
 for(let end=train;end+test<=rows.length;end+=test){const tr=rows.slice(end-train,end);const te=rows.slice(end,end+test);const ranked=rankFeatures(tr,{minSamples:Math.min(50,train)}).slice(0,topK);folds.push(Object.freeze({trainFrom:tr[0]?.asOf,trainTo:tr.at(-1)?.asOf,testFrom:te[0]?.asOf,testTo:te.at(-1)?.asOf,features:ranked.map(x=>x.feature),effects:ranked}));}
 return folds;
}
