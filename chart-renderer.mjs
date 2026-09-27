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
function priceScale(candles,analysis){
  let min=Math.min(...candles.map(c=>c.l)),max=Math.max(...candles.map(c=>c.h));
  for(const v of [analysis?.support,analysis?.resistance,analysis?.ema20,analysis?.ema50]){
    if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}
  }
  const pad=Math.max((max-min)*0.07,Math.abs(max)*0.0005,1e-9);
  return {min:min-pad,max:max+pad};
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

export function renderCandlestickPng(candlesInput,analysis,{width=1100,height=760,dashboard=null}={}){
  const candles=candlesInput.slice(-100);
  if(candles.length<2)throw new Error('Need at least 2 candles');

  const bg=color('#0b0f14'),panel=color('#101720'),grid=color('#1b2633'),text=color('#d6dee8');
  const muted=color('#8290a0'),up=color('#20c997'),down=color('#ff5c5c'),wick=color('#aab7c4');
  const ema20c=color('#f4c430'),ema50c=color('#4ea1ff'),supportC=color('#3ddc97'),resistanceC=color('#ff8c69');
  const pivotC=color('#d0d7de'),activeC=color('#9aa4ad'),breakC=color('#ffd166'),retestC=color('#b388ff');
  const volUp=color('#147d68'),volDown=color('#9b3d45'),zoneSupport=color('#3ddc97',35),zoneResistance=color('#ff8c69',35);

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

  const scale=priceScale(candles,analysis||{});
  const yOf=p=>priceTop+(scale.max-p)/(scale.max-scale.min)*plotH;
  const step=plotW/candles.length,bodyW=Math.max(2,Math.floor(step*0.58));
  const zonePct=0.0012;

  if(Number.isFinite(analysis?.support)){
    const y1=yOf(analysis.support*(1+zonePct)),y2=yOf(analysis.support*(1-zonePct));
    fillRect(buf,width,height,left,Math.min(y1,y2),plotW,Math.max(3,Math.abs(y2-y1)),zoneSupport,true);
    line(buf,width,height,left,yOf(analysis.support),width-right,yOf(analysis.support),supportC);
    labelBox(buf,width,height,left+6,Math.max(priceTop+4,yOf(analysis.support)-14),'SUP',supportC,panel,2);
  }
  if(Number.isFinite(analysis?.resistance)){
    const y1=yOf(analysis.resistance*(1+zonePct)),y2=yOf(analysis.resistance*(1-zonePct));
    fillRect(buf,width,height,left,Math.min(y1,y2),plotW,Math.max(3,Math.abs(y2-y1)),zoneResistance,true);
    line(buf,width,height,left,yOf(analysis.resistance),width-right,yOf(analysis.resistance),resistanceC);
    labelBox(buf,width,height,left+6,Math.max(priceTop+4,yOf(analysis.resistance)-14),'RES',resistanceC,panel,2);
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
  drawText(buf,width,height,16,46,'OBSERVED OHLCV  DERIVED STRUCTURE REGIME RIFT  MECHANISM NOT INFERRED',muted,1);

  return pngEncode(width,height,buf);
}
