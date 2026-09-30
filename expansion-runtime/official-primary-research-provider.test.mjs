import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OFFICIAL_PRIMARY_RESEARCH_PROVIDER_VERSION,
  createOfficialPrimaryResearchProvider,
  exchangeContextToExtraFeatures,
  secFilingToExtraFeatures,
  treasuryAuctionToExtraFeatures
} from './official-primary-research-provider.mjs';

const NOW=Date.parse('2026-09-30T12:00:00Z');

function response(body,{ok=true,status=200}={}){
  return {ok,status,json:async()=>body};
}

test('Treasury auction features preserve official demand composition without synthetic zeros',()=>{
  const rows=treasuryAuctionToExtraFeatures({
    ok:true,
    bidToCoverRatio:2.6,
    clearingRatePct:4.1,
    totalAccepted:70e9,
    primaryDealerAccepted:20e9,
    directBidderAccepted:8e9,
    indirectBidderAccepted:42e9,
    offeringAmount:70e9
  });
  const byId=new Map(rows.map(x=>[x.id,x.value]));
  assert.equal(byId.get('research.treasury.bidToCover'),2.6);
  assert.ok(Math.abs(byId.get('research.treasury.indirectBidderAcceptedShare')-.6)<1e-12);
  assert.equal(treasuryAuctionToExtraFeatures({ok:true,bidToCoverRatio:null}).some(x=>x.value===0),false);
});

test('SEC filing features classify form type only, not content direction',()=>{
  const rows=secFilingToExtraFeatures({ok:true,form:'8-K'});
  const byId=new Map(rows.map(x=>[x.id,x.value]));
  assert.equal(byId.get('research.sec.filingPresent'),1);
  assert.equal(byId.get('research.sec.isCurrentReport'),1);
  assert.equal(byId.get('research.sec.isPeriodicReport'),0);
});

test('exchange context encodes operational incidents and market-universe deltas',()=>{
  const rows=exchangeContextToExtraFeatures({
    ok:true,
    coinbase:{incidentSeverity:2/3,unresolvedIncidents:1,productCount:500,addedMarkets:2,removedMarkets:1},
    kraken:{incidentSeverity:0,unresolvedIncidents:0,pairCount:300,addedMarkets:0,removedMarkets:0},
    assetCoverage:{BTC:2,ETH:2,SOL:2}
  });
  const byId=new Map(rows.map(x=>[x.id,x.value]));
  assert.equal(byId.get('research.exchange.coinbaseIncidentSeverity'),2/3);
  assert.equal(byId.get('research.exchange.coinbaseAddedMarkets'),2);
  assert.equal(byId.get('research.exchange.btcVenueCoverage'),2);
});

test('provider isolates source failures and uses capture time as knowledge availability',async()=>{
  const fetchImpl=async url=>{
    const u=String(url);
    if(u.includes('auctions_query')) return response({data:[
      {
        record_date:'2026-09-30',cusip:'A2',security_type:'Note',security_term:'2-Year',auction_date:'2026-09-29',
        high_yield:'4.00',bid_to_cover_ratio:'2.50',offering_amt:'70000000000',total_accepted:'70000000000',
        primary_dealer_accepted:'20000000000',direct_bidder_accepted:'8000000000',indirect_bidder_accepted:'42000000000'
      },
      {
        record_date:'2026-09-30',cusip:'A10',security_type:'Note',security_term:'10-Year',auction_date:'2026-09-28',
        high_yield:'4.20',bid_to_cover_ratio:'2.40',offering_amt:'40000000000',total_accepted:'40000000000',
        primary_dealer_accepted:'10000000000',direct_bidder_accepted:'5000000000',indirect_bidder_accepted:'25000000000'
      },
      {
        record_date:'2026-09-30',cusip:'A30',security_type:'Bond',security_term:'30-Year',auction_date:'2026-09-27',
        high_yield:'4.60',bid_to_cover_ratio:'2.30',offering_amt:'22000000000',total_accepted:'22000000000',
        primary_dealer_accepted:'7000000000',direct_bidder_accepted:'3000000000',indirect_bidder_accepted:'12000000000'
      }
    ]});
    if(u.includes('company_tickers.json')) return response({
      0:{ticker:'COIN',cik_str:1679788,title:'Coinbase Global'}
    });
    if(u.includes('CIK0001679788.json')) return response({
      name:'Coinbase Global, Inc.',
      filings:{recent:{
        form:['8-K'],
        accessionNumber:['0001679788-26-000001'],
        filingDate:['2026-09-30'],
        acceptanceDateTime:['20260930110000'],
        primaryDocument:['coin-8k.htm']
      }}
    });
    if(u.includes('status.coinbase.com')) return response({incidents:[]});
    if(u.includes('status.kraken.com')) return response({incidents:[]});
    if(u.includes('api.exchange.coinbase.com/products')) return response([{id:'BTC-USD',base_currency:'BTC'},{id:'ETH-USD',base_currency:'ETH'},{id:'SOL-USD',base_currency:'SOL'}]);
    if(u.includes('api.kraken.com/0/public/AssetPairs')) return response({error:[],result:{
      XBTUSD:{wsname:'XBT/USD'},ETHUSD:{wsname:'ETH/USD'},SOLUSD:{wsname:'SOL/USD'}
    }});
    return response({}, {ok:false,status:500});
  };
  const p=createOfficialPrimaryResearchProvider({
    fetchImpl,
    secTickers:['COIN','MISSING'],
    now:()=>NOW
  });
  const out=await p.fetchContext({force:true});
  assert.equal(out.version,OFFICIAL_PRIMARY_RESEARCH_PROVIDER_VERSION);
  assert.equal(out.ok,true);
  assert.equal(out.treasury.rows.length,3);
  assert.ok(out.treasury.rows.every(x=>x.availableAt===NOW));
  assert.equal(out.sec.rows.length,1);
  assert.equal(out.sec.rows[0].availableAt,NOW);
  assert.equal(out.sec.errors.length,1);
  assert.equal(out.exchange.assetCoverage.BTC,2);
  assert.equal(out.exchange.assetCoverage.ETH,2);
  assert.equal(out.exchange.assetCoverage.SOL,2);
});

test('exchange listing deltas appear only after a baseline snapshot',async()=>{
  let productCall=0;
  const fetchImpl=async url=>{
    const u=String(url);
    if(u.includes('auctions_query')) return response({data:[]});
    if(u.includes('company_tickers.json')) return response({});
    if(u.includes('status.coinbase.com')||u.includes('status.kraken.com')) return response({incidents:[]});
    if(u.includes('api.exchange.coinbase.com/products')){
      productCall++;
      return response(productCall===1
        ?[{id:'BTC-USD',base_currency:'BTC'}]
        :[{id:'BTC-USD',base_currency:'BTC'},{id:'SOL-USD',base_currency:'SOL'}]);
    }
    if(u.includes('api.kraken.com/0/public/AssetPairs')) return response({error:[],result:{XBTUSD:{wsname:'XBT/USD'}}});
    return response({});
  };
  let clock=NOW;
  const p=createOfficialPrimaryResearchProvider({fetchImpl,secTickers:[],cacheTtlMs:1,now:()=>clock});
  const first=await p.fetchContext({force:true});
  assert.equal(first.exchange.coinbase.addedMarkets,null);
  clock+=1000;
  const second=await p.fetchContext({force:true});
  assert.equal(second.exchange.coinbase.addedMarkets,1);
  assert.equal(second.exchange.coinbase.removedMarkets,0);
});
