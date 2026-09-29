import test from 'node:test';
import assert from 'node:assert/strict';
import { isDiscordInteractionReplyTarget } from './discord-telegram-bridge.mjs';

test('Discord core edit targets the active deferred interaction reply',()=>{
  const ctx={
    interaction:{id:'interaction-1'},
    replyMessageId:'message-123',
    responded:false
  };
  assert.equal(isDiscordInteractionReplyTarget(ctx,'message-123'),true);
  assert.equal(isDiscordInteractionReplyTarget(ctx,'message-999'),false);
});

test('Discord panel and unrelated message edits do not hijack interaction replies',()=>{
  assert.equal(isDiscordInteractionReplyTarget(null,'message-123'),false);
  assert.equal(isDiscordInteractionReplyTarget({interaction:{},replyMessageId:null},'message-123'),false);
  assert.equal(isDiscordInteractionReplyTarget({interaction:{},replyMessageId:'message-123'},null),false);
});
