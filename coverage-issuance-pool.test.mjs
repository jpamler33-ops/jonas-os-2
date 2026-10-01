import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCoverageIssuancePool,
  rememberCoverageIssuance,
  coverageIssuancePoolItems,
  coverageIssuancePoolSummary
} from './coverage-issuance-pool.mjs';

function issuance(symbol,generatedAt){
  return {
    symbol,
    generatedAt,
    asOf:generatedAt-100,
    forecast:{asOf:generatedAt-100}
  };
}

test('pool remembers multiple recent audit-bound issuances across sweeps',()=>{
  const pool=createCoverageIssuancePool({maxAgeMs:600_000,maxEntries:8});
  assert.equal(rememberCoverageIssuance(pool,{issuance:issuance('ETHUSDT',1000),auditHealthy:true,now:1100}).accepted,true);
  assert.equal(rememberCoverageIssuance(pool,{issuance:issuance('BTCUSDT',1200),auditHealthy:true,now:1300}).accepted,true);
  const rows=coverageIssuancePoolItems(pool,{now:1400});
  assert.deepEqual(rows.map(x=>x.issuance.symbol),['BTCUSDT','ETHUSDT']);
});

test('newest issuance replaces prior symbol snapshot',()=>{
  const pool=createCoverageIssuancePool({maxAgeMs:600_000});
  rememberCoverageIssuance(pool,{issuance:issuance('BTCUSDT',1000),auditHealthy:true,now:1100});
  rememberCoverageIssuance(pool,{issuance:issuance('BTCUSDT',2000),auditHealthy:true,now:2100});
  const rows=coverageIssuancePoolItems(pool,{now:2200});
  assert.equal(rows.length,1);
  assert.equal(rows[0].issuance.generatedAt,2000);
});

test('audit failure evicts older symbol snapshot instead of trading stale safe state',()=>{
  const pool=createCoverageIssuancePool({maxAgeMs:600_000});
  rememberCoverageIssuance(pool,{issuance:issuance('BTCUSDT',1000),auditHealthy:true,now:1100});
  const out=rememberCoverageIssuance(pool,{issuance:issuance('BTCUSDT',2000),auditHealthy:false,now:2100});
  assert.equal(out.accepted,false);
  assert.equal(out.reason,'AUDIT_NOT_HEALTHY');
  assert.equal(coverageIssuancePoolItems(pool,{now:2200}).length,0);
});

test('stale or future issuances are excluded from the global pool',()=>{
  const pool=createCoverageIssuancePool({maxAgeMs:1000});
  assert.equal(rememberCoverageIssuance(pool,{issuance:issuance('BTCUSDT',1000),auditHealthy:true,now:2501}).accepted,false);
  assert.equal(rememberCoverageIssuance(pool,{issuance:issuance('ETHUSDT',4000),auditHealthy:true,now:3000}).accepted,false);
  assert.equal(coverageIssuancePoolItems(pool,{now:3000}).length,0);
});

test('pool bounds retained symbols and reports deterministic summary',()=>{
  const pool=createCoverageIssuancePool({maxAgeMs:10_000,maxEntries:2});
  rememberCoverageIssuance(pool,{issuance:issuance('BTCUSDT',1000),auditHealthy:true,now:1100});
  rememberCoverageIssuance(pool,{issuance:issuance('ETHUSDT',1200),auditHealthy:true,now:1300});
  rememberCoverageIssuance(pool,{issuance:issuance('SOLUSDT',1400),auditHealthy:true,now:1500});
  const s=coverageIssuancePoolSummary(pool,{now:1600});
  assert.equal(s.size,2);
  assert.deepEqual(s.symbols,['ETHUSDT','SOLUSDT']);
});
