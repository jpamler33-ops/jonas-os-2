import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketViewModel,
  homeKeyboard,
  marketsKeyboard,
  marketProductKeyboard,
  marketCardText,
  parseProductCallback,
  assertTelegramKeyboardSafe
} from "./telegram-product-ui.mjs";

test("market view hard-locks execution safety",()=>{
  const vm=buildMarketViewModel({
    symbol:"BTCUSDT",
    snapshot:{price:70000,changePct:1.2,spreadBps:0.4,timestamp:1,availableAt:2,source:"BINANCE",version:"v1"},
    dashboard:{regime:"TREND",bias:"BULLISH",liquidity:"TIGHT",flow:"BID_PRESSURE"},
    safety:{state:"VALID",dataQuality:99}
  });
  assert.equal(vm.safety.execution,"SHADOW_ONLY");
  assert.equal(vm.safety.action,"ABSTAIN");
  assert.equal(vm.safety.canExecute,false);
});

test("stale data is visible and fail-closed",()=>{
  const vm=buildMarketViewModel({symbol:"BTCUSDT",safety:{dataStale:true}});
  assert.equal(vm.safety.status,"DATA_STALE");
  assert.equal(vm.safety.canExecute,false);
});

test("all product keyboards satisfy Telegram callback limit",()=>{
  const markets=[
    {symbol:"BTCUSDT",icon:"₿",label:"BTC"},
    {symbol:"ETHUSDT",icon:"Ξ",label:"ETH"}
  ];
  assert.equal(assertTelegramKeyboardSafe(homeKeyboard()),true);
  assert.equal(assertTelegramKeyboardSafe(marketsKeyboard(markets,1)),true);
  assert.equal(assertTelegramKeyboardSafe(marketProductKeyboard("BTCUSDT",{live:true,isFavorite:true})),true);
});

test("product callbacks are deterministic",()=>{
  assert.deepEqual(parseProductCallback("home"),{kind:"HOME"});
  assert.deepEqual(parseProductCallback("home:radar"),{kind:"HOME_SECTION",section:"RADAR"});
  assert.deepEqual(parseProductCallback("why:BTCUSDT"),{kind:"WHY",symbol:"BTCUSDT"});
  assert.deepEqual(parseProductCallback("regime:BTCUSDT"),{kind:"REGIME",symbol:"BTCUSDT"});
  assert.deepEqual(parseProductCallback("evidence:BTCUSDT"),{kind:"EVIDENCE",symbol:"BTCUSDT"});
  assert.deepEqual(parseProductCallback("history:BTCUSDT"),{kind:"HISTORY",symbol:"BTCUSDT"});
  assert.deepEqual(parseProductCallback("validity:BTCUSDT"),{kind:"VALIDITY",symbol:"BTCUSDT"});
  assert.deepEqual(parseProductCallback("replaymenu:BTCUSDT"),{kind:"REPLAY_MENU",symbol:"BTCUSDT"});
  assert.deepEqual(parseProductCallback("oms:BTCUSDT"),{kind:"OMS",symbol:"BTCUSDT"});
  assert.deepEqual(parseProductCallback("sor:BTCUSDT"),{kind:"SOR",symbol:"BTCUSDT"});
  assert.deepEqual(parseProductCallback("vqm:BTCUSDT"),{kind:"VQM",symbol:"BTCUSDT"});
});

test("market card keeps epistemic action visible",()=>{
  const vm=buildMarketViewModel({
    symbol:"BTCUSDT",
    snapshot:{price:70000,changePct:-0.5,spreadBps:0.5},
    dashboard:{regime:"RANGE",bias:"NEUTRAL",liquidity:"NORMAL",flow:"BALANCED"}
  });
  const output=marketCardText(vm,{live:true,detailMode:"SIMPLE"});
  assert.match(output,/ABSTAIN \/ SHADOW_ONLY/);
  assert.match(output,/LIVE/);
});
