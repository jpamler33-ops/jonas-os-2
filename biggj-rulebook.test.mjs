import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIGGJ_RULEBOOK_VERSION,
  BIGGJ_RULEBOOK_DOMAINS,
  BIGGJ_RULEBOOK_RULES,
  BIGGJ_RULEBOOK_CORE_FACTS,
  verifyBiggjRulebook,
  biggjRulebookSummary,
  getBiggjRule,
  searchBiggjRules,
  evaluateBiggjRulebook,
  evaluateBiggjRuntimeRulebook,
  assertBiggjRulebookAdmission,
  biggjRulebookInstructionPacket
} from './biggj-rulebook.mjs';

const safeFacts=()=>({
  execution:'SHADOW_ONLY',
  canExecute:false,
  canExecuteLive:false,
  abstainFirstClass:true,
  automaticPrimaryMutation:false,
  automaticPromotion:false,
  automaticSkillTransition:false,
  unboundedLoop:false,
  pointInTimeRequired:true,
  evidenceFabrication:false,
  stalePresentedAsCurrent:false,
  unverifiedMarkedVerified:false,
  destructiveRecovery:false,
  secretsExposed:false,
  redCiIgnored:false,
  externalCallsHaveTimeouts:true
});

test('rulebook is structurally valid, broad and negative-state explicit',()=>{
  const v=verifyBiggjRulebook();
  assert.equal(v.ok,true,v.reasons.join('\n'));
  assert.equal(v.version,BIGGJ_RULEBOOK_VERSION);
  assert.ok(v.rules>=140);
  assert.equal(v.domains,Object.keys(BIGGJ_RULEBOOK_DOMAINS).length);
  assert.ok(v.hardRules>=40);

  const ids=new Set();
  for(const rule of BIGGJ_RULEBOOK_RULES){
    assert.equal(ids.has(rule.id),false,'duplicate '+rule.id);
    ids.add(rule.id);
    assert.ok(rule.must.length>10,rule.id+' missing must');
    assert.ok(rule.mustNot.length>10,rule.id+' missing mustNot');
    assert.ok(rule.why.length>10,rule.id+' missing why');
    assert.ok(rule.response.length>2,rule.id+' missing response');
    assert.ok(rule.badExamples.length>=1,rule.id+' missing bad example');
    assert.ok(rule.goodExamples.length>=1,rule.id+' missing good example');
  }
});

test('core machine checks map only to real rules',()=>{
  const ids=new Set(BIGGJ_RULEBOOK_RULES.map(r=>r.id));
  assert.ok(BIGGJ_RULEBOOK_CORE_FACTS.length>=16);
  for(const check of BIGGJ_RULEBOOK_CORE_FACTS){
    assert.ok(ids.has(check.ruleId),check.ruleId);
    assert.ok(check.key);
    assert.equal(typeof check.test,'function');
  }
});

test('known-safe constitutional facts pass without manufacturing semantic coverage',()=>{
  const out=evaluateBiggjRulebook({facts:safeFacts(),operation:'TEST_SAFE'});
  assert.equal(out.state,'PASS');
  assert.equal(out.action,'CONTINUE_SHADOW_RESEARCH');
  assert.equal(out.counts.failed,0);
  assert.equal(out.counts.checked,BIGGJ_RULEBOOK_CORE_FACTS.length);
  assert.equal(out.coverage.coreFactsMissing.length,0);
  assert.equal(out.execution,'SHADOW_ONLY');
  assert.equal(out.canExecute,false);
  assert.equal(out.canExecuteLive,false);
  assert.ok(out.coverage.semanticRulesTotal>=140);
  assert.match(out.coverage.note,/Domain modules must attach explicit violations/);
});

test('live execution, policy mutation and future-leakage boundary violations fail closed',()=>{
  const facts=safeFacts();
  facts.execution='LIVE';
  facts.canExecute=true;
  facts.canExecuteLive=true;
  facts.automaticPrimaryMutation=true;
  facts.automaticPromotion=true;
  facts.pointInTimeRequired=false;

  const out=evaluateBiggjRulebook({facts,operation:'RED_TEAM'});
  assert.equal(out.state,'BLOCKED');
  assert.equal(out.action,'ABSTAIN');
  const ids=new Set(out.violations.map(v=>v.ruleId));
  for(const id of ['TRADING-001','TRADING-002','TRADING-003','AUTO-002','AUTO-003','DATA-001']){
    assert.ok(ids.has(id),id);
  }
  assert.ok(out.counts.hard>=6);
});

test('negative evidence, stale presentation, verification laundering and destructive recovery are blocked',()=>{
  const facts=safeFacts();
  facts.evidenceFabrication=true;
  facts.stalePresentedAsCurrent=true;
  facts.unverifiedMarkedVerified=true;
  facts.destructiveRecovery=true;
  facts.secretsExposed=true;
  facts.redCiIgnored=true;
  facts.unboundedLoop=true;
  facts.externalCallsHaveTimeouts=false;

  const out=evaluateBiggjRulebook({facts,operation:'ANTI_PATTERN_TEST'});
  assert.equal(out.state,'BLOCKED');
  const ids=new Set(out.violations.map(v=>v.ruleId));
  for(const id of ['EPI-002','DATA-004','NEWS-003','PERSIST-004','SEC-001','DEPLOY-006','AUTO-007','RES-003']){
    assert.ok(ids.has(id),id);
  }
});

test('explicit non-hard semantic violation produces CAUTION and stable remediation',()=>{
  const out=evaluateBiggjRulebook({
    facts:safeFacts(),
    operation:'NEWS_PIPELINE',
    explicitViolations:[{ruleId:'NEWS-006',reason:'DUPLICATE_FEED_SPAM',detail:'same event posted twice'}]
  });
  assert.equal(out.state,'CAUTION');
  assert.equal(out.action,'CONTINUE_WITH_CAUTION');
  assert.equal(out.violations[0].ruleId,'NEWS-006');
  assert.equal(out.violations[0].response,'CAP_DEDUP_BACKPRESSURE');
});

test('unknown explicit rule references never silently disappear',()=>{
  const out=evaluateBiggjRulebook({
    facts:safeFacts(),
    explicitViolations:[{ruleId:'DOES-NOT-EXIST',reason:'INTEGRATION_BUG'}]
  });
  assert.equal(out.state,'CAUTION');
  assert.equal(out.violations[0].severity,'HIGH');
  assert.equal(out.violations[0].reason,'INTEGRATION_BUG');
  assert.equal(out.violations[0].response,'REVIEW_RULEBOOK_INTEGRATION');
});

test('assert admission throws on hard violation and carries rulebook evidence',()=>{
  const facts=safeFacts();
  facts.canExecuteLive=true;
  assert.throws(
    ()=>assertBiggjRulebookAdmission({facts,operation:'EXECUTION_GATE'}),
    err=>{
      assert.equal(err.code,'BIGGJ_RULEBOOK_BLOCKED');
      assert.equal(err.rulebook.state,'BLOCKED');
      assert.ok(err.rulebook.violations.some(v=>v.ruleId==='TRADING-003'));
      return true;
    }
  );
});

test('search and direct lookup expose both desired and forbidden behavior',()=>{
  const live=getBiggjRule('TRADING-003');
  assert.equal(live.severity,'HARD');
  assert.match(live.mustNot,/Live Execution/i);

  const rows=searchBiggjRules({query:'future leakage'});
  assert.ok(rows.some(r=>r.id==='DATA-001'));

  const security=searchBiggjRules({domain:'SECURITY'});
  assert.ok(security.length>=6);
  assert.ok(security.every(r=>r.domain==='SECURITY'));
});

test('instruction packet contains negative examples for autonomous consumers',()=>{
  const packet=biggjRulebookInstructionPacket({domains:['DATA','FORECAST','TRADING']});
  assert.equal(packet.version,BIGGJ_RULEBOOK_VERSION);
  assert.equal(packet.execution,'SHADOW_ONLY');
  assert.equal(packet.canExecuteLive,false);
  assert.ok(packet.rules.length>=20);
  for(const rule of packet.rules){
    assert.ok(rule.must);
    assert.ok(rule.mustNot);
    assert.ok(rule.badExamples.length);
    assert.ok(rule.goodExamples.length);
  }
});

test('summary is versioned, fingerprinted and domain-complete',()=>{
  const summary=biggjRulebookSummary();
  assert.equal(summary.version,BIGGJ_RULEBOOK_VERSION);
  assert.equal(summary.rules,BIGGJ_RULEBOOK_RULES.length);
  assert.equal(Object.keys(summary.byDomain).length,Object.keys(BIGGJ_RULEBOOK_DOMAINS).length);
  assert.match(summary.hierarchy,/HARD > HIGH > MEDIUM/);
  assert.equal(summary.defaultFailureMode,'FAIL_CLOSED_FOR_HARD_RULES');
  assert.equal(typeof summary.fingerprint,'string');
  assert.ok(summary.fingerprint.length>=32);
});


test('runtime assessment exposes unproven coverage and blocks verification laundering',()=>{
  const healthy=evaluateBiggjRuntimeRulebook({
    health:{
      institutionalKernel:{execution:'SHADOW_ONLY',canExecute:false},
      autonomousOperator:{
        canExecuteLive:false,
        automaticPrimaryMutation:false,
        automaticPromotion:false,
        automaticSkillTransition:false
      }
    },
    newsEvents:[]
  });
  assert.equal(healthy.state,'PASS');
  assert.ok(healthy.counts.missingCoreFacts>0);
  assert.match(healthy.note,/(Missing core facts remain explicitly unproven|Nicht beobachtbare semantische Regeln bleiben weiterhin als feste Policy aktiv)/);

  const bad=evaluateBiggjRuntimeRulebook({
    health:{
      institutionalKernel:{execution:'SHADOW_ONLY',canExecute:false},
      autonomousOperator:{
        canExecuteLive:false,
        automaticPrimaryMutation:false,
        automaticPromotion:false,
        automaticSkillTransition:false
      }
    },
    newsEvents:[{verified:true,independentConfirmation:0}]
  });
  assert.equal(bad.state,'BLOCKED');
  assert.ok(bad.violations.some(v=>v.ruleId==='NEWS-003'));
});
