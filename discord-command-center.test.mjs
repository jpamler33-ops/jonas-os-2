import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISCORD_TELEGRAM_BRIDGE_VERSION,
  buildDiscordTerminalPayload,
  buildDiscordSystemPayload,
  buildDiscordPerformancePayload,
  buildDiscordMarketOverviewPayload,
  buildDiscordDataHealthPayload
} from './discord-telegram-bridge.mjs';

const snapshot={
  health:{
    operationalReadiness:{ready:true,hardReasons:[],warningReasons:[]},
    institutionalKernel:{ledgerHealthy:true},
    marketDataFabric:{healthy:true,events:123},
    shadowOms:{healthy:true,active:2,filled:9},
    institutionalForecastRuntime:{healthy:true,journalEntries:42},
    episodeMemory:{healthy:true,total:77},
    evidenceHistory:{healthy:true,total:88},
    telegramPolling:{lastPollError:null}
  },
  portfolio:{
    equityQuote:10123.45,
    netPnlQuote:123.45,
    returnPct:0.012345,
    openPositions:2,
    closedTrades:9,
    winRate:0.6,
    profitFactor:1.4,
    expectancyQuote:13.71,
    maxDrawdownPct:0.03
  }
};

test('Discord V3 mission control exposes safe interactive dashboard',()=>{
  assert.equal(DISCORD_TELEGRAM_BRIDGE_VERSION,'TCX_DISCORD_COMMAND_CENTER_V3');
  const payload=buildDiscordTerminalPayload(snapshot);
  assert.match(payload.embeds[0].description,/SHADOW_ONLY/);
  assert.ok(Array.isArray(payload.components));
  assert.equal(payload.components.at(-1).components[0].type,3);
  assert.equal(payload.components.at(-1).components[0].custom_id,'dc3:market-select');
});

test('Discord V3 system and performance panels stay shadow-only',()=>{
  const system=buildDiscordSystemPayload(snapshot);
  const performance=buildDiscordPerformancePayload(snapshot);
  assert.match(JSON.stringify(system),/ABSTAIN \/ SHADOW_ONLY/);
  assert.match(JSON.stringify(performance),/keine echten Orders/);
  assert.match(JSON.stringify(performance),/Winrate/);
});

test('Discord V3 overview and data health render without synthetic market values',()=>{
  const overview=buildDiscordMarketOverviewPayload(snapshot);
  const data=buildDiscordDataHealthPayload(snapshot);
  assert.match(JSON.stringify(overview),/17 Märkte/);
  assert.match(JSON.stringify(data),/Point-in-time Research Pipeline/);
  assert.doesNotMatch(JSON.stringify(data),/undefined/);
});
