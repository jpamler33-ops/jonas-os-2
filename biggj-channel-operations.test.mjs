import test from 'node:test';
import assert from 'node:assert/strict';
import {createBiggjChannelManagerRuntime} from './biggj-channel-operations.mjs';

test('one manager is created for every declared channel and supervisor sees failures',()=>{
  let now=1000;
  const runtime=createBiggjChannelManagerRuntime({
    sections:[{category:'A',channels:[{name:'x',topic:'x'},{name:'y',topic:'y'}]}],
    profileFor:()=>({mode:'LIVE PANEL',cadence:'60s',cadenceMs:60000,requiresContent:true}),
    now:()=>now
  });
  assert.deepEqual(runtime.names,['x','y']);
  runtime.observe('x',{exists:true,parentMatches:true,topicMatches:true,botMessageCount:1,lastMessageAt:1000});
  runtime.success('x','ok');
  runtime.observe('y',{exists:false,parentMatches:false,topicMatches:false});
  const snap=runtime.snapshot();
  assert.equal(snap.managers,2);
  assert.equal(snap.supervisor.status,'ACTION_REQUIRED');
  assert.equal(snap.topProblems[0].name,'y');
  assert.equal(snap.topProblems[0].decision,'REPAIR_LAYOUT');
});

test('stale live channel is detected and gets a refresh recommendation',()=>{
  let now=200000;
  const runtime=createBiggjChannelManagerRuntime({
    sections:[{category:'A',channels:[{name:'x',topic:'x'}]}],
    profileFor:()=>({mode:'LIVE PANEL',cadence:'60s',cadenceMs:60000,requiresContent:true}),
    now:()=>now
  });
  runtime.observe('x',{exists:true,parentMatches:true,topicMatches:true,botMessageCount:1,lastMessageAt:1});
  runtime.success('x','old');
  now=400000;
  const row=runtime.snapshot().rows[0];
  assert.equal(row.status,'STALE');
  assert.equal(row.decision,'REFRESH');
  assert.match(row.suggestion,/neu erzeugen|Freshness|neu laden|Refresh/i);
});


test('domain supervisors roll channel state into director and meta supervisor',()=>{
  const runtime=createBiggjChannelManagerRuntime({
    sections:[
      {category:'A',channels:[{name:'a1',topic:'a1'},{name:'a2',topic:'a2'}]},
      {category:'B',channels:[{name:'b1',topic:'b1'}]}
    ],
    profileFor:()=>({mode:'LIVE PANEL',cadence:'60s',cadenceMs:60000,requiresContent:true}),
    now:()=>1000
  });
  for(const name of runtime.names)runtime.observe(name,{exists:true,parentMatches:true,topicMatches:true});
  runtime.success('a1');
  runtime.failure('a2',new Error('SOURCE_DOWN'));
  runtime.success('b1');
  const snap=runtime.snapshot();
  assert.equal(snap.domainSupervisors.length,2);
  assert.equal(snap.domainSupervisors.find(x=>x.category==='A').status,'ACTION_REQUIRED');
  assert.equal(snap.domainSupervisors.find(x=>x.category==='B').status,'HEALTHY');
  assert.equal(snap.operationsDirector.status,'ACTION_REQUIRED');
  assert.equal(snap.metaSupervisor.status,'DIRECTOR_ESCALATION');
  assert.equal(snap.metaSupervisor.directorObserved,true);
  assert.equal(snap.metaSupervisor.domainSupervisorsObserved,2);
});
