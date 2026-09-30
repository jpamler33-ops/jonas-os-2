import path from 'node:path';
import { mkdir, readFile, rename } from 'node:fs/promises';
import { sha256 } from './institutional-kernel.mjs';
import { atomicWriteCanonicalObjectWithArray } from './streaming-json-persistence.mjs';

export const SHADOW_OMS_SCHEMA_VERSION=1;
const SCHEMA_VERSION=SHADOW_OMS_SCHEMA_VERSION;
const EPS=1e-12;

function finite(x,fallback=null){ const n=Number(x); return Number.isFinite(n)?n:fallback; }
function clamp(x,a,b){ return Math.max(a,Math.min(b,x)); }
function round12(x){ return Math.round(Number(x)*1e12)/1e12; }

export const SHADOW_OMS_VERSION='SOMS_V1';
export const SHADOW_OMS_CAPABILITIES=Object.freeze({
  execution:'SHADOW_ONLY',
  canExecuteLive:false,
  exchangeOrderAdapter:false,
  networkOrderSubmission:false
});

export function normalizeExecutionBook({symbol,bids,asks,availableAt=Date.now(),source='UNKNOWN',provenance=''}) {
  const clean=(xs,side)=>[...(xs||[])]
    .map(([p,q])=>[finite(p),finite(q)])
    .filter(([p,q])=>p>0&&q>0)
    .sort((a,b)=>side==='BID'?b[0]-a[0]:a[0]-b[0]);
  const b=clean(bids,'BID');
  const a=clean(asks,'ASK');
  if(!b.length||!a.length) throw new Error('ORDER_BOOK_EMPTY');
  if(a[0][0]<b[0][0]) throw new Error('ORDER_BOOK_CROSSED');
  const bid=b[0][0],ask=a[0][0],mid=(bid+ask)/2;
  return {
    symbol:String(symbol),
    bids:b,
    asks:a,
    bid,ask,mid,
    spreadBps:mid>0?(ask-bid)/mid*10000:null,
    availableAt:Number(availableAt),
    source:String(source),
    provenance:String(provenance)
  };
}

export function validateShadowIntent(intent){
  const errors=[];
  const symbol=String(intent?.symbol||'').toUpperCase();
  const side=String(intent?.side||'').toUpperCase();
  const type=String(intent?.type||'').toUpperCase();
  const notionalQuote=finite(intent?.notionalQuote);
  const limitPrice=finite(intent?.limitPrice);
  const latencyMs=finite(intent?.latencyMs,0);
  if(!/^[A-Z0-9]{2,18}USDT$/.test(symbol)) errors.push('SYMBOL_INVALID');
  if(!['BUY','SELL'].includes(side)) errors.push('SIDE_INVALID');
  if(!['MARKET','LIMIT'].includes(type)) errors.push('TYPE_INVALID');
  if(!(notionalQuote>0)) errors.push('NOTIONAL_INVALID');
  if(type==='LIMIT'&&!(limitPrice>0)) errors.push('LIMIT_PRICE_INVALID');
  if(!(latencyMs>=0&&latencyMs<=5000)) errors.push('LATENCY_INVALID');
  return {
    ok:errors.length===0,
    errors,
    normalized:{symbol,side,type,notionalQuote,limitPrice:type==='LIMIT'?limitPrice:null,latencyMs}
  };
}

export function isMarketableLimit(order,book){
  if(order.type!=='LIMIT') return false;
  return order.side==='BUY'
    ? Number(order.limitPrice)>=Number(book.ask)
    : Number(order.limitPrice)<=Number(book.bid);
}

function levelEligible(order,price){
  if(order.type==='MARKET') return true;
  return order.side==='BUY'
    ? price<=Number(order.limitPrice)+EPS
    : price>=Number(order.limitPrice)-EPS;
}

export function simulateImmediateExecution(order,book,{takerFeeBps=10}={}){
  const side=order.side;
  const levels=side==='BUY'?book.asks:book.bids;
  const targetQuote=Number(order.notionalQuote);
  const targetBase=side==='BUY'?null:targetQuote/book.mid;
  let remainingQuote=targetQuote;
  let remainingBase=targetBase;
  let filledBase=0,filledQuote=0;
  const fills=[];

  for(const [price,qty] of levels){
    if(!levelEligible(order,price)) break;
    if(side==='BUY'){
      const maxQuote=price*qty;
      const takeQuote=Math.min(remainingQuote,maxQuote);
      const takeBase=takeQuote/price;
      if(takeBase<=EPS) continue;
      fills.push({price,baseQty:takeBase,quoteQty:takeQuote,liquidity:'TAKER'});
      filledBase+=takeBase;filledQuote+=takeQuote;remainingQuote-=takeQuote;
      if(remainingQuote<=EPS) break;
    } else {
      const takeBase=Math.min(remainingBase,qty);
      const takeQuote=takeBase*price;
      if(takeBase<=EPS) continue;
      fills.push({price,baseQty:takeBase,quoteQty:takeQuote,liquidity:'TAKER'});
      filledBase+=takeBase;filledQuote+=takeQuote;remainingBase-=takeBase;
      if(remainingBase<=EPS) break;
    }
  }

  const requestedBase=side==='BUY'
    ? targetQuote/(book.mid||1)
    : targetBase;
  const avgFillPrice=filledBase>EPS?filledQuote/filledBase:null;
  const fillRatio=side==='BUY'
    ? clamp(filledQuote/targetQuote,0,1)
    : clamp(filledBase/targetBase,0,1);
  const sideSign=side==='BUY'?1:-1;
  const slippageBps=avgFillPrice==null?null:sideSign*(avgFillPrice-book.mid)/book.mid*10000;
  const spreadCrossBps=side==='BUY'
    ? (book.ask-book.mid)/book.mid*10000
    : (book.mid-book.bid)/book.mid*10000;
  const feeQuote=filledQuote*Number(takerFeeBps)/10000;

  return {
    fills,
    requestedQuote:targetQuote,
    requestedBase,
    filledBase,
    filledQuote,
    remainingBase:Math.max(0,requestedBase-filledBase),
    remainingQuote:Math.max(0,targetQuote-filledQuote),
    avgFillPrice,
    fillRatio,
    slippageBps,
    spreadCrossBps,
    feeQuote,
    feeBps:Number(takerFeeBps),
    liquidity:'TAKER',
    depthExhausted:fillRatio<1-EPS
  };
}

function exactLevel(levels,price){
  const p=Number(price);
  return levels.find(([x])=>Math.abs(x-p)<=Math.max(1e-12,Math.abs(p)*1e-10))||null;
}

export function initializePassiveQueue(order,book,{hiddenQueueBufferPct=0.15}={}){
  if(order.type!=='LIMIT') throw new Error('PASSIVE_QUEUE_REQUIRES_LIMIT');
  if(isMarketableLimit(order,book)) throw new Error('MARKETABLE_LIMIT_HAS_NO_PASSIVE_QUEUE');
  const levels=order.side==='BUY'?book.bids:book.asks;
  const level=exactLevel(levels,order.limitPrice);
  const visibleQty=level?Number(level[1]):0;
  const topQty=Number(levels[0]?.[1]||0);
  const hiddenBufferBase=(level?visibleQty:topQty)*clamp(Number(hiddenQueueBufferPct),0,2);
  const queueAheadBase=visibleQty+hiddenBufferBase;
  const baseQty=Number(order.notionalQuote)/Number(order.limitPrice);
  return {
    baseQty,
    visibleQueueAheadBase:visibleQty,
    hiddenBufferBase,
    queueAheadBase,
    initialQueueAheadBase:queueAheadBase,
    queueVisibility:level?'VISIBLE_LEVEL_PLUS_BUFFER':'NEW_OR_UNSEEN_LEVEL_BUFFERED',
    queueModel:'PRICE_TIME_PROXY',
    uncertainty:level?'MEDIUM':'HIGH'
  };
}

export function createShadowOrder({intent,decisionBook,arrivalBook,config={},createdAt=Date.now(),lastAggTradeId=null}){
  const v=validateShadowIntent(intent);
  if(!v.ok) throw new Error(`INVALID_SHADOW_INTENT:${v.errors.join(',')}`);
  const i=v.normalized;
  const id=`sh_${createdAt}_${sha256({i,createdAt,decision:decisionBook.availableAt,arrival:arrivalBook.availableAt}).slice(0,10)}`;
  const marketable=i.type==='MARKET'||isMarketableLimit(i,arrivalBook);
  const base={
    id,
    schemaVersion:SCHEMA_VERSION,
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    exchangeOrderId:null,
    symbol:i.symbol,
    side:i.side,
    type:i.type,
    notionalQuote:i.notionalQuote,
    limitPrice:i.limitPrice,
    latencyMs:i.latencyMs,
    createdAt:Number(createdAt),
    decisionBook:{
      bid:decisionBook.bid,ask:decisionBook.ask,mid:decisionBook.mid,
      availableAt:decisionBook.availableAt,source:decisionBook.source
    },
    arrivalBook:{
      bid:arrivalBook.bid,ask:arrivalBook.ask,mid:arrivalBook.mid,spreadBps:arrivalBook.spreadBps,
      availableAt:arrivalBook.availableAt,source:arrivalBook.source
    },
    latencyMoveBps:(i.side==='BUY'?1:-1)*(arrivalBook.mid-decisionBook.mid)/decisionBook.mid*10000,
    status:'NEW',
    fillBase:0,
    fillQuote:0,
    avgFillPrice:null,
    feesQuote:0,
    slippageBps:null,
    spreadCrossBps:null,
    queue:null,
    lastAggTradeId:Number.isFinite(Number(lastAggTradeId))?Number(lastAggTradeId):null,
    dataQuality:'OK',
    fillEvents:[],
    markouts:{},
    updatedAt:Number(createdAt),
    config:{
      makerFeeBps:Number(config.makerFeeBps??10),
      takerFeeBps:Number(config.takerFeeBps??10),
      hiddenQueueBufferPct:Number(config.hiddenQueueBufferPct??0.15)
    }
  };

  if(marketable){
    const sim=simulateImmediateExecution(i,arrivalBook,{takerFeeBps:base.config.takerFeeBps});
    Object.assign(base,{
      status:sim.fillRatio>=1-EPS?'FILLED':sim.fillRatio>EPS?'PARTIALLY_FILLED':'UNFILLED_DEPTH',
      fillBase:sim.filledBase,
      fillQuote:sim.filledQuote,
      avgFillPrice:sim.avgFillPrice,
      feesQuote:sim.feeQuote,
      slippageBps:sim.slippageBps,
      spreadCrossBps:sim.spreadCrossBps,
      fillRatio:sim.fillRatio,
      liquidity:'TAKER',
      depthExhausted:sim.depthExhausted,
      fillEvents:sim.fills.map((f,idx)=>({
        seq:idx+1,at:arrivalBook.availableAt,price:f.price,baseQty:f.baseQty,quoteQty:f.quoteQty,liquidity:'TAKER'
      }))
    });
  } else {
    const q=initializePassiveQueue(i,arrivalBook,{hiddenQueueBufferPct:base.config.hiddenQueueBufferPct});
    Object.assign(base,{
      status:'ACTIVE',
      fillRatio:0,
      liquidity:'MAKER',
      queue:q,
      requestedBase:q.baseQty
    });
  }

  return base;
}

function tradeEligibleForMaker(order,trade){
  const price=Number(trade.price),qty=Number(trade.qty);
  if(!(price>0&&qty>0)) return false;
  if(order.side==='BUY'){
    return trade.buyerMaker===true && price<=Number(order.limitPrice)+EPS;
  }
  return trade.buyerMaker===false && price>=Number(order.limitPrice)-EPS;
}

export function applyAggTrades(order,trades,{at=Date.now()}={}){
  if(!['ACTIVE','PARTIALLY_FILLED'].includes(order.status)||order.liquidity!=='MAKER') return {order,changed:false};
  let changed=false;
  let queue=Number(order.queue?.queueAheadBase||0);
  const targetBase=Number(order.requestedBase||order.notionalQuote/order.limitPrice);
  let filledBase=Number(order.fillBase||0);
  let filledQuote=Number(order.fillQuote||0);
  const events=[...(order.fillEvents||[])];
  let lastId=order.lastAggTradeId;

  const sorted=[...(trades||[])].sort((a,b)=>Number(a.id)-Number(b.id));
  for(const t of sorted){
    const id=Number(t.id);
    if(Number.isFinite(id) && Number.isFinite(Number(lastId)) && id<=Number(lastId)) continue;
    if(Number.isFinite(id)) lastId=id;
    if(!tradeEligibleForMaker(order,t)) continue;
    let qty=Number(t.qty);
    if(queue>EPS){
      const consumed=Math.min(queue,qty);
      queue-=consumed;
      qty-=consumed;
      changed=changed||consumed>EPS;
    }
    if(qty<=EPS) continue;
    const remaining=Math.max(0,targetBase-filledBase);
    const fill=Math.min(remaining,qty);
    if(fill<=EPS) continue;
    const quote=fill*Number(order.limitPrice);
    filledBase+=fill;
    filledQuote+=quote;
    events.push({
      seq:events.length+1,
      at:Number(t.time||at),
      aggTradeId:Number.isFinite(id)?id:null,
      price:Number(order.limitPrice),
      baseQty:fill,
      quoteQty:quote,
      liquidity:'MAKER'
    });
    changed=true;
    if(filledBase>=targetBase-EPS) break;
  }

  if(!changed && lastId===order.lastAggTradeId) return {order,changed:false};

  const fillRatio=clamp(filledBase/targetBase,0,1);
  const avg=filledBase>EPS?filledQuote/filledBase:null;
  const fees=filledQuote*Number(order.config?.makerFeeBps??10)/10000;
  const sideSign=order.side==='BUY'?1:-1;
  const slippage=avg==null?null:sideSign*(avg-Number(order.arrivalBook.mid))/Number(order.arrivalBook.mid)*10000;

  const next={
    ...order,
    status:fillRatio>=1-EPS?'FILLED':fillRatio>EPS?'PARTIALLY_FILLED':'ACTIVE',
    fillBase:round12(filledBase),
    fillQuote:round12(filledQuote),
    avgFillPrice:avg,
    feesQuote:fees,
    slippageBps:slippage,
    fillRatio,
    queue:{...order.queue,queueAheadBase:Math.max(0,queue)},
    lastAggTradeId:lastId,
    fillEvents:events,
    updatedAt:Number(at)
  };
  return {order:next,changed:true};
}

export function markShadowOrder(order,{mid,at=Date.now()}){
  const m=finite(mid);
  if(!(m>0)||!(order.fillBase>EPS)||!(order.avgFillPrice>0)) return order;
  const elapsed=Math.max(0,Number(at)-Number(order.fillEvents?.[0]?.at||order.updatedAt||order.createdAt));
  const horizons=[60_000,300_000,900_000];
  const markouts={...(order.markouts||{})};
  const sideSign=order.side==='BUY'?1:-1;
  for(const h of horizons){
    const key=String(h);
    if(elapsed>=h && !markouts[key]){
      const signedBps=sideSign*(m-Number(order.avgFillPrice))/Number(order.avgFillPrice)*10000;
      markouts[key]={
        horizonMs:h,
        observedAt:Number(at),
        mid:m,
        signedMarkoutBps:signedBps,
        adverseSelectionBps:-signedBps
      };
    }
  }
  return {...order,markouts,updatedAt:Number(at)};
}

export function cancelShadowOrder(order,{at=Date.now()}={}){
  if(!['ACTIVE','PARTIALLY_FILLED'].includes(order.status)) return order;
  return {...order,status:'CANCELLED',cancelledAt:Number(at),updatedAt:Number(at)};
}

export function shadowOrderSummary(order){
  return {
    id:order.id,
    symbol:order.symbol,
    side:order.side,
    type:order.type,
    status:order.status,
    notionalQuote:order.notionalQuote,
    limitPrice:order.limitPrice,
    fillRatio:Number(order.fillRatio||0),
    avgFillPrice:order.avgFillPrice,
    slippageBps:order.slippageBps,
    feesQuote:Number(order.feesQuote||0),
    queueAheadBase:order.queue?.queueAheadBase??null,
    latencyMoveBps:order.latencyMoveBps,
    markouts:order.markouts,
    dataQuality:order.dataQuality,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

function sanitizeOrder(o){
  if(!o||typeof o!=='object'||typeof o.id!=='string') return null;
  if(o.execution!=='SHADOW_ONLY'||o.canExecuteLive!==false) return null;
  if(!/^[A-Z0-9]{2,18}USDT$/.test(String(o.symbol||''))) return null;
  if(!['BUY','SELL'].includes(o.side)||!['MARKET','LIMIT'].includes(o.type)) return null;
  return o;
}

export async function loadShadowOms(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(parsed?.schemaVersion!==SCHEMA_VERSION) throw new Error('SHADOW_OMS_SCHEMA_MISMATCH');
    const orders=(Array.isArray(parsed.orders)?parsed.orders:[]).map(sanitizeOrder).filter(Boolean);
    return {orders,recoveredFromCorrupt:false,healthy:true};
  }catch(err){
    if(err?.code==='ENOENT') return {orders:[],recoveredFromCorrupt:false,healthy:true};
    try{ await rename(filePath,`${filePath}.corrupt-${Date.now()}`); }catch{}
    return {orders:[],recoveredFromCorrupt:true,healthy:false,error:err instanceof Error?err.message:String(err)};
  }
}

export async function saveShadowOms(filePath,orders,{maxOrders=1000}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  const clean=(orders||[]).map(sanitizeOrder).filter(Boolean).slice(-Math.max(10,Number(maxOrders)||1000));
  const body={
    schemaVersion:SCHEMA_VERSION,
    updatedAt:new Date().toISOString(),
    capabilityHash:sha256(SHADOW_OMS_CAPABILITIES),
    orders:clean
  };
  await atomicWriteCanonicalObjectWithArray(filePath,body,{arrayKey:'orders'});
  return clean;
}
