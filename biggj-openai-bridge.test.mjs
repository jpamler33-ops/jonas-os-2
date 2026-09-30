import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_OPENAI_BRIDGE_VERSION,
  createBiggjOpenAiBridge,
  sanitizeBiggjAiContext,
  extractOpenAiResponseText,
  renderBiggjAiAdvisory
} from './biggj-openai-bridge.mjs';

test('sanitizes secret-shaped keys and values',()=>{
  const input={
    openai_api_key:'sk-supersecret123456789',
    nested:{authorization:'Bearer abcdefghijklmnop',safe:'hello sk-hidden123456789'},
    token:'abc',
    count:3
  };
  const safe=sanitizeBiggjAiContext(input);
  assert.equal(safe.openai_api_key,'[REDACTED_SECRET]');
  assert.equal(safe.nested.authorization,'[REDACTED_SECRET]');
  assert.match(safe.nested.safe,/REDACTED_SECRET/);
  assert.equal(safe.token,'[REDACTED_SECRET]');
  assert.equal(safe.count,3);
});

test('extracts REST Responses API output text',()=>{
  assert.equal(extractOpenAiResponseText({
    output:[{content:[{type:'output_text',text:'{"status":"ANSWER"}'}]}]
  }),'{"status":"ANSWER"}');
});

test('bridge is disabled without an API key',async()=>{
  const bridge=createBiggjOpenAiBridge({apiKey:'',fetchImpl:async()=>{throw new Error('must not call');}});
  assert.equal(bridge.snapshot().enabled,false);
  await assert.rejects(()=>bridge.ask({question:'test'}),err=>err.code==='BIGGJ_AI_NOT_CONFIGURED');
});

test('bridge sends stateless structured advisory request and never forwards secrets',async()=>{
  let captured=null;
  const advisory={
    status:'ANSWER',
    answer:'Nur Advisory.',
    facts:['SHADOW_ONLY'],
    inferences:[],
    uncertainties:['Keine Live-Ausführung.'],
    recommended_next_steps:['Weiter im Shadow-Modus testen.'],
    safety_checks:['canExecuteLive=false'],
    confidence_label:'MEDIUM'
  };
  const bridge=createBiggjOpenAiBridge({
    apiKey:'sk-test-key-do-not-send-in-context',
    model:'gpt-5.6',
    fetchImpl:async (url,init)=>{
      captured={url,init,body:JSON.parse(init.body)};
      return {
        ok:true,
        status:200,
        async text(){return JSON.stringify({
          id:'resp_test',
          model:'gpt-5.6',
          usage:{input_tokens:100,output_tokens:40},
          output:[{content:[{type:'output_text',text:JSON.stringify(advisory)}]}]
        });}
      };
    }
  });
  const result=await bridge.ask({
    question:'Was ist der nächste sinnvolle Forschungsschritt?',
    context:{secret:'abc',OPENAI_API_KEY:'sk-context-secret-123456',market:{symbol:'BTCUSDT'}}
  });
  assert.equal(result.ok,true);
  assert.equal(result.canExecute,false);
  assert.equal(result.canExecuteLive,false);
  assert.equal(result.advisory.answer,'Nur Advisory.');
  assert.equal(captured.body.store,false);
  assert.equal(captured.body.text.format.type,'json_schema');
  assert.equal(captured.body.text.format.strict,true);
  assert.equal(captured.body.model,'gpt-5.6');
  assert.match(captured.init.headers.authorization,/^Bearer sk-test-key/);
  assert.doesNotMatch(captured.init.body,/sk-context-secret-123456/);
  assert.match(captured.init.body,/REDACTED_SECRET/);
  assert.equal(bridge.snapshot().successes,1);
});

test('rendered advisory keeps execution boundary visible',()=>{
  const text=renderBiggjAiAdvisory({
    model:'gpt-5.6',
    advisory:{
      status:'ABSTAIN',
      answer:'Mehr Daten nötig.',
      recommended_next_steps:['Quelle prüfen.'],
      uncertainties:['Datenlage unvollständig.'],
      confidence_label:'LOW'
    }
  });
  assert.match(text,/ABSTAIN/);
  assert.match(text,/SHADOW_ONLY/);
  assert.match(text,/canExecuteLive:false/);
  assert.equal(BIGGJ_OPENAI_BRIDGE_VERSION,'BIGGJ_OPENAI_BRIDGE_V1');
});
