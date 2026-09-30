export const OFFICIAL_PRIMARY_RESEARCH_PROVIDER_VERSION='TCX_OFFICIAL_PRIMARY_RESEARCH_PROVIDER_V1';

const TREASURY_URL='https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query';
const SEC_TICKERS_URL='https://www.sec.gov/files/company_tickers.json';
const SEC_SUBMISSIONS_BASE='https://data.sec.gov/submissions/';
const COINBASE_STATUS_URL='https://status.coinbase.com/api/v2/summary.json';
const KRAKEN_STATUS_URL='https://status.kraken.com/api/v2/summary.json';
const COINBASE_PRODUCTS_URL='https://api.exchange.coinbase.com/products';
const KRAKEN_PAIRS_URL='https://api.kraken.com/0/public/AssetPairs';

const TRACKED_TREASURY_TERMS=Object.freeze(['2-Year','10-Year','30-Year']);
const RELEVANT_SEC_FORMS=new Set([
  '8-K','8-K/A','10-Q','10-Q/A','10-K','10-K/A','6-K','20-F',
  'S-1','S-1/A','S-3','S-3/A','424B3','424B5','SC 13D','SC 13G'
]);

function finite(v){
  if(v==null||v==='') return null;
  const n=Number(String(v).replaceAll(',',''));
  return Number.isFinite(n)?n:null;
}
function text(v,max=500){
  const s=String(v??'').replace(/\s+/g,' ').trim();
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function parseDateMs(v){
  const s=String(v??'').trim();
  if(/^\d{14}$/.test(s)){
    const iso=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T'+s.slice(8,10)+':'+s.slice(10,12)+':'+s.slice(12,14)+'Z';
    const t=Date.parse(iso);
    return Number.isFinite(t)?t:null;
  }
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
    const t=Date.parse(s+'T00:00:00Z');
    return Number.isFinite(t)?t:null;
  }
  const t=Date.parse(s);
  return Number.isFinite(t)?t:null;
}
function logAmount(v){
  const n=finite(v);
  return n!=null&&n>=0?Math.log1p(n):null;
}
function ratio(a,b){
  const n=finite(a),d=finite(b);
  return n!=null&&d!=null&&d>0?n/d:null;
}
function clamp01(v){
  const n=finite(v);
  return n==null?null:Math.max(0,Math.min(1,n));
}
function stableSortedSet(values){
  return [...new Set((values||[]).map(x=>String(x).trim().toUpperCase()).filter(Boolean))].sort();
}
function impactCode(v){
  return ({none:0,minor:1/3,major:2/3,critical:1}[String(v||'').toLowerCase()])??0;
}
function filingClass(form){
  const f=String(form||'').toUpperCase();
  if(f.startsWith('8-K')||f==='6-K') return 1;
  if(f.startsWith('10-Q')||f.startsWith('10-K')||f==='20-F') return 2;
  if(f.startsWith('S-1')||f.startsWith('S-3')||f.startsWith('424B')) return 3;
  if(f.includes('13D')||f.includes('13G')) return 4;
  return 0;
}
function tickerAssets(ticker){
  const t=String(ticker||'').toUpperCase();
  if(t==='COIN') return Object.freeze(['BTC','ETH','SOL','CRYPTO','RISK']);
  if(['MSTR','MARA','RIOT'].includes(t)) return Object.freeze(['BTC','RISK']);
  return Object.freeze(['CRYPTO','RISK']);
}
function filingRelevantToSymbol(filing,symbol){
  const base=String(symbol||'').toUpperCase().replace(/USDT$/,'');
  const assets=new Set(filing?.affectedAssets||[]);
  return assets.has(base)||assets.has('CRYPTO');
}

export function treasuryAuctionToExtraFeatures(row){
  if(!row?.ok) return [];
  const out=[];
  const add=(id,v)=>{const n=finite(v);if(n!=null)out.push({id,value:n});};
  add('research.treasury.bidToCover',row.bidToCoverRatio);
  add('research.treasury.clearingRatePct',row.clearingRatePct);
  add('research.treasury.totalAcceptedLogUsd',logAmount(row.totalAccepted));
  add('research.treasury.primaryDealerAcceptedShare',ratio(row.primaryDealerAccepted,row.totalAccepted));
  add('research.treasury.directBidderAcceptedShare',ratio(row.directBidderAccepted,row.totalAccepted));
  add('research.treasury.indirectBidderAcceptedShare',ratio(row.indirectBidderAccepted,row.totalAccepted));
  add('research.treasury.offeringAcceptedRatio',ratio(row.totalAccepted,row.offeringAmount));
  return out;
}

export function secFilingToExtraFeatures(row){
  if(!row?.ok) return [];
  const out=[
    {id:'research.sec.filingPresent',value:1},
    {id:'research.sec.formClassCode',value:filingClass(row.form)},
    {id:'research.sec.isCurrentReport',value:['8-K','8-K/A','6-K'].includes(String(row.form||'').toUpperCase())?1:0},
    {id:'research.sec.isPeriodicReport',value:/^(10-Q|10-K|20-F)/i.test(String(row.form||''))?1:0},
    {id:'research.sec.isOfferingFiling',value:/^(S-1|S-3|424B)/i.test(String(row.form||''))?1:0},
    {id:'research.sec.isOwnershipFiling',value:/13D|13G/i.test(String(row.form||''))?1:0}
  ];
  return out;
}

export function exchangeContextToExtraFeatures(row){
  if(!row?.ok) return [];
  const out=[];
  const add=(id,v)=>{const n=finite(v);if(n!=null)out.push({id,value:n});};
  add('research.exchange.coinbaseIncidentSeverity',row?.coinbase?.incidentSeverity);
  add('research.exchange.krakenIncidentSeverity',row?.kraken?.incidentSeverity);
  add('research.exchange.coinbaseUnresolvedIncidentCount',row?.coinbase?.unresolvedIncidents);
  add('research.exchange.krakenUnresolvedIncidentCount',row?.kraken?.unresolvedIncidents);
  add('research.exchange.coinbaseProductCountLog',logAmount(row?.coinbase?.productCount));
  add('research.exchange.krakenPairCountLog',logAmount(row?.kraken?.pairCount));
  add('research.exchange.coinbaseAddedMarkets',row?.coinbase?.addedMarkets);
  add('research.exchange.coinbaseRemovedMarkets',row?.coinbase?.removedMarkets);
  add('research.exchange.krakenAddedMarkets',row?.kraken?.addedMarkets);
  add('research.exchange.krakenRemovedMarkets',row?.kraken?.removedMarkets);
  add('research.exchange.btcVenueCoverage',row?.assetCoverage?.BTC);
  add('research.exchange.ethVenueCoverage',row?.assetCoverage?.ETH);
  add('research.exchange.solVenueCoverage',row?.assetCoverage?.SOL);
  return out;
}

function normalizeTreasury(row,capturedAt){
  const auctionDate=parseDateMs(row?.auction_date);
  const recordDate=parseDateMs(row?.record_date);
  if(!row?.cusip||auctionDate==null||auctionDate>capturedAt+5000) return null;
  const term=text(row?.security_term,40);
  if(!TRACKED_TREASURY_TERMS.includes(term)) return null;
  const clearingRatePct=finite(row?.high_yield)??finite(row?.high_investment_rate)??finite(row?.high_discount_rate);
  return Object.freeze({
    ok:true,
    source:'US_TREASURY_FISCAL_DATA_AUCTIONS',
    sourceEventId:String(row.cusip)+':'+String(row.auction_date),
    cusip:text(row.cusip,24),
    securityType:text(row?.security_type,30),
    securityTerm:term,
    auctionDate,
    recordDate:recordDate??auctionDate,
    capturedAt,
    availableAt:capturedAt,
    clearingRatePct,
    bidToCoverRatio:finite(row?.bid_to_cover_ratio),
    offeringAmount:finite(row?.offering_amt),
    totalAccepted:finite(row?.total_accepted),
    primaryDealerAccepted:finite(row?.primary_dealer_accepted),
    directBidderAccepted:finite(row?.direct_bidder_accepted),
    indirectBidderAccepted:finite(row?.indirect_bidder_accepted),
    endpoint:TREASURY_URL,
    epistemic:'OFFICIAL_TREASURY_AUCTION_RESULT_NOT_FORECAST_OR_DIRECTIONAL_SIGNAL'
  });
}

function latestByTerm(rows){
  const out=new Map();
  for(const row of rows){
    if(!row) continue;
    const prior=out.get(row.securityTerm);
    if(!prior||row.auctionDate>prior.auctionDate) out.set(row.securityTerm,row);
  }
  return TRACKED_TREASURY_TERMS.map(x=>out.get(x)).filter(Boolean);
}

function secTickerMap(raw){
  const map=new Map();
  for(const row of Object.values(raw&&typeof raw==='object'?raw:{})){
    const ticker=String(row?.ticker||'').toUpperCase();
    const cik=Number(row?.cik_str);
    if(ticker&&Number.isFinite(cik)) map.set(ticker,String(Math.trunc(cik)).padStart(10,'0'));
  }
  return map;
}

function normalizeSecFilings(body,{ticker,cik,capturedAt,maxRows=3,maxAgeMs=21*24*60*60_000}){
  const recent=body?.filings?.recent||{};
  const forms=Array.isArray(recent.form)?recent.form:[];
  const out=[];
  for(let i=0;i<forms.length&&out.length<maxRows;i++){
    const form=String(forms[i]||'');
    if(!RELEVANT_SEC_FORMS.has(form)) continue;
    const accession=text(recent.accessionNumber?.[i],40);
    if(!accession) continue;
    const acceptanceDateTime=parseDateMs(recent.acceptanceDateTime?.[i]);
    const filingDate=parseDateMs(recent.filingDate?.[i]);
    const eventTime=acceptanceDateTime??filingDate;
    if(eventTime==null||eventTime>capturedAt+5000||capturedAt-eventTime>maxAgeMs) continue;
    const primaryDocument=text(recent.primaryDocument?.[i],180);
    const accessionPath=accession.replaceAll('-','');
    const url=primaryDocument
      ?'https://www.sec.gov/Archives/edgar/data/'+String(Number(cik))+'/'+accessionPath+'/'+primaryDocument
      :'https://www.sec.gov/Archives/edgar/data/'+String(Number(cik))+'/'+accessionPath+'/';
    out.push(Object.freeze({
      ok:true,
      source:'SEC_EDGAR_SUBMISSIONS',
      sourceEventId:accession,
      ticker,
      cik,
      companyName:text(body?.name,200),
      form,
      filingDate,
      acceptanceDateTime,
      eventTime,
      capturedAt,
      availableAt:capturedAt,
      primaryDocument,
      url,
      affectedAssets:tickerAssets(ticker),
      epistemic:'OFFICIAL_SEC_FILING_METADATA_NOT_CONTENT_INTERPRETATION_OR_FORECAST'
    }));
  }
  return out;
}

function productBaseCoinbase(product){
  return String(product?.base_currency||product?.base||'').toUpperCase();
}
function productBaseKraken(pair){
  const ws=String(pair?.wsname||'');
  const base=ws.includes('/')?ws.split('/')[0]:'';
  return base.toUpperCase().replace(/^XBT$/,'BTC');
}
function pairIdKraken(key,pair){
  return String(pair?.wsname||pair?.altname||key||'').toUpperCase();
}
function universeDelta(prior,current){
  if(!prior) return {added:null,removed:null};
  const a=new Set(prior),b=new Set(current);
  let added=0,removed=0;
  for(const x of b) if(!a.has(x)) added++;
  for(const x of a) if(!b.has(x)) removed++;
  return {added,removed};
}

export function createOfficialPrimaryResearchProvider({
  fetchImpl=globalThis.fetch,
  timeoutMs=8000,
  cacheTtlMs=5*60_000,
  secTickerMapTtlMs=6*60*60_000,
  secTickers=['COIN','MSTR','MARA','RIOT'],
  secUserAgent='BIGGJ/1.0 research-only',
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation required');
  let contextCache=null;
  let tickerCache=null;
  let coinbaseUniverse=null;
  let krakenUniverse=null;

  async function fetchJson(url,{headers={}}={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1500,Number(timeoutMs)||8000));
    try{
      const res=await fetchImpl(url,{
        method:'GET',
        headers:{accept:'application/json','user-agent':'BIGGJ/1.0 governed-public-research',...headers},
        signal:controller.signal
      });
      if(!res?.ok) throw new Error('HTTP_'+String(res?.status??'UNKNOWN')+' '+url);
      return await res.json();
    }finally{clearTimeout(timer);}
  }

  async function fetchTreasury(capturedAt){
    const u=new URL(TREASURY_URL);
    u.searchParams.set('fields',[
      'record_date','cusip','security_type','security_term','auction_date',
      'high_yield','high_investment_rate','high_discount_rate','bid_to_cover_ratio',
      'offering_amt','total_accepted','primary_dealer_accepted','direct_bidder_accepted','indirect_bidder_accepted'
    ].join(','));
    u.searchParams.set('sort','-auction_date');
    u.searchParams.set('page[size]','100');
    const body=await fetchJson(u.toString());
    const rows=(Array.isArray(body?.data)?body.data:[]).map(x=>normalizeTreasury(x,capturedAt)).filter(Boolean);
    return Object.freeze({
      ok:rows.length>0,
      source:'US_TREASURY_FISCAL_DATA_AUCTIONS',
      capturedAt,
      rows:Object.freeze(latestByTerm(rows)),
      endpoint:TREASURY_URL,
      epistemic:'OFFICIAL_AUCTION_RESULTS_POINT_IN_TIME_CAPTURE'
    });
  }

  async function tickerMap(capturedAt){
    if(tickerCache&&capturedAt-tickerCache.at<secTickerMapTtlMs) return tickerCache.value;
    const raw=await fetchJson(SEC_TICKERS_URL,{headers:{'user-agent':secUserAgent}});
    const value=secTickerMap(raw);
    tickerCache={at:capturedAt,value};
    return value;
  }

  async function fetchSec(capturedAt){
    const map=await tickerMap(capturedAt);
    const configured=stableSortedSet(secTickers);
    const settled=await Promise.allSettled(configured.map(async ticker=>{
      const cik=map.get(ticker);
      if(!cik) throw new Error('SEC_CIK_NOT_FOUND:'+ticker);
      const body=await fetchJson(SEC_SUBMISSIONS_BASE+'CIK'+cik+'.json',{headers:{'user-agent':secUserAgent}});
      return normalizeSecFilings(body,{ticker,cik,capturedAt});
    }));
    const rows=[],errors=[];
    settled.forEach((r,i)=>{
      if(r.status==='fulfilled') rows.push(...r.value);
      else errors.push({ticker:configured[i],error:r.reason instanceof Error?r.reason.message:String(r.reason)});
    });
    return Object.freeze({
      ok:rows.length>0,
      source:'SEC_EDGAR_SUBMISSIONS',
      capturedAt,
      trackedTickers:Object.freeze(configured),
      rows:Object.freeze(rows),
      errors:Object.freeze(errors),
      epistemic:'OFFICIAL_EDGAR_SUBMISSIONS_METADATA_NOT_CONTENT_INTERPRETATION'
    });
  }

  async function fetchExchange(capturedAt){
    const settled=await Promise.allSettled([
      fetchJson(COINBASE_STATUS_URL),
      fetchJson(KRAKEN_STATUS_URL),
      fetchJson(COINBASE_PRODUCTS_URL),
      fetchJson(KRAKEN_PAIRS_URL)
    ]);
    const [cbStatus,kStatus,cbProducts,kPairs]=settled.map(x=>x.status==='fulfilled'?x.value:null);
    const errors=settled.map((x,i)=>x.status==='rejected'?{
      source:['COINBASE_STATUS','KRAKEN_STATUS','COINBASE_PRODUCTS','KRAKEN_PAIRS'][i],
      error:x.reason instanceof Error?x.reason.message:String(x.reason)
    }:null).filter(Boolean);

    const cbRows=Array.isArray(cbProducts)?cbProducts:[];
    const krRows=kPairs?.result&&typeof kPairs.result==='object'?Object.entries(kPairs.result):[];
    const cbIds=stableSortedSet(cbRows.map(x=>x?.id));
    const krIds=stableSortedSet(krRows.map(([key,pair])=>pairIdKraken(key,pair)));
    const cbDelta=universeDelta(coinbaseUniverse,cbIds);
    const krDelta=universeDelta(krakenUniverse,krIds);
    if(cbIds.length) coinbaseUniverse=cbIds;
    if(krIds.length) krakenUniverse=krIds;

    const cbBases=new Set(cbRows.map(productBaseCoinbase).filter(Boolean));
    const krBases=new Set(krRows.map(([,pair])=>productBaseKraken(pair)).filter(Boolean));
    const coverage=asset=>Number(cbBases.has(asset))+Number(krBases.has(asset));

    const cbIncidents=Array.isArray(cbStatus?.incidents)?cbStatus.incidents:[];
    const krIncidents=Array.isArray(kStatus?.incidents)?kStatus.incidents:[];
    const severity=rows=>rows.reduce((m,x)=>Math.max(m,impactCode(x?.impact)),0);

    const ok=Boolean(cbStatus||kStatus||cbRows.length||krRows.length);
    return Object.freeze({
      ok,
      source:'COINBASE_KRAKEN_PUBLIC_CONTEXT',
      capturedAt,
      availableAt:capturedAt,
      coinbase:Object.freeze({
        incidentSeverity:severity(cbIncidents),
        unresolvedIncidents:cbIncidents.filter(x=>String(x?.status||'').toLowerCase()!=='resolved').length,
        productCount:cbRows.length||null,
        addedMarkets:cbDelta.added,
        removedMarkets:cbDelta.removed
      }),
      kraken:Object.freeze({
        incidentSeverity:severity(krIncidents),
        unresolvedIncidents:krIncidents.filter(x=>String(x?.status||'').toLowerCase()!=='resolved').length,
        pairCount:krRows.length||null,
        addedMarkets:krDelta.added,
        removedMarkets:krDelta.removed
      }),
      assetCoverage:Object.freeze({BTC:coverage('BTC'),ETH:coverage('ETH'),SOL:coverage('SOL')}),
      errors:Object.freeze(errors),
      endpoints:Object.freeze([COINBASE_STATUS_URL,KRAKEN_STATUS_URL,COINBASE_PRODUCTS_URL,KRAKEN_PAIRS_URL]),
      epistemic:'OFFICIAL_EXCHANGE_STATUS_AND_MARKET_UNIVERSE_NOT_PRICE_FORECAST'
    });
  }

  async function fetchContext({force=false}={}){
    const capturedAt=Number(now());
    if(!force&&contextCache&&capturedAt-contextCache.at<cacheTtlMs) return contextCache.value;
    const settled=await Promise.allSettled([
      fetchTreasury(capturedAt),
      fetchSec(capturedAt),
      fetchExchange(capturedAt)
    ]);
    const names=['treasury','sec','exchange'];
    const value={version:OFFICIAL_PRIMARY_RESEARCH_PROVIDER_VERSION,capturedAt,errors:[]};
    settled.forEach((r,i)=>{
      if(r.status==='fulfilled') value[names[i]]=r.value;
      else {
        value[names[i]]=null;
        value.errors.push({source:names[i].toUpperCase(),error:r.reason instanceof Error?r.reason.message:String(r.reason)});
      }
    });
    value.ok=Boolean(value.treasury?.ok||value.sec?.ok||value.exchange?.ok);
    value.errors=Object.freeze(value.errors);
    value.epistemic='OFFICIAL_PRIMARY_DATA_CONTEXT_RESEARCH_ONLY';
    const frozen=Object.freeze(value);
    contextCache={at:capturedAt,value:frozen};
    return frozen;
  }

  return Object.freeze({
    version:OFFICIAL_PRIMARY_RESEARCH_PROVIDER_VERSION,
    fetchContext,
    filingRelevantToSymbol
  });
}
