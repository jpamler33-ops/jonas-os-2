import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);
  return Buffer.concat([len,t,data,crc]);
}

function pngEncode(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const dst = y * (stride + 1);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, y * stride, (y + 1) * stride);
  }
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  return Buffer.concat([
    sig,
    chunk('IHDR',ihdr),
    chunk('IDAT',zlib.deflateSync(raw,{level:9})),
    chunk('IEND',Buffer.alloc(0)),
  ]);
}

function color(hex) {
  const v = hex.replace('#','');
  return [parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16),255];
}

function setPixel(buf,w,h,x,y,c) {
  x=Math.round(x); y=Math.round(y);
  if (x<0||y<0||x>=w||y>=h) return;
  const i=(y*w+x)*4;
  buf[i]=c[0];buf[i+1]=c[1];buf[i+2]=c[2];buf[i+3]=c[3];
}

function fillRect(buf,w,h,x,y,rw,rh,c) {
  const x0=Math.max(0,Math.floor(x)), y0=Math.max(0,Math.floor(y));
  const x1=Math.min(w,Math.ceil(x+rw)), y1=Math.min(h,Math.ceil(y+rh));
  for(let yy=y0;yy<y1;yy++) for(let xx=x0;xx<x1;xx++) setPixel(buf,w,h,xx,yy,c);
}

function line(buf,w,h,x0,y0,x1,y1,c) {
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const dx=Math.abs(x1-x0), sx=x0<x1?1:-1;
  const dy=-Math.abs(y1-y0), sy=y0<y1?1:-1;
  let err=dx+dy;
  for(;;){
    setPixel(buf,w,h,x0,y0,c);
    if(x0===x1&&y0===y1) break;
    const e2=2*err;
    if(e2>=dy){err+=dy;x0+=sx;}
    if(e2<=dx){err+=dx;y0+=sy;}
  }
}

function priceScale(candles, analysis) {
  let min=Math.min(...candles.map(c=>c.l));
  let max=Math.max(...candles.map(c=>c.h));
  for (const v of [analysis?.support,analysis?.resistance,analysis?.ema20,analysis?.ema50]) {
    if (Number.isFinite(v)) { min=Math.min(min,v); max=Math.max(max,v); }
  }
  const pad=Math.max((max-min)*0.06,Math.abs(max)*0.0005,1e-9);
  return {min:min-pad,max:max+pad};
}

function emaSeries(candles, period) {
  if (!candles.length) return [];
  const a=2/(period+1);
  const out=[candles[0].c];
  for(let i=1;i<candles.length;i++) out.push(a*candles[i].c+(1-a)*out[i-1]);
  return out;
}

export function renderCandlestickPng(candlesInput, analysis, { width=1000, height=620 }={}) {
  const candles=candlesInput.slice(-100);
  if (candles.length < 2) throw new Error('Need at least 2 candles');
  const bg=color('#0b0f14'), grid=color('#1b2633'), up=color('#20c997'), down=color('#ff5c5c');
  const wick=color('#aab7c4'), ema20c=color('#f4c430'), ema50c=color('#4ea1ff');
  const supportC=color('#3ddc97'), resistanceC=color('#ff8c69'), pivotC=color('#d0d7de'), activeC=color('#9aa4ad');
  const buf=Buffer.alloc(width*height*4);
  for(let i=0;i<width*height;i++){buf[i*4]=bg[0];buf[i*4+1]=bg[1];buf[i*4+2]=bg[2];buf[i*4+3]=255;}

  const left=36,right=20,top=24,bottom=36;
  const plotW=width-left-right, plotH=height-top-bottom;
  for(let i=0;i<=5;i++){
    const y=top+i*plotH/5; line(buf,width,height,left,y,width-right,y,grid);
  }
  for(let i=0;i<=8;i++){
    const x=left+i*plotW/8; line(buf,width,height,x,top,x,height-bottom,grid);
  }

  const scale=priceScale(candles,analysis||{});
  const yOf=p=>top+(scale.max-p)/(scale.max-scale.min)*plotH;
  const step=plotW/candles.length;
  const bodyW=Math.max(2,Math.floor(step*0.58));

  if(Number.isFinite(analysis?.support)) line(buf,width,height,left,yOf(analysis.support),width-right,yOf(analysis.support),supportC);
  if(Number.isFinite(analysis?.resistance)) line(buf,width,height,left,yOf(analysis.resistance),width-right,yOf(analysis.resistance),resistanceC);

  const e20=emaSeries(candles,20), e50=emaSeries(candles,50);
  for(let i=1;i<candles.length;i++){
    const x0=left+(i-0.5)*step, x1=left+(i+0.5)*step;
    line(buf,width,height,x0,yOf(e20[i-1]),x1,yOf(e20[i]),ema20c);
    line(buf,width,height,x0,yOf(e50[i-1]),x1,yOf(e50[i]),ema50c);
  }

  candles.forEach((c,i)=>{
    const x=left+(i+0.5)*step;
    line(buf,width,height,x,yOf(c.h),x,yOf(c.l),c.closed===false?activeC:wick);
    const yOpen=yOf(c.o), yClose=yOf(c.c);
    const topY=Math.min(yOpen,yClose), bodyH=Math.max(2,Math.abs(yOpen-yClose));
    const cc=c.closed===false?activeC:(c.c>=c.o?up:down);
    fillRect(buf,width,height,x-bodyW/2,topY,bodyW,bodyH,cc);
  });

  const baseIndexOffset=Math.max(0,(candlesInput.length-candles.length));
  for(const p of analysis?.classifiedPivots || []){
    const idx=p.i-baseIndexOffset;
    if(idx<0||idx>=candles.length) continue;
    const x=left+(idx+0.5)*step, y=yOf(p.price);
    fillRect(buf,width,height,x-3,y-3,7,7,pivotC);
  }

  return pngEncode(width,height,buf);
}
