import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemecoinSocialAttentionProvider,applyDirectSocialAttention,MEMECOIN_SOCIAL_ATTENTION_VERSION} from './memecoin-social-attention.mjs';

test('unconfigured X source is explicit and fail-quiet when Bluesky is disabled',async()=>{
  const p=createMemecoinSocialAttentionProvider({bearerToken:'',blueskyEnabled:false});
  const x=await p.fetchDiscovery();
  assert.equal(x.version,MEMECOIN_SOCIAL_ATTENTION_VERSION);
  assert.equal(x.configured,false);
  assert.equal(x.sourceReady,false);
  assert.ok(x.missingSources.includes('X_BEARER_TOKEN_NOT_CONFIGURED'));
});

test('X recent search extracts direct contract seeds and attention',async()=>{
  const sol='So11111111111111111111111111111111111111112';
  const evm='0x1111111111111111111111111111111111111111';
  const p=createMemecoinSocialAttentionProvider({
    bearerToken:'test',blueskyEnabled:false,now:()=>1000,
    fetchImpl:async url=>{
      const u=new URL(url);assert.match(u.pathname,/tweets\/search\/recent/);
      return {ok:true,status:200,json:async()=>({
        data:[
          {id:'1',author_id:'u1',created_at:'2026-10-01T20:00:00Z',text:'new meme CA: '+sol+' $CATX',public_metrics:{like_count:10,retweet_count:5,reply_count:2,quote_count:1}},
          {id:'2',author_id:'u2',created_at:'2026-10-01T20:01:00Z',text:'watch $CATX contract '+evm,public_metrics:{like_count:4,retweet_count:2,reply_count:1,quote_count:0}}
        ],
        includes:{users:[
          {id:'u1',username:'a',public_metrics:{followers_count:5000}},
          {id:'u2',username:'b',public_metrics:{followers_count:1000}}
        ]}
      })};
    }
  });
  const x=await p.fetchDiscovery();
  assert.equal(x.sourceReady,true);
  assert.equal(x.x.sourceReady,true);
  assert.ok(x.seeds.some(s=>s.type==='SOLANA_ADDRESS'&&s.value===sol));
  assert.ok(x.seeds.some(s=>s.type==='EVM_ADDRESS'&&s.value===evm));
  const cat=x.seeds.find(s=>s.key==='symbol:CATX');
  assert.equal(cat.posts,2);
  assert.equal(cat.uniqueAuthors,2);
  assert.deepEqual(cat.platforms,['X']);
});

test('keyless Bluesky public search supplies direct attention without X credentials',async()=>{
  const evm='0x2222222222222222222222222222222222222222';
  const p=createMemecoinSocialAttentionProvider({
    bearerToken:'',blueskyEnabled:true,blueskyQueries:['memecoin'],now:()=>2000,
    fetchImpl:async url=>{
      const u=new URL(url);
      assert.equal(u.hostname,'api.bsky.app');
      assert.equal(u.pathname,'/xrpc/app.bsky.feed.searchPosts');
      return {ok:true,status:200,json:async()=>({posts:[{
        uri:'at://did:plc:test/app.bsky.feed.post/abc',
        author:{did:'did:plc:test',handle:'alpha.bsky.social'},
        record:{text:'fresh meme contract '+evm+' $BLUE',createdAt:'2026-10-01T20:02:00Z'},
        likeCount:7,repostCount:3,replyCount:2,quoteCount:1
      }]})};
    }
  });
  const x=await p.fetchDiscovery();
  assert.equal(x.sourceReady,true);
  assert.equal(x.x.configured,false);
  assert.equal(x.bluesky.sourceReady,true);
  assert.ok(x.missingSources.includes('X_BEARER_TOKEN_NOT_CONFIGURED'));
  assert.ok(x.seeds.some(s=>s.type==='EVM_ADDRESS'&&s.value===evm));
  assert.ok(x.seeds.some(s=>s.key==='symbol:BLUE'&&s.platforms.includes('BLUESKY')));
});

test('single weak cashtag does not contaminate same-symbol radar rows',()=>{
  const out=applyDirectSocialAttention({rows:[{chainId:'base',tokenAddress:'0xabc',symbol:'CAT'}]},{
    configured:true,sourceReady:true,capturedAt:10,source:'BLUESKY_PUBLIC_SEARCH',errors:[],
    seeds:[{type:'CASHTAG',value:'CAT',posts:1,uniqueAuthors:1,engagement:2,maxAuthorFollowers:0,latestAt:9,attentionBand:'SINGLE_POST',platforms:['BLUESKY']}]
  });
  assert.equal(out.rows[0].directSocialAttention.posts,0);
  assert.equal(out.rows[0].directSocialAttention.attentionBand,'NONE');
});

test('Bluesky search falls back to secondary AppView host',async()=>{
  const calls=[];
  const p=createMemecoinSocialAttentionProvider({
    bearerToken:'',blueskyEnabled:true,blueskyQueries:['memecoin'],now:()=>2500,
    blueskyBaseUrls:['https://api.bsky.app','https://public.api.bsky.app'],
    fetchImpl:async url=>{
      const u=new URL(url);calls.push(u.hostname);
      if(u.hostname==='api.bsky.app')return {ok:false,status:403,json:async()=>({})};
      return {ok:true,status:200,json:async()=>({posts:[]})};
    }
  });
  const x=await p.fetchDiscovery();
  assert.equal(x.bluesky.sourceReady,true);
  assert.equal(x.bluesky.sourceBase,'https://public.api.bsky.app');
  assert.deepEqual(calls,['api.bsky.app','public.api.bsky.app']);
});

test('direct social evidence maps to existing radar rows without claiming causality',()=>{
  const out=applyDirectSocialAttention({rows:[{chainId:'solana',tokenAddress:'ABC',symbol:'CATX'}]},{
    configured:true,sourceReady:true,capturedAt:10,source:'X_RECENT_SEARCH',errors:[],
    seeds:[{type:'CASHTAG',value:'CATX',posts:3,uniqueAuthors:2,engagement:50,maxAuthorFollowers:10000,latestAt:9,attentionBand:'MULTI_POST',platforms:['X']}]
  });
  assert.equal(out.rows[0].directSocialAttention.posts,3);
  assert.equal(out.rows[0].directSocialAttention.uniqueAuthors,2);
  assert.deepEqual(out.rows[0].directSocialAttention.platforms,['X']);
  assert.equal(out.socialAttention.sourceReady,true);
});
