import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemecoinSocialAttentionProvider,applyDirectSocialAttention,MEMECOIN_SOCIAL_ATTENTION_VERSION} from './memecoin-social-attention.mjs';

test('unconfigured X source is explicit and fail-quiet',async()=>{
  const p=createMemecoinSocialAttentionProvider({bearerToken:''});
  const x=await p.fetchDiscovery();
  assert.equal(x.version,MEMECOIN_SOCIAL_ATTENTION_VERSION);
  assert.equal(x.configured,false);
  assert.equal(x.sourceReady,false);
  assert.ok(x.errors.includes('X_BEARER_TOKEN_NOT_CONFIGURED'));
});

test('X recent search extracts direct contract seeds and attention',async()=>{
  const sol='7YWHMfk9JZe0LM0g1ZauHuiSxhIji61Y9ij4nAbCpump';
  const evm='0x1111111111111111111111111111111111111111';
  const p=createMemecoinSocialAttentionProvider({
    bearerToken:'test',now:()=>1000,
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
  assert.ok(x.seeds.some(s=>s.type==='SOLANA_ADDRESS'&&s.value===sol));
  assert.ok(x.seeds.some(s=>s.type==='EVM_ADDRESS'&&s.value===evm));
  const cat=x.seeds.find(s=>s.key==='symbol:CATX');
  assert.equal(cat.posts,2);
  assert.equal(cat.uniqueAuthors,2);
});

test('direct social evidence maps to existing radar rows without claiming causality',()=>{
  const out=applyDirectSocialAttention({rows:[{chainId:'solana',tokenAddress:'ABC',symbol:'CATX'}]},{
    configured:true,sourceReady:true,capturedAt:10,source:'X_RECENT_SEARCH',errors:[],
    seeds:[{type:'CASHTAG',value:'CATX',posts:3,uniqueAuthors:2,engagement:50,maxAuthorFollowers:10000,latestAt:9,attentionBand:'OBSERVED'}]
  });
  assert.equal(out.rows[0].xDirectAttention.posts,3);
  assert.equal(out.rows[0].xDirectAttention.uniqueAuthors,2);
  assert.equal(out.socialAttention.sourceReady,true);
});
