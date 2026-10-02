import zlib from 'node:zlib';

const CRC_TABLE=(()=>{
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
    table[n]=c>>>0;
  }
  return table;
})();

function crc32(buf){
  let c=0xffffffff;
  for(const b of buf) c=CRC_TABLE[(c^b)&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function chunk(type,data){
  const t=Buffer.from(type,'ascii');
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);
  return Buffer.concat([len,t,data,crc]);
}
function pngEncode(width,height,rgba){
  const stride=width*4;
  const raw=Buffer.alloc((stride+1)*height);
  for(let y=0;y<height;y++){
    const dst=y*(stride+1);raw[dst]=0;
    rgba.copy(raw,dst+1,y*stride,(y+1)*stride);
  }
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
  ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function color(hex,a=255){
  const v=hex.replace('#','');
  return [parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16),a];
}
function setPixel(buf,w,h,x,y,c){
  x=Math.round(x);y=Math.round(y);
  if(x<0||y<0||x>=w||y>=h)return;
  const i=(y*w+x)*4;
  buf[i]=c[0];buf[i+1]=c[1];buf[i+2]=c[2];buf[i+3]=255;
}
function blendPixel(buf,w,h,x,y,c){
  x=Math.round(x);y=Math.round(y);
  if(x<0||y<0||x>=w||y>=h)return;
  const i=(y*w+x)*4,a=(c[3]??255)/255,ia=1-a;
  buf[i]=Math.round(c[0]*a+buf[i]*ia);
  buf[i+1]=Math.round(c[1]*a+buf[i+1]*ia);
  buf[i+2]=Math.round(c[2]*a+buf[i+2]*ia);
  buf[i+3]=255;
}
function fillRect(buf,w,h,x,y,rw,rh,c,blend=false){
  const x0=Math.max(0,Math.floor(x)),y0=Math.max(0,Math.floor(y));
  const x1=Math.min(w,Math.ceil(x+rw)),y1=Math.min(h,Math.ceil(y+rh));
  for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){
    if(blend)blendPixel(buf,w,h,xx,yy,c);else setPixel(buf,w,h,xx,yy,c);
  }
}
function line(buf,w,h,x0,y0,x1,y1,c){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
  let err=dx+dy;
  for(;;){
    setPixel(buf,w,h,x0,y0,c);
    if(x0===x1&&y0===y1)break;
    const e2=2*err;
    if(e2>=dy){err+=dy;x0+=sx;}
    if(e2<=dx){err+=dx;y0+=sy;}
  }
}
function rectOutline(buf,w,h,x1,y1,x2,y2,c,{right=true}={}){
  const left=Math.min(x1,x2),rightX=Math.max(x1,x2),top=Math.min(y1,y2),bottom=Math.max(y1,y2);
  line(buf,w,h,left,top,rightX,top,c);
  line(buf,w,h,left,bottom,rightX,bottom,c);
  line(buf,w,h,left,top,left,bottom,c);
  if(right)line(buf,w,h,rightX,top,rightX,bottom,c);
}

const FONT={
' ': [0,0,0,0,0], A:[2,5,7,5,5], B:[6,5,6,5,6], C:[3,4,4,4,3], D:[6,5,5,5,6],
E:[7,4,6,4,7], F:[7,4,6,4,4], G:[3,4,5,5,3], H:[5,5,7,5,5], I:[7,2,2,2,7],
J:[1,1,1,5,2], K:[5,5,6,5,5], L:[4,4,4,4,7], M:[5,7,7,5,5], N:[5,7,7,7,5],
O:[2,5,5,5,2], P:[6,5,6,4,4], Q:[2,5,5,7,3], R:[6,5,6,5,5], S:[3,4,2,1,6],
T:[7,2,2,2,2], U:[5,5,5,5,7], V:[5,5,5,5,2], W:[5,5,7,7,5], X:[5,5,2,5,5],
Y:[5,5,2,2,2], Z:[7,1,2,4,7],
'0':[7,5,5,5,7],'1':[2,6,2,2,7],'2':[6,1,7,4,7],'3':[6,1,3,1,6],'4':[5,5,7,1,1],
'5':[7,4,6,1,6],'6':[3,4,7,5,7],'7':[7,1,2,2,2],'8':[7,5,7,5,7],'9':[7,5,7,1,6],
'.':[0,0,0,0,2], ':':[0,2,0,2,0], '-':[0,0,7,0,0], '+':[0,2,7,2,0], '/':[1,1,2,4,4],
'%':[5,1,2,4,5], '_':[0,0,0,0,7], '>':[4,2,1,2,4], '<':[1,2,4,2,1]
};

function drawText(buf,w,h,x,y,text,c,scale=2){
  let cx=Math.round(x);
  const s=String(text).toUpperCase();
  for(const ch of s){
    const glyph=FONT[ch]||FONT[' '];
    for(let ry=0;ry<5;ry++){
      const bits=glyph[ry];
      for(let rx=0;rx<3;rx++){
        if(bits&(1<<(2-rx))) fillRect(buf,w,h,cx+rx*scale,y+ry*scale,scale,scale,c);
      }
    }
    cx+=4*scale;
  }
  return cx;
}
function textWidth(text,scale=2){return String(text).length*4*scale;}
function labelBox(buf,w,h,x,y,text,fg,bg,scale=2){
  const tw=textWidth(text,scale),th=5*scale;
  fillRect(buf,w,h,x-3,y-3,tw+6,th+6,bg);
  drawText(buf,w,h,x,y,text,fg,scale);
}
function quantile(sorted,q){
  if(!sorted.length)return null;
  const pos=(sorted.length-1)*Math.max(0,Math.min(1,Number(q)));
  const lo=Math.floor(pos),hi=Math.ceil(pos);
  if(lo===hi)return sorted[lo];
  const w=pos-lo;
  return sorted[lo]*(1-w)+sorted[hi]*w;
}
function finitePositive(v){
  const n=Number(v);
  return Number.isFinite(n)&&n>0?n:null;
}
export function derivePriceScale(candles,analysis={},forecastOverlay=null,tradeOverlay=null){
  const candlePrices=[];
  for(const candle of candles||[]){
    for(const key of ['o','h','l','c']){
      const n=finitePositive(candle?.[key]);
      if(n!=null)candlePrices.push(n);
    }
  }
  if(!candlePrices.length)throw new Error('NO_FINITE_CANDLE_PRICES');
  const sorted=[...candlePrices].sort((a,b)=>a-b);
  const center=quantile(sorted,.5);
  const q05=quantile(sorted,.05),q95=quantile(sorted,.95);
  const robustSpan=Math.max((q95??center)-(q05??center),Math.abs(center)*.002,1e-9);
  // Replay charts should survive a stale/broken overlay or one malformed wick.
  // The guard is intentionally broad (35% or 8 robust spans) so legitimate
  // crypto volatility remains visible while impossible scale anchors are ignored.
  const guardRadius=Math.max(robustSpan*8,Math.abs(center)*.35);
  const guardMin=Math.max(1e-12,center-guardRadius);
  const guardMax=center+guardRadius;
  const acceptedCandles=candlePrices.filter(v=>v>=guardMin&&v<=guardMax);
  const base=acceptedCandles.length>=Math.min(8,candlePrices.length)?acceptedCandles:candlePrices;
  let min=Math.min(...base),max=Math.max(...base);
  const candidates=[
    ['SUPPORT',analysis?.support],['RESISTANCE',analysis?.resistance],['EMA20',analysis?.ema20],['EMA50',analysis?.ema50],
    ['FORECAST_ANCHOR',forecastOverlay?.anchorPrice],['TRADE_ENTRY',tradeOverlay?.entryPrice],['TRADE_STOP',tradeOverlay?.stopPrice],
    ['TRADE_TARGET',tradeOverlay?.takeProfitPrice],['TRADE_CURRENT',tradeOverlay?.currentPrice]
  ];
  for(const [i,h] of (forecastOverlay?.horizons||[]).entries()){
    candidates.push(['FORECAST_LOWER_'+i,h?.lowerPrice],['FORECAST_MEDIAN_'+i,h?.medianPrice],['FORECAST_UPPER_'+i,h?.upperPrice]);
  }
  for(const [si,s] of (forecastOverlay?.scenarios||[]).entries()){
    for(const [pi,p] of (s?.points||[]).entries())candidates.push(['SCENARIO_'+si+'_'+pi,p?.targetPrice]);
  }
  const ignoredExternal=[];
  for(const [source,v] of candidates){
    const n=finitePositive(v);
    if(n==null)continue;
    if(n<guardMin||n>guardMax){ignoredExternal.push({source,value:n});continue;}
    min=Math.min(min,n);max=Math.max(max,n);
  }
  const span=Math.max(max-min,Math.abs(center)*.0005,1e-9);
  const pad=Math.max(span*.07,Math.abs(center)*.0005,1e-9);
  return {
    min:min-pad,max:max+pad,center,guardMin,guardMax,
    ignoredExternalCount:ignoredExternal.length,
    ignoredCandleCount:candlePrices.length-base.length,
    ignoredExternal
  };
}
function priceVisible(v,scale){
  const n=finitePositive(v);
  return n!=null&&n>=scale.guardMin&&n<=scale.guardMax;
}
function emaSeries(candles,period){
  if(!candles.length)return[];
  const a=2/(period+1),out=[candles[0].c];
  for(let i=1;i<candles.length;i++)out.push(a*candles[i].c+(1-a)*out[i-1]);
  return out;
}
function fmtCompact(n){
  if(!Number.isFinite(n))return'NA';
  const a=Math.abs(n);
  if(a>=1e9)return (n/1e9).toFixed(1)+'B';
  if(a>=1e6)return (n/1e6).toFixed(1)+'M';
  if(a>=1e3)return (n/1e3).toFixed(1)+'K';
  if(a<1)return n.toFixed(4);
  return n.toFixed(2);
}

export function renderCandlestickPng(candlesInput,analysis,{width=1100,height=760,dashboard=null,tradeReplay=null,forecastOverlay=null,superchart=null,tradeOverlay=null,trendBoxes=null,trendPhaseForecast=null}={}){
  const candles=candlesInput.slice(-100);
  if(candles.length<2)throw new Error('Need at least 2 candles');

  const bg=color('#0b0f14'),panel=color('#101720'),grid=color('#1b2633'),text=color('#d6dee8');
  const muted=color('#8290a0'),up=color('#20c997'),down=color('#ff5c5c'),wick=color('#aab7c4');
  const ema20c=color('#f4c430'),ema50c=color('#4ea1ff'),supportC=color('#3ddc97'),resistanceC=color('#ff8c69');
  const pivotC=color('#d0d7de'),activeC=color('#9aa4ad'),breakC=color('#ffd166'),retestC=color('#b388ff');
  const forecastBaseC=color('#4ea1ff'),forecastUpC=color('#3ddc97'),forecastDownC=color('#ff5c5c'),forecastBandC=color('#4ea1ff',32);
  const volUp=color('#147d68'),volDown=color('#9b3d45'),zoneSupport=color('#3ddc97',35),zoneResistance=color('#ff8c69',35);
  const confluenceC=color('#ffd166'),liqLongC=color('#ff5c5c'),liqShortC=color('#3ddc97'),intelPanel=color('#101720',235);
  const trendBoxC=color('#39a9ff'),trendBoxFill=color('#2a7cff',18),trendBoxActiveFill=color('#2a7cff',30),trendRiskC=color('#ffd166');

  const buf=Buffer.alloc(width*height*4);
  for(let i=0;i<width*height;i++){buf[i*4]=bg[0];buf[i*4+1]=bg[1];buf[i*4+2]=bg[2];buf[i*4+3]=255;}

  const headerH=58,left=48,right=26,bottom=28,volumeH=112,gap=18;
  const priceTop=headerH+12;
  const volumeBottom=height-bottom;
  const volumeTop=volumeBottom-volumeH;
  const priceBottom=volumeTop-gap;
  const plotW=width-left-right,plotH=priceBottom-priceTop;

  fillRect(buf,width,height,0,0,width,headerH,panel);
  fillRect(buf,width,height,left,volumeTop,plotW,volumeH,panel);

  for(let i=0;i<=5;i++){
    const y=priceTop+i*plotH/5;line(buf,width,height,left,y,width-right,y,grid);
  }
  for(let i=0;i<=8;i++){
    const x=left+i*plotW/8;line(buf,width,height,x,priceTop,x,priceBottom,grid);
    line(buf,width,height,x,volumeTop,x,volumeBottom,grid);
  }

  const overlayActive=Boolean(forecastOverlay&&((forecastOverlay.scenarios||[]).length||(forecastOverlay.horizons||[]).length));
  const candlePlotW=overlayActive?plotW*0.74:plotW;
  const futureStart=left+candlePlotW;
  const futureEnd=width-right;
  const scale=derivePriceScale(candles,analysis||{},forecastOverlay,tradeOverlay);
  const yOf=p=>{
    const n=finitePositive(p);
    const bounded=n==null?scale.center:Math.max(scale.min,Math.min(scale.max,n));
    return priceTop+(scale.max-bounded)/(scale.max-scale.min)*plotH;
  };
  const step=candlePlotW/candles.length,bodyW=Math.max(2,Math.floor(step*0.58));
  const zonePct=0.0012;

  if(tradeOverlay){
    const entry=Number(tradeOverlay.entryPrice),stop=Number(tradeOverlay.stopPrice),tp=Number(tradeOverlay.takeProfitPrice),current=Number(tradeOverlay.currentPrice);
    const side=String(tradeOverlay.side||'').toUpperCase();
    const status=String(tradeOverlay.status||'OPEN').toUpperCase();
    const tradeEntryC=color('#4ea1ff'),tradeStopC=color('#ff5c5c'),tradeTpC=color('#20c997'),tradeCurrentC=color('#ffd166');
    if(Number.isFinite(entry)&&priceVisible(entry,scale)){
      const y=yOf(entry);
      line(buf,width,height,left,y,width-right,y,tradeEntryC);
      labelBox(buf,width,height,left+8,Math.max(priceTop+4,Math.min(priceBottom-14,y-7)),'ENTRY',tradeEntryC,panel,1);
    }
    if(Number.isFinite(stop)&&priceVisible(stop,scale)){
      const y=yOf(stop);
      line(buf,width,height,left,y,width-right,y,tradeStopC);
      labelBox(buf,width,height,left+72,Math.max(priceTop+4,Math.min(priceBottom-14,y-7)),'SL',tradeStopC,panel,1);
    }
    if(Number.isFinite(tp)&&priceVisible(tp,scale)){
      const y=yOf(tp);
      line(buf,width,height,left,y,width-right,y,tradeTpC);
      labelBox(buf,width,height,left+104,Math.max(priceTop+4,Math.min(priceBottom-14,y-7)),'TP',tradeTpC,panel,1);
    }
    if(Number.isFinite(current)&&priceVisible(current,scale)){
      const y=yOf(current);
      line(buf,width,height,left+candlePlotW*.84,y,width-right,y,tradeCurrentC);
      labelBox(buf,width,height,Math.max(left,width-right-94),Math.max(priceTop+4,Math.min(priceBottom-14,y-7)),'NOW',tradeCurrentC,panel,1);
    }
    if(Number.isFinite(entry)&&Number.isFinite(stop)&&priceVisible(entry,scale)&&priceVisible(stop,scale)){
      const y1=yOf(entry),y2=yOf(stop);
      fillRect(buf,width,height,left,Math.min(y1,y2),candlePlotW,Math.max(2,Math.abs(y2-y1)),color('#ff5c5c',18),true);
    }
    if(Number.isFinite(entry)&&Number.isFinite(tp)&&priceVisible(entry,scale)&&priceVisible(tp,scale)){
      const y1=yOf(entry),y2=yOf(tp);
      fillRect(buf,width,height,left,Math.min(y1,y2),candlePlotW,Math.max(2,Math.abs(y2-y1)),color('#20c997',16),true);
    }
    const health=Number(tradeOverlay.thesisHealth);
    const rr=Number(tradeOverlay.rewardRisk);
    const badge='BIGGJ '+side+' '+status;
    labelBox(buf,width,height,left+8,priceTop+8,badge,text,color('#161f2b'),1);
    if(Number.isFinite(health)) labelBox(buf,width,height,left+8,priceTop+26,'THESIS '+Math.round(Math.max(0,Math.min(1,health))*100)+'%',tradeCurrentC,color('#161f2b'),1);
    if(Number.isFinite(rr)) labelBox(buf,width,height,left+112,priceTop+26,'RR '+rr.toFixed(2),tradeTpC,color('#161f2b'),1);
  }

  if(priceVisible(analysis?.support,scale)){
    const y1=yOf(analysis.support*(1+zonePct)),y2=yOf(analysis.support*(1-zonePct));
    fillRect(buf,width,height,left,Math.min(y1,y2),plotW,Math.max(3,Math.abs(y2-y1)),zoneSupport,true);
    line(buf,width,height,left,yOf(analysis.support),width-right,yOf(analysis.support),supportC);
    labelBox(buf,width,height,left+6,Math.max(priceTop+4,yOf(analysis.support)-14),'SUP',supportC,panel,2);
  }
  if(priceVisible(analysis?.resistance,scale)){
    const y1=yOf(analysis.resistance*(1+zonePct)),y2=yOf(analysis.resistance*(1-zonePct));
    fillRect(buf,width,height,left,Math.min(y1,y2),plotW,Math.max(3,Math.abs(y2-y1)),zoneResistance,true);
    line(buf,width,height,left,yOf(analysis.resistance),width-right,yOf(analysis.resistance),resistanceC);
    labelBox(buf,width,height,left+6,Math.max(priceTop+4,yOf(analysis.resistance)-14),'RES',resistanceC,panel,2);
  }

  if(trendBoxes?.boxes?.length){
    const firstTime=Number(candles[0]?.openTime);
    const lastTime=Number(candles.at(-1)?.closeTime);
    const xForTime=t=>{
      const n=Number(t);
      if(!Number.isFinite(n)||n<=firstTime)return left;
      if(n>=lastTime)return left+candlePlotW;
      let idx=candles.findIndex(c=>Number(c.openTime)>=n);
      if(idx<0)idx=candles.length-1;
      return left+(idx+.5)*step;
    };
    for(const b of trendBoxes.boxes){
      if(Number(b?.endTime)<firstTime||Number(b?.startTime)>lastTime)continue;
      const x1=Math.max(left,xForTime(b.startTime));
      const x2=Math.min(left+candlePlotW,b.status==='CLOSED'?xForTime(b.endTime):left+candlePlotW);
      const hi=Number(b.high),lo=Number(b.low);
      if(!Number.isFinite(hi)||!Number.isFinite(lo)||x2<=x1)continue;
      const y1=yOf(hi),y2=yOf(lo);
      const active=b.status==='ACTIVE'||b.status==='AT_RISK';
      const fg=b.status==='AT_RISK'?trendRiskC:trendBoxC;
      fillRect(buf,width,height,x1,Math.min(y1,y2),Math.max(2,x2-x1),Math.max(2,Math.abs(y2-y1)),active?trendBoxActiveFill:trendBoxFill,true);
      rectOutline(buf,width,height,x1,y1,x2,y2,fg,{right:!active});
      if(x2-x1>42){
        const label=String(b.scale||trendBoxes.scale||'M')+' '+String(b.direction||'')+(active?' '+String(b.status):'');
        labelBox(buf,width,height,Math.min(x2-44,x1+5),Math.max(priceTop+4,Math.min(priceBottom-13,Math.min(y1,y2)+5)),label,fg,panel,1);
      }
    }
    const active=trendBoxes.active;
    const phase=trendPhaseForecast?.byScale?.[String(trendBoxes.scale||'M').toUpperCase()]||null;
    if(active){
      const phaseTxt=phase
        ?String(active.scale)+' FC '+String(phase.targetHorizonId||'')+' '+(Number(phase.medianReturn)>=0?'+':'')+(Number(phase.medianReturn)*100).toFixed(2)+'% '+String(phase.alignment||'')
        :String(active.scale)+' '+String(active.direction)+' '+String(active.status);
      labelBox(buf,width,height,Math.max(left+6,left+candlePlotW-textWidth(phaseTxt,1)-10),priceBottom-18,phaseTxt,phase?.alignment==='CONTRADICTED'?trendRiskC:trendBoxC,panel,1);
    }
  }

  const e20=emaSeries(candles,20),e50=emaSeries(candles,50);
  for(let i=1;i<candles.length;i++){
    const x0=left+(i-0.5)*step,x1=left+(i+0.5)*step;
    line(buf,width,height,x0,yOf(e20[i-1]),x1,yOf(e20[i]),ema20c);
    line(buf,width,height,x0,yOf(e50[i-1]),x1,yOf(e50[i]),ema50c);
  }

  candles.forEach((c,i)=>{
    const x=left+(i+0.5)*step;
    line(buf,width,height,x,yOf(c.h),x,yOf(c.l),c.closed===false?activeC:wick);
    const yOpen=yOf(c.o),yClose=yOf(c.c),topY=Math.min(yOpen,yClose),bodyH=Math.max(2,Math.abs(yOpen-yClose));
    const cc=c.closed===false?activeC:(c.c>=c.o?up:down);
    fillRect(buf,width,height,x-bodyW/2,topY,bodyW,bodyH,cc);
  });

  const maxVol=Math.max(...candles.map(c=>c.v),1);
  candles.forEach((c,i)=>{
    const x=left+(i+0.5)*step;
    const bh=Math.max(1,(c.v/maxVol)*(volumeH-22));
    const cc=c.closed===false?activeC:(c.c>=c.o?volUp:volDown);
    fillRect(buf,width,height,x-bodyW/2,volumeBottom-bh,bodyW,bh,cc);
  });
  drawText(buf,width,height,left+4,volumeTop+4,'VOL',muted,2);

  const closedFull=candlesInput.filter(c=>c.closed===true);
  const firstVisibleClosed=Math.max(0,closedFull.length-candles.filter(c=>c.closed===true).length);

  for(const p of analysis?.classifiedPivots||[]){
    const idx=p.i-firstVisibleClosed;
    if(idx<0||idx>=candles.length)continue;
    const x=left+(idx+0.5)*step,y=yOf(p.price);
    fillRect(buf,width,height,x-3,y-3,7,7,pivotC);
    const yy=p.kind==='H'?Math.max(priceTop+4,y-22):Math.min(priceBottom-18,y+8);
    labelBox(buf,width,height,x-8,yy,p.label,pivotC,panel,2);
  }

  if(analysis?.pattern){
    const base=firstVisibleClosed;
    const bi=analysis.pattern.breakIndex-base;
    const ri=analysis.pattern.retestIndex==null?null:analysis.pattern.retestIndex-base;
    if(bi>=0&&bi<candles.length){
      const x=left+(bi+0.5)*step;
      line(buf,width,height,x,priceTop,x,priceBottom,breakC);
      labelBox(buf,width,height,Math.min(width-right-42,Math.max(left,x-14)),priceTop+8,'BRK',breakC,panel,2);
    }
    if(ri!=null&&ri>=0&&ri<candles.length){
      const x=left+(ri+0.5)*step;
      line(buf,width,height,x,priceTop,x,priceBottom,retestC);
      labelBox(buf,width,height,Math.min(width-right-34,Math.max(left,x-10)),priceTop+25,'RT',retestC,panel,2);
    }
  }

  if(superchart&&superchart.mode!=='CLEAN'){
    for(const z of superchart.confluenceZones||[]){
      const p=Number(z?.price);if(!Number.isFinite(p)||p<scale.min||p>scale.max)continue;
      const y=yOf(p),score=Math.max(0,Math.min(100,Number(z?.score)||0));
      const half=Math.max(2,2+score/30);
      fillRect(buf,width,height,left,y-half,candlePlotW,half*2,color('#ffd166',18+Math.round(score*.22)),true);
      line(buf,width,height,left,y,left+candlePlotW,y,confluenceC);
      labelBox(buf,width,height,left+6,Math.max(priceTop+4,Math.min(priceBottom-13,y-6)),'C'+Math.round(score),confluenceC,panel,1);
    }
    for(const z of superchart.liquidationZones||[]){
      const p=Number(z?.price);if(!Number.isFinite(p)||p<scale.min||p>scale.max)continue;
      const y=yOf(p),long=Number(z?.longUsd)||0,short=Number(z?.shortUsd)||0;
      const fg=long>=short?liqLongC:liqShortC;
      line(buf,width,height,left+candlePlotW*.72,y,left+candlePlotW,y,fg);
      labelBox(buf,width,height,Math.max(left,left+candlePlotW-42),Math.max(priceTop+4,Math.min(priceBottom-13,y-6)),'LIQ',fg,panel,1);
    }
  }

  if(overlayActive){
    const allHorizonMs=[
      ...(forecastOverlay?.horizons||[]).map(x=>Number(x?.horizonMs)),
      ...(forecastOverlay?.scenarios||[]).flatMap(x=>(x?.points||[]).map(p=>Number(p?.horizonMs)))
    ].filter(x=>Number.isFinite(x)&&x>0);
    const maxH=Math.max(1,...allHorizonMs);
    const xFuture=h=>futureStart+Math.max(0,Math.min(1,Number(h)/maxH))*Math.max(8,futureEnd-futureStart-8);
    const anchorPrice=Number(forecastOverlay?.anchorPrice);
    line(buf,width,height,futureStart,priceTop,futureStart,priceBottom,grid);
    labelBox(buf,width,height,Math.min(width-right-78,futureStart+5),priceTop+8,'FORECAST',forecastBaseC,panel,1);

    const hs=[...(forecastOverlay?.horizons||[])].sort((a,b)=>Number(a.horizonMs)-Number(b.horizonMs));
    for(let i=0;i<hs.length;i++){
      const h=hs[i];
      const x=xFuture(h.horizonMs);
      const lo=Number(h.lowerPrice),hi=Number(h.upperPrice);
      if(Number.isFinite(lo)&&Number.isFinite(hi)&&priceVisible(lo,scale)&&priceVisible(hi,scale)){
        const y1=yOf(Math.max(lo,hi)),y2=yOf(Math.min(lo,hi));
        const prevX=i===0?futureStart:xFuture(hs[i-1].horizonMs);
        fillRect(buf,width,height,prevX,Math.min(y1,y2),Math.max(2,x-prevX),Math.max(2,Math.abs(y2-y1)),forecastBandC,true);
        line(buf,width,height,x,y1,x,y2,forecastBaseC);
      }
      const txt=String(h.horizonId||'');
      if(txt) drawText(buf,width,height,Math.max(futureStart,x-textWidth(txt,1)/2),priceBottom+5,txt,muted,1);
    }

    const scenarioColor=id=>id==='UPSIDE_PATH'?forecastUpC:id==='DOWNSIDE_PATH'?forecastDownC:forecastBaseC;
    for(const s of forecastOverlay?.scenarios||[]){
      const pts=(s?.points||[]).filter(p=>Number.isFinite(Number(p?.targetPrice))&&priceVisible(p?.targetPrice,scale)&&Number.isFinite(Number(p?.horizonMs))).sort((a,b)=>Number(a.horizonMs)-Number(b.horizonMs));
      if(!pts.length)continue;
      const fg=scenarioColor(String(s.id||''));
      let px=futureStart,py=Number.isFinite(anchorPrice)&&priceVisible(anchorPrice,scale)?yOf(anchorPrice):yOf(candles.at(-1)?.c);
      for(const p of pts){
        const x=xFuture(p.horizonMs),y=yOf(Number(p.targetPrice));
        line(buf,width,height,px,py,x,y,fg);
        fillRect(buf,width,height,x-2,y-2,5,5,fg);
        px=x;py=y;
      }
      const short=String(s.id||'PATH').replace('_PATH','').replace('DOWNSIDE','DOWN').replace('UPSIDE','UP');
      labelBox(buf,width,height,Math.min(width-right-52,Math.max(futureStart,px-18)),Math.max(priceTop+25,Math.min(priceBottom-14,py-7)),short,fg,panel,1);
    }
  }

  if(tradeReplay){
    const marks=[['ENTRY',Number(tradeReplay.entryAt),Number(tradeReplay.entryPrice),supportC],['EXIT',Number(tradeReplay.exitAt),Number(tradeReplay.exitPrice),resistanceC]];
    for(const [label,at,price,fg] of marks){
      if(!Number.isFinite(at)||!Number.isFinite(price)||!priceVisible(price,scale))continue;
      const idx=candles.findIndex(x=>Number(x.openTime)<=at&&at<=Number(x.closeTime));
      if(idx<0)continue;
      const x=left+(idx+0.5)*step,y=yOf(price);
      line(buf,width,height,x,priceTop,x,priceBottom,fg);
      fillRect(buf,width,height,x-4,y-4,9,9,fg);
      labelBox(buf,width,height,Math.min(width-right-58,Math.max(left,x-18)),label==='ENTRY'?priceTop+44:priceTop+62,label,fg,panel,2);
    }
  }

  const last=candles.at(-1);
  if(last){
    const y=yOf(last.c);
    line(buf,width,height,width-right-55,y,width-right,y,text);
    labelBox(buf,width,height,width-right-120,Math.max(priceTop+2,Math.min(priceBottom-14,y-6)),fmtCompact(last.c),text,panel,1);
  }

  const h1=dashboard?.bias?('BIAS '+dashboard.bias+' '+(dashboard.biasScore>=0?'+':'')+dashboard.biasScore):('TREND '+(analysis?.trend||'NA'));
  const h2=dashboard?('REGIME '+dashboard.regime):('TREND '+(analysis?.trend||'NA'));
  const h3=dashboard?('RIFT '+Math.round(dashboard.pressureScore)+' '+dashboard.pressureBand):'RIFT NA';
  const h4=dashboard?('FLOW '+dashboard.flow):'FLOW NA';
  const h5=dashboard?('LIQ '+dashboard.liquidity+' '+dashboard.spreadBps.toFixed(2)+'BPS'):'LIQ NA';

  let hx=16;
  for(const [txt,fg] of [[h1,text],[h2,ema50c],[h3,breakC],[h4,supportC],[h5,resistanceC]]){
    const tw=textWidth(txt,2)+12;
    fillRect(buf,width,height,hx,12,tw,32,color('#161f2b'));
    drawText(buf,width,height,hx+6,22,txt,fg,2);
    hx+=tw+8;
    if(hx>width-160)break;
  }
  if(superchart){
    let sx=Math.max(16,width-18);
    const badges=[...(superchart.badges||[])].reverse();
    for(const b of badges){
      const txt=String(b.label)+' '+String(b.value),tw=textWidth(txt,1)+8;
      sx-=tw;
      if(sx<left+260)break;
      fillRect(buf,width,height,sx,40,tw,14,color('#161f2b'));
      drawText(buf,width,height,sx+4,44,txt,text,1);
      sx-=4;
    }
    if(superchart.mode==='FULL'&&(superchart.panel||[]).length){
      const pw=210,ph=Math.min(112,20+(superchart.panel.length*14)),px=width-right-pw-6,py=priceTop+42;
      fillRect(buf,width,height,px,py,pw,ph,intelPanel,true);
      drawText(buf,width,height,px+8,py+7,'FULL INTEL',confluenceC,1);
      let yy=py+22;
      for(const row of superchart.panel.slice(0,6)){
        drawText(buf,width,height,px+8,yy,String(row),text,1);yy+=14;
      }
    }
  }
  drawText(buf,width,height,16,46,tradeOverlay?('BIGGJ TRADE VISUAL  OBSERVED + DERIVED + PROBABILISTIC  SHADOW_ONLY'):superchart?('TCX SUPERCHART '+superchart.mode+'  TREND BOXES + PROBABILISTIC FORECAST  SHADOW_ONLY'):(overlayActive?'OBSERVED OHLCV  DERIVED STRUCTURE  PROBABILISTIC FORECAST PATH  NOT GUARANTEED':'OBSERVED OHLCV  DERIVED STRUCTURE REGIME RIFT  MECHANISM NOT INFERRED'),muted,1);

  return pngEncode(width,height,buf);
}
