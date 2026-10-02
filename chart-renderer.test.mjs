import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCandlestickPng, derivePriceScale } from './chart-renderer.mjs';

test('renders a valid PNG signature',()=>{
  const candles=[];
  for(let i=0;i<80;i++) candles.push({openTime:i,o:100+i*0.1,h:101+i*0.1,l:99+i*0.1,c:100.4+i*0.1,v:10,closeTime:i+1,closed:true});
  const png=renderCandlestickPng(candles,{support:100,resistance:110,classifiedPivots:[]},{width:640,height:360});
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.ok(png.length>1000);
});

test('renders with a live active candle without treating it as a pivot input',()=>{
  const candles=[];
  for(let i=0;i<50;i++) candles.push({openTime:i,o:100,h:102,l:98,c:101,v:10,closeTime:i+1,closed:true});
  candles.push({openTime:51,o:101,h:120,l:90,c:110,v:10,closeTime:999999,closed:false});
  const png=renderCandlestickPng(candles,{support:99,resistance:103,classifiedPivots:[]},{width:640,height:360});
  assert.ok(png.length>1000);
});


test('renders probabilistic forecast path overlay in a future panel',()=>{
  const candles=[];
  for(let i=0;i<80;i++) candles.push({openTime:i,o:100+i*0.05,h:101+i*0.05,l:99+i*0.05,c:100.2+i*0.05,v:10,closeTime:i+1,closed:true});
  const forecastOverlay={
    anchorPrice:104,
    horizons:[
      {horizonId:'5m',horizonMs:300000,lowerPrice:100,medianPrice:104.5,upperPrice:108},
      {horizonId:'1h',horizonMs:3600000,lowerPrice:96,medianPrice:106,upperPrice:114}
    ],
    scenarios:[
      {id:'UPSIDE_PATH',points:[{horizonMs:300000,targetPrice:106},{horizonMs:3600000,targetPrice:112}]},
      {id:'BASE_PATH',points:[{horizonMs:300000,targetPrice:104.5},{horizonMs:3600000,targetPrice:106}]},
      {id:'DOWNSIDE_PATH',points:[{horizonMs:300000,targetPrice:102},{horizonMs:3600000,targetPrice:98}]}
    ]
  };
  const png=renderCandlestickPng(candles,{support:100,resistance:110,classifiedPivots:[]},{width:900,height:560,forecastOverlay});
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.ok(png.length>1000);
});


test('renders full superchart layers with forecast',()=>{
  const candles=[];
  for(let i=0;i<80;i++)candles.push({openTime:i,o:100,h:102,l:98,c:100+i*.02,v:10,closeTime:i+1,closed:true});
  const png=renderCandlestickPng(candles,{support:99,resistance:103,classifiedPivots:[]},{
    width:1000,height:650,
    forecastOverlay:{anchorPrice:101,status:'ACTIVE',horizons:[{horizonId:'1h',horizonMs:3600000,lowerPrice:96,medianPrice:102,upperPrice:108}],scenarios:[{id:'BASE_PATH',points:[{horizonMs:3600000,targetPrice:102}]}]},
    superchart:{mode:'FULL',badges:[{label:'ACC',value:'64%'}],panel:['ACC 64%','ECE 7%'],confluenceZones:[{price:100,score:88}],liquidationZones:[{price:101,longUsd:500,shortUsd:100}]}
  });
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.ok(png.length>1000);
});


test('SOL replay scale ignores malformed external price anchors instead of flattening candles',()=>{
  const candles=[];
  for(let i=0;i<100;i++){
    const base=118+i*.035+Math.sin(i/7)*.45;
    candles.push({openTime:i,o:base,h:base+.65,l:base-.6,c:base+.12,v:100+i,closeTime:i+1,closed:true});
  }
  const analysis={support:0.001,resistance:123.8,ema20:121.1,ema50:120.4,classifiedPivots:[]};
  const tradeOverlay={entryPrice:121.28,stopPrice:122.1,takeProfitPrice:119.2,currentPrice:120.53,side:'SHORT',status:'CLOSED'};
  const scale=derivePriceScale(candles,analysis,null,tradeOverlay);
  assert.ok(scale.min>80,'scale must remain near SOL market range');
  assert.ok(scale.max<170,'malformed support must not expand scale');
  assert.ok(scale.ignoredExternal.some(x=>x.source==='SUPPORT'));
  assert.ok(scale.ignoredExternalCount>=1);
  const png=renderCandlestickPng(candles,analysis,{width:900,height:560,tradeOverlay,tradeReplay:{entryAt:95,entryPrice:121.28,exitAt:99,exitPrice:120.53}});
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.ok(png.length>1000);
});

test('single malformed candle wick cannot collapse replay price scale',()=>{
  const candles=[];
  for(let i=0;i<100;i++) candles.push({openTime:i,o:120+i*.01,h:121+i*.01,l:119+i*.01,c:120.3+i*.01,v:10,closeTime:i+1,closed:true});
  candles[15]={...candles[15],l:.01};
  const scale=derivePriceScale(candles,{support:119.5,resistance:122});
  assert.ok(scale.min>80);
  assert.ok(scale.max<170);
  assert.ok(scale.ignoredCandleCount>=1);
});


test('trade replay caption falls back to stored research lane instead of UNKNOWN setup',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.match(source,/function tradeReplayContextLabel/);
  assert.match(source,/mode&&mode!==['"]UNKNOWN['"]&&mode!==['"]STANDARD['"]/);
  assert.match(source,/tradeReplayContextLabel\(p\)/);
  assert.match(source,/PRIMARY_UNCLASSIFIED/);
});


test('renders persistent trend boxes and historical forecast moments together',()=>{
  const candles=[];
  for(let i=0;i<100;i++){
    const base=100+Math.sin(i/8)*4+i*.04;
    candles.push({openTime:i*60000,o:base,h:base+.8,l:base-.8,c:base+.25,v:100+i,closeTime:(i+1)*60000-1,closed:true});
  }
  const trendBoxes=[
    {scale:'M',direction:'UP',status:'CLOSED',startTime:candles[10].closeTime,endTime:candles[38].closeTime,high:106,low:99},
    {scale:'M',direction:'DOWN',status:'CLOSED',startTime:candles[38].closeTime,endTime:candles[66].closeTime,high:107,low:98},
    {scale:'M',direction:'UP',status:'ACTIVE',startTime:candles[66].closeTime,endTime:candles[99].closeTime,high:108,low:99}
  ];
  const forecastMoments=[
    {asOf:candles[20].closeTime,anchorPrice:102,targetAt:candles[25].closeTime,medianPrice:104,horizonId:'5m'},
    {asOf:candles[50].closeTime,anchorPrice:103,targetAt:candles[55].closeTime,medianPrice:101,horizonId:'5m'}
  ];
  const png=renderCandlestickPng(candles,{support:98,resistance:109,classifiedPivots:[]},{
    width:900,height:560,
    trendBoxes,
    forecastMoments,
    trendBoxForecast:{available:true,scale:'M',boxDirection:'UP',alignment:'ALIGNED'}
  });
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.ok(png.length>1000);
});
