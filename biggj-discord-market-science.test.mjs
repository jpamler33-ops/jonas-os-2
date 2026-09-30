import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_DISCORD_MARKET_SCIENCE_LAYOUT,
  buildBiggjDiscordMarketSciencePanelMap,
  buildBiggjDiscordScienceHomePayload,
  buildBiggjDiscordWorldModelPayload,
  buildBiggjDiscordAutopilotPayload
} from './biggj-discord-market-science.mjs';

const snapshot={
  biggj:{
    science:{
      frontier:{total:5,evidence:294,experiments:3,surprises:2,robust:1,broken:0},
      director:{
        nextResearchQuestion:{kind:'WORLD_MODEL_VALIDATION',question:'Does candidate state survive OOS?',priority:.8},
        topAgenda:[{kind:'WORLD_MODEL_VALIDATION',question:'Does candidate state survive OOS?',derivedStatus:'HYPOTHESIS',nextExperimentType:'TEMPORAL_OUT_OF_SAMPLE',expectedInformationGainProxy:.72}]
      }
    },
    worldModel:{
      marketsObserved:2,
      markets:[
        {symbol:'BTCUSDT',regime:'TREND',epistemicClass:'INFERRED',score:.7},
        {symbol:'ETHUSDT',regime:'TREND',epistemicClass:'INFERRED',score:.6}
      ],
      associationGraph:{edges:[{from:'BTC',to:'ETH'}]},
      informationFlowGraph:{status:'SCREENING',candidates:[{leader:'BTCUSDT',follower:'ETHUSDT',lagBars:1,rho:.55}]},
      latentStateDiscovery:{status:'UNKNOWN',estimatorPromoted:false,researchCandidate:{status:'RESEARCH_CANDIDATE',candidateKey:'SYNC|COUPLED|QUIET'}},
      predictabilityField:{status:'MEASURED',markets:[{symbol:'BTCUSDT',status:'MEASURED',score:.52}]}
    },
    laboratory:{
      experimentCount:3,
      factoryMode:'DATA_QUALITY_BLOCKED',
      automaticResearchTasks:12,
      manualResearchTasks:0,
      dataOnlyTasks:12,
      agenda:[{kind:'WORLD_MODEL_VALIDATION',question:'Does candidate state survive OOS?',nextExperimentType:'TEMPORAL_OUT_OF_SAMPLE',replicationGap:.8,generalizationGap:.7}],
      dataRequests:[]
    },
    decisionIntelligence:{
      proof:{live:2,awaitingOutcome:3,resolved:10,hits:5,misses:5,invalid:0,learned:4},
      tcx:{role:'DECISION_APPLICATION',consumesValidatedScience:true,scientificAuthority:false},
      rift:{role:'MECHANISM_APPLICATION',scientificAuthority:false}
    }
  },
  health:{
    biggjAutopilotSupervisor:{
      state:'WAITING_FOR_DATA',
      humanActionRequired:false,
      shouldNotifyHuman:false,
      operator:{automationCoverage:1,mode:'WAITING_FOR_DATA',approvalRequired:0,activeIncidents:0},
      research:{mode:'DATA_QUALITY_BLOCKED',automatic:12,manual:0,unowned:0,dataReadiness:.95,stalledTasks:26,dataNeeds:['MORE_POINT_IN_TIME_DATA']},
      critical:[],warnings:['STALLED_RESEARCH_TASKS'],waiting:['MORE_POINT_IN_TIME_DATA'],
      recommendation:'No human action.'
    }
  }
};

test('Discord control room is science-first and starts at science-home',()=>{
  assert.equal(BIGGJ_DISCORD_MARKET_SCIENCE_LAYOUT[0].category,'BIGGJ • CONTROL ROOM');
  const names=BIGGJ_DISCORD_MARKET_SCIENCE_LAYOUT[0].channels.map(x=>x.name);
  assert.deepEqual(names.slice(0,6),['start-here','science-home','world-model','science-lab','decision-intelligence','autopilot-supervisor']);
});

test('science home presents knowledge before trading',()=>{
  const p=buildBiggjDiscordScienceHomePayload(snapshot);
  assert.match(p.embeds[0].title,/MARKET SCIENCE/);
  assert.match(p.embeds[0].description,/Trading ist nur eine nachgelagerte Anwendung/);
  assert.match(p.embeds[0].fields.map(x=>x.value).join('\n'),/Reality > models/);
  assert.ok(p.components[0].components.some(x=>x.custom_id==='dc7:science:world'));
});

test('world model keeps latent state explicitly unknown and research-only',()=>{
  const p=buildBiggjDiscordWorldModelPayload(snapshot);
  const text=p.embeds[0].fields.map(x=>x.value).join('\n');
  assert.match(text,/Canonical UNKNOWN/);
  assert.match(text,/MODELLED · authority NONE/);
  assert.match(p.embeds[0].description,/Association\/Lead-Lag sind keine Kausalität/);
});

test('autopilot panel says no human work during passive data collection',()=>{
  const p=buildBiggjDiscordAutopilotPayload(snapshot);
  assert.match(p.embeds[0].description,/Du musst aktuell nichts tun/);
  const text=p.embeds[0].fields.map(x=>x.value).join('\n');
  assert.match(text,/Automation 100%/);
  assert.match(text,/Manual 0/);
  assert.match(text,/Critical: none/);
});

test('panel map contains every canonical science-control surface',()=>{
  const map=buildBiggjDiscordMarketSciencePanelMap(snapshot);
  assert.deepEqual(map.map(x=>x.channel),['science-home','world-model','science-lab','decision-intelligence','autopilot-supervisor']);
});
