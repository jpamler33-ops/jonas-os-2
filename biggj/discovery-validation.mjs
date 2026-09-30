const mean=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
export function wilsonLowerBound(successes,n,z=1.96){if(!n)return 0;const p=successes/n,d=1+z*z/n,c=p+z*z/(2*n),m=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n);return (c-m)/d;}
export function evaluateFrozenCandidate({id,folds,minSupport=100,minFolds=3,minPositiveShare=.67,minMeanLift=1.1}={}){
 const valid=(folds??[]).filter(f=>f.support>0&&Number.isFinite(f.lift));const support=valid.reduce((s,f)=>s+f.support,0);const positive=valid.filter(f=>f.lift>1).length;const meanLift=mean(valid.map(f=>f.lift));const positiveShare=valid.length?positive/valid.length:0;const lower=wilsonLowerBound(positive,valid.length);
 const gates={enoughSupport:support>=minSupport,enoughFolds:valid.length>=minFolds,positiveShare:positiveShare>=minPositiveShare,meanLift:meanLift>=minMeanLift};
 return Object.freeze({id,support,folds:valid.length,positiveFolds:positive,positiveShare,positiveShareWilsonLower95:lower,meanLift,gates,passes:Object.values(gates).every(Boolean)});
}
export function directionStats(rows){const hits=rows.filter(r=>r.matched);if(!hits.length)return {n:0,upRate:null,downRate:null,meanReturn:null};const ups=hits.filter(r=>r.futureReturn>0).length;return {n:hits.length,upRate:ups/hits.length,downRate:(hits.length-ups)/hits.length,meanReturn:mean(hits.map(r=>r.futureReturn))};}
export function costStress({grossReturns,costBps=[0,5,10,20]}={}){return costBps.map(bps=>{const c=bps/10000;const net=grossReturns.map(r=>r-c);return {costBps:bps,n:net.length,meanNetReturn:mean(net),positiveRate:net.length?net.filter(x=>x>0).length/net.length:null};});}
