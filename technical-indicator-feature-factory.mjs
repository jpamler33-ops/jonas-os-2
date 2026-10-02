export const TECHNICAL_INDICATOR_FACTORY_VERSION='BIGGJ_TECHNICAL_INDICATOR_FACTORY_V1';
export const TECHNICAL_INDICATOR_TIMEFRAMES=Object.freeze(['5m','15m','1h','4h']);

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function safeDiv(a,b){
  const x=finite(a),y=finite(b);
  return x==null||y==null||Math.abs(y)<1e-18?null:x/y;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,Number(v)));}
function last(xs,n=0){return Array.isArray(xs)&&xs.length>n?xs[xs.length-1-n]:null;}
function mean(xs){
  const a=(xs||[]).map(finite).filter(x=>x!=null);
  return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
}
function std(xs){
  const a=(xs||[]).map(finite).filter(x=>x!=null);
  if(a.length<2)return null;
  const m=mean(a);
  return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));
}
function sum(xs){
  return (xs||[]).map(finite).filter(x=>x!=null).reduce((s,x)=>s+x,0);
}
function rolling(values,period,fn){
  const out=Array(values.length).fill(null);
  for(let i=period-1;i<values.length;i++)out[i]=fn(values.slice(i-period+1,i+1));
  return out;
}
function smaSeries(values,period){return rolling(values,period,mean);}
function emaSeries(values,period){
  const xs=(values||[]).map(finite);
  const out=Array(xs.length).fill(null);
  if(!xs.length)return out;
  const alpha=2/(period+1);
  let e=null;
  for(let i=0;i<xs.length;i++){
    const x=xs[i];
    if(x==null)continue;
    e=e==null?x:alpha*x+(1-alpha)*e;
    out[i]=e;
  }
  return out;
}
function rmaSeries(values,period){
  const xs=(values||[]).map(finite),out=Array(xs.length).fill(null);
  let r=null;
  for(let i=0;i<xs.length;i++){
    const x=xs[i];
    if(x==null)continue;
    if(i<period-1)continue;
    if(r==null)r=mean(xs.slice(i-period+1,i+1));
    else r=((period-1)*r+x)/period;
    out[i]=r;
  }
  return out;
}
function wmaSeries(values,period){
  const den=period*(period+1)/2;
  return rolling(values,period,xs=>xs.reduce((s,x,i)=>s+Number(x)*(i+1),0)/den);
}
function diffSeries(a,b){return a.map((x,i)=>finite(x)!=null&&finite(b[i])!=null?Number(x)-Number(b[i]):null);}
function pctDistance(price,line){
  const p=finite(price),l=finite(line);
  return p!=null&&l!=null&&p!==0?(p-l)/p:null;
}
function rocSeries(values,period){
  return values.map((x,i)=>{
    const a=finite(x),b=i>=period?finite(values[i-period]):null;
    return a!=null&&b!=null&&b!==0?a/b-1:null;
  });
}
function closesOnly(candles,asOf){
  return (Array.isArray(candles)?candles:[])
    .filter(c=>c?.closed===true&&finite(c?.closeTime)!=null&&Number(c.closeTime)<=Number(asOf))
    .map(c=>({
      openTime:Number(c.openTime),
      closeTime:Number(c.closeTime),
      o:Number(c.o),h:Number(c.h),l:Number(c.l),c:Number(c.c),v:Math.max(0,Number(c.v)||0)
    }))
    .filter(c=>[c.o,c.h,c.l,c.c].every(Number.isFinite)&&c.o>0&&c.h>0&&c.l>0&&c.c>0);
}
function trueRanges(rows){
  return rows.map((x,i)=>{
    if(i===0)return x.h-x.l;
    const pc=rows[i-1].c;
    return Math.max(x.h-x.l,Math.abs(x.h-pc),Math.abs(x.l-pc));
  });
}
function atrSeries(rows,period){return rmaSeries(trueRanges(rows),period);}
function rsiSeries(values,period){
  const gains=Array(values.length).fill(0),losses=Array(values.length).fill(0);
  for(let i=1;i<values.length;i++){
    const d=Number(values[i])-Number(values[i-1]);
    gains[i]=Math.max(0,d);losses[i]=Math.max(0,-d);
  }
  const ag=rmaSeries(gains,period),al=rmaSeries(losses,period);
  return values.map((_,i)=>{
    const g=finite(ag[i]),l=finite(al[i]);
    if(g==null||l==null)return null;
    if(l===0)return 1;
    const rs=g/l;
    return 1-1/(1+rs);
  });
}
function stochSeries(rows,period=14,smooth=3){
  const k=Array(rows.length).fill(null);
  for(let i=period-1;i<rows.length;i++){
    const w=rows.slice(i-period+1,i+1),hi=Math.max(...w.map(x=>x.h)),lo=Math.min(...w.map(x=>x.l));
    k[i]=hi===lo?.5:(rows[i].c-lo)/(hi-lo);
  }
  const d=smaSeries(k,smooth);
  return {k,d};
}
function stochRsiSeries(values,period=14){
  const rsi=rsiSeries(values,period),out=Array(values.length).fill(null);
  for(let i=period*2-2;i<values.length;i++){
    const w=rsi.slice(i-period+1,i+1).filter(Number.isFinite);
    if(w.length<period)continue;
    const hi=Math.max(...w),lo=Math.min(...w);
    out[i]=hi===lo?.5:(rsi[i]-lo)/(hi-lo);
  }
  return out;
}
function cciSeries(rows,period=20){
  const tp=rows.map(x=>(x.h+x.l+x.c)/3);
  const out=Array(rows.length).fill(null);
  for(let i=period-1;i<rows.length;i++){
    const w=tp.slice(i-period+1,i+1),m=mean(w),md=mean(w.map(x=>Math.abs(x-m)));
    out[i]=md&&Number.isFinite(md)?(tp[i]-m)/(.015*md):0;
  }
  return out;
}
function mfiSeries(rows,period=14){
  const tp=rows.map(x=>(x.h+x.l+x.c)/3),out=Array(rows.length).fill(null);
  const pos=Array(rows.length).fill(0),neg=Array(rows.length).fill(0);
  for(let i=1;i<rows.length;i++){
    const flow=tp[i]*rows[i].v;
    if(tp[i]>tp[i-1])pos[i]=flow;
    else if(tp[i]<tp[i-1])neg[i]=flow;
  }
  for(let i=period;i<rows.length;i++){
    const p=sum(pos.slice(i-period+1,i+1)),n=sum(neg.slice(i-period+1,i+1));
    out[i]=n===0?1:1-1/(1+p/n);
  }
  return out;
}
function tsiSeries(values,long=25,short=13){
  const mom=values.map((x,i)=>i?Number(x)-Number(values[i-1]):0);
  const a1=emaSeries(mom,long),a2=emaSeries(a1,short);
  const b1=emaSeries(mom.map(Math.abs),long),b2=emaSeries(b1,short);
  return values.map((_,i)=>safeDiv(a2[i],b2[i]));
}
function ultimateOscillatorSeries(rows){
  const bp=Array(rows.length).fill(null),tr=Array(rows.length).fill(null),out=Array(rows.length).fill(null);
  for(let i=1;i<rows.length;i++){
    const pc=rows[i-1].c;
    bp[i]=rows[i].c-Math.min(rows[i].l,pc);
    tr[i]=Math.max(rows[i].h,pc)-Math.min(rows[i].l,pc);
  }
  for(let i=27;i<rows.length;i++){
    const avg=p=>{
      const b=sum(bp.slice(i-p+1,i+1)),t=sum(tr.slice(i-p+1,i+1));
      return t>0?b/t:null;
    };
    const a7=avg(7),a14=avg(14),a28=avg(28);
    if([a7,a14,a28].every(x=>x!=null))out[i]=(4*a7+2*a14+a28)/7;
  }
  return out;
}
function adxSeries(rows,period=14){
  const tr=Array(rows.length).fill(0),plus=Array(rows.length).fill(0),minus=Array(rows.length).fill(0);
  for(let i=1;i<rows.length;i++){
    const up=rows[i].h-rows[i-1].h,down=rows[i-1].l-rows[i].l;
    tr[i]=Math.max(rows[i].h-rows[i].l,Math.abs(rows[i].h-rows[i-1].c),Math.abs(rows[i].l-rows[i-1].c));
    plus[i]=up>down&&up>0?up:0;
    minus[i]=down>up&&down>0?down:0;
  }
  const atr=rmaSeries(tr,period),pdm=rmaSeries(plus,period),mdm=rmaSeries(minus,period);
  const pdi=rows.map((_,i)=>safeDiv(pdm[i],atr[i]));
  const mdi=rows.map((_,i)=>safeDiv(mdm[i],atr[i]));
  const dx=rows.map((_,i)=>{
    const p=pdi[i],m=mdi[i];
    return p!=null&&m!=null&&p+m>0?Math.abs(p-m)/(p+m):null;
  });
  return {adx:rmaSeries(dx,period),pdi,mdi};
}
function aroon(rows,period=25){
  if(rows.length<period)return {up:null,down:null,osc:null};
  const w=rows.slice(-period),hi=Math.max(...w.map(x=>x.h)),lo=Math.min(...w.map(x=>x.l));
  const hiIdx=w.map(x=>x.h).lastIndexOf(hi),loIdx=w.map(x=>x.l).lastIndexOf(lo);
  const up=(hiIdx+1)/period,down=(loIdx+1)/period;
  return {up,down,osc:up-down};
}
function vortex(rows,period=14){
  if(rows.length<period+1)return {plus:null,minus:null,diff:null};
  const w=rows.slice(-(period+1));let tr=0,vp=0,vm=0;
  for(let i=1;i<w.length;i++){
    tr+=Math.max(w[i].h-w[i].l,Math.abs(w[i].h-w[i-1].c),Math.abs(w[i].l-w[i-1].c));
    vp+=Math.abs(w[i].h-w[i-1].l);
    vm+=Math.abs(w[i].l-w[i-1].h);
  }
  const p=tr>0?vp/tr:null,m=tr>0?vm/tr:null;
  return {plus:p,minus:m,diff:p!=null&&m!=null?p-m:null};
}
function choppiness(rows,period=14){
  if(rows.length<period+1)return null;
  const w=rows.slice(-period),tr=sum(trueRanges(rows).slice(-period)),hi=Math.max(...w.map(x=>x.h)),lo=Math.min(...w.map(x=>x.l));
  return hi>lo&&tr>0?Math.log10(tr/(hi-lo))/Math.log10(period):null;
}
function supertrend(rows,period=10,mult=3){
  if(rows.length<period+2)return {direction:null,distance:null};
  const atr=atrSeries(rows,period),finalUpper=Array(rows.length).fill(null),finalLower=Array(rows.length).fill(null),st=Array(rows.length).fill(null),dir=Array(rows.length).fill(null);
  for(let i=0;i<rows.length;i++){
    const a=atr[i];
    if(a==null)continue;
    const mid=(rows[i].h+rows[i].l)/2,upper=mid+mult*a,lower=mid-mult*a;
    if(i===0||finalUpper[i-1]==null){
      finalUpper[i]=upper;finalLower[i]=lower;
      st[i]=upper;dir[i]=-1;continue;
    }
    finalUpper[i]=(upper<finalUpper[i-1]||rows[i-1].c>finalUpper[i-1])?upper:finalUpper[i-1];
    finalLower[i]=(lower>finalLower[i-1]||rows[i-1].c<finalLower[i-1])?lower:finalLower[i-1];
    if(st[i-1]===finalUpper[i-1]){
      st[i]=rows[i].c<=finalUpper[i]?finalUpper[i]:finalLower[i];
    }else{
      st[i]=rows[i].c>=finalLower[i]?finalLower[i]:finalUpper[i];
    }
    dir[i]=st[i]===finalLower[i]?1:-1;
  }
  const line=last(st),direction=last(dir),price=last(rows)?.c;
  return {direction,distance:pctDistance(price,line)};
}
function parabolicSar(rows,{step=.02,max=.2}={}){
  if(rows.length<3)return {direction:null,distance:null};
  let bull=rows[1].c>=rows[0].c,sar=bull?rows[0].l:rows[0].h,ep=bull?rows[0].h:rows[0].l,af=step;
  for(let i=1;i<rows.length;i++){
    sar=sar+af*(ep-sar);
    if(bull){
      sar=Math.min(sar,rows[i-1].l,i>1?rows[i-2].l:rows[i-1].l);
      if(rows[i].l<sar){bull=false;sar=ep;ep=rows[i].l;af=step;}
      else if(rows[i].h>ep){ep=rows[i].h;af=Math.min(max,af+step);}
    }else{
      sar=Math.max(sar,rows[i-1].h,i>1?rows[i-2].h:rows[i-1].h);
      if(rows[i].h>sar){bull=true;sar=ep;ep=rows[i].h;af=step;}
      else if(rows[i].l<ep){ep=rows[i].l;af=Math.min(max,af+step);}
    }
  }
  return {direction:bull?1:-1,distance:pctDistance(last(rows)?.c,sar)};
}
function rollingVwap(rows,period){
  if(rows.length<period)return null;
  const w=rows.slice(-period),den=sum(w.map(x=>x.v));
  return den>0?sum(w.map(x=>((x.h+x.l+x.c)/3)*x.v))/den:null;
}
function obvSeries(rows){
  const out=Array(rows.length).fill(0);
  for(let i=1;i<rows.length;i++)out[i]=out[i-1]+(rows[i].c>rows[i-1].c?rows[i].v:rows[i].c<rows[i-1].c?-rows[i].v:0);
  return out;
}
function accumulationDistribution(rows){
  const out=Array(rows.length).fill(0);
  for(let i=0;i<rows.length;i++){
    const range=rows[i].h-rows[i].l;
    const mfm=range>0?((rows[i].c-rows[i].l)-(rows[i].h-rows[i].c))/range:0;
    out[i]=(i?out[i-1]:0)+mfm*rows[i].v;
  }
  return out;
}
function normalizedSlope(series,rows,period){
  if(series.length<period+1)return null;
  const now=finite(last(series)),prior=finite(series[series.length-1-period]);
  const vol=sum(rows.slice(-period).map(x=>x.v));
  return now!=null&&prior!=null&&vol>0?(now-prior)/vol:null;
}
function cmf(rows,period=20){
  if(rows.length<period)return null;
  const w=rows.slice(-period),den=sum(w.map(x=>x.v));
  const num=sum(w.map(x=>{
    const range=x.h-x.l,clv=range>0?((x.c-x.l)-(x.h-x.c))/range:0;
    return clv*x.v;
  }));
  return den>0?num/den:null;
}
function forceIndexSeries(rows,period=13){
  const raw=rows.map((x,i)=>i?(x.c-rows[i-1].c)*x.v:0);
  return emaSeries(raw,period);
}
function easeOfMovement(rows,period=14){
  const vals=[];
  for(let i=1;i<rows.length;i++){
    const mid=(rows[i].h+rows[i].l)/2,prev=(rows[i-1].h+rows[i-1].l)/2;
    const boxRatio=rows[i].v>0?(rows[i].h-rows[i].l)/rows[i].v:0;
    vals.push((mid-prev)*boxRatio);
  }
  return vals.length>=period?mean(vals.slice(-period)):null;
}
function volumeZ(rows,period=20){
  if(rows.length<period)return null;
  const w=rows.slice(-period).map(x=>x.v),sd=std(w),m=mean(w);
  return sd&&sd>0?(last(w)-m)/sd:0;
}
function priceZ(rows,period=20){
  if(rows.length<period)return null;
  const w=rows.slice(-period).map(x=>x.c),sd=std(w),m=mean(w);
  return sd&&sd>0?(last(w)-m)/sd:0;
}
function massIndex(rows){
  if(rows.length<40)return null;
  const range=rows.map(x=>x.h-x.l),ema1=emaSeries(range,9),ema2=emaSeries(ema1,9),rat=range.map((_,i)=>safeDiv(ema1[i],ema2[i]));
  const w=rat.slice(-25).filter(Number.isFinite);
  return w.length===25?sum(w):null;
}
function negativePositiveVolume(rows){
  let nvi=1000,pvi=1000;
  const ns=[nvi],ps=[pvi];
  for(let i=1;i<rows.length;i++){
    const r=rows[i-1].c!==0?rows[i].c/rows[i-1].c-1:0;
    if(rows[i].v<rows[i-1].v)nvi*=1+r;
    if(rows[i].v>rows[i-1].v)pvi*=1+r;
    ns.push(nvi);ps.push(pvi);
  }
  return {nvi:ns,pvi:ps};
}
function fisher(rows,period=10){
  if(rows.length<period)return null;
  const mids=rows.map(x=>(x.h+x.l)/2),w=mids.slice(-period),hi=Math.max(...w),lo=Math.min(...w);
  if(hi===lo)return 0;
  const x=clamp(2*((last(w)-lo)/(hi-lo)-.5),-.999,.999);
  return .5*Math.log((1+x)/(1-x));
}
function cmo(values,period=14){
  if(values.length<period+1)return null;
  let up=0,down=0;
  for(let i=values.length-period;i<values.length;i++){
    const d=values[i]-values[i-1];
    if(d>0)up+=d;else down-=d;
  }
  return up+down>0?(up-down)/(up+down):0;
}
function kst(values){
  const configs=[[10,10,1],[15,10,2],[20,10,3],[30,15,4]];
  const components=configs.map(([rocP,smaP,w])=>{
    const roc=rocSeries(values,rocP),sm=smaSeries(roc,smaP);
    return {series:sm,weight:w};
  });
  const k=values.map((_,i)=>{
    const vals=components.map(x=>finite(x.series[i]));
    if(vals.some(x=>x==null))return null;
    return components.reduce((s,x)=>s+Number(x.series[i])*x.weight,0);
  });
  const sig=smaSeries(k,9);
  return {kst:last(k),signal:last(sig),hist:last(k)!=null&&last(sig)!=null?last(k)-last(sig):null};
}
function coppock(values){
  const a=rocSeries(values,14),b=rocSeries(values,11),sumSeries=values.map((_,i)=>finite(a[i])!=null&&finite(b[i])!=null?a[i]+b[i]:null);
  return last(wmaSeries(sumSeries,10));
}
function historicalVol(values,period){
  if(values.length<period+1)return null;
  const rs=[];
  for(let i=values.length-period;i<values.length;i++)if(values[i-1]>0&&values[i]>0)rs.push(Math.log(values[i]/values[i-1]));
  return std(rs);
}
function indicatorSnapshot(rows){
  const c=rows.map(x=>x.c),h=rows.map(x=>x.h),l=rows.map(x=>x.l),v=rows.map(x=>x.v),p=last(c);
  if(rows.length<20||!(p>0))return {};

  const sma10=last(smaSeries(c,10)),sma20=last(smaSeries(c,20)),sma50=last(smaSeries(c,50)),sma100=last(smaSeries(c,100));
  const ema9s=emaSeries(c,9),ema21s=emaSeries(c,21),ema50s=emaSeries(c,50);
  const ema9=last(ema9s),ema21=last(ema21s),ema50=last(ema50s);
  const ema20s=emaSeries(c,20),ema20=last(ema20s),ema13s=emaSeries(c,13);

  const ema20a=emaSeries(c,20),ema20b=emaSeries(ema20a,20),ema20c=emaSeries(ema20b,20);
  const dema20=last(ema20a)!=null&&last(ema20b)!=null?2*last(ema20a)-last(ema20b):null;
  const tema20=last(ema20a)!=null&&last(ema20b)!=null&&last(ema20c)!=null?3*last(ema20a)-3*last(ema20b)+last(ema20c):null;
  const hmaHalf=wmaSeries(c,10),hmaFull=wmaSeries(c,20),hmaRaw=c.map((_,i)=>finite(hmaHalf[i])!=null&&finite(hmaFull[i])!=null?2*hmaHalf[i]-hmaFull[i]:null);
  const hma20=last(wmaSeries(hmaRaw,Math.max(2,Math.round(Math.sqrt(20)))));
  const lag=Math.floor((20-1)/2),zlemaInput=c.map((x,i)=>i>=lag?Number(x)+(Number(x)-Number(c[i-lag])):null);
  const zlema20=last(emaSeries(zlemaInput,20));
  let kama=null;
  if(c.length>=21){
    let k=c[c.length-21];
    for(let i=c.length-20;i<c.length;i++){
      const change=Math.abs(c[i]-c[i-10]??0),vol=sum(c.slice(Math.max(1,i-9),i+1).map((x,j,arr)=>{
        const global=i-arr.length+1+j;
        return global>0?Math.abs(c[global]-c[global-1]):0;
      }));
      const er=vol>0?change/vol:0,sc=(er*(2/(2+1)-2/(30+1))+2/(30+1))**2;
      k=k+sc*(c[i]-k);
    }
    kama=k;
  }

  const rsi7=last(rsiSeries(c,7)),rsi14s=rsiSeries(c,14),rsi14=last(rsi14s),rsi21=last(rsiSeries(c,21));
  const st=stochSeries(rows,14,3),srsi=last(stochRsiSeries(c,14));
  const will=rows.length>=14?(()=>{
    const w=rows.slice(-14),hi=Math.max(...w.map(x=>x.h)),lo=Math.min(...w.map(x=>x.l));
    return hi===lo?-.5:(p-hi)/(hi-lo);
  })():null;
  const cci20=last(cciSeries(rows,20)),mfi14=last(mfiSeries(rows,14));
  const tsi=last(tsiSeries(c,25,13)),ult=last(ultimateOscillatorSeries(rows));
  const med=rows.map(x=>(x.h+x.l)/2),ao=rows.length>=34?(last(smaSeries(med,5))-last(smaSeries(med,34)))/p:null;
  const macdFast=emaSeries(c,12),macdSlow=emaSeries(c,26),macd=diffSeries(macdFast,macdSlow),macdSig=emaSeries(macd,9);
  const macdLine=safeDiv(last(macd),p),macdSignal=safeDiv(last(macdSig),p),macdHist=last(macd)!=null&&last(macdSig)!=null?(last(macd)-last(macdSig))/p:null;
  const ppoLine=last(macdSlow)&&last(macdFast)!=null?(last(macdFast)-last(macdSlow))/last(macdSlow):null;
  const ppoSeries=c.map((_,i)=>finite(macdFast[i])!=null&&finite(macdSlow[i])!=null&&macdSlow[i]!==0?(macdFast[i]-macdSlow[i])/macdSlow[i]:null);
  const ppoSignal=last(emaSeries(ppoSeries,9));
  const trixBase=emaSeries(emaSeries(emaSeries(c,15),15),15),trix=trixBase.length>1&&last(trixBase,1)>0?last(trixBase)/last(trixBase,1)-1:null;
  const dpoPeriod=20,dpoShift=Math.floor(dpoPeriod/2)+1,dpoIndex=c.length-1-dpoShift,dpoSma=smaSeries(c,dpoPeriod);
  const dpo=dpoIndex>=0&&finite(dpoSma[dpoIndex])!=null?(c[dpoIndex]-dpoSma[dpoIndex])/p:null;

  const atr14s=atrSeries(rows,14),atr14=last(atr14s),atr21=last(atrSeries(rows,21));
  const bbSd=std(c.slice(-20)),bbMid=sma20,bbUpper=bbMid!=null&&bbSd!=null?bbMid+2*bbSd:null,bbLower=bbMid!=null&&bbSd!=null?bbMid-2*bbSd:null;
  const bbPos=bbUpper!=null&&bbLower!=null&&bbUpper!==bbLower?(p-bbLower)/(bbUpper-bbLower):null;
  const bbWidth=bbMid&&bbUpper!=null&&bbLower!=null?(bbUpper-bbLower)/bbMid:null;
  const kelAtr=last(atrSeries(rows,10)),kelUp=ema20!=null&&kelAtr!=null?ema20+2*kelAtr:null,kelDn=ema20!=null&&kelAtr!=null?ema20-2*kelAtr:null;
  const kelPos=kelUp!=null&&kelDn!=null&&kelUp!==kelDn?(p-kelDn)/(kelUp-kelDn):null;
  const kelWidth=ema20&&kelUp!=null&&kelDn!=null?(kelUp-kelDn)/ema20:null;
  const don=(period)=>{
    if(rows.length<period)return {pos:null,width:null};
    const w=rows.slice(-period),hi=Math.max(...w.map(x=>x.h)),lo=Math.min(...w.map(x=>x.l));
    return {pos:hi===lo?.5:(p-lo)/(hi-lo),width:p>0?(hi-lo)/p:null};
  };
  const don20=don(20),don55=don(55);
  const adx=adxSeries(rows,14),ar=aroon(rows,25),vx=vortex(rows,14),chop=choppiness(rows,14),sup=supertrend(rows,10,3),psar=parabolicSar(rows);
  const tenkan=rows.length>=9?(()=>{
    const w=rows.slice(-9);return (Math.max(...w.map(x=>x.h))+Math.min(...w.map(x=>x.l)))/2;
  })():null;
  const kijun=rows.length>=26?(()=>{
    const w=rows.slice(-26);return (Math.max(...w.map(x=>x.h))+Math.min(...w.map(x=>x.l)))/2;
  })():null;
  const spanB=rows.length>=52?(()=>{
    const w=rows.slice(-52);return (Math.max(...w.map(x=>x.h))+Math.min(...w.map(x=>x.l)))/2;
  })():null;
  const spanA=tenkan!=null&&kijun!=null?(tenkan+kijun)/2:null;
  const cloudTop=spanA!=null&&spanB!=null?Math.max(spanA,spanB):null,cloudBottom=spanA!=null&&spanB!=null?Math.min(spanA,spanB):null;

  const vwap20=rollingVwap(rows,20),vwap50=rollingVwap(rows,50);
  const obv=obvSeries(rows),ad=accumulationDistribution(rows),chaikin=diffSeries(emaSeries(ad,3),emaSeries(ad,10));
  const force=last(forceIndexSeries(rows,13)),avgVol=mean(v.slice(-20));
  const eom=easeOfMovement(rows,14);
  const nv=negativePositiveVolume(rows),nviR=nv.nvi.length>10&&nv.nvi[nv.nvi.length-11]>0?last(nv.nvi)/nv.nvi[nv.nvi.length-11]-1:null,pviR=nv.pvi.length>10&&nv.pvi[nv.pvi.length-11]>0?last(nv.pvi)/nv.pvi[nv.pvi.length-11]-1:null;
  const k=kst(c);
  const elderEma=last(ema13s),mass=massIndex(rows),rvi=rows.length>=10?safeDiv(mean(rows.slice(-10).map(x=>x.c-x.o)),mean(rows.slice(-10).map(x=>x.h-x.l))):null;
  const bop=rows.length?safeDiv(last(rows).c-last(rows).o,last(rows).h-last(rows).l):null;
  const qstick=mean(rows.slice(-10).map(x=>x.c-x.o))/p;
  const pvt=Array(rows.length).fill(0);
  for(let i=1;i<rows.length;i++)pvt[i]=pvt[i-1]+(rows[i-1].c?rows[i].v*(rows[i].c/rows[i-1].c-1):0);
  const rangeEma=emaSeries(rows.map(x=>x.h-x.l),10),chaikinVol=rangeEma.length>10&&last(rangeEma,10)>0?last(rangeEma)/last(rangeEma,10)-1:null;
  const ulcer=rows.length>=14?(()=>{
    let peak=-Infinity;const dd=[];
    for(const x of rows.slice(-14)){peak=Math.max(peak,x.c);dd.push(peak>0?(x.c/peak-1):0);}
    return Math.sqrt(mean(dd.map(x=>x*x)));
  })():null;

  return {
    sma10Distance:pctDistance(p,sma10),sma20Distance:pctDistance(p,sma20),sma50Distance:pctDistance(p,sma50),sma100Distance:pctDistance(p,sma100),
    ema9Distance:pctDistance(p,ema9),ema21Distance:pctDistance(p,ema21),ema50Distance:pctDistance(p,ema50),
    dema20Distance:pctDistance(p,dema20),tema20Distance:pctDistance(p,tema20),hma20Distance:pctDistance(p,hma20),kama20Distance:pctDistance(p,kama),zlema20Distance:pctDistance(p,zlema20),
    rsi7,rsi14,rsi21,stochK14:last(st.k),stochD3:last(st.d),stochRsi14:srsi,williamsR14:will,cci20,mfi14,tsi25_13:tsi,ultimateOsc:ult,awesomeOscPct:ao,
    macdLinePct:macdLine,macdSignalPct:macdSignal,macdHistPct:macdHist,ppoLine,ppoSignal,ppoHist:ppoLine!=null&&ppoSignal!=null?ppoLine-ppoSignal:null,
    roc5:last(rocSeries(c,5)),roc10:last(rocSeries(c,10)),roc20:last(rocSeries(c,20)),momentum10:c.length>10?(p-c[c.length-11])/p:null,
    trix15:trix,dpo20Pct:dpo,cmo14:cmo(c,14),kst:k.kst,kstSignal:k.signal,kstHist:k.hist,coppock:coppock(c),
    atr14Pct:atr14!=null?atr14/p:null,atr21Pct:atr21!=null?atr21/p:null,
    bbPosition20:bbPos,bbWidth20:bbWidth,keltnerPosition20:kelPos,keltnerWidth20:kelWidth,
    donchianPosition20:don20.pos,donchianWidth20:don20.width,donchianPosition55:don55.pos,donchianWidth55:don55.width,
    histVol10:historicalVol(c,10),histVol20:historicalVol(c,20),histVol60:historicalVol(c,60),
    adx14:last(adx.adx),diPlus14:last(adx.pdi),diMinus14:last(adx.mdi),diSpread14:last(adx.pdi)!=null&&last(adx.mdi)!=null?last(adx.pdi)-last(adx.mdi):null,
    aroonUp25:ar.up,aroonDown25:ar.down,aroonOsc25:ar.osc,vortexPlus14:vx.plus,vortexMinus14:vx.minus,vortexDiff14:vx.diff,choppiness14:chop,
    supertrendDirection:sup.direction,supertrendDistance:sup.distance,
    ichimokuTenkanKijunSpread:tenkan!=null&&kijun!=null?(tenkan-kijun)/p:null,
    ichimokuCloudDistance:cloudTop!=null&&cloudBottom!=null?(p>(cloudTop)?(p-cloudTop)/p:p<cloudBottom?(p-cloudBottom)/p:0):null,
    ichimokuCloudThickness:spanA!=null&&spanB!=null?Math.abs(spanA-spanB)/p:null,
    psarDirection:psar.direction,psarDistance:psar.distance,
    vwap20Distance:pctDistance(p,vwap20),vwap50Distance:pctDistance(p,vwap50),
    obvSlope10:normalizedSlope(obv,rows,10),obvSlope20:normalizedSlope(obv,rows,20),cmf20:cmf(rows,20),
    adSlope10:normalizedSlope(ad,rows,10),chaikinOsc:avgVol>0?safeDiv(last(chaikin),avgVol):null,
    forceIndex13:avgVol&&p?safeDiv(force,avgVol*p):null,eom14:p?eom/p:null,volumeRoc10:v.length>10&&v[v.length-11]>0?v.at(-1)/v[v.length-11]-1:null,
    volumeZ20:volumeZ(rows,20),priceZ20:priceZ(rows,20),massIndex25:mass,rvi10:rvi,balanceOfPower:bop,
    nviSlope10:nviR,pviSlope10:pviR,fisher10:fisher(rows,10),
    elderBullPower:elderEma!=null?(last(h)-elderEma)/p:null,elderBearPower:elderEma!=null?(last(l)-elderEma)/p:null,
    qstick10:qstick,pvtSlope10:normalizedSlope(pvt,rows,10),chaikinVolatility10:chaikinVol,ulcerIndex14:ulcer
  };
}

const FAMILY_DEFS=Object.freeze([
  ['SMA_STACK','Simple Moving Average Stack',['sma10Distance','sma20Distance','sma50Distance','sma100Distance'],'sma20Distance'],
  ['EMA_STACK','Exponential Moving Average Stack',['ema9Distance','ema21Distance','ema50Distance'],'ema21Distance'],
  ['ADVANCED_MA','DEMA/TEMA/HMA/KAMA/ZLEMA',['dema20Distance','tema20Distance','hma20Distance','kama20Distance','zlema20Distance'],'hma20Distance'],
  ['RSI','Relative Strength Index',['rsi7','rsi14','rsi21'],'rsi14'],
  ['STOCHASTIC','Stochastic Oscillator',['stochK14','stochD3'],'stochK14'],
  ['STOCH_RSI','Stochastic RSI',['stochRsi14'],'stochRsi14'],
  ['WILLIAMS_R','Williams %R',['williamsR14'],'williamsR14'],
  ['CCI','Commodity Channel Index',['cci20'],'cci20'],
  ['MFI','Money Flow Index',['mfi14'],'mfi14'],
  ['TSI','True Strength Index',['tsi25_13'],'tsi25_13'],
  ['ULTIMATE_OSC','Ultimate Oscillator',['ultimateOsc'],'ultimateOsc'],
  ['AWESOME_OSC','Awesome Oscillator',['awesomeOscPct'],'awesomeOscPct'],
  ['MACD','MACD',['macdLinePct','macdSignalPct','macdHistPct'],'macdHistPct'],
  ['PPO','Percentage Price Oscillator',['ppoLine','ppoSignal','ppoHist'],'ppoHist'],
  ['ROC','Rate of Change',['roc5','roc10','roc20'],'roc10'],
  ['MOMENTUM','Price Momentum',['momentum10'],'momentum10'],
  ['TRIX','TRIX',['trix15'],'trix15'],
  ['DPO','Detrended Price Oscillator',['dpo20Pct'],'dpo20Pct'],
  ['CMO','Chande Momentum Oscillator',['cmo14'],'cmo14'],
  ['KST','Know Sure Thing',['kst','kstSignal','kstHist'],'kstHist'],
  ['COPPOCK','Coppock Curve',['coppock'],'coppock'],
  ['ATR','Average True Range',['atr14Pct','atr21Pct'],'atr14Pct'],
  ['BOLLINGER','Bollinger Bands',['bbPosition20','bbWidth20'],'bbPosition20'],
  ['KELTNER','Keltner Channels',['keltnerPosition20','keltnerWidth20'],'keltnerPosition20'],
  ['DONCHIAN','Donchian Channels',['donchianPosition20','donchianWidth20','donchianPosition55','donchianWidth55'],'donchianPosition20'],
  ['HIST_VOL','Historical Volatility',['histVol10','histVol20','histVol60'],'histVol20'],
  ['ADX_DMI','ADX / Directional Movement',['adx14','diPlus14','diMinus14','diSpread14'],'adx14'],
  ['AROON','Aroon',['aroonUp25','aroonDown25','aroonOsc25'],'aroonOsc25'],
  ['VORTEX','Vortex Indicator',['vortexPlus14','vortexMinus14','vortexDiff14'],'vortexDiff14'],
  ['CHOPPINESS','Choppiness Index',['choppiness14'],'choppiness14'],
  ['SUPERTREND','Supertrend',['supertrendDirection','supertrendDistance'],'supertrendDistance'],
  ['ICHIMOKU','Ichimoku Cloud',['ichimokuTenkanKijunSpread','ichimokuCloudDistance','ichimokuCloudThickness'],'ichimokuCloudDistance'],
  ['PARABOLIC_SAR','Parabolic SAR',['psarDirection','psarDistance'],'psarDistance'],
  ['VWAP','Rolling VWAP',['vwap20Distance','vwap50Distance'],'vwap20Distance'],
  ['OBV','On Balance Volume',['obvSlope10','obvSlope20'],'obvSlope10'],
  ['CMF','Chaikin Money Flow',['cmf20'],'cmf20'],
  ['ACCUM_DIST','Accumulation Distribution',['adSlope10'],'adSlope10'],
  ['CHAIKIN_OSC','Chaikin Oscillator',['chaikinOsc'],'chaikinOsc'],
  ['FORCE_INDEX','Force Index',['forceIndex13'],'forceIndex13'],
  ['EOM','Ease of Movement',['eom14'],'eom14'],
  ['VOLUME_ROC','Volume ROC',['volumeRoc10'],'volumeRoc10'],
  ['VOLUME_Z','Volume Z-Score',['volumeZ20'],'volumeZ20'],
  ['PRICE_Z','Price Z-Score',['priceZ20'],'priceZ20'],
  ['MASS_INDEX','Mass Index',['massIndex25'],'massIndex25'],
  ['RVI','Relative Vigor Index',['rvi10'],'rvi10'],
  ['BOP','Balance of Power',['balanceOfPower'],'balanceOfPower'],
  ['NVI','Negative Volume Index',['nviSlope10'],'nviSlope10'],
  ['PVI','Positive Volume Index',['pviSlope10'],'pviSlope10'],
  ['FISHER','Fisher Transform',['fisher10'],'fisher10'],
  ['ELDER_RAY','Elder Ray',['elderBullPower','elderBearPower'],'elderBullPower'],
  ['QSTICK','Qstick',['qstick10'],'qstick10'],
  ['PVT','Price Volume Trend',['pvtSlope10'],'pvtSlope10'],
  ['CHAIKIN_VOL','Chaikin Volatility',['chaikinVolatility10'],'chaikinVolatility10'],
  ['ULCER_INDEX','Ulcer Index',['ulcerIndex14'],'ulcerIndex14']
]);

function featureId(tf,key){return 'research.ta.'+String(tf)+'.'+String(key);}
export const TECHNICAL_INDICATOR_FAMILIES=Object.freeze(FAMILY_DEFS.map(([id,label,keys,representativeKey])=>Object.freeze({
  id,label,keys:Object.freeze([...keys]),representativeKey
})));

export const TECHNICAL_INDICATOR_EXPERIMENTS=Object.freeze(
  TECHNICAL_INDICATOR_TIMEFRAMES.flatMap(tf=>
    TECHNICAL_INDICATOR_FAMILIES.map(f=>Object.freeze({
      id:'TA_'+String(tf).toUpperCase()+'_'+f.id,
      label:f.label+' · '+String(tf).toUpperCase(),
      family:f.id,
      timeframe:tf,
      featureIds:Object.freeze(f.keys.map(k=>featureId(tf,k))),
      representativeFeatureId:featureId(tf,f.representativeKey),
      source:TECHNICAL_INDICATOR_FACTORY_VERSION
    }))
  )
);

export function buildTechnicalIndicatorFeatures(candlesByTf,{asOf=Date.now(),timeframes=TECHNICAL_INDICATOR_TIMEFRAMES}={}){
  const rows=[];
  const coverage={};
  for(const tf of timeframes){
    const candles=closesOnly(candlesByTf?.[tf],asOf);
    if(!candles.length){
      coverage[tf]={bars:0,features:0,lastClosedAt:null};
      continue;
    }
    const snapshot=indicatorSnapshot(candles);
    let count=0;
    for(const [key,value] of Object.entries(snapshot)){
      const n=finite(value);
      if(n==null)continue;
      rows.push(Object.freeze({
        id:featureId(tf,key),
        value:n,
        availableAt:Number(last(candles).closeTime),
        source:TECHNICAL_INDICATOR_FACTORY_VERSION,
        domain:'TECHNICAL_INDICATOR',
        timeframe:tf
      }));
      count++;
    }
    coverage[tf]={bars:candles.length,features:count,lastClosedAt:Number(last(candles).closeTime)};
  }
  return Object.freeze({
    version:TECHNICAL_INDICATOR_FACTORY_VERSION,
    asOf:Number(asOf),
    features:Object.freeze(rows),
    coverage:Object.freeze(coverage),
    familyCount:TECHNICAL_INDICATOR_FAMILIES.length,
    experimentCount:TECHNICAL_INDICATOR_EXPERIMENTS.length,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function technicalIndicatorFeatureSummary(result){
  return Object.freeze({
    version:TECHNICAL_INDICATOR_FACTORY_VERSION,
    features:Array.isArray(result?.features)?result.features.length:0,
    familyCount:TECHNICAL_INDICATOR_FAMILIES.length,
    experimentCount:TECHNICAL_INDICATOR_EXPERIMENTS.length,
    timeframes:[...TECHNICAL_INDICATOR_TIMEFRAMES],
    coverage:result?.coverage||{},
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}
