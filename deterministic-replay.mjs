import { canonicalJson, sha256 } from './institutional-kernel.mjs';

function eligible(event,asOf){
  return Number.isFinite(Number(event?.availableAt)) && Number(event.availableAt)<=Number(asOf);
}

export function pointInTimeEvents(events,{asOf,symbol=null,kinds=null}={}){
  if(!Number.isFinite(Number(asOf))) throw new Error('Replay asOf required');
  const kindSet=kinds?new Set(kinds):null;
  return (events||[])
    .filter(e=>eligible(e,asOf))
    .filter(e=>!symbol||String(e.streamKey).includes(`:${symbol}:`)||String(e.streamKey).endsWith(`:${symbol}`))
    .filter(e=>!kindSet||kindSet.has(e.kind))
    .sort((a,b)=>Number(a.availableAt)-Number(b.availableAt)||Number(a.seq)-Number(b.seq));
}

export function latestBySourceEventId(events,{asOf,streamKey,kind}){
  const map=new Map();
  for(const e of pointInTimeEvents(events,{asOf,kinds:[kind]})){
    if(e.streamKey!==streamKey) continue;
    const prev=map.get(e.sourceEventId);
    if(!prev||Number(e.availableAt)>Number(prev.availableAt)||(e.availableAt===prev.availableAt&&e.seq>prev.seq)){
      map.set(e.sourceEventId,e);
    }
  }
  return [...map.values()].sort((a,b)=>Number(a.eventTime)-Number(b.eventTime)||Number(a.seq)-Number(b.seq));
}

export function latestEvent(events,{asOf,streamKey,kind}){
  const xs=pointInTimeEvents(events,{asOf,kinds:[kind]}).filter(e=>e.streamKey===streamKey);
  return xs.at(-1)||null;
}

export function reconstructCandles(events,{symbol,interval,asOf}){
  const streamKey=`CANDLE:${symbol}:${interval}`;
  return latestBySourceEventId(events,{asOf,streamKey,kind:'CANDLE_CLOSE'})
    .map(e=>({...e.payload,eventTime:e.eventTime,availableAt:e.availableAt,sourceEventId:e.sourceEventId}));
}

export function reconstructInstitutionalState(events,{symbol,asOf,intervals=['4h','1h','15m','5m']}){
  const primary=latestEvent(events,{asOf,streamKey:`PRIMARY:${symbol}`,kind:'PRIMARY_MARKET'});
  const witness=latestEvent(events,{asOf,streamKey:`WITNESS:${symbol}`,kind:'WITNESS_CONSENSUS'});
  const candles={};
  for(const interval of intervals) candles[interval]=reconstructCandles(events,{symbol,interval,asOf});

  const state={
    replayVersion:'DR_V1',
    symbol,
    asOf:Number(asOf),
    primary:primary?.payload??null,
    witness:witness?.payload??null,
    candles,
    provenance:{
      primarySeq:primary?.seq??null,
      witnessSeq:witness?.seq??null,
      candleCounts:Object.fromEntries(Object.entries(candles).map(([k,v])=>[k,v.length]))
    }
  };
  return {...state,replayHash:sha256(state)};
}

export function verifyNoFutureLeakage(state){
  const violations=[];
  if(state?.primary?.availableAt>state.asOf) violations.push('PRIMARY_FUTURE');
  for(const [interval,candles] of Object.entries(state?.candles||{})){
    for(const c of candles){
      if(Number(c.availableAt)>Number(state.asOf)) violations.push(`CANDLE_FUTURE_${interval}`);
    }
  }
  return {ok:violations.length===0,violations};
}

export function replaySummary(state){
  return {
    symbol:state.symbol,
    asOf:state.asOf,
    hasPrimary:Boolean(state.primary),
    hasWitness:Boolean(state.witness),
    candleCounts:Object.fromEntries(Object.entries(state.candles||{}).map(([k,v])=>[k,v.length])),
    replayHash:state.replayHash,
    leakage:verifyNoFutureLeakage(state)
  };
}

export function compareReplayStates(a,b){
  return {
    identical:a?.replayHash===b?.replayHash,
    aHash:a?.replayHash||null,
    bHash:b?.replayHash||null,
    canonicalEqual:canonicalJson(a)===canonicalJson(b)
  };
}

export const DETERMINISTIC_REPLAY_VERSION='DR_V1';
