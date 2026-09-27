import test from "node:test";
import assert from "node:assert/strict";
import { createReadCommandHandlers } from "./telegram-read-command-handlers.mjs";

function deps(overrides={}){
  const sent=[];
  const calls=[];
  const d={
    tg:async(method,body)=>{sent.push([method,body]);return {};},
    helpText:()=>"help",
    normalizeSymbol:x=>String(x||"").toUpperCase()==="BTC"?"BTCUSDT":null,
    showStart:async(...x)=>calls.push(["start",...x]),
    showFavorites:async(...x)=>calls.push(["favorites",...x]),
    showCompare:async(...x)=>calls.push(["compare",...x]),
    showMarket:async(...x)=>calls.push(["market",...x]),
    showChart:async(...x)=>calls.push(["chart",...x]),
    showStructure:async(...x)=>calls.push(["structure",...x]),
    showObservability:async(...x)=>calls.push(["obs",...x]),
    showChaos:async(...x)=>calls.push(["chaos",...x]),
    showOms:async(...x)=>calls.push(["oms",...x]),
    showShadowPortfolio:async(...x)=>calls.push(["portfolio",...x]),
    showShadowTradeStats:async(...x)=>calls.push(["stats",...x]),
    showExecutionResearch:async(...x)=>calls.push(["erl",...x]),
    showVenueQuality:async(...x)=>calls.push(["vqm",...x]),
    showSorStatus:async(...x)=>calls.push(["sorstatus",...x]),
    showRelease:async(...x)=>calls.push(["release",...x]),
    showFabric:async(...x)=>calls.push(["fabric",...x]),
    parseReplayTime:x=>x==="NOW"?123:null,
    showReplay:async(...x)=>calls.push(["replay",...x]),
    showAudit:async(...x)=>calls.push(["audit",...x]),
    showWitness:async(...x)=>calls.push(["witness",...x]),
    showEngine:async(...x)=>calls.push(["engine",...x]),
    showMemory:async(...x)=>calls.push(["memory",...x]),
    showEvidence:async(...x)=>calls.push(["evidence",...x]),
    showEvidenceHistory:async(...x)=>calls.push(["history",...x]),
    showValidity:async(...x)=>calls.push(["validity",...x]),
    recordError:()=>{},
    recordOperation:()=>{},
    observability:{},
    ...overrides
  };
  return {d,sent,calls};
}

test("coin validation stays inside read handler suite",async()=>{
  const {d,sent}=deps();
  const h=createReadCommandHandlers(d);
  await h["/coin"]({chatId:1,args:["NOPE"]});
  assert.equal(sent.at(-1)[1].text,"Beispiel: /coin BTC");
});

test("execution lab aliases share identical behavior",async()=>{
  const {d,calls}=deps();
  const h=createReadCommandHandlers(d);
  await h["/executionlab"]({chatId:1,args:["BTC","BUY"]});
  await h["/erl"]({chatId:1,args:["BTC","BUY"]});
  assert.equal(calls.filter(x=>x[0]==="erl").length,2);
});

test("venue quality parses decimal notional and default side",async()=>{
  const {d,calls}=deps();
  const h=createReadCommandHandlers(d);
  await h["/venuequality"]({chatId:1,args:["BTC",undefined,"1500,5"]});
  const row=calls.find(x=>x[0]==="vqm");
  assert.equal(row[2].symbol,"BTCUSDT");
  assert.equal(row[2].side,"BUY");
  assert.equal(row[2].notionalQuote,1500.5);
});

test("replay requires parsed point-in-time",async()=>{
  const {d,sent,calls}=deps();
  const h=createReadCommandHandlers(d);
  await h["/replay"]({chatId:1,args:["BTC","BAD"]});
  assert.match(sent.at(-1)[1].text,/Beispiel/);
  await h["/replay"]({chatId:1,args:["BTC","NOW"]});
  assert.deepEqual(calls.find(x=>x[0]==="replay"),["replay",1,"BTCUSDT",123]);
});

test("research symbol handler forwards normalized symbol",async()=>{
  const {d,calls}=deps();
  const h=createReadCommandHandlers(d);
  await h["/memory"]({chatId:7,args:["BTC"]});
  assert.deepEqual(calls.find(x=>x[0]==="memory"),["memory",7,"BTCUSDT"]);
});


test("portfolio and trades aliases open the same shadow portfolio",async()=>{
  const {d,calls}=deps();
  const h=createReadCommandHandlers(d);
  await h["/portfolio"]({chatId:9,args:[]});
  await h["/trades"]({chatId:9,args:[]});
  assert.equal(calls.filter(x=>x[0]==="portfolio").length,2);
});


test("stats commands map to requested periods",async()=>{
  const {d,calls}=deps();
  const h=createReadCommandHandlers(d);
  await h["/stats"]({chatId:7,args:[]});
  await h["/daystats"]({chatId:7,args:[]});
  await h["/weekstats"]({chatId:7,args:[]});
  await h["/monthstats"]({chatId:7,args:[]});
  assert.equal(calls.filter(x=>x[0]==="stats"&&x[3]==="DAY").length,2);
  assert.equal(calls.filter(x=>x[0]==="stats"&&x[3]==="WEEK").length,1);
  assert.equal(calls.filter(x=>x[0]==="stats"&&x[3]==="MONTH").length,1);
});
