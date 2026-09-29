import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveBiggjStyleExperimentCandidates } from './biggj-style-experiment-engine.mjs';

function h(id,ms,up=.68,down=.17,ret=.008){
  return {
    horizonId:id,horizonMs:ms,gate:'PASS',direction:'UP',expectedReturn:ret,
    calibration:{status:'CALIBRATED'},
    probabilities:{up,down,flat:1-up-down},
    display:{probabilityDisplayAllowed:true,probabilities:{up,down,flat:1-up-down}}
  };
}
function issuance(){
  return {
    issuanceId:'iss_style_1',symbol:'BTCUSDT',generatedAt:1_000_000,
    forecastFingerprint:'f'.repeat(64),
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false,
    forecast:{horizons:[
      h('15m',15*60_000,.70,.15,.006),
      h('1h',60*60_000,.68,.17,.008),
      h('3h',3*60*60_000,.66,.18,.012)
    ]}
  };
}
function analysis(){
  return {
    decision:'CANDIDATE',side:'LONG',strategyFamily:'TREND_CONTINUATION',
    marketStructure:{bias:'BULLISH'},
    microstructure:{spreadBps:1.2},
    styleCandidates:[
      {style:'SCALP',score:.62,evidence:{microstructure:.8}},
      {style:'INTRADAY',score:.82,evidence:{trendAlignment:.9}},
      {style:'SWING',score:.74,evidence:{higherTimeframeAlignment:.85}}
    ]
  };
}

test('style experiment engine creates separate scalp intraday and swing research lanes',()=>{
  const x=deriveBiggjStyleExperimentCandidates(issuance(),analysis(),{
    assetClass:'CORE',baseNotionalQuote:20,setupType:'A',now:2_000_000,maxCandidates:3
  });
  assert.equal(x.reason,'STYLE_EXPERIMENTS_READY');
  assert.equal(x.candidates.length,3);
  const styles=new Set(x.candidates.map(c=>c.style));
  assert.deepEqual(styles,new Set(['SCALP','INTRADAY','SWING']));
  assert.equal(x.canExecuteLive,false);
  assert.ok(x.candidates.every(c=>c.horizonOnlyExit===true));
  assert.ok(x.candidates.every(c=>c.notionalQuote<20));
});

test('learned factor hypotheses can annotate matching style experiments but remain challenger-only research',()=>{
  const lab={
    experiments:[{
      experimentId:'bx_match',
      hypothesis:{constraints:{assetClass:'CORE',strategyFamily:'TREND_CONTINUATION',side:'LONG'}},
      mode:'CHALLENGER_ONLY'
    }]
  };
  const x=deriveBiggjStyleExperimentCandidates(issuance(),analysis(),{
    assetClass:'CORE',baseNotionalQuote:20,setupType:'A',learnedExperimentLab:lab,now:2_000_000
  });
  assert.ok(x.candidates.some(c=>c.learnedHypothesisIds.includes('bx_match')));
  assert.ok(x.candidates.every(c=>c.execution==='SHADOW_ONLY'&&c.canExecuteLive===false));
});

test('unsafe issuance cannot create style experiments',()=>{
  const bad={...issuance(),canExecute:true};
  const x=deriveBiggjStyleExperimentCandidates(bad,analysis());
  assert.equal(x.candidates.length,0);
  assert.equal(x.reason,'ISSUANCE_SAFETY_INVALID');
});
