import assert from 'node:assert/strict';
import {JONAS_CLONE_V1_POLICY} from '../jonas-clone-v1.mjs';
for(const key of ['candidateAgeSeconds','marketCapUsd','liquidityUsd','sizeSol','entryPrice','priceImpactBps','feesQuote','mfeReturnPct','maeReturnPct','liquidityDecayPct','exitLiquidityUsd','holdSeconds','grossPnl','netPnl','exitReason']) assert.ok(JONAS_CLONE_V1_POLICY.telemetry.includes(key),key);
console.log('JONAS_CLONE_TELEMETRY_PASS');
