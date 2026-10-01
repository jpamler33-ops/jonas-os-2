export const BIGGJ_PUBLIC_TRADER_WATCH_VERSION='BIGGJ_PUBLIC_TRADER_WATCH_V2_EDGE_COMPARE';

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
function mean(values){
  const xs=(Array.isArray(values)?values:[]).map(finite).filter(x=>x!=null);
  return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
}
function sum(values){
  const xs=(Array.isArray(values)?values:[]).map(finite).filter(x=>x!=null);
  return xs.length?xs.reduce((a,b)=>a+b,0):null;
}
function round(v,d=4){
  const n=finite(v);if(n==null)return null;
  const p=10**Math.max(0,Math.min(8,d));
  return Math.round(n*p)/p;
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

  const pnlKnown=closed.filter(x=>x.pnlRatio!=null||x.pnl!=null);
  const isWin=x=>(x.pnlRatio!=null?x.pnlRatio:x.pnl)>0;
  const isLoss=x=>(x.pnlRatio!=null?x.pnlRatio:x.pnl)<0;
  const wins=pnlKnown.filter(isWin),losses=pnlKnown.filter(isLoss);
  const realizedWinRate=(wins.length+losses.length)?wins.length/(wins.length+losses.length):null;
  const winRatios=wins.map(x=>x.pnlRatio).filter(x=>x!=null);
  const lossRatios=losses.map(x=>x.pnlRatio).filter(x=>x!=null);
  const avgWinRatio=mean(winRatios);
  const avgLossRatioAbs=lossRatios.length?Math.abs(mean(lossRatios)):null;
  const payoffRatio=avgWinRatio!=null&&avgLossRatioAbs>0?avgWinRatio/avgLossRatioAbs:null;
  const positivePnl=wins.map(x=>x.pnl).filter(x=>x!=null&&x>0);
  const negativePnl=losses.map(x=>x.pnl).filter(x=>x!=null&&x<0);
  const grossProfit=sum(positivePnl);
  const grossLoss=negativePnl.length?Math.abs(sum(negativePnl)):null;
  const profitFactor=grossProfit!=null&&grossLoss>0?grossProfit/grossLoss:null;
  const expectancyPnlRatio=mean(closed.map(x=>x.pnlRatio));
  const medianWinHoldMs=median(wins.map(x=>x.holdMs));
  const medianLossHoldMs=median(losses.map(x=>x.holdMs));
  const lossToWinHoldRatio=medianLossHoldMs!=null&&medianWinHoldMs>0?medianLossHoldMs/medianWinHoldMs:null;
  const times=closed.flatMap(x=>[x.openTime,x.closeTime]).filter(x=>x!=null);
  const spanMs=times.length?Math.max(...times)-Math.min(...times):null;
  const tradesPerDay=closed.length&&spanMs!=null?closed.length/Math.max(1,spanMs/86_400_000):null;

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
  const lossHandling=lossToWinHoldRatio==null?'UNRESOLVED':lossToWinHoldRatio<=0.80?'CUTS_LOSERS_FASTER':lossToWinHoldRatio>=1.25?'HOLDS_LOSERS_LONGER':'BALANCED_HOLD_TIME';
  const edgeShape=realizedWinRate==null?'UNRESOLVED':
    payoffRatio!=null&&payoffRatio>=1.25&&realizedWinRate>=0.50?'BALANCED_EDGE':
    payoffRatio!=null&&payoffRatio>=1.40?'PAYOFF_DRIVEN':
    realizedWinRate>=0.60?'HIT_RATE_DRIVEN':'NO_CLEAR_EDGE_SHAPE';

  return Object.freeze({
    holdingStyle,
    directionalBias,
    concentration,
    leverageStyle,
    lossHandling,
    edgeShape,
    medianHoldMs:round(medianHoldMs,0),
    medianLeverage:round(medianLeverage,2),
    longShare:round(longShare,4),
    topSymbolShare:round(topShare,4),
    topSymbols:Object.freeze(topSymbols),
    realizedWinRate:round(realizedWinRate,4),
    avgWinRatio:round(avgWinRatio,4),
    avgLossRatioAbs:round(avgLossRatioAbs,4),
    payoffRatio:round(payoffRatio,3),
    profitFactor:round(profitFactor,3),
    expectancyPnlRatio:round(expectancyPnlRatio,4),
    medianWinHoldMs:round(medianWinHoldMs,0),
    medianLossHoldMs:round(medianLossHoldMs,0),
    lossToWinHoldRatio:round(lossToWinHoldRatio,3),
    tradesPerDay:round(tradesPerDay,2),
    observedClosedTrades:closed.length,
    observedOpenPositions:open.length,
    inferred:true,
    epistemic:'INFERRED_FROM_PUBLIC_OKX_POSITION_HISTORY_NOT_SELF_DECLARED_STRATEGY'
  });
}

function cohortBehaviorSummary(traders=[]){
  const xs=(Array.isArray(traders)?traders:[]).filter(Boolean);
  const strategies=xs.map(x=>x?.strategy||{});
  return Object.freeze({
    traders:xs.length,
    observedClosedTrades:strategies.reduce((a,x)=>a+Number(x?.observedClosedTrades||0),0),
    medianLeaderboardPnl90d:round(median(xs.map(x=>x?.metrics?.pnl90d)),2),
    medianLeaderboardRoi90d:round(median(xs.map(x=>x?.metrics?.pnlRatio90d)),4),
    medianWinRate:round(median(strategies.map(x=>x?.realizedWinRate)),4),
    medianPayoffRatio:round(median(strategies.map(x=>x?.payoffRatio)),3),
    medianProfitFactor:round(median(strategies.map(x=>x?.profitFactor)),3),
    medianExpectancyPnlRatio:round(median(strategies.map(x=>x?.expectancyPnlRatio)),4),
    medianHoldMs:round(median(strategies.map(x=>x?.medianHoldMs)),0),
    medianLeverage:round(median(strategies.map(x=>x?.medianLeverage)),2),
    medianLossToWinHoldRatio:round(median(strategies.map(x=>x?.lossToWinHoldRatio)),3),
    medianTopSymbolShare:round(median(strategies.map(x=>x?.topSymbolShare)),4),
    medianTradesPerDay:round(median(strategies.map(x=>x?.tradesPerDay)),2),
    medianOpenPositions:round(median(strategies.map(x=>x?.observedOpenPositions)),1)
  });
}

export function compareTraderCohorts(topTraders=[],lowerProfitTraders=[]){
  const top=cohortBehaviorSummary(topTraders);
  const lower=cohortBehaviorSummary(lowerProfitTraders);
  const delta=(a,b,d=3)=>a!=null&&b!=null?round(a-b,d):null;
  const observations=[];
  const push=(key,label,a,b,{scale=1,unit='',better=null}={})=>{
    if(a==null||b==null)return;
    const d=a-b;
    if(Math.abs(d)<1e-9)return;
    observations.push(Object.freeze({
      key,label,
      top:round(a*scale,3),
      lower:round(b*scale,3),
      delta:round(d*scale,3),
      unit,
      direction:d>0?'HIGHER_IN_TOP':'LOWER_IN_TOP',
      interpretation:better==null?'DESCRIPTIVE_ONLY':((d>0)===better?'TOP_SAMPLE_FAVORABLE':'TOP_SAMPLE_UNFAVORABLE')
    }));
  };
  push('win_rate','Recent realized win rate',top.medianWinRate,lower.medianWinRate,{scale:100,unit:'pp',better:true});
  push('payoff','Average winner / loser size',top.medianPayoffRatio,lower.medianPayoffRatio,{better:true});
  push('profit_factor','Recent profit factor',top.medianProfitFactor,lower.medianProfitFactor,{better:true});
  push('expectancy','Mean recent trade return',top.medianExpectancyPnlRatio,lower.medianExpectancyPnlRatio,{scale:100,unit:'pp',better:true});
  push('leverage','Median leverage',top.medianLeverage,lower.medianLeverage,{unit:'x',better:null});
  push('hold_time','Median holding time',top.medianHoldMs,lower.medianHoldMs,{unit:'ms',better:null});
  push('loser_hold','Loser/winner hold-time ratio',top.medianLossToWinHoldRatio,lower.medianLossToWinHoldRatio,{better:false});
  push('concentration','Top-market concentration',top.medianTopSymbolShare,lower.medianTopSymbolShare,{scale:100,unit:'pp',better:null});
  push('frequency','Trades per observed day',top.medianTradesPerDay,lower.medianTradesPerDay,{better:null});
  return Object.freeze({
    top,
    lowerProfit:lower,
    observations:Object.freeze(observations),
    sampleQuality:top.traders>=3&&lower.traders>=3&&top.observedClosedTrades>=60&&lower.observedClosedTrades>=30?'MODERATE':'LIMITED',
    basis:'DESCRIPTIVE_PUBLIC_OKX_SAMPLE_NOT_CAUSAL',
    comparatorDefinition:'LOWER_PNL_ROWS_WITHIN_SAME_OKX_OVERVIEW_SNAPSHOT',
    limitations:Object.freeze([
      'selection bias: public OKX lead traders only',
      'overview ranking is multi-factor, not pure profit ranking',
      'history endpoint is a recent bounded sample, not lifetime trading',
      'observed differences are not proven causes of profitability'
    ])
  });
}

export function createBiggjPublicTraderWatchProvider({
  fetchImpl=globalThis.fetch,
  baseUrls=['https://www.okx.com','https://eea.okx.com','https://openapi.okx.com'],
  timeoutMs=5000,
  cacheTtlMs=5*60_000,
  minRequestGapMs=450,
  defaultLimit=5,
  comparisonCount=3,
  rankPoolSize=20,
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
    const poolSize=Math.max(max+clampInt(comparisonCount,1,5,3),clampInt(rankPoolSize,8,50,20));
    if(!force&&cache&&t-cache.at<Math.max(30_000,Number(cacheTtlMs)||300_000))return cache.value;
    const rankResult=await fetchJson('/api/v5/copytrading/public-lead-traders',{
      instType:'SWAP',
      sortType:'overview',
      state:'0',
      minLeadDays,
      page:'1',
      limit:String(poolSize)
    });
    const envelope=Array.isArray(rankResult.body?.data)?rankResult.body.data[0]:null;
    const rankPool=Array.isArray(envelope?.ranks)?envelope.ranks.slice(0,poolSize):[];
    if(!rankPool.length)throw new Error('OKX_PUBLIC_LEADERBOARD_EMPTY');
    const topRanks=rankPool.slice(0,max);
    const topCodes=new Set(topRanks.map(x=>text(x?.uniqueCode,32)).filter(Boolean));
    const comparatorRows=rankPool
      .filter(x=>!topCodes.has(text(x?.uniqueCode,32)))
      .filter(x=>finite(x?.pnl)!=null||finite(x?.pnlRatio)!=null)
      .sort((a,b)=>(finite(a?.pnl)??Infinity)-(finite(b?.pnl)??Infinity)||(finite(a?.pnlRatio)??Infinity)-(finite(b?.pnlRatio)??Infinity))
      .slice(0,clampInt(comparisonCount,1,5,3));

    const traders=[];
    const lowerProfitTraders=[];
    const errors=[];
    for(let i=0;i<topRanks.length;i++){
      try{
        const trader=await traderDetails(topRanks[i],i);
        if(trader)traders.push(trader);
      }catch(err){
        errors.push('top_rank_'+String(i+1)+':'+(err instanceof Error?err.message:String(err)));
      }
    }
    for(const row of comparatorRows){
      const providerRank=Math.max(1,rankPool.indexOf(row)+1);
      try{
        const trader=await traderDetails(row,providerRank-1);
        if(trader)lowerProfitTraders.push(trader);
      }catch(err){
        errors.push('lower_profit_rank_'+String(providerRank)+':'+(err instanceof Error?err.message:String(err)));
      }
    }
    if(!traders.length)throw new Error('OKX_PUBLIC_TRADER_DETAILS_EMPTY');
    const cohortComparison=compareTraderCohorts(traders,lowerProfitTraders);
    const enrichedTraders=traders.map(x=>Object.freeze({...x,cohortComparison}));
    const value=Object.freeze({
      version:BIGGJ_PUBLIC_TRADER_WATCH_VERSION,
      source:'OKX_PUBLIC_COPY_TRADING_API',
      sourceBase:rankResult.base,
      capturedAt:t,
      dataVersion:text(envelope?.dataVer||'',32)||null,
      rankingMethod:'OKX_OVERVIEW',
      rankPoolSize:rankPool.length,
      lowerProfitSampleSize:lowerProfitTraders.length,
      minLeadDaysSelector:String(minLeadDays||''),
      sourceReady:true,
      traders:Object.freeze(enrichedTraders),
      errors:Object.freeze(errors),
      limitations:Object.freeze({
        publicDataOnly:true,
        naturalPersonIdentity:false,
        openPositionDataMayBeDelayedMs:5*60_000,
        protectedTraderFieldsMayBeBlank:true,
        strategyIsBehavioralInference:true,
        comparisonIsDescriptiveNotCausal:true,
        lowerProfitComparatorIsWithinSameOverviewSnapshot:true,
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
