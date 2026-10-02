export const TREND_BOX_ENGINE_VERSION='BIGGJ_TREND_BOX_ENGINE_V1';

export const TREND_BOX_SCALES=Object.freeze({
  XS:Object.freeze({atrMultiplier:.35,warningRatio:.62,minBars:2,label:'MICRO'}),
  S:Object.freeze({atrMultiplier:.70,warningRatio:.64,minBars:3,label:'SMALL'}),
  M:Object.freeze({atrMultiplier:1.40,warningRatio:.66,minBars:4,label:'MEDIUM'}),
  L:Object.freeze({atrMultiplier:2.80,warningRatio:.68,minBars:6,label:'LARGE'}),
  XL:Object.freeze({atrMultiplier:5.60,warningRatio:.70,minBars:10,label:'MACRO'})
});

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function closedCandles(candles,asOf){
  return (Array.isArray(candles)?candles:[])
    .filter(c=>c?.closed===true&&finite(c?.closeTime)!=null&&Number(c.closeTime)<=Number(asOf))
    .map((c,i)=>({
      originalIndex:i,
      openTime:Number(c.openTime),
      closeTime:Number(c.closeTime),
      o:Number(c.o),h:Number(c.h),l:Number(c.l),c:Number(c.c),v:Math.max(0,Number(c.v)||0)
    }))
    .filter(c=>[c.o,c.h,c.l,c.c,c.openTime,c.closeTime].every(Number.isFinite)&&c.o>0&&c.h>0&&c.l>0&&c.c>0);
}
function trueRange(rows,i){
  const c=rows[i];
  if(!c)return null;
  if(i===0)return c.h-c.l;
  const p=rows[i-1].c;
  return Math.max(c.h-c.l,Math.abs(c.h-p),Math.abs(c.l-p));
}
function atrSeries(rows,period=14){
  const out=Array(rows.length).fill(null);
  let prev=null;
  const seed=[];
  for(let i=0;i<rows.length;i++){
    const tr=trueRange(rows,i);
    if(!Number.isFinite(tr))continue;
    if(i<period){
      seed.push(tr);
      if(i===period-1){
        prev=seed.reduce((s,x)=>s+x,0)/seed.length;
        out[i]=prev;
      }
      continue;
    }
    prev=prev==null?tr:((period-1)*prev+tr)/period;
    out[i]=prev;
  }
  return out;
}
function thresholdAt(rows,atr,i,scale){
  const cfg=TREND_BOX_SCALES[scale];
  const a=finite(atr[i]);
  const p=finite(rows[i]?.c);
  if(!(p>0))return null;
  const volatility=a!=null&&a>0?a:p*.0025;
  return Math.max(volatility*cfg.atrMultiplier,p*.00025);
}
function rangeStats(rows,startIndex,endIndex){
  const a=Math.max(0,Math.min(startIndex,endIndex));
  const b=Math.min(rows.length-1,Math.max(startIndex,endIndex));
  const w=rows.slice(a,b+1);
  return {
    high:w.length?Math.max(...w.map(x=>x.h)):null,
    low:w.length?Math.min(...w.map(x=>x.l)):null,
    bars:w.length,
    volume:w.reduce((s,x)=>s+(Number(x.v)||0),0)
  };
}
function directionLabel(d){return d==='UP'?'UP':'DOWN';}
function boxId(scale,startTime,direction,generation){
  return 'tb_'+String(scale).toLowerCase()+'_'+String(startTime)+'_'+String(direction).toLowerCase()+'_'+String(generation);
}
function boxReturn(startPrice,endPrice,direction){
  if(!(startPrice>0)||!(endPrice>0))return null;
  const raw=endPrice/startPrice-1;
  return direction==='UP'?raw:-raw;
}
function finalizeClosedBox(active,rows,{endIndex,endPrice,confirmedAt,confirmationIndex,threshold,scale,generation}){
  const stats=rangeStats(rows,active.startIndex,endIndex);
  return Object.freeze({
    id:boxId(scale,active.startTime,active.direction,generation),
    scale,
    scaleLabel:TREND_BOX_SCALES[scale].label,
    direction:directionLabel(active.direction),
    status:'CLOSED',
    startIndex:active.startIndex,
    endIndex,
    startTime:active.startTime,
    endTime:Number(rows[endIndex]?.openTime??rows[endIndex]?.closeTime),
    openedAt:active.openedAt,
    confirmedAt:Number(confirmedAt),
    confirmationIndex:Number(confirmationIndex),
    confirmationLagBars:Math.max(0,Number(confirmationIndex)-Number(endIndex)),
    startPrice:Number(active.startPrice),
    endPrice:Number(endPrice),
    high:stats.high,
    low:stats.low,
    bars:stats.bars,
    volume:stats.volume,
    returnInDirection:boxReturn(active.startPrice,endPrice,active.direction),
    reversalThreshold:Number(threshold),
    breakReason:'ATR_REVERSAL_CONFIRMED',
    pointInTime:{
      pivotTime:Number(rows[endIndex]?.openTime??rows[endIndex]?.closeTime),
      detectedAt:Number(confirmedAt),
      futureLeakage:false
    }
  });
}
function activeBoxSnapshot(active,rows,{scale,threshold,warningRatio,latestIndex,retracement,generation}){
  const stats=rangeStats(rows,active.startIndex,latestIndex);
  const riskThreshold=threshold*warningRatio;
  const status=retracement>=riskThreshold?'AT_RISK':'ACTIVE';
  const endPrice=active.direction==='UP'?active.extremePrice:active.extremePrice;
  return Object.freeze({
    id:boxId(scale,active.startTime,active.direction,generation),
    scale,
    scaleLabel:TREND_BOX_SCALES[scale].label,
    direction:directionLabel(active.direction),
    status,
    startIndex:active.startIndex,
    endIndex:latestIndex,
    startTime:active.startTime,
    endTime:Number(rows[latestIndex]?.closeTime),
    openedAt:active.openedAt,
    confirmedAt:null,
    confirmationIndex:null,
    confirmationLagBars:null,
    startPrice:Number(active.startPrice),
    endPrice:Number(endPrice),
    high:stats.high,
    low:stats.low,
    bars:stats.bars,
    volume:stats.volume,
    returnInDirection:boxReturn(active.startPrice,endPrice,active.direction),
    reversalThreshold:Number(threshold),
    warningThreshold:Number(riskThreshold),
    currentRetracement:Number(retracement),
    breakReason:null,
    pointInTime:{
      pivotTime:null,
      detectedAt:null,
      futureLeakage:false
    }
  });
}

export function buildTrendBoxes(candles,{
  asOf=Date.now(),
  scale='M',
  atrPeriod=14,
  maxBoxes=48
}={}){
  const s=String(scale||'M').toUpperCase();
  const cfg=TREND_BOX_SCALES[s];
  if(!cfg)throw new Error('INVALID_TREND_BOX_SCALE');
  const rows=closedCandles(candles,asOf);
  if(rows.length<Math.max(atrPeriod+2,cfg.minBars+2)){
    return Object.freeze({
      version:TREND_BOX_ENGINE_VERSION,scale:s,boxes:Object.freeze([]),active:null,
      status:'INSUFFICIENT_DATA',bars:rows.length,asOf:Number(asOf),execution:'SHADOW_ONLY',canExecuteLive:false
    });
  }
  const atr=atrSeries(rows,atrPeriod);
  const seedIndex=Math.max(0,atrPeriod-1);
  let candidateLowIndex=seedIndex,candidateLowPrice=rows[seedIndex].l;
  let candidateHighIndex=seedIndex,candidateHighPrice=rows[seedIndex].h;
  let active=null;
  let generation=0;
  const boxes=[];

  for(let i=seedIndex+1;i<rows.length;i++){
    const candle=rows[i];
    const threshold=thresholdAt(rows,atr,i,s);
    if(!(threshold>0))continue;

    if(!active){
      if(candle.l<candidateLowPrice){candidateLowPrice=candle.l;candidateLowIndex=i;}
      if(candle.h>candidateHighPrice){candidateHighPrice=candle.h;candidateHighIndex=i;}
      const upMove=candle.c-candidateLowPrice;
      const downMove=candidateHighPrice-candle.c;
      const upReady=upMove>=threshold&&i-candidateLowIndex>=cfg.minBars;
      const downReady=downMove>=threshold&&i-candidateHighIndex>=cfg.minBars;
      if(upReady||downReady){
        const chooseUp=upReady&&(!downReady||upMove>=downMove);
        generation++;
        active=chooseUp?{
          direction:'UP',
          startIndex:candidateLowIndex,
          startTime:rows[candidateLowIndex].openTime,
          startPrice:candidateLowPrice,
          openedAt:candle.closeTime,
          extremeIndex:i,
          extremePrice:candle.h
        }:{
          direction:'DOWN',
          startIndex:candidateHighIndex,
          startTime:rows[candidateHighIndex].openTime,
          startPrice:candidateHighPrice,
          openedAt:candle.closeTime,
          extremeIndex:i,
          extremePrice:candle.l
        };
      }
      continue;
    }

    if(active.direction==='UP'){
      if(candle.h>active.extremePrice){
        active.extremePrice=candle.h;
        active.extremeIndex=i;
      }
      const reversal=Math.max(0,active.extremePrice-candle.c);
      if(
        reversal>=threshold&&
        i-active.extremeIndex>=1&&
        active.extremeIndex-active.startIndex>=cfg.minBars
      ){
        boxes.push(finalizeClosedBox(active,rows,{
          endIndex:active.extremeIndex,
          endPrice:active.extremePrice,
          confirmedAt:candle.closeTime,
          confirmationIndex:i,
          threshold,
          scale:s,
          generation
        }));
        const pivotIndex=active.extremeIndex,pivotPrice=active.extremePrice;
        generation++;
        active={
          direction:'DOWN',
          startIndex:pivotIndex,
          startTime:rows[pivotIndex].openTime,
          startPrice:pivotPrice,
          openedAt:candle.closeTime,
          extremeIndex:i,
          extremePrice:candle.l
        };
      }
    }else{
      if(candle.l<active.extremePrice){
        active.extremePrice=candle.l;
        active.extremeIndex=i;
      }
      const reversal=Math.max(0,candle.c-active.extremePrice);
      if(
        reversal>=threshold&&
        i-active.extremeIndex>=1&&
        active.extremeIndex-active.startIndex>=cfg.minBars
      ){
        boxes.push(finalizeClosedBox(active,rows,{
          endIndex:active.extremeIndex,
          endPrice:active.extremePrice,
          confirmedAt:candle.closeTime,
          confirmationIndex:i,
          threshold,
          scale:s,
          generation
        }));
        const pivotIndex=active.extremeIndex,pivotPrice=active.extremePrice;
        generation++;
        active={
          direction:'UP',
          startIndex:pivotIndex,
          startTime:rows[pivotIndex].openTime,
          startPrice:pivotPrice,
          openedAt:candle.closeTime,
          extremeIndex:i,
          extremePrice:candle.h
        };
      }
    }
  }

  let activeSnapshot=null;
  if(active){
    const latestIndex=rows.length-1;
    const threshold=thresholdAt(rows,atr,latestIndex,s)||Math.max(rows[latestIndex].c*.00025,1e-12);
    const retracement=active.direction==='UP'
      ?Math.max(0,active.extremePrice-rows[latestIndex].c)
      :Math.max(0,rows[latestIndex].c-active.extremePrice);
    activeSnapshot=activeBoxSnapshot(active,rows,{
      scale:s,threshold,warningRatio:cfg.warningRatio,latestIndex,retracement,generation
    });
  }

  const limited=boxes.slice(-Math.max(4,Number(maxBoxes)||48));
  const combined=activeSnapshot?[...limited,activeSnapshot]:limited;
  const closed=limited.length;
  const totalDuration=limited.reduce((s,x)=>s+Number(x.bars||0),0);
  return Object.freeze({
    version:TREND_BOX_ENGINE_VERSION,
    scale:s,
    scaleLabel:cfg.label,
    status:activeSnapshot?'ACTIVE':'COLLECTING',
    boxes:Object.freeze(combined),
    closedBoxes:closed,
    active:activeSnapshot,
    bars:rows.length,
    averageClosedBars:closed?totalDuration/closed:null,
    asOf:Number(asOf),
    semantics:'POINT_IN_TIME_ATR_REVERSAL_TREND_PHASE_SEGMENTATION',
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function buildMultiScaleTrendBoxes(candles,{asOf=Date.now(),scales=Object.keys(TREND_BOX_SCALES),maxBoxes=48}={}){
  const byScale={};
  for(const scale of scales){
    const s=String(scale).toUpperCase();
    if(!TREND_BOX_SCALES[s])continue;
    byScale[s]=buildTrendBoxes(candles,{asOf,scale:s,maxBoxes});
  }
  const active=Object.fromEntries(Object.entries(byScale).map(([k,v])=>[k,v.active]));
  const directions=Object.values(active).filter(Boolean).map(x=>x.direction);
  const up=directions.filter(x=>x==='UP').length,down=directions.filter(x=>x==='DOWN').length;
  return Object.freeze({
    version:TREND_BOX_ENGINE_VERSION,
    byScale:Object.freeze(byScale),
    active:Object.freeze(active),
    alignment:Object.freeze({
      observed:directions.length,
      up,down,
      state:directions.length===0?'COLLECTING':up===directions.length?'ALL_UP':down===directions.length?'ALL_DOWN':'MIXED'
    }),
    asOf:Number(asOf),
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function trendBoxSummary(result){
  if(!result)return Object.freeze({available:false});
  return Object.freeze({
    available:true,
    version:result.version,
    scale:result.scale,
    status:result.status,
    closedBoxes:Number(result.closedBoxes||0),
    active:result.active?Object.freeze({
      id:result.active.id,
      direction:result.active.direction,
      status:result.active.status,
      bars:result.active.bars,
      startTime:result.active.startTime,
      endTime:result.active.endTime,
      returnInDirection:result.active.returnInDirection,
      confirmationLagBars:result.active.confirmationLagBars
    }):null,
    semantics:result.semantics,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}
