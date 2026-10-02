import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeObservation,crossProviderCheck} from './cross-provider-normalizer.mjs';
const base={sourceTimestamp:'2026-09-29T07:30:00Z',ingestTimestamp:'2026-09-29T07:31:00Z'};

test('missing numeric fields remain null rather than becoming zero',()=>{
  const x=normalizeObservation({...base,provider:'KRAKEN_FUTURES',symbol:'PF_XBTUSD',values:{funding_rate:.0002,mark_price:null}});
  assert.equal(x.mark_price,null);
  assert.equal(x.index_price,null);
  assert.equal(x.open_interest,null);
});

test('missing mark on one provider cannot create false price divergence',()=>{
  const x=crossProviderCheck([
    {...base,provider:'OKX',symbol:'BTCUSDT',values:{funding_rate:.0001,mark_price:65000}},
    {...base,provider:'KRAKEN_FUTURES',symbol:'PF_XBTUSD',values:{funding_rate:.0002,mark_price:null}}
  ]);
  assert.equal(x.alerts.some(a=>a.type==='MARK_PRICE_DIVERGENCE'),false);
});

test('provider-native Kraken funding is not treated as directly comparable to OKX interval funding',()=>{
  const x=crossProviderCheck([
    {...base,provider:'OKX',symbol:'BTCUSDT',values:{funding_rate:.00004,mark_price:65000}},
    {...base,provider:'KRAKEN_FUTURES',symbol:'PF_XBTUSD',values:{funding_rate:.9,mark_price:null}}
  ]);
  assert.equal(x.comparableFundingPairs,0);
  assert.deepEqual(x.comparableFundingProviders,['OKX']);
  assert.equal(x.alerts.some(a=>a.type==='FUNDING_NOT_DIRECTLY_COMPARABLE'&&a.severity==='WARN'),true);
});

test('same-unit extreme funding magnitude divergence is fail-closed warning',()=>{
  const x=crossProviderCheck([
    {...base,provider:'OKX',symbol:'BTCUSDT',values:{funding_rate:.00004,mark_price:65000}},
    {...base,provider:'BINANCE_FUTURES',symbol:'BTCUSDT',values:{funding_rate:.004,mark_price:65010}}
  ]);
  assert.equal(x.comparableFundingPairs,1);
  assert.equal(x.alerts.some(a=>a.type==='FUNDING_MAGNITUDE_DIVERGENCE'&&a.severity==='WARN'),true);
});
