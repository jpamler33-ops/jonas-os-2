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
  const retestTol=Number(params.retestTol??0.0012);
  const stopBuffer=Number(params.stopBuffer??0.0005);
  const minRR=Number(params.minRR??2);
  const maxExtension=Number(params.maxExtension??0.002);
  const c5=all5.slice(Math.max(0,currentIndex-6000),currentIndex+1);
  if(c5.length<1000)return null;
  const last=c5.at(-1),currentClose=Number(last.t)+5*60_000;
  const c15=aggregateClosed(c5,15,currentClose);
  const c1h=aggregateClosed(c5,60,currentClose);
  const c4h=aggregateClosed(c5,240,currentClose);
  if(c15.length<60||c1h.length<60||c4h.length<20)return null;

  const trends={"5m":trend(c5),"15m":trend(c15),"1h":trend(c1h),"4h":trend(c4h)};
  const price=Number(last.c);
  const closes=c5.map(x=>Number(x.c));
  const e20=ema(closes,EMA_FAST).at(-1),e50=ema(closes,EMA_SLOW).at(-1);
  const {support,resistance}=nearestLevels(c15,price);
  const lp=findBreakRetest(c5,"LONG",retestTol),sp=findBreakRetest(c5,"SHORT",retestTol);
  const fresh=p=>p&&p.retest_i>=c5.length-2&&Math.abs(price-p.level)/Math.max(1e-9,p.level)<=maxExtension;

  const macroLong=trends["4h"]==="BULLISH"&&trends["1h"]==="BULLISH"&&trends["15m"]!=="BEARISH";
  const macroShort=trends["4h"]==="BEARISH"&&trends["1h"]==="BEARISH"&&trends["15m"]!=="BULLISH";

  if(fresh(lp)&&macroLong&&price>e20&&price>e50&&resistance>price){
    const lows=pivots(c5.slice(-80)).filter(p=>p.kind==="L"&&p.price<price).map(p=>p.price);
    let base=lows.slice(-3).length?Math.max(...lows.slice(-3)):lp.retest_low;
    base=Math.min(base,lp.retest_low);
    const stop=base*(1-stopBuffer),ratio=rr(price,stop,resistance,"LONG");
    if(ratio>=minRR)return{ts:last.t,side:"LONG",entry:price,stop,target:resistance,planned_rr:ratio,level:lp.level,trends};
  }
  if(fresh(sp)&&macroShort&&price<e20&&price<e50&&support<price){
    const highs=pivots(c5.slice(-80)).filter(p=>p.kind==="H"&&p.price>price).map(p=>p.price);
    let base=highs.slice(-3).length?Math.min(...highs.slice(-3)):sp.retest_high;
    base=Math.max(base,sp.retest_high);
    const stop=base*(1+stopBuffer),ratio=rr(price,stop,support,"SHORT");
    if(ratio>=minRR)return{ts:last.t,side:"SHORT",entry:price,stop,target:support,planned_rr:ratio,level:sp.level,trends};
  }
  return null;
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
