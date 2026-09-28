import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFlowRadar} from './flow-radar-view.mjs';

test('renders verified entity flow and anomaly without identity claims',()=>{
  const out=buildFlowRadar({
    symbol:'ETHUSDT',
    registryAddressCount:12,
    registryEntityCount:1,
    entityFlow:{
      ok:true,
      entities:{
        OKX:{
          '5m':{
            grossExternalEth:1200,
            netExternalEth:-400,
            inflowEth:400,
            outflowEth:800,
            largestExternalEth:500,
            grossExternalRobustZ:3.2
          }
        }
      }
    },
    walletCohort:{ok:false},
    onchain:{ok:true,chain:'ETHEREUM',metrics:{gasUtilization:.55,baseFeeGwei:4.2,largeNativeTransferCount:3}}
  });
  assert.match(out.text,/WHALE \+ FLOW RADAR/);
  assert.match(out.text,/NET OUTFLOW/);
  assert.match(out.text,/STARK HOCH/);
  assert.match(out.text,/KEINE vollständige Exchange-Bilanz/);
  assert.equal(out.naturalPersonIdentification,false);
});
