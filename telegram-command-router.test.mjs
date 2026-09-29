import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTelegramCommand,
  createTelegramCommandRouter,
  commandNames
} from "./telegram-command-router.mjs";

test("parses bot-suffixed Telegram commands",()=>{
  const p=parseTelegramCommand(" /coin@TCXBot BTC  5m ");
  assert.equal(p.command,"/coin");
  assert.deepEqual(p.args,["BTC","5m"]);
  assert.equal(p.parts[0],"/coin@TCXBot");
});

test("non-command text is ignored",()=>{
  assert.equal(parseTelegramCommand("hello"),null);
  assert.equal(parseTelegramCommand(""),null);
});

test("router dispatches known command and returns true",async()=>{
  const calls=[];
  const route=createTelegramCommandRouter({
    handlers:{
      "/start":async ctx=>calls.push(ctx)
    }
  });
  const handled=await route({chat:{id:123},text:"/start"});
  assert.equal(handled,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].chatId,123);
});

test("router returns false for unknown command",async()=>{
  const route=createTelegramCommandRouter({handlers:{"/start":async()=>{}}});
  assert.equal(await route({chat:{id:1},text:"/unknown"}),false);
});

test("denied chats are consumed without invoking handler",async()=>{
  let called=false,denied=false;
  const route=createTelegramCommandRouter({
    permitted:()=>false,
    onDenied:async()=>{denied=true;},
    handlers:{"/start":async()=>{called=true;}}
  });
  assert.equal(await route({chat:{id:9},text:"/start"}),true);
  assert.equal(called,false);
  assert.equal(denied,true);
});

test("handler errors can be isolated by onError",async()=>{
  const errors=[];
  const route=createTelegramCommandRouter({
    onError:async(err,ctx)=>errors.push([err.message,ctx.command]),
    handlers:{"/x":async()=>{throw new Error("boom");}}
  });
  assert.equal(await route({chat:{id:1},text:"/x"}),true);
  assert.deepEqual(errors,[["boom","/x"]]);
});

test("commandNames returns normalized stable registry",()=>{
  assert.deepEqual(commandNames({"/B":async()=>{},"/a":()=>{},bad:()=>{}, "/x":1}),["/a","/b"]);
});
