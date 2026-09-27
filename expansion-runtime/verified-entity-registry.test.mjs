import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseOfficialOkxPorCsv,
  fetchOfficialOkxPorRegistry,
  entityRegistrySummary,
  registryToWalletCohorts
} from './verified-entity-registry.mjs';

function storedZip(name,text){
  const nameBuf=Buffer.from(name);
  const data=Buffer.from(text);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);
  local.writeUInt16LE(0,6);
  local.writeUInt16LE(0,8);
  local.writeUInt32LE(0,14);
  local.writeUInt32LE(data.length,18);
  local.writeUInt32LE(data.length,22);
  local.writeUInt16LE(nameBuf.length,26);
  local.writeUInt16LE(0,28);

  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);
  central.writeUInt16LE(20,4);
  central.writeUInt16LE(20,6);
  central.writeUInt16LE(0,8);
  central.writeUInt16LE(0,10);
  central.writeUInt32LE(0,16);
  central.writeUInt32LE(data.length,20);
  central.writeUInt32LE(data.length,24);
  central.writeUInt16LE(nameBuf.length,28);
  central.writeUInt16LE(0,30);
  central.writeUInt16LE(0,32);
  central.writeUInt16LE(0,34);
  central.writeUInt16LE(0,36);
  central.writeUInt32LE(0,38);
  central.writeUInt32LE(0,42);

  const cdOffset=local.length+nameBuf.length+data.length;
  const eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);
  eocd.writeUInt16LE(0,4);
  eocd.writeUInt16LE(0,6);
  eocd.writeUInt16LE(1,8);
  eocd.writeUInt16LE(1,10);
  eocd.writeUInt32LE(central.length+nameBuf.length,12);
  eocd.writeUInt32LE(cdOffset,16);
  eocd.writeUInt16LE(0,20);

  return Buffer.concat([local,nameBuf,data,central,nameBuf,eocd]);
}

const csv=[
  'coin,amount',
  'ETH,10',
  '',
  'coin,Type,Network,Snapshot Height,address,amount,message,signature1,signature2,redeem script/ public key,EOA1,EOA2',
  'ETH,Non Staking,ETH,123,0x1111111111111111111111111111111111111111,5,I am an OKX address,0xsig,,,,,',
  'ETH,Non Staking,ETH,123,0x2222222222222222222222222222222222222222,5,I am an OKX address,0xsig2,,,,,',
  'BTC,Non Staking,BTC,456,bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh,1,I am an OKX address,sig,,,,,',
  'ETH,Native ETH Staking,ETH,123,0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,32,I am an OKX address,0xsig,,,,,'
].join('\n');

test('official OKX CSV parser keeps standard public addresses with source attestation',()=>{
  const rows=parseOfficialOkxPorCsv(csv,{
    reportId:'R1',
    reportDate:'2026-09-08',
    sourceUrl:'https://static.okx.com/file.zip'
  });
  assert.equal(rows.length,3);
  const eth=rows.filter(x=>x.chain==='ETHEREUM');
  assert.equal(eth.length,2);
  assert.ok(eth.every(x=>x.verificationStatus==='OFFICIAL_SOURCE_ATTESTED_WITH_SIGNATURE'));
  assert.ok(eth.every(x=>x.restrictions.naturalPersonIdentity===false));
});

test('official PoR zip fetch creates fingerprinted registry',async()=>{
  const zip=storedZip('okx_por.csv',csv);
  const registry=await fetchOfficialOkxPorRegistry({
    fetchImpl:async()=>({
      ok:true,
      status:200,
      async arrayBuffer(){return zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength);}
    }),
    url:'https://static.okx.com/por.zip',
    reportId:'R1',
    reportDate:'2026-09-08',
    now:()=>2_000_000
  });
  assert.equal(registry.entries.length,3);
  assert.equal(registry.sources[0].publisher,'OKX');
  assert.ok(/^[a-f0-9]{64}$/.test(registry.fingerprint));
});

test('registry converts verified EVM entity addresses into a bounded wallet cohort',()=>{
  const entries=parseOfficialOkxPorCsv(csv,{
    reportId:'R1',
    reportDate:'2026-09-08',
    sourceUrl:'https://static.okx.com/file.zip'
  });
  const registry={version:'TCX_VERIFIED_ENTITY_REGISTRY_V1',entries,sources:[]};
  const cohorts=registryToWalletCohorts(registry,{entityIds:['OKX'],chains:['ETHEREUM']});
  assert.equal(cohorts.length,1);
  assert.equal(cohorts[0].symbol,'ETHUSDT');
  assert.equal(cohorts[0].addresses.length,2);
  const summary=entityRegistrySummary(registry);
  assert.equal(summary.byEntity.OKX,3);
  assert.equal(summary.byChain.ETHEREUM,2);
});
