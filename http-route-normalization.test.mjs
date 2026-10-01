import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('./bot.mjs',import.meta.url),'utf8');

test('public web routes match pathname and tolerate query parameters',()=>{
  assert.match(source,/const requestPath=String\(req\.url\|\|''\)\.split\('\?'\)\[0\]\|\|'\/'/);
  for(const route of [
    '/mission-control',
    '/mission-control/legacy',
    '/mission-control.json',
    '/app.webmanifest',
    '/biggj-icon.svg',
    '/sw.js',
    '/health',
    '/ready'
  ]){
    assert.ok(source.includes("requestPath === '"+route+"'"),route);
  }
  assert.ok(!source.includes("req.url === '/mission-control'"));
  assert.ok(!source.includes("req.url === '/mission-control.json'"));
});

test('query-bearing dynamic routes also use normalized pathname',()=>{
  for(const route of ['/superchart.png','/signal-lab.json','/proof-feed.json','/ai/ask']){
    assert.ok(source.includes("requestPath === '"+route+"'"),route);
  }
});
