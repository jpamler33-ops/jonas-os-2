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
    memecoinRadar:{
      temporalTemple:{
        independentCases:40,
        bookOfChanges:{observedTransitions:160},
        transitionLaws:{
          status:'FORWARD_LAW_CANDIDATES_PRESENT',
          testedHypotheses:24,
          candidates:[
            {fromState:'S17',toState:'S45',forwardHorizon:'1h',independentCases:30,contextsEligible:4,validated:true,status:'FORWARD_LAW_CANDIDATE',validation:{medianReturn:.18}},
            {fromState:'S12',toState:'S03',forwardHorizon:'4h',independentCases:26,contextsEligible:3,validated:false,status:'FAILED_FORWARD_VALIDATION',validation:{medianReturn:-.04}}
          ]
        }
      }
    },
    discoveryLedger:{
      version:'BIGGJ_DISCOVERY_LEDGER_V1',
      total:3,validated:2,robust:1,falsified:1,
      topDiscoveries:[
        {type:'TRANSITION_LAW',title:'S17 → S45 → 1h',currentStatus:'ROBUST_FORWARD_LAW_CANDIDATE',samples:48,robust:true,validated:true},
        {type:'WALK_FORWARD_PATTERN',title:'SECURITY:solana|UNKNOWN|LIQ_LT10K · 1h',currentStatus:'WALK_FORWARD_VALIDATED',samples:20,robust:false,validated:true},
        {type:'TRANSITION_LAW',title:'S12 → S03 → 4h',currentStatus:'FAILED_FORWARD_VALIDATION',samples:26,robust:false,validated:false}
      ],
      recentlyChanged:[{title:'S17 → S45 → 1h',previousStatus:'COLLECTING',status:'ROBUST_FORWARD_LAW_CANDIDATE',samples:48}],
      canExecuteLive:false,automaticPromotion:false
    },
    indicatorEvolution:{
      catalogSize:216,active:203,
      counts:{CORE_CANDIDATE:2,SUPPORTED_ONCE:3,SPECIALIST_CANDIDATE:4,RETIRED:10,REDUNDANT:7,REACTIVATION_TRIAL:1},
      top:[
        {id:'TA_5M_RSI',label:'Relative Strength Index · 5M',family:'RSI',timeframe:'5m',status:'CORE_CANDIDATE',oosCases:130,independentEpisodes:80,meanBrierDelta:-.009,q:.012},
        {id:'TA_1H_ADX_DMI',label:'ADX / Directional Movement · 1H',family:'ADX_DMI',timeframe:'1h',status:'SPECIALIST_CANDIDATE',oosCases:100,independentEpisodes:65,meanBrierDelta:-.006,q:.041}
      ],
      canExecuteLive:false,automaticProductionMutation:false
    },
    parallelStrategyWorlds:{
      worldCount:2,
      generations:5,
      evolutions:3,
      worlds:[
        {strategyId:'EDGE_HUNTER',label:'Edge Hunter',generation:3,doctrine:{name:'Edge World'},currentGenome:{status:'MEASURING',mutation:{field:'minProbabilityEdge',before:.14,after:.155,direction:'TIGHTEN'},evidence:{closed:5,winRate:.6}}},
        {strategyId:'DEFENSIVE',label:'Defensive',generation:2,doctrine:{name:'Robustness World'},currentGenome:{status:'AWAITING_FORWARD_TRADES',mutation:{field:'minDirectionalProbability',before:.64,after:.6525,direction:'TIGHTEN'},evidence:{closed:0,winRate:null}}}
      ],
      council:{convergences:[{field:'minProbabilityEdge',direction:'TIGHTEN',worlds:['WORLD_EDGE_HUNTER','WORLD_SCOUT']}],crossPollination:[{sourceWorld:'WORLD_EDGE_HUNTER'}]},
      automaticPrimaryMutation:false,
      canExecuteLive:false
    },
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

test('science home presents knowledge and new Temporal Temple findings before trading',()=>{
  const p=buildBiggjDiscordScienceHomePayload(snapshot);
  assert.match(p.embeds[0].title,/MARKET SCIENCE/);
  assert.match(p.embeds[0].description,/Trading ist nur eine nachgelagerte Anwendung/);
  const text=p.embeds[0].fields.map(x=>x.name+'\n'+x.value).join('\n');
  assert.match(text,/HALL OF DISCOVERIES · LIFECYCLE/);
  assert.match(text,/Gespeichert 3 · validiert 2 · robust 1 · widerlegt 1/);
  assert.match(text,/INDICATOR EVOLUTION · FEATURE SURVIVAL/);
  assert.match(text,/Arsenal 216 · aktiv 203 · Core 2 · Specialist 4/);
  assert.match(text,/Relative Strength Index/);
  assert.match(text,/Walk-forward \+ FDR · keine automatische Production-Mutation/);
  assert.match(text,/Dauerhafte Forschungschronik · authority NONE/);
  assert.match(text,/Letzter Statuswechsel: S17 → S45 → 1h/);
  assert.match(text,/NEUE ENTDECKUNGEN · TEMPORAL TEMPLE/);
  assert.match(text,/S17 → S45/);
  assert.match(text,/verworfen: S12 → S03/);
  assert.match(text,/keine automatische Promotion/);
  assert.match(text,/PARALLEL WORLDS · STRATEGY EVOLUTION/);
  assert.match(text,/Edge World/);
  assert.match(text,/Gen 3/);
  assert.match(text,/automatische PRIMARY-Mutation gesperrt/);
  assert.match(text,/Reality > models/);
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
