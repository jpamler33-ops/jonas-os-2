export const CFTC_COT_PUBLIC_PROVIDER_VERSION='TCX_CFTC_COT_PUBLIC_PROVIDER_V1';

export const CFTC_COT_CONTRACTS=Object.freeze({
  BTCUSDT:Object.freeze({contractCode:'133741',contractName:'BITCOIN',venue:'CHICAGO MERCANTILE EXCHANGE'}),
  ETHUSDT:Object.freeze({contractCode:'146021',contractName:'ETHER CASH SETTLED',venue:'CHICAGO MERCANTILE EXCHANGE'}),
  SOLUSDT:Object.freeze({contractCode:'177LM1',contractName:'NANO SOLANA',venue:'COINBASE DERIVATIVES, LLC'})
});

function finite(v){
  if(v==null||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function ratio(num,den){
  const n=finite(num),d=finite(den);
  return n!=null&&d!=null&&d!==0?n/d:null;
}
function sharePct(v){
  const n=finite(v);
  return n==null?null:n/100;
}
function log1pNonNegative(v){
  const n=finite(v);
  return n!=null&&n>=0?Math.log1p(n):null;
}
function parseDateMs(v){
  const t=Date.parse(String(v??'').trim());
  return Number.isFinite(t)?t:null;
}
function text(v,max=240){
  const s=String(v??'').trim();
  return s.length<=max?s:s.slice(0,max);
}
function positionBlock(row,prefix){
  const long=finite(row?.[prefix+'_positions_long'+(prefix==='dealer'?'_all':'')]);
  const short=finite(row?.[prefix+'_positions_short'+(prefix==='dealer'?'_all':'')]);
  const spread=finite(row?.[prefix+'_positions_spread'+(prefix==='dealer'?'_all':'')]);
  const oi=finite(row?.open_interest_all);
  return Object.freeze({
    long,
    short,
    spread,
    netShare:long!=null&&short!=null&&oi!=null&&oi>0?(long-short)/oi:null
  });
}
function normalizeRow(row,{symbol,contract,capturedAt}){
  const reportDate=parseDateMs(row?.report_date_as_yyyy_mm_dd);
  const openInterest=finite(row?.open_interest_all);
  if(!row?.id||reportDate==null||openInterest==null||openInterest<0) return null;
  if(reportDate>Number(capturedAt)+5000) return null;
  const levLong=finite(row?.lev_money_positions_long);
  const levShort=finite(row?.lev_money_positions_short);
  const amLong=finite(row?.asset_mgr_positions_long);
  const amShort=finite(row?.asset_mgr_positions_short);
  const dealerLong=finite(row?.dealer_positions_long_all);
  const dealerShort=finite(row?.dealer_positions_short_all);
  const nonrepLong=finite(row?.nonrept_positions_long_all);
  const nonrepShort=finite(row?.nonrept_positions_short_all);
  return Object.freeze({
    ok:true,
    version:CFTC_COT_PUBLIC_PROVIDER_VERSION,
    symbol,
    source:'CFTC_TFF_FUTURES_ONLY',
    sourceEventId:String(row.id),
    contractCode:contract.contractCode,
    contractMarketName:text(row?.contract_market_name||contract.contractName),
    marketAndExchange:text(row?.market_and_exchange_names),
    reportDate,
    reportWeek:text(row?.yyyy_report_week_ww,80),
    capturedAt,
    availableAt:capturedAt,
    openInterest,
    changeOpenInterest:finite(row?.change_in_open_interest_all),
    dealer:Object.freeze({
      long:dealerLong,
      short:dealerShort,
      spread:finite(row?.dealer_positions_spread_all),
      netShare:dealerLong!=null&&dealerShort!=null&&openInterest>0?(dealerLong-dealerShort)/openInterest:null,
      longShare:sharePct(row?.pct_of_oi_dealer_long_all),
      shortShare:sharePct(row?.pct_of_oi_dealer_short_all)
    }),
    assetManager:Object.freeze({
      long:amLong,
      short:amShort,
      spread:finite(row?.asset_mgr_positions_spread),
      netShare:amLong!=null&&amShort!=null&&openInterest>0?(amLong-amShort)/openInterest:null,
      longShare:sharePct(row?.pct_of_oi_asset_mgr_long),
      shortShare:sharePct(row?.pct_of_oi_asset_mgr_short)
    }),
    leveragedMoney:Object.freeze({
      long:levLong,
      short:levShort,
      spread:finite(row?.lev_money_positions_spread),
      netShare:levLong!=null&&levShort!=null&&openInterest>0?(levLong-levShort)/openInterest:null,
      longShare:sharePct(row?.pct_of_oi_lev_money_long),
      shortShare:sharePct(row?.pct_of_oi_lev_money_short)
    }),
    nonreportable:Object.freeze({
      long:nonrepLong,
      short:nonrepShort,
      netShare:nonrepLong!=null&&nonrepShort!=null&&openInterest>0?(nonrepLong-nonrepShort)/openInterest:null
    }),
    top4LongConcentration:sharePct(row?.conc_gross_le_4_tdr_long),
    top4ShortConcentration:sharePct(row?.conc_gross_le_4_tdr_short),
    traderCount:finite(row?.traders_tot_all),
    commodity:text(row?.commodity||row?.commodity_name),
    endpoint:'https://publicreporting.cftc.gov/resource/gpe5-46if.json',
    timestampSemantics:'REPORT_DATE_EVENT_TIME_CAPTURE_TIME_AVAILABILITY',
    epistemic:'OFFICIAL_WEEKLY_POSITIONING_REPORT_NOT_LIVE_FLOW_OR_FORECAST'
  });
}

export function cftcCotSnapshotToExtraFeatures(snapshot){
  if(!snapshot?.ok) return [];
  const rows=[];
  const add=(id,value)=>{
    const n=finite(value);
    if(n!=null) rows.push({id,value:n});
  };
  add('research.cftc.openInterestLog',log1pNonNegative(snapshot.openInterest));
  add('research.cftc.openInterestChangeShare',ratio(snapshot.changeOpenInterest,snapshot.openInterest));
  add('research.cftc.dealerNetShare',snapshot?.dealer?.netShare);
  add('research.cftc.assetManagerNetShare',snapshot?.assetManager?.netShare);
  add('research.cftc.leveragedMoneyNetShare',snapshot?.leveragedMoney?.netShare);
  add('research.cftc.nonreportableNetShare',snapshot?.nonreportable?.netShare);
  add('research.cftc.assetManagerLongShare',snapshot?.assetManager?.longShare);
  add('research.cftc.assetManagerShortShare',snapshot?.assetManager?.shortShare);
  add('research.cftc.leveragedMoneyLongShare',snapshot?.leveragedMoney?.longShare);
  add('research.cftc.leveragedMoneyShortShare',snapshot?.leveragedMoney?.shortShare);
  add('research.cftc.top4LongConcentration',snapshot.top4LongConcentration);
  add('research.cftc.top4ShortConcentration',snapshot.top4ShortConcentration);
  return rows;
}

export function createCftcCotPublicProvider({
  fetchImpl=globalThis.fetch,
  baseUrl='https://publicreporting.cftc.gov/resource/gpe5-46if.json',
  timeoutMs=8000,
  cacheTtlMs=6*60*60_000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation required');
  const cache=new Map();

  async function fetchSnapshot(symbol,{force=false}={}){
    const s=String(symbol||'').toUpperCase();
    const contract=CFTC_COT_CONTRACTS[s];
    if(!contract) return Object.freeze({
      ok:false,
      applicable:false,
      status:'NOT_APPLICABLE',
      symbol:s,
      reason:'CFTC_CONTRACT_NOT_APPLICABLE',
      version:CFTC_COT_PUBLIC_PROVIDER_VERSION
    });
    const t=Number(now());
    const hit=cache.get(s);
    if(!force&&hit&&t-hit.at<cacheTtlMs) return hit.value;

    const u=new URL(baseUrl);
    u.searchParams.set('$select',[
      'id','market_and_exchange_names','report_date_as_yyyy_mm_dd','yyyy_report_week_ww',
      'contract_market_name','cftc_contract_market_code','commodity','commodity_name',
      'open_interest_all','change_in_open_interest_all',
      'dealer_positions_long_all','dealer_positions_short_all','dealer_positions_spread_all',
      'asset_mgr_positions_long','asset_mgr_positions_short','asset_mgr_positions_spread',
      'lev_money_positions_long','lev_money_positions_short','lev_money_positions_spread',
      'nonrept_positions_long_all','nonrept_positions_short_all',
      'pct_of_oi_dealer_long_all','pct_of_oi_dealer_short_all',
      'pct_of_oi_asset_mgr_long','pct_of_oi_asset_mgr_short',
      'pct_of_oi_lev_money_long','pct_of_oi_lev_money_short',
      'conc_gross_le_4_tdr_long','conc_gross_le_4_tdr_short','traders_tot_all'
    ].join(','));
    u.searchParams.set('$where',"cftc_contract_market_code='"+contract.contractCode.replace(/'/g,"''")+"'");
    u.searchParams.set('$order','report_date_as_yyyy_mm_dd DESC');
    u.searchParams.set('$limit','1');

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||8000));
    try{
      const res=await fetchImpl(u.toString(),{
        method:'GET',
        headers:{accept:'application/json','user-agent':'BIGGJ/1.0 CFTC-COT-research'},
        signal:controller.signal
      });
      if(!res?.ok) throw new Error('CFTC_COT_HTTP_'+String(res?.status??'UNKNOWN'));
      const body=await res.json();
      const row=Array.isArray(body)?body[0]:null;
      const value=normalizeRow(row,{symbol:s,contract,capturedAt:t});
      if(!value) throw new Error('CFTC_COT_ROW_MISSING');
      cache.set(s,{at:t,value});
      return value;
    }finally{
      clearTimeout(timer);
    }
  }

  return Object.freeze({version:CFTC_COT_PUBLIC_PROVIDER_VERSION,fetchSnapshot});
}