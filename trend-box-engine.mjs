import { sha256 } from './institutional-kernel.mjs';

export const TREND_BOX_ENGINE_VERSION='BIGGJ_TREND_BOX_ENGINE_V1';
export const TREND_BOX_SCALES=Object.freeze(['XS','S','M','L','XL']);

export const DEFAULT_TREND_BOX_CONFIG=Object.freeze({
  atrPeriod:14,
  minBars:20,
  riskConfirmBars:2,
  scales:Object.freeze({
    XS:Object.freeze({startAtr:.45,reversalAtr:.55}),
    S:Object.freeze({startAtr:.75,reversalAtr:.85}),
    M:Object.freeze({startAtr:1.25,reversalAtr:1.35}),
    L:Object.freeze({startAtr:2.10,reversalAtr:2.25}),
    XL:Object.freeze({startAtr:3.50,reversalAtr:3.75})
  })
});

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,Number(v)));}
function sortedClosedCandles(input,asOf=Number.POSITIVE_INFINITY){
  return (Array.isArray(input)?input:[])
    .filter(x=>x?.closed===true&&finite(x?.closeTime)!=null&&Number(x.closeTime)<=Number(asOf))
    .map((x,i)=>({
      sourceIndex:i,
      openTime:Number(x.openTime),
      closeTime:Number(x.closeTime),
      o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),
      v:Number.isFinite(Number(x.v))?Number(x.v):0
    }))
    .filter(x=>[x.openTime,x.closeTime,x.o,x.h,x.l,x.c].every(Number.isFinite)&&x.h>0&&x.l>0&&x.c>0&&x.o>0)
    .sort((a,b)=>a.closeTime-b.closeTime||a.openTime-b.openTime);
}
function trueRanges(rows){
  return rows.map((x,i)=>{
    if(i===0)return Math.max(0,x.h-x.l);
    const pc=rows[i-1].c;
    return Math.max(x.h-x.l,Math.abs(x.h-pc),Math.abs(x.l-pc));
  });
}
function rma(values,period){
  const out=Array(values.length).fill(null);
  let acc=0,r=null;
  for(let i=0;i<values.length;i++){
    const x=Number(values[i]);
    if(!Number.isFinite(x))continue;
    if(i<period){acc+=x;if(i===period-1){r=acc/period;out[i]=r;}continue;}
    r=((period-1)*r+x)/period;
    out[i]=r;
  }
  return out;
}
function boxId(scale,direction,startTime){
  return 'tb_'+sha256({v:TREND_BOX_ENGINE_VERSION,scale,direction,startTime:Number(startTime)}).slice(0,22);
}
function makeBox({scale,direction,startIndex,startTime,startPrice,thresholds}){
  return {
    id:boxId(scale,direction,startTime),
    version:TREND_BOX_ENGINE_VERSION,
    scale,
    direction,
    status:'ACTIVE',
    startIndex:Number(startIndex),
    endIndex:null,
    startTime:Number(startTime),
    endTime:null,
    detectedAt:Number(startTime),
    confirmedAt:null,
    startPrice:Number(startPrice),
    endPrice:null,
    high:Number(startPrice),
    low:Number(startPrice),
    highAt:Number(startTime),
    lowAt:Number(startTime),
    bars:0,
    durationMs:0,
    returnPct:null,
    atrMove:null,
    thresholdStartAtr:Number(thresholds.startAtr),
    thresholdReversalAtr:Number(thresholds.reversalAtr),
    termination:null
  };
}
function updateExtremes(box,candle,index){
  box.bars=Math.max(1,Number(index)-Number(box.startIndex)+1);
  box.durationMs=Math.max(0,Number(candle.closeTime)-Number(box.startTime));
  if(candle.h>box.high){box.high=candle.h;box.highAt=candle.closeTime;box.highIndex=index;}
  if(candle.l<box.low){box.low=candle.l;box.lowAt=candle.closeTime;box.lowIndex=index;}
}
function finalizeBox(box,{endIndex,endTime,endPrice,confirmedAt,trigger,confirmation,atrAtConfirmation}){
  box.status='CLOSED';
  box.endIndex=Number(endIndex);
  box.endTime=Number(endTime);
  box.endPrice=Number(endPrice);
  box.confirmedAt=Number(confirmedAt);
  box.durationMs=Math.max(0,box.endTime-box.startTime);
  box.bars=Math.max(1,box.endIndex-box.startIndex+1);
  box.returnPct=box.startPrice>0?box.endPrice/box.startPrice-1:null;
  box.atrMove=Number.isFinite(Number(atrAtConfirmation))&&Number(atrAtConfirmation)>0
    ?Math.abs(box.endPrice-box.startPrice)/Number(atrAtConfirmation)
    :null;
  box.termination={
    trigger:String(trigger),
    confirmation:String(confirmation),
    reversalPivotTime:box.endTime,
    reversalPivotPrice:box.endPrice,
    confirmedAt:Number(confirmedAt),
    confirmationLagMs:Math.max(0,Number(confirmedAt)-Number(endTime))
  };
  return box;
}
function riskSnapshot({direction,extremePrice,extremeTime,extremeIndex,breakLevel,startedAt,startedIndex,count}){
  return {
    direction,
    extremePrice:Number(extremePrice),
    extremeTime:Number(extremeTime),
    extremeIndex:Number(extremeIndex),
    breakLevel:Number(breakLevel),
    startedAt:Number(startedAt),
    startedIndex:Number(startedIndex),
    count:Number(count)
  };
}

export function buildTrendBoxes(candlesInput,{
  asOf=Date.now(),
  config=DEFAULT_TREND_BOX_CONFIG,
  scales=TREND_BOX_SCALES
}={}){
  const rows=sortedClosedCandles(candlesInput,asOf);
  const cfg={...DEFAULT_TREND_BOX_CONFIG,...(config||{}),scales:{...DEFAULT_TREND_BOX_CONFIG.scales,...(config?.scales||{})}};
  const atr=rma(trueRanges(rows),Math.max(2,Number(cfg.atrPeriod)||14));
  const output={};

  for(const scale of scales){
    const threshold=cfg.scales?.[scale];
    if(!threshold)continue;
    const boxes=[];
    let active=null,risk=null;
    let seedHigh=null,seedLow=null,seedHighIndex=null,seedLowIndex=null;

    for(let i=0;i<rows.length;i++){
      const c=rows[i],a=finite(atr[i]);
      if(!(a>0))continue;

      if(!active){
        if(seedHigh==null){
          seedHigh=c.h;seedLow=c.l;seedHighIndex=i;seedLowIndex=i;
          continue;
        }
        if(c.h>seedHigh){seedHigh=c.h;seedHighIndex=i;}
        if(c.l<seedLow){seedLow=c.l;seedLowIndex=i;}
        const upMove=seedLow>0?(c.c-seedLow)/a:0;
        const downMove=seedHigh>0?(seedHigh-c.c)/a:0;
        if(upMove>=Number(threshold.startAtr)){
          const s=rows[seedLowIndex];
          active=makeBox({scale,direction:'UP',startIndex:seedLowIndex,startTime:s.closeTime,startPrice:seedLow,thresholds:threshold});
          for(let j=seedLowIndex;j<=i;j++)updateExtremes(active,rows[j],j);
          seedHigh=null;seedLow=null;seedHighIndex=null;seedLowIndex=null;
        }else if(downMove>=Number(threshold.startAtr)){
          const s=rows[seedHighIndex];
          active=makeBox({scale,direction:'DOWN',startIndex:seedHighIndex,startTime:s.closeTime,startPrice:seedHigh,thresholds:threshold});
          for(let j=seedHighIndex;j<=i;j++)updateExtremes(active,rows[j],j);
          seedHigh=null;seedLow=null;seedHighIndex=null;seedLowIndex=null;
        }
        continue;
      }

      updateExtremes(active,c,i);

      if(active.direction==='UP'){
        if(c.h>=active.high){
          if(risk)active.status='ACTIVE';
          risk=null;
        }
        const reversalDistance=(active.high-c.c)/a;
        if(reversalDistance>=Number(threshold.reversalAtr)){
          if(!risk){
            risk=riskSnapshot({
              direction:'DOWN',
              extremePrice:active.high,
              extremeTime:active.highAt,
              extremeIndex:Number(active.highIndex??i),
              breakLevel:active.high-Number(threshold.reversalAtr)*a,
              startedAt:c.closeTime,
              startedIndex:i,
              count:1
            });
            active.status='AT_RISK';
          }else{
            risk.count++;
          }
          const confirms=risk.count>=Math.max(1,Number(cfg.riskConfirmBars)||2)&&c.c<risk.breakLevel;
          if(confirms){
            finalizeBox(active,{
              endIndex:risk.extremeIndex,endTime:risk.extremeTime,endPrice:risk.extremePrice,
              confirmedAt:c.closeTime,trigger:'UP_REVERSAL_DISTANCE',confirmation:'PERSISTENT_CLOSE_BELOW_REVERSAL_THRESHOLD',
              atrAtConfirmation:a
            });
            boxes.push(active);
            active=makeBox({
              scale,direction:'DOWN',startIndex:risk.extremeIndex,startTime:risk.extremeTime,
              startPrice:risk.extremePrice,thresholds:threshold
            });
            for(let j=Math.max(risk.extremeIndex,0);j<=i;j++)updateExtremes(active,rows[j],j);
            risk=null;
          }
        }else if(risk){
          risk=null;active.status='ACTIVE';
        }
      }else{
        if(c.l<=active.low){
          if(risk)active.status='ACTIVE';
          risk=null;
        }
        const reversalDistance=(c.c-active.low)/a;
        if(reversalDistance>=Number(threshold.reversalAtr)){
          if(!risk){
            risk=riskSnapshot({
              direction:'UP',
              extremePrice:active.low,
              extremeTime:active.lowAt,
              extremeIndex:Number(active.lowIndex??i),
              breakLevel:active.low+Number(threshold.reversalAtr)*a,
              startedAt:c.closeTime,
              startedIndex:i,
              count:1
            });
            active.status='AT_RISK';
          }else{
            risk.count++;
          }
          const confirms=risk.count>=Math.max(1,Number(cfg.riskConfirmBars)||2)&&c.c>risk.breakLevel;
          if(confirms){
            finalizeBox(active,{
              endIndex:risk.extremeIndex,endTime:risk.extremeTime,endPrice:risk.extremePrice,
              confirmedAt:c.closeTime,trigger:'DOWN_REVERSAL_DISTANCE',confirmation:'PERSISTENT_CLOSE_ABOVE_REVERSAL_THRESHOLD',
              atrAtConfirmation:a
            });
            boxes.push(active);
            active=makeBox({
              scale,direction:'UP',startIndex:risk.extremeIndex,startTime:risk.extremeTime,
              startPrice:risk.extremePrice,thresholds:threshold
            });
            for(let j=Math.max(risk.extremeIndex,0);j<=i;j++)updateExtremes(active,rows[j],j);
            risk=null;
          }
        }else if(risk){
          risk=null;active.status='ACTIVE';
        }
      }
    }

    if(active){
      const last=rows.at(-1);
      if(last){
        active.endIndex=rows.length-1;
        active.endTime=last.closeTime;
        active.endPrice=last.c;
        active.durationMs=Math.max(0,last.closeTime-active.startTime);
        active.returnPct=active.startPrice>0?last.c/active.startPrice-1:null;
        const latestAtr=finite(atr.at(-1));
        active.atrMove=latestAtr>0?Math.abs(last.c-active.startPrice)/latestAtr:null;
        if(risk)active.risk=Object.freeze({...risk});
      }
    }

    output[scale]=Object.freeze({
      scale,
      config:Object.freeze({
        startAtr:Number(threshold.startAtr),
        reversalAtr:Number(threshold.reversalAtr),
        riskConfirmBars:Math.max(1,Number(cfg.riskConfirmBars)||2)
      }),
      boxes:Object.freeze(boxes.map(x=>Object.freeze(structuredClone(x)))),
      active:active?Object.freeze(structuredClone(active)):null,
      closedCount:boxes.length,
      status:active?String(active.status):'NO_BOX'
    });
  }

  return Object.freeze({
    version:TREND_BOX_ENGINE_VERSION,
    asOf:Number(asOf),
    candleCount:rows.length,
    atrPeriod:Number(cfg.atrPeriod),
    scales:Object.freeze(output),
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    futureLeakageGuard:'PIVOT_TIME_AND_CONFIRMATION_TIME_STORED_SEPARATELY'
  });
}

export function trendBoxesForScale(result,scale='M',{limit=16,includeActive=true}={}){
  const key=String(scale||'M').toUpperCase();
  if(key==='ALL'){
    return TREND_BOX_SCALES.flatMap(s=>{
      const x=result?.scales?.[s];
      if(!x)return[];
      return [
        ...(x.boxes||[]).slice(-Math.max(1,Math.floor(limit/TREND_BOX_SCALES.length))),
        ...(includeActive&&x.active?[x.active]:[])
      ];
    }).sort((a,b)=>Number(a.startTime)-Number(b.startTime));
  }
  const x=result?.scales?.[key];
  if(!x)return[];
  return [
    ...(x.boxes||[]).slice(-Math.max(1,Number(limit)||16)),
    ...(includeActive&&x.active?[x.active]:[])
  ];
}

export function trendBoxSummary(result){
  const scales={};
  for(const s of TREND_BOX_SCALES){
    const x=result?.scales?.[s]||{};
    scales[s]={
      status:x.status||'NO_BOX',
      closedCount:Number(x.closedCount||0),
      active:x.active?{
        id:x.active.id,
        direction:x.active.direction,
        status:x.active.status,
        startTime:x.active.startTime,
        endTime:x.active.endTime,
        startPrice:x.active.startPrice,
        endPrice:x.active.endPrice,
        returnPct:x.active.returnPct,
        atrMove:x.active.atrMove,
        bars:x.active.bars,
        risk:x.active.risk||null
      }:null
    };
  }
  return Object.freeze({
    version:TREND_BOX_ENGINE_VERSION,
    asOf:result?.asOf??null,
    candleCount:Number(result?.candleCount||0),
    scales:Object.freeze(scales),
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}

export function trendBoxForecastContext(result,forecastOverlay,{scale='M'}={}){
  const key=String(scale||'M').toUpperCase();
  const active=result?.scales?.[key]?.active||null;
  if(!active||!forecastOverlay)return Object.freeze({
    available:false,scale:key,reason:!active?'NO_ACTIVE_BOX':'NO_FORECAST_OVERLAY'
  });
  const anchor=finite(forecastOverlay.anchorPrice);
  const horizons=(forecastOverlay.horizons||[]).filter(x=>finite(x?.medianPrice)!=null);
  const last=horizons.at(-1)||null;
  const median=finite(last?.medianPrice);
  const forecastDirection=anchor!=null&&median!=null?(median>anchor?'UP':median<anchor?'DOWN':'FLAT'):'UNKNOWN';
  const alignment=forecastDirection==='UNKNOWN'||forecastDirection==='FLAT'
    ?'NEUTRAL'
    :forecastDirection===active.direction?'ALIGNED':'OPPOSED';
  return Object.freeze({
    available:true,
    scale:key,
    boxId:active.id,
    boxDirection:active.direction,
    boxStatus:active.status,
    boxReturnPct:finite(active.returnPct),
    boxAtrMove:finite(active.atrMove),
    forecastDirection,
    alignment,
    horizonId:last?.horizonId||null,
    horizonMs:finite(last?.horizonMs),
    medianPrice:median,
    anchorPrice:anchor,
    probabilistic:true,
    authority:'NONE'
  });
}
