import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCandlestickPng } from './chart-renderer.mjs';

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
