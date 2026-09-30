import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramChatLifecycle, TELEGRAM_CHAT_LIFECYCLE_VERSION } from './telegram-chat-lifecycle.mjs';

test('chat becomes resettable only after configured idle timeout',()=>{
  let t=1_000;
  const x=createTelegramChatLifecycle({idleMs:600_000,now:()=>t});
  x.touch(123,{at:t});
  t+=599_999;
  assert.deepEqual(x.claimExpired({at:t}),[]);
  t+=1;
  const due=x.claimExpired({at:t});
  assert.equal(due.length,1);
  assert.equal(due[0].chatId,123);
  assert.equal(due[0].idleForMs,600_000);
});

test('one inactivity window can trigger only one reset',()=>{
  let t=1_000;
  const x=createTelegramChatLifecycle({idleMs:600_000,now:()=>t});
  x.touch(1,{at:t});
  t+=600_000;
  assert.equal(x.claimExpired({at:t}).length,1);
  assert.equal(x.claimExpired({at:t}).length,0);
  x.completeReset(1,{at:t,newHomeMessageId:90});
  assert.equal(x.claimExpired({at:t+600_000}).length,0);
  const snap=x.snapshot();
  assert.equal(snap.version,TELEGRAM_CHAT_LIFECYCLE_VERSION);
  assert.equal(snap.reset,1);
});

test('new user activity rearms the ten minute idle window',()=>{
  let t=10_000;
  const x=createTelegramChatLifecycle({idleMs:600_000,now:()=>t});
  x.touch(5,{at:t});
  t+=600_000;
  x.completeReset(5,{at:t,newHomeMessageId:22});
  t+=60_000;
  const touch=x.touch(5,{at:t});
  assert.equal(touch.wasResetDone,true);
  assert.equal(touch.hadExpired,false);
  t+=599_999;
  assert.equal(x.claimExpired({at:t}).length,0);
  t+=1;
  assert.equal(x.claimExpired({at:t}).length,1);
});

test('tracks only bounded unique UI message ids',()=>{
  const x=createTelegramChatLifecycle({idleMs:600_000,maxTrackedUiMessages:3,now:()=>1_000});
  x.touch('abc',{at:1_000});
  x.recordUiMessage('abc',10);
  x.recordUiMessage('abc',11);
  x.recordUiMessage('abc',12);
  x.recordUiMessage('abc',11);
  x.recordUiMessage('abc',13);
  const due=x.claimExpired({at:601_000});
  assert.deepEqual(due[0].uiMessageIds,[12,11,13]);
});

test('failed reset does not spam repeated resets during the same idle window',()=>{
  let t=1_000;
  const x=createTelegramChatLifecycle({idleMs:600_000,now:()=>t});
  x.touch(7,{at:t});
  t+=600_000;
  assert.equal(x.claimExpired({at:t}).length,1);
  x.failReset(7);
  assert.equal(x.claimExpired({at:t+60_000}).length,0);
  x.touch(7,{at:t+70_000});
  assert.equal(x.claimExpired({at:t+670_000}).length,1);
});
