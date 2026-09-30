import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const ISSUER_ETF_HOLDINGS_PROVIDER_VERSION='TCX_ISSUER_ETF_HOLDINGS_PROVIDER_V1';
export const ISSUER_ETF_HOLDINGS_STATE_VERSION='TCX_ISSUER_ETF_HOLDINGS_STATE_V1';

export const ISSUER_ETF_FUNDS=Object.freeze({
  BTCUSDT:Object.freeze({
    fundTicker:'IBIT',
    assetTicker:'BTC',
    name:'iShares Bitcoin Trust ETF',
    url:'https://www.ishares.com/us/products/333011/ishares-bitcoin-trust-etf/latest-holdings.csv'
  }),
  ETHUSDT:Object.freeze({
    fundTicker:'ETHA',
    assetTicker:'ETH',
    name:'iShares Ethereum Trust ETF',
    url:'https://www.ishares.com/us/products/337614/ishares-ethereum-trust-etf/latest-holdings.csv'
  })
});

function finite(v){
  if(v==null||v==='') return null;
  const n=Number(String(v).replaceAll(',','').replaceAll('$','').trim());
  return Number.isFinite(n)?n:null;
}
function parseDateMs(v){
  const s=String(v??'').replaceAll('"','').trim();
  const t=Date.parse(s);
  return Number.isFinite(t)?t:null;
}
function text(v,max=300){
  const s=String(v??'').replace(/\s+/g,' ').trim();
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function ratioChange(current,prior){
  const c=finite(current),p=finite(prior);
  return c!=null&&p!=null&&Math.abs(p)>1e-12?(c-p)/Math.abs(p):null;
}
function log1pNonNegative(v){
  const n=finite(v);
  return n!=null&&n>=0?Math.log1p(n):null;
}
function csvCells(line){
  const out=[];
  let cur='',quoted=false;
  const s=String(line??'');
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(ch==='"'){
      if(quoted&&s[i+1]==='"'){cur+='"';i++;}
      else quoted=!quoted;
    }else if(ch===','&&!quoted){
      out.push(cur);
      cur='';
    }else cur+=ch;
  }
  out.push(cur);
  return out.map(x=>x.trim());
}
function cleanObservation(row){
  const asOfDate=finite(row?.asOfDate);
  const assetQuantity=finite(row?.assetQuantity);
  const sharesOutstanding=finite(row?.sharesOutstanding);
  const assetMarketValueUsd=finite(row?.assetMarketValueUsd);
  const cashUsd=finite(row?.cashUsd);
  if(asOfDate==null||assetQuantity==null||sharesOutstanding==null) return null;
  return {
    asOfDate,
    assetQuantity,
    sharesOutstanding,
    assetMarketValueUsd,
    cashUsd,
    observedAt:finite(row?.observedAt)
  };
}
function normalizeHistory(rows=[]){
  const byDate=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    const clean=cleanObservation(row);
    if(clean) byDate.set(clean.asOfDate,clean);
  }
  return [...byDate.values()].sort((a,b)=>a.asOfDate-b.asOfDate).slice(-4);
}
function sanitizeState(raw){
  const state=createIssuerEtfHoldingsState({updatedAt:finite(raw?.updatedAt)??Date.now()});
  if(raw?.byFund&&typeof raw.byFund==='object'){
    for(const [fund,rows] of Object.entries(raw.byFund)){
      const key=String(fund||'').toUpperCase();
      if(!/^[A-Z0-9]{2,12}$/.test(key)) continue;
      const clean=normalizeHistory(rows);
      if(clean.length) state.byFund[key]=clean;
    }
  }
  return state;
}

export function createIssuerEtfHoldingsState({updatedAt=Date.now(),byFund={}}={}){
  return {
    version:ISSUER_ETF_HOLDINGS_STATE_VERSION,
    updatedAt:Number(updatedAt),
    byFund:structuredClone(byFund||{})
  };
}

export async function loadIssuerEtfHoldingsState(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const raw=JSON.parse(await readFile(filePath,'utf8'));
    if(raw?.version!==ISSUER_ETF_HOLDINGS_STATE_VERSION) throw new Error('unsupported ETF holdings state version');
    const state=sanitizeState(raw);
    return {state,recoveredFromCorrupt:false,backupPath:null,lastLoadError:null};
  }catch(err){
    if(err?.code==='ENOENT') return {
      state:createIssuerEtfHoldingsState(),
      recoveredFromCorrupt:false,
      backupPath:null,
      lastLoadError:null
    };
    const backupPath=filePath+'.corrupt-'+Date.now();
    await rename(filePath,backupPath).catch(()=>{});
    return {
      state:createIssuerEtfHoldingsState(),
      recoveredFromCorrupt:true,
      backupPath,
      lastLoadError:err instanceof Error?err.message:String(err)
    };
  }
}

export async function saveIssuerEtfHoldingsState(filePath,state){
  await mkdir(path.dirname(filePath),{recursive:true});
  const clean=sanitizeState(state);
  clean.updatedAt=Date.now();
  const temp=filePath+'.tmp-'+process.pid;
  await writeFile(temp,JSON.stringify(clean,null,2),{encoding:'utf8',mode:0o600});
  await rename(temp,filePath);
  state.updatedAt=clean.updatedAt;
  state.byFund=clean.byFund;
  return clean;
}

export function observeIssuerEtfHoldingsState(state,snapshot,{observedAt=Date.now()}={}){
  if(!state||state.version!==ISSUER_ETF_HOLDINGS_STATE_VERSION) throw new Error('ETF holdings state invalid');
  if(!snapshot?.ok) return state;
  const fund=String(snapshot.fundTicker||'').toUpperCase();
  const row=cleanObservation({...snapshot,observedAt});
  if(!fund||!row) return state;
  state.byFund[fund]=normalizeHistory([...(state.byFund[fund]||[]),row]);
  state.updatedAt=Number(observedAt);
  return state;
}

export function enrichIssuerEtfSnapshotWithPrior(snapshot,state){
  if(!snapshot?.ok) return snapshot;
  const fund=String(snapshot.fundTicker||'').toUpperCase();
  const currentDate=finite(snapshot.asOfDate);
  const history=normalizeHistory(state?.byFund?.[fund]||[]);
  const prior=[...history].reverse().find(x=>currentDate!=null&&x.asOfDate<currentDate)||null;
  return Object.freeze({
    ...snapshot,
    prior:prior?Object.freeze({...prior}):null,
    assetQuantityChangeShare:prior?ratioChange(snapshot.assetQuantity,prior.assetQuantity):null,
    sharesOutstandingChangeShare:prior?ratioChange(snapshot.sharesOutstanding,prior.sharesOutstanding):null,
    observationDayGap:prior&&currentDate!=null?(currentDate-prior.asOfDate)/(24*60*60_000):null,
    deltaSemantics:prior
      ?'CONSECUTIVE_ISSUER_HOLDINGS_CHANGE_NOT_NET_FUND_FLOW'
      :'NO_PRIOR_ISSUER_OBSERVATION'
  });
}

export function issuerEtfHoldingsToExtraFeatures(snapshot){
  if(!snapshot?.ok) return [];
  const rows=[];
  const add=(id,value)=>{const n=finite(value);if(n!=null)rows.push({id,value:n});};
  add('research.etf.assetQuantityLog',log1pNonNegative(snapshot.assetQuantity));
  add('research.etf.assetQuantityChangeShare',snapshot.assetQuantityChangeShare);
  add('research.etf.sharesOutstandingLog',log1pNonNegative(snapshot.sharesOutstanding));
  add('research.etf.sharesOutstandingChangeShare',snapshot.sharesOutstandingChangeShare);
  add('research.etf.marketValueLogUsd',log1pNonNegative(snapshot.assetMarketValueUsd));
  const total=(finite(snapshot.assetMarketValueUsd)??0)+(finite(snapshot.cashUsd)??0);
  if(total>0&&finite(snapshot.cashUsd)!=null) add('research.etf.cashShare',Math.max(0,Math.min(1,Number(snapshot.cashUsd)/total)));
  add('research.etf.observationDayGap',snapshot.observationDayGap);
  return rows;
}

export function parseIssuerHoldingsCsv(csv,fund,{capturedAt=Date.now()}={}){
  if(!fund?.fundTicker||!fund?.assetTicker) throw new Error('fund definition required');
  const lines=String(csv||'').split(/\r?\n/).filter(x=>x.trim());
  const asOfLine=lines.find(x=>/^Fund Holdings as of,/i.test(x));
  const sharesLine=lines.find(x=>/^Shares Outstanding,/i.test(x));
  const asOfDate=parseDateMs(csvCells(asOfLine||'')[1]);
  const sharesOutstanding=finite(csvCells(sharesLine||'')[1]);
  const headerIndex=lines.findIndex(x=>/^Ticker,Name,Sector,Asset Class,/i.test(x));
  if(asOfDate==null||sharesOutstanding==null||headerIndex<0) return null;
  if(asOfDate>Number(capturedAt)+24*60*60_000) return null;
  const headers=csvCells(lines[headerIndex]).map(x=>x.toLowerCase());
  const idx=name=>headers.indexOf(name.toLowerCase());
  const tickerIdx=idx('ticker');
  const marketValueIdx=idx('market value');
  const quantityIdx=idx('quantity');
  if(tickerIdx<0||marketValueIdx<0||quantityIdx<0) return null;
  let assetRow=null,cashRow=null;
  for(const line of lines.slice(headerIndex+1)){
    const cells=csvCells(line);
    const ticker=String(cells[tickerIdx]||'').replaceAll('"','').trim().toUpperCase();
    if(ticker===fund.assetTicker) assetRow=cells;
    if(ticker==='USD') cashRow=cells;
  }
  if(!assetRow) return null;
  const assetQuantity=finite(assetRow[quantityIdx]);
  const assetMarketValueUsd=finite(assetRow[marketValueIdx]);
  if(assetQuantity==null||assetMarketValueUsd==null) return null;
  return Object.freeze({
    ok:true,
    version:ISSUER_ETF_HOLDINGS_PROVIDER_VERSION,
    source:'ISHARES_DIGITAL_ASSET_HOLDINGS',
    fundTicker:fund.fundTicker,
    fundName:fund.name,
    assetTicker:fund.assetTicker,
    asOfDate,
    capturedAt:Number(capturedAt),
    availableAt:Number(capturedAt),
    sharesOutstanding,
    assetQuantity,
    assetMarketValueUsd,
    cashUsd:cashRow?finite(cashRow[marketValueIdx]):null,
    endpoint:fund.url,
    sourceEventId:fund.fundTicker+':'+new Date(asOfDate).toISOString().slice(0,10),
    epistemic:'ISSUER_PUBLISHED_HOLDINGS_LEVEL_NOT_NET_FUND_FLOW_OR_FORECAST'
  });
}

export function createIssuerEtfHoldingsProvider({
  fetchImpl=globalThis.fetch,
  state=createIssuerEtfHoldingsState(),
  timeoutMs=8000,
  cacheTtlMs=30*60_000,
  now=()=>Date.now()
}={}){
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation required');
  let cache=null;

  async function fetchFund(fund){
    const capturedAt=Number(now());
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1500,Number(timeoutMs)||8000));
    try{
      const res=await fetchImpl(fund.url,{
        method:'GET',
        headers:{accept:'text/csv,text/plain;q=0.9,*/*;q=0.1','user-agent':'BIGGJ/1.0 issuer-holdings-research'},
        signal:controller.signal
      });
      if(!res?.ok) throw new Error(fund.fundTicker+'_HTTP_'+String(res?.status??'UNKNOWN'));
      const parsed=parseIssuerHoldingsCsv(await res.text(),fund,{capturedAt});
      if(!parsed) throw new Error(fund.fundTicker+'_HOLDINGS_PARSE_FAILED');
      return enrichIssuerEtfSnapshotWithPrior(parsed,state);
    }finally{clearTimeout(timer);}
  }

  async function fetchContext({force=false}={}){
    const t=Number(now());
    if(!force&&cache&&t-cache.at<cacheTtlMs) return cache.value;
    const funds=Object.values(ISSUER_ETF_FUNDS);
    const settled=await Promise.allSettled(funds.map(fetchFund));
    const rows=[],errors=[];
    settled.forEach((r,i)=>{
      if(r.status==='fulfilled') rows.push(r.value);
      else errors.push({fundTicker:funds[i].fundTicker,error:r.reason instanceof Error?r.reason.message:String(r.reason)});
    });
    const value=Object.freeze({
      version:ISSUER_ETF_HOLDINGS_PROVIDER_VERSION,
      capturedAt:t,
      ok:rows.length>0,
      source:'ISHARES_DIGITAL_ASSET_HOLDINGS',
      rows:Object.freeze(rows),
      errors:Object.freeze(errors),
      epistemic:'ISSUER_HOLDINGS_LEVEL_AND_CONSECUTIVE_CHANGE_RESEARCH_ONLY'
    });
    cache={at:t,value};
    return value;
  }

  return Object.freeze({
    version:ISSUER_ETF_HOLDINGS_PROVIDER_VERSION,
    fetchContext,
    state
  });
}
