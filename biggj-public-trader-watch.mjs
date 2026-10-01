export const BIGGJ_PUBLIC_TRADER_WATCH_VERSION='BIGGJ_PUBLIC_TRADER_WATCH_V1';

function finite(v){
  if(v==null||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function text(v,max=240){
  const s=String(v??'').replace(/\s+/g,' ').trim();
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function median(values){
  const xs=(Array.isArray(values)?values:[]).map(finite).filter(x=>x!=null).sort((a,b)=>a-b);
  if(!xs.length)return null;
  const m=Math.floor(xs.length/2);
  return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;
}
function clampInt(v,min,max,fallback){
  const n=Math.floor(Number(v));
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
function sideOf(row={}){
  const side=String(row?.posSide||'').toUpperCase();
  if(side==='LONG'||side==='SHORT')return side;
  const size=finite(row?.subPos);
  if(size==null||size===0)return 'UNKNOWN';
  return size>0?'LONG':'SHORT';
}
function symbolOf(row={}){
  return text(row?.instId||row?.symbol,80).toUpperCase();
}
function normalizePosition(row={}){
  const instId=symbolOf(row);
  const positionSide=sideOf(row);
  const openTime=finite(row?.openTime);
  const openAvgPx=finite(row?.openAvgPx);
  const markPx=finite(row?.markPx);
  const leverage=finite(row?.lever);
  const upl=finite(row?.upl);
  const uplRatio=finite(row?.uplRatio);
  const margin=finite(row?.margin);
  return Object.freeze({
    id:text(row?.subPosId||'',80),
    instId,
    side:positionSide,
    leverage,
    margin,
    openAvgPx,
    markPx,
    openTime,
    upl,
    uplRatio,
    protectedFields:Boolean(!instId||openAvgPx==null||openTime==null),
    source:'OKX_PUBLIC_COPY_TRADING'
  });
}
function normalizeClosed(row={}){
  const openTime=finite(row?.openTime);
  const closeTime=finite(row?.closeTime);
  return Object.freeze({
    id:text(row?.subPosId||'',80),
    instId:symbolOf(row),
    side:sideOf(row),
    leverage:finite(row?.lever),
    pnl:finite(row?.pnl),
    pnlRatio:finite(row?.pnlRatio),
    openTime,
    closeTime,
    holdMs:openTime!=null&&closeTime!=null&&closeTime>=openTime?closeTime-openTime:null,
    source:'OKX_PUBLIC_COPY_TRADING'
  });
}

export function inferTraderBehavior(history=[],openPositions=[]){
  const closed=(Array.isArray(history)?history:[]).map(normalizeClosed);
  const open=(Array.isArray(openPositions)?openPositions:[]).map(normalizePosition);
  const observed=[...closed,...open];
  const holds=closed.map(x=>x.holdMs).filter(x=>x!=null&&x>=0&&x<=120*24*60*60_000);
  const medianHoldMs=median(holds);
  const leverage=observed.map(x=>x.leverage).filter(x=>x!=null&&x>0&&x<500);
  const medianLeverage=median(leverage);
  const directional=observed.filter(x=>x.side==='LONG'||x.side==='SHORT');
  const longs=directional.filter(x=>x.side==='LONG').length;
  const longShare=directional.length?longs/directional.length:null;
  const counts=new Map();
  for(const x of observed){
    if(!x.instId)continue;
    counts.set(x.instId,(counts.get(x.instId)||0)+1);
  }
  const topSymbols=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([symbol,count])=>({symbol,count}));
  const topShare=observed.length&&topSymbols.length?topSymbols[0].count/observed.length:null;
  let holdingStyle='UNRESOLVED';
  if(medianHoldMs!=null){
    if(medianHoldMs<2*60*60_000)holdingStyle='SCALP';
    else if(medianHoldMs<12*60*60_000)holdingStyle='INTRADAY';
    else if(medianHoldMs<72*60*60_000)holdingStyle='SWING';
    else holdingStyle='POSITION';
  }
  let directionalBias='UNRESOLVED';
  if(longShare!=null){
    if(longShare>=0.70)directionalBias='LONG_BIAS';
    else if(longShare<=0.30)directionalBias='SHORT_BIAS';
    else directionalBias='TWO_WAY';
  }
  const concentration=topShare==null?'UNRESOLVED':topShare>=0.60?'CONCENTRATED':'DIVERSIFIED';
  const leverageStyle=medianLeverage==null?'UNRESOLVED':medianLeverage>=10?'HIGH_LEVERAGE':medianLeverage>=4?'MODERATE_LEVERAGE':'LOW_LEVERAGE';
  return Object.freeze({
    holdingStyle,
    directionalBias,
    concentration,
    leverageStyle,
    medianHoldMs,
    medianLeverage,
    longShare,
    topSymbols:Object.freeze(topSymbols),
    observedClosedTrades:closed.length,
    observedOpenPositions:open.length,
    inferred:true,
    epistemic:'INFERRED_FROM_PUBLIC_OKX_POSITION_HISTORY_NOT_SELF_DECLARED_STRATEGY'
  });
}

export function createBiggjPublicTraderWatchProvider({
  fetchImpl=globalThis.fetch,
  baseUrls=['https://www.okx.com','https://eea.okx.com','https://openapi.okx.com'],
  timeoutMs=5000,
  cacheTtlMs=5*60_000,
  minRequestGapMs=450,
  defaultLimit=5,
  minLeadDays='2',
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const bases=(Array.isArray(baseUrls)?baseUrls:[baseUrls]).map(x=>String(x||'').replace(/\/+$/,'')).filter(Boolean);
  if(!bases.length)throw new Error('at least one OKX base URL required');
  let cache=null;
  let lastRequestAt=0;

  async function throttle(){
    const gap=Math.max(0,Number(minRequestGapMs)||0);
    const wait=gap-(Number(now())-lastRequestAt);
    if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
    lastRequestAt=Number(now());
  }

  async function fetchJson(path,params={}){
    const errors=[];
    for(const base of bases){
      await throttle();
      const u=new URL(base+path);
      for(const [k,v] of Object.entries(params))if(v!=null&&v!=='')u.searchParams.set(k,String(v));
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||5000));
      try{
        const res=await fetchImpl(u.toString(),{
          method:'GET',
          headers:{accept:'application/json','user-agent':'BIGGJ/1.0 public-trader-watch'},
          signal:controller.signal
        });
        if(!res?.ok)throw new Error('HTTP_'+String(res?.status??'UNKNOWN'));
        const body=await res.json();
        if(String(body?.code??'')!=='0')throw new Error('OKX_CODE_'+String(body?.code??'UNKNOWN')+':'+text(body?.msg,120));
        return {body,base};
      }catch(err){
        errors.push(base+':'+(err instanceof Error?err.message:String(err)));
      }finally{
        clearTimeout(timer);
      }
    }
    throw new Error('OKX_PUBLIC_COPY_TRADING_FAILED:'+errors.join(' | '));
  }

  async function traderDetails(rankRow,index){
    const uniqueCode=text(rankRow?.uniqueCode,32);
    if(!uniqueCode)return null;
    const errors=[];
    let openRaw=[],historyRaw=[];
    try{
      const x=await fetchJson('/api/v5/copytrading/public-current-subpositions',{
        instType:'SWAP',uniqueCode,limit:'50'
      });
      openRaw=Array.isArray(x.body?.data)?x.body.data:[];
    }catch(err){errors.push('open:'+(err instanceof Error?err.message:String(err)));}
    try{
      const x=await fetchJson('/api/v5/copytrading/public-subpositions-history',{
        instType:'SWAP',uniqueCode,limit:'50'
      });
      historyRaw=Array.isArray(x.body?.data)?x.body.data:[];
    }catch(err){errors.push('history:'+(err instanceof Error?err.message:String(err)));}
    const openPositions=openRaw.map(normalizePosition);
    const recentClosed=historyRaw.map(normalizeClosed);
    const strategy=inferTraderBehavior(historyRaw,openRaw);
    return Object.freeze({
      providerRank:index+1,
      uniqueCode,
      nickname:text(rankRow?.nickName||'Public Lead Trader',80),
      avatarUrl:text(rankRow?.portLink||'',500),
      metrics:Object.freeze({
        pnl90d:finite(rankRow?.pnl),
        pnlRatio90d:finite(rankRow?.pnlRatio),
        winRatio:finite(rankRow?.winRatio),
        aum:finite(rankRow?.aum),
        copyTraderNum:finite(rankRow?.copyTraderNum),
        accumulatedCopyTraderNum:finite(rankRow?.accCopyTraderNum),
        leadDays:finite(rankRow?.leadDays)
      }),
      instruments:Object.freeze((Array.isArray(rankRow?.traderInsts)?rankRow.traderInsts:[]).map(x=>text(x,80)).filter(Boolean).slice(0,20)),
      openPositions:Object.freeze(openPositions.slice(0,12)),
      recentClosed:Object.freeze(recentClosed.slice(0,50)),
      strategy,
      detailErrors:Object.freeze(errors),
      publicProfileOnly:true
    });
  }

  async function fetchTopTraders({limit=defaultLimit,force=false}={}){
    const t=Number(now());
    const max=clampInt(limit,1,8,5);
    if(!force&&cache&&t-cache.at<Math.max(30_000,Number(cacheTtlMs)||300_000))return cache.value;
    const rankResult=await fetchJson('/api/v5/copytrading/public-lead-traders',{
      instType:'SWAP',
      sortType:'overview',
      state:'0',
      minLeadDays,
      page:'1',
      limit:String(max)
    });
    const envelope=Array.isArray(rankResult.body?.data)?rankResult.body.data[0]:null;
    const ranks=Array.isArray(envelope?.ranks)?envelope.ranks.slice(0,max):[];
    if(!ranks.length)throw new Error('OKX_PUBLIC_LEADERBOARD_EMPTY');
    const traders=[];
    const errors=[];
    for(let i=0;i<ranks.length;i++){
      try{
        const trader=await traderDetails(ranks[i],i);
        if(trader)traders.push(trader);
      }catch(err){
        errors.push('rank_'+String(i+1)+':'+(err instanceof Error?err.message:String(err)));
      }
    }
    if(!traders.length)throw new Error('OKX_PUBLIC_TRADER_DETAILS_EMPTY');
    const value=Object.freeze({
      version:BIGGJ_PUBLIC_TRADER_WATCH_VERSION,
      source:'OKX_PUBLIC_COPY_TRADING_API',
      sourceBase:rankResult.base,
      capturedAt:t,
      dataVersion:text(envelope?.dataVer||'',32)||null,
      rankingMethod:'OKX_OVERVIEW',
      minLeadDaysSelector:String(minLeadDays||''),
      sourceReady:true,
      traders:Object.freeze(traders),
      errors:Object.freeze(errors),
      limitations:Object.freeze({
        publicDataOnly:true,
        naturalPersonIdentity:false,
        openPositionDataMayBeDelayedMs:5*60_000,
        protectedTraderFieldsMayBeBlank:true,
        strategyIsBehavioralInference:true,
        notTradeAdvice:true
      })
    });
    cache={at:t,value};
    return value;
  }

  return Object.freeze({
    version:BIGGJ_PUBLIC_TRADER_WATCH_VERSION,
    fetchTopTraders
  });
}
