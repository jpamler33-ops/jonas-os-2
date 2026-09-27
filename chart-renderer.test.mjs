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
