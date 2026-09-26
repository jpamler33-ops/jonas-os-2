export const STRATEGY_CORE_VERSION="2.2.0";

export function ema(values,period){
  if(!values?.length)return[];
  const a=2/(period+1),out=[Number(values[0])];
  for(const v of values.slice(1)) out.push(a*Number(v)+(1-a)*out.at(-1));
  return out;
}

export function pivots(candles,window=2){
  const c=Array.isArray(candles)?candles:[];
  const out=[];
  for(let i=window;i<c.length-window;i++){
    const s=c.slice(i-window,i+window+1);
    const hs=s.map(x=>Number(x.h)),ls=s.map(x=>Number(x.l));
    const max=Math.max(...hs),min=Math.min(...ls);
    if(Number(c[i].h)===max&&hs.filter(x=>x===max).length===1)out.push({i,price:max,kind:"H"});
    if(Number(c[i].l)===min&&ls.filter(x=>x===min).length===1)out.push({i,price:min,kind:"L"});
  }
  return out.sort((a,b)=>a.i-b.i);
}

export function marketTrend(candles){
  const p=pivots(candles);
  const h=p.filter(x=>x.kind==="H").slice(-2);
  const l=p.filter(x=>x.kind==="L").slice(-2);
  if(h.length<2||l.length<2)return"NEUTRAL";
  if(h[1].price>h[0].price&&l[1].price>l[0].price)return"BULLISH";
  if(h[1].price<h[0].price&&l[1].price<l[0].price)return"BEARISH";
  return"NEUTRAL";
}

export function aggregateClosed(c5,minutes,currentClose){
  const span=Number(minutes)*60_000,buckets=new Map();
  for(const x of c5||[]){
    const start=Math.floor(Number(x.t)/span)*span;
    if(start+span>Number(currentClose))continue;
    let b=buckets.get(start);
    if(!b){
      b={t:start,o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),v:Number(x.v||0)};
      buckets.set(start,b);
    }else{
      b.h=Math.max(b.h,Number(x.h));
      b.l=Math.min(b.l,Number(x.l));
      b.c=Number(x.c);
      b.v+=Number(x.v||0);
    }
  }
  return[...buckets.values()].sort((a,b)=>a.t-b.t);
}

export function nearestLevels(candles,price){
  const p=pivots((candles||[]).slice(-120));
  const lows=[...new Set(p.filter(x=>x.kind==="L"&&x.price<price).map(x=>x.price))].sort((a,b)=>b-a);
  const highs=[...new Set(p.filter(x=>x.kind==="H"&&x.price>price).map(x=>x.price))].sort((a,b)=>a-b);
  return{support:lows[0]??null,resistance:highs[0]??null};
}

export function findBreakRetest(c,side,retestTol=0.0012){
  const n=c?.length||0;
  if(n<40)return null;
  for(let b=Math.max(20,n-9);b<n-1;b++){
    const hist=c.slice(Math.max(0,b-16),b);
    if(hist.length<10)continue;
    if(side==="LONG"){
      const level=Math.max(...hist.map(x=>Number(x.h)));
      if(Number(c[b].c)<=level||(Number(c[b].c)-level)/level<0.00015)continue;
      for(let r=b+1;r<Math.min(n,b+7);r++){
        const touched=Number(c[r].l)<=level*(1+retestTol);
        const held=Number(c[r].c)>=level*(1-retestTol);
        if(touched&&held&&Number(c[n-1].c)>=level)
          return{side,level,break_i:b,retest_i:r,retest_low:Number(c[r].l)};
      }
    }else{
      const level=Math.min(...hist.map(x=>Number(x.l)));
      if(Number(c[b].c)>=level||(level-Number(c[b].c))/level<0.00015)continue;
      for(let r=b+1;r<Math.min(n,b+7);r++){
        const touched=Number(c[r].h)>=level*(1-retestTol);
        const held=Number(c[r].c)<=level*(1+retestTol);
        if(touched&&held&&Number(c[n-1].c)<=level)
          return{side,level,break_i:b,retest_i:r,retest_high:Number(c[r].h)};
      }
    }
  }
  return null;
}

export function rr(entry,stop,target,side){
  const risk=side==="LONG"?entry-stop:stop-entry;
  const reward=side==="LONG"?target-entry:entry-target;
  return risk>0&&reward>0?reward/risk:0;
}

export function evaluateStrategyContext(ctx,opts={}){
  const c5=Array.isArray(ctx?.c5)?ctx.c5:[];
  const price=Number(ctx?.price);
  const ema20=Number(ctx?.ema20),ema50=Number(ctx?.ema50);
  const resistance=ctx?.resistance===null||ctx?.resistance===undefined?null:Number(ctx.resistance);
  const support=ctx?.support===null||ctx?.support===undefined?null:Number(ctx.support);
  const trends=ctx?.trends||{};
  if(c5.length<40||![price,ema20,ema50].every(Number.isFinite))return null;

  const retestTol=Number(opts.retestTol??0.0012);
  const stopBuffer=Number(opts.stopBuffer??0.0005);
  const minRR=Number(opts.minRR??2);
  const maxExtension=Number(opts.maxExtension??0.002);
  const longPattern=findBreakRetest(c5,"LONG",retestTol);
  const shortPattern=findBreakRetest(c5,"SHORT",retestTol);
  const fresh=p=>p&&p.retest_i>=c5.length-2&&Math.abs(price-p.level)/Math.max(1e-9,p.level)<=maxExtension;

  const macroLong=trends["4h"]==="BULLISH"&&trends["1h"]==="BULLISH"&&trends["15m"]!=="BEARISH";
  const macroShort=trends["4h"]==="BEARISH"&&trends["1h"]==="BEARISH"&&trends["15m"]!=="BULLISH";

  if(fresh(longPattern)&&macroLong&&price>ema20&&price>ema50&&resistance!==null&&resistance>price){
    const lows=pivots(c5.slice(-80)).filter(p=>p.kind==="L"&&p.price<price).map(p=>p.price);
    let base=lows.slice(-3).length?Math.max(...lows.slice(-3)):longPattern.retest_low;
    base=Math.min(base,longPattern.retest_low);
    const stop=base*(1-stopBuffer),ratio=rr(price,stop,resistance,"LONG");
    if(ratio>=minRR)return{
      decision:"LONG SETUP",side:"LONG",entry:price,stop,target:resistance,rr:ratio,
      planned_rr:ratio,level:longPattern.level,strategyVersion:STRATEGY_CORE_VERSION
    };
  }

  if(fresh(shortPattern)&&macroShort&&price<ema20&&price<ema50&&support!==null&&support<price){
    const highs=pivots(c5.slice(-80)).filter(p=>p.kind==="H"&&p.price>price).map(p=>p.price);
    let base=highs.slice(-3).length?Math.min(...highs.slice(-3)):shortPattern.retest_high;
    base=Math.max(base,shortPattern.retest_high);
    const stop=base*(1+stopBuffer),ratio=rr(price,stop,support,"SHORT");
    if(ratio>=minRR)return{
      decision:"SHORT SETUP",side:"SHORT",entry:price,stop,target:support,rr:ratio,
      planned_rr:ratio,level:shortPattern.level,strategyVersion:STRATEGY_CORE_VERSION
    };
  }
  return null;
}

export function contextFrom5m(all5,currentIndex){
  const c5=(all5||[]).slice(Math.max(0,currentIndex-6000),currentIndex+1);
  if(c5.length<960)return null;
  const last=c5.at(-1),currentClose=Number(last.t)+5*60_000;
  const c15=aggregateClosed(c5,15,currentClose);
  const c1h=aggregateClosed(c5,60,currentClose);
  const c4h=aggregateClosed(c5,240,currentClose);
  if(c15.length<60||c1h.length<60||c4h.length<20)return null;
  const trends={
    "5m":marketTrend(c5),"15m":marketTrend(c15),
    "1h":marketTrend(c1h),"4h":marketTrend(c4h)
  };
  const price=Number(last.c),closes=c5.map(x=>Number(x.c));
  const e20=ema(closes,20).at(-1),e50=ema(closes,50).at(-1);
  const levels=nearestLevels(c15,price);
  return{
    updatedAt:currentClose,price,trends,
    score:(trends["4h"]==="BULLISH"?2:trends["4h"]==="BEARISH"?-2:0)+
      (trends["1h"]==="BULLISH"?2:trends["1h"]==="BEARISH"?-2:0)+
      (trends["15m"]==="BULLISH"?1:trends["15m"]==="BEARISH"?-1:0),
    ema20:e20,ema50:e50,support:levels.support,resistance:levels.resistance,c5
  };
}

export function normalizeDecision(x){
  if(!x)return{signal:"NONE"};
  return{
    signal:x.side||"NONE",
    entry:Number(x.entry),stop:Number(x.stop),target:Number(x.target),
    rr:Number(x.rr??x.planned_rr),level:Number(x.level)
  };
}

export function compareDecisions(a,b,tolerancePct=0.00005){
  const x=normalizeDecision(a),y=normalizeDecision(b);
  if(x.signal!==y.signal)return{match:false,reason:"SIGNAL_MISMATCH",a:x,b:y};
  if(x.signal==="NONE")return{match:true,reason:"BOTH_NONE",a:x,b:y};
  const fields=["entry","stop","target","level"];
  const diffs={};
  let ok=true;
  for(const k of fields){
    const xv=Number(x[k]),yv=Number(y[k]);
    if(!Number.isFinite(xv)||!Number.isFinite(yv)){ok=false;diffs[k]=null;continue;}
    const d=Math.abs(xv-yv)/Math.max(1e-9,Math.abs(xv));
    diffs[k]=d;
    if(d>tolerancePct)ok=false;
  }
  return{match:ok,reason:ok?"MATCH":"PRICE_FIELD_MISMATCH",diffs,a:x,b:y};
}
