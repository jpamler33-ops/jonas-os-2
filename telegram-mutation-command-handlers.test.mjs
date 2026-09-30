import test from "node:test";
import assert from "node:assert/strict";
import { createMutationCommandHandlers } from "./telegram-mutation-command-handlers.mjs";

function make(overrides={}){
  const sent=[],calls=[];
  let orders=[{id:"sh_12345678",status:"ACTIVE"}];
  const deps={
    tg:async(method,body)=>{sent.push([method,body]);return {};},
    normalizeSymbol:x=>String(x||"").toUpperCase()==="BTC"?"BTCUSDT":null,
    showShadowOrders:async(...x)=>calls.push(["orders",...x]),
    getShadowOrders:()=>orders,
    replaceShadowOrder:(i,o)=>{orders[i]=o;},
    cancelShadowOrder:o=>({...o,status:"CANCELLED"}),
    now:()=>123,
    persistShadowOms:async()=>true,
    isAuditHealthy:()=>false,
    appendInstitutionalAudit:async()=>{},
    shadowAuditPayload:()=>({}),
    showPlacedShadowOrder:async(...x)=>calls.push(["placed",...x]),
    shadowDefaultLatencyMs:120,
    getShadowOmsStatus:()=>({healthy:true,lastError:null}),
    placeShadowOrder:async x=>({id:"sh_new",status:"FILLED",...x}),
    recordError:()=>{},
    recordOperation:()=>{},
    observability:{},
    showSorRoute:async(...x)=>calls.push(["sor",...x]),
    snapshot:async()=>({price:100}),
    createAlert:x=>x,
    addTcXAlert:async()=>({added:true,persisted:true}),
    symbolLabel:()=> "BTC",
    fmt:x=>String(x),
    alertPreset:(symbol,type,extra={})=>({symbol,type,...extra}),
    describeAlert:a=>a.type,
    activeAlerts:()=>[],
    clearAlerts:async()=>true,
    ...overrides
  };
  return {deps,sent,calls,getOrders:()=>orders};
}

test("shadow cancel uses live order accessor and setter",async()=>{
  const {deps,calls,getOrders}=make();
  const h=createMutationCommandHandlers(deps);
  await h["/shadowcancel"]({chatId:1,args:["sh_12345678"]});
  assert.equal(getOrders()[0].status,"CANCELLED");
  assert.equal(calls.at(-1)[0],"placed");
});

test("shadow is fail-closed when OMS is unhealthy",async()=>{
  const {deps,sent}=make({getShadowOmsStatus:()=>({healthy:false,lastError:"bad state"})});
  const h=createMutationCommandHandlers(deps);
  await h["/shadow"]({chatId:1,args:["BTC","BUY","100","MARKET"]});
  assert.match(sent.at(-1)[1].text,/fail-closed/);
});

test("price alert derives threshold direction from live price",async()=>{
  let created=null;
  const {deps}=make({
    snapshot:async()=>({price:100}),
    createAlert:x=>{created=x;return x;}
  });
  const h=createMutationCommandHandlers(deps);
  await h["/alert"]({chatId:1,args:["BTC","120"]});
  assert.equal(created.conditions[0].op,"GTE");
  await h["/alert"]({chatId:1,args:["BTC","80"]});
  assert.equal(created.conditions[0].op,"LTE");
});

test("preset commands map to explicit research alert types",async()=>{
  const types=[];
  const {deps}=make({
    alertPreset:(symbol,type)=>{types.push(type);return {symbol,type};}
  });
  const h=createMutationCommandHandlers(deps);
  await h["/alertregime"]({chatId:1,args:["BTC"],command:"/alertregime"});
  await h["/alertstructure"]({chatId:1,args:["BTC"],command:"/alertstructure"});
  await h["/alertsafety"]({chatId:1,args:["BTC"],command:"/alertsafety"});
  await h["/alertcombo"]({chatId:1,args:["BTC"],command:"/alertcombo"});
  assert.deepEqual(types,["REGIME","STRUCTURE","SAFETY","COMPOSITE"]);
});

test("clearalerts delegates persistence semantics",async()=>{
  let cleared=0;
  const {deps,sent}=make({clearAlerts:async chatId=>{cleared=chatId;return false;}});
  const h=createMutationCommandHandlers(deps);
  await h["/clearalerts"]({chatId:77,args:[]});
  assert.equal(cleared,77);
  assert.match(sent.at(-1)[1].text,/nicht schreibbar/);
});
