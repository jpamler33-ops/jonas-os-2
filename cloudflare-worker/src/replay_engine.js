import { contextFrom5m, evaluateStrategyContext } from "./strategy_core.js";

const EMA_FAST=20;
const EMA_SLOW=50;
const PIVOT_WINDOW=2;

function ema(values,period){
  if(!values.length)return[];
  const a=2/(period+1),out=[values[0]];
  for(const v of values.slice(1)) out.push(a*v+(1-a)*out.at(-1));
  return out;
}

function pivots(c,window=PIVOT_WINDOW){
  const out=[];
  for(let i=window;i<c.length-window;i++){
    const s=c.slice(i-window,i+window+1);
    const hs=s.map(x=>x.h),ls=s.map(x=>x.l);
    const max=Math.max(...hs),min=Math.min(...ls);
    if(c[i].h===max&&hs.filter(x=>x===max).length===1) out.push({i,price:c[i].h,kind:"H"});
    if(c[i].l===min&&ls.filter(x=>x===min).length===1) out.push({i,price:c[i].l,kind:"L"});
  }
  return out.sort((a,b)=>a.i-b.i);
}

function trend(c){
  const p=pivots(c),h=p.filter(x=>x.kind==="H").slice(-2),l=p.filter(x=>x.kind==="L").slice(-2);
  if(h.length<2||l.length<2)return"NEUTRAL";
  if(h[1].price>h[0].price&&l[1].price>l[0].price)return"BULLISH";
  if(h[1].price<h[0].price&&l[1].price<l[0].price)return"BEARISH";
  return"NEUTRAL";
}

function aggregateClosed(c5,minutes,currentClose){
  const span=minutes*60_000;
  const buckets=new Map();
  for(const x of c5){
    const start=Math.floor(Number(x.t)/span)*span;
    if(start+span>currentClose) continue;
    let b=buckets.get(start);
    if(!b){
      b={t:start,o:x.o,h:x.h,l:x.l,c:x.c,v:Number(x.v||0)};
      buckets.set(start,b);
    }else{
      b.h=Math.max(b.h,x.h); b.l=Math.min(b.l,x.l); b.c=x.c; b.v+=Number(x.v||0);
    }
  }
  return [...buckets.values()].sort((a,b)=>a.t-b.t);
}

function nearestLevels(c,price){
  const p=pivots(c.slice(-120));
  const lows=[...new Set(p.filter(x=>x.kind==="L"&&x.price<price).map(x=>x.price))].sort((a,b)=>b-a);
  const highs=[...new Set(p.filter(x=>x.kind==="H"&&x.price>price).map(x=>x.price))].sort((a,b)=>a-b);
  return{support:lows[0]??null,resistance:highs[0]??null};
}

function findBreakRetest(c,side,retestTol){
  const n=c.length;
  if(n<40)return null;
  for(let b=Math.max(20,n-9);b<n-1;b++){
    const hist=c.slice(Math.max(0,b-16),b);
    if(hist.length<10)continue;
    if(side==="LONG"){
      const level=Math.max(...hist.map(x=>x.h));
      if(c[b].c<=level||(c[b].c-level)/level<0.00015)continue;
      for(let r=b+1;r<Math.min(n,b+7);r++){
        if(c[r].l<=level*(1+retestTol)&&c[r].c>=level*(1-retestTol)&&c[n-1].c>=level)
          return{side,level,break_i:b,retest_i:r,retest_low:c[r].l};
      }
    }else{
      const level=Math.min(...hist.map(x=>x.l));
      if(c[b].c>=level||(level-c[b].c)/level<0.00015)continue;
      for(let r=b+1;r<Math.min(n,b+7);r++){
        if(c[r].h>=level*(1-retestTol)&&c[r].c<=level*(1+retestTol)&&c[n-1].c<=level)
          return{side,level,break_i:b,retest_i:r,retest_high:c[r].h};
      }
    }
  }
  return null;
}

function rr(entry,stop,target,side){
  const risk=side==="LONG"?entry-stop:stop-entry;
  const reward=side==="LONG"?target-entry:entry-target;
  return risk>0&&reward>0?reward/risk:0;
}

export function evaluateReplaySetup(all5,currentIndex,params={}){
  const ctx=contextFrom5m(all5,currentIndex);
  if(!ctx)return null;
  const setup=evaluateStrategyContext(ctx,params);
  if(!setup)return null;
  return{
    ts:Number(ctx.c5.at(-1).t),
    side:setup.side,
    entry:Number(setup.entry),
    stop:Number(setup.stop),
    target:Number(setup.target),
    planned_rr:Number(setup.rr),
    level:Number(setup.level),
    trends:ctx.trends,
    strategyVersion:setup.strategyVersion
  };
}

export function simulateOutcome(all5,currentIndex,setup,maxBars=288){
  const risk=setup.side==="LONG"?setup.entry-setup.stop:setup.stop-setup.entry;
  if(!(risk>0))return null;
  let mfe=0,mae=0;
  const end=Math.min(all5.length,currentIndex+1+maxBars);
  for(let i=currentIndex+1;i<end;i++){
    const x=all5[i];
    const fav=setup.side==="LONG"?(x.h-setup.entry)/risk:(setup.entry-x.l)/risk;
    const adv=setup.side==="LONG"?(setup.entry-x.l)/risk:(x.h-setup.entry)/risk;
    mfe=Math.max(mfe,fav); mae=Math.max(mae,adv);
    const stopHit=setup.side==="LONG"?x.l<=setup.stop:x.h>=setup.stop;
    const targetHit=setup.side==="LONG"?x.h>=setup.target:x.l<=setup.target;
    if(stopHit&&targetHit)return{result:"AMBIGUOUS",realized_r:null,mfe_r:mfe,mae_r:mae,closed_ts:x.t};
    if(targetHit)return{result:"TARGET",realized_r:setup.planned_rr,mfe_r:mfe,mae_r:mae,closed_ts:x.t};
    if(stopHit)return{result:"STOP",realized_r:-1,mfe_r:mfe,mae_r:mae,closed_ts:x.t};
  }
  return{result:"TIMEOUT",realized_r:null,mfe_r:mfe,mae_r:mae,closed_ts:all5[end-1]?.t??null};
}

export function parameterGrid(){
  const out=[];
  for(const retestTol of [0.0006,0.0010,0.0012,0.0016,0.0020])
    for(const stopBuffer of [0.0003,0.0005,0.0008])
      for(const minRR of [1.5,2.0,2.5])
        out.push({retestTol,stopBuffer,minRR,maxExtension:0.002});
  return out;
}
