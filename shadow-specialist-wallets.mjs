import { readFile, writeFile, rename } from 'node:fs/promises';
import { sha256 } from './institutional-kernel.mjs';

export const SPECIALIST_SHADOW_WALLETS_VERSION='BIGGJ_SPECIALIST_SHADOW_WALLETS_V1';
export const WALLET_3_TRADER_COPY='W3_TRADER_COPY';
export const WALLET_4_MEME_SCOUT='W4_MEME_SCOUT';
export const WALLET_5_MEME_COPY='W5_MEME_COPY';

const EPS=1e-12;
const DEFAULT_MEME_SYMBOLS=new Set([
  'DOGE','PEPE','SHIB','BONK','WIF','FLOKI','TRUMP','PENGU','BRETT','MOG','POPCAT','MEW','TURBO','BABYDOGE'
]);

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='')return fallback;
  const n=Number(v);return Number.isFinite(n)?n:fallback;
}
function text(v,max=160){
  const s=String(v??'').replace(/\s+/g,' ').trim();
  return s.length<=max?s:s.slice(0,max-1)+'…';
}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v))freeze(x);
  }
  return v;
}
function instBase(instId=''){
  return String(instId||'').toUpperCase().replace(/-USDT-SWAP$/,'').replace(/USDT$/,'').split('-')[0];
}
function directionSign(side){return String(side||'').toUpperCase()==='SHORT'?-1:1;}
function netPnl({side,entryPrice,markPrice,exposureQuote,feeBps=10}={}){
  const e=finite(entryPrice),m=finite(markPrice),x=Math.max(0,finite(exposureQuote,0));
  if(!(e>0&&m>0&&x>0))return {gross:null,fees:null,net:null,returnPct:null};
  const ret=directionSign(side)*(m/e-1);
  const gross=x*ret;
  const fees=x*Math.max(0,Number(feeBps)||0)/10000*2;
  return {gross,fees,net:gross-fees,returnPct:ret};
}
function walletTemplate(id,{label,defaultMarginQuote,objective}){
  return {
    walletId:id,label,
    capitalModel:'UNLIMITED_VIRTUAL_FACILITY',
    capitalLimitQuote:null,
    defaultMarginQuote,
    objective,
    positions:[],
    closed:[],
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false,
    primaryPerformanceExcluded:true
  };
}

export function createSpecialistWalletState(){
  return freeze({
    version:SPECIALIST_SHADOW_WALLETS_VERSION,
    schemaVersion:1,
    updatedAt:null,
    wallets:{
      [WALLET_3_TRADER_COPY]:walletTemplate(WALLET_3_TRADER_COPY,{
        label:'Copy erfolgreiche öffentliche Trader',
        defaultMarginQuote:500,
        objective:'NORMALIZED_COPY_RESEARCH_OF_PUBLIC_SUCCESSFUL_TRADERS'
      }),
      [WALLET_4_MEME_SCOUT]:walletTemplate(WALLET_4_MEME_SCOUT,{
        label:'Early Memecoin Scout',
        defaultMarginQuote:100,
        objective:'ENTER_EARLY_PUBLIC_MEMECOIN_RESEARCH_CANDIDATES'
      }),
      [WALLET_5_MEME_COPY]:walletTemplate(WALLET_5_MEME_COPY,{
        label:'Memecoin Copy',
        defaultMarginQuote:150,
        objective:'COPY_PUBLIC_SUCCESSFUL_TRADER_MEMECOIN_POSITIONS'
      })
    },
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false
  });
}

function mutableState(input){
  const base=input&&input.version===SPECIALIST_SHADOW_WALLETS_VERSION?clone(input):clone(createSpecialistWalletState());
  for(const id of [WALLET_3_TRADER_COPY,WALLET_4_MEME_SCOUT,WALLET_5_MEME_COPY]){
    base.wallets[id]??=clone(createSpecialistWalletState().wallets[id]);
    base.wallets[id].positions=Array.isArray(base.wallets[id].positions)?base.wallets[id].positions:[];
    base.wallets[id].closed=Array.isArray(base.wallets[id].closed)?base.wallets[id].closed:[];
  }
  return base;
}
function openPosition(wallet,position){
  if(wallet.positions.some(x=>x.positionKey===position.positionKey))return false;
  wallet.positions.push(position);
  return true;
}
function closePosition(wallet,index,{price,at,reason,sourceClose=null,feeBps=10}={}){
  const p=wallet.positions[index];
  if(!p)return null;
  const mark=finite(price,p.lastPrice);
  if(!(mark>0))return null;
  const calc=netPnl({side:p.side,entryPrice:p.entryPrice,markPrice:mark,exposureQuote:p.exposureQuote,feeBps});
  const closed={
    ...p,status:'CLOSED',closedAt:Number(at),closePrice:mark,closeReason:String(reason||'SOURCE_EXIT'),
    realizedGrossPnlQuote:calc.gross,realizedFeesQuote:calc.fees,realizedNetPnlQuote:calc.net,
    realizedReturnPct:calc.returnPct,sourceClose:sourceClose?clone(sourceClose):null
  };
  wallet.positions.splice(index,1);
  wallet.closed.push(closed);
  if(wallet.closed.length>2000)wallet.closed=wallet.closed.slice(-2000);
  return closed;
}
function markPosition(p,price,at,feeBps=10){
  const mark=finite(price);
  if(!(mark>0))return p;
  const calc=netPnl({side:p.side,entryPrice:p.entryPrice,markPrice:mark,exposureQuote:p.exposureQuote,feeBps});
  return {...p,lastPrice:mark,lastMarkedAt:Number(at),unrealizedNetPnlQuote:calc.net,unrealizedReturnPct:calc.returnPct};
}
function traderPositionKey(walletId,trader,pos){
  return walletId+':'+String(trader?.uniqueCode||'')+':'+String(pos?.id||pos?.instId||'')+':'+String(pos?.openTime||'');
}
function isMemeInstrument(instId,memeSymbols=DEFAULT_MEME_SYMBOLS){
  return memeSymbols.has(instBase(instId));
}

export function applyPublicTraderCopySnapshot(input,snapshot,{
  now=Date.now(),
  wallet3MarginQuote=500,
  wallet5MarginQuote=150,
  feeBps=10,
  memeSymbols=[...DEFAULT_MEME_SYMBOLS],
  maxOpenOperational=120
}={}){
  const state=mutableState(input);
  const memeSet=new Set((Array.isArray(memeSymbols)?memeSymbols:[]).map(x=>String(x).toUpperCase()));
  const traders=Array.isArray(snapshot?.traders)?snapshot.traders:[];
  const sourceReady=snapshot?.sourceReady===true&&traders.length>0;
  const results={openedW3:0,openedW5:0,closedW3:0,closedW5:0,marked:0,sourceReady};
  const closeByTrader=new Map();
  for(const t of traders){
    const map=new Map();
    for(const row of Array.isArray(t?.recentClosed)?t.recentClosed:[])if(row?.id)map.set(String(row.id),row);
    closeByTrader.set(String(t?.uniqueCode||''),map);
  }

  for(const walletId of [WALLET_3_TRADER_COPY,WALLET_5_MEME_COPY]){
    const wallet=state.wallets[walletId];
    for(let i=wallet.positions.length-1;i>=0;i--){
      let p=wallet.positions[i];
      const trader=traders.find(t=>String(t?.uniqueCode||'')===String(p.sourceTraderCode||''));
      const open=trader?.openPositions?.find(x=>String(x?.id||'')===String(p.sourcePositionId||''));
      if(open&&finite(open?.markPx)>0){
        wallet.positions[i]=markPosition(p,open.markPx,now,feeBps);results.marked++;continue;
      }
      const closed=closeByTrader.get(String(p.sourceTraderCode||''))?.get(String(p.sourcePositionId||''));
      if(closed&&finite(closed?.closeAvgPx)>0){
        closePosition(wallet,i,{price:closed.closeAvgPx,at:finite(closed.closeTime,now),reason:'LEADER_POSITION_CLOSED',sourceClose:closed,feeBps});
        if(walletId===WALLET_3_TRADER_COPY)results.closedW3++;else results.closedW5++;
      }else{
        wallet.positions[i]={...p,sourceState:'SOURCE_EXIT_PENDING'};
      }
    }
  }

  if(sourceReady){
    for(const trader of traders){
      for(const pos of Array.isArray(trader?.openPositions)?trader.openPositions:[]){
        if(pos?.protectedFields||!(finite(pos?.markPx)>0)||!['LONG','SHORT'].includes(String(pos?.side||'').toUpperCase()))continue;
        const leverage=Math.max(1,Math.min(50,finite(pos?.leverage,1)));
        const common={
          source:'OKX_PUBLIC_COPY_TRADING',
          sourceTraderCode:String(trader?.uniqueCode||''),
          sourceTraderName:text(trader?.nickname||'Public Lead Trader',80),
          sourceProviderRank:finite(trader?.providerRank),
          sourcePositionId:String(pos?.id||''),
          sourceInstId:String(pos?.instId||''),
          side:String(pos.side).toUpperCase(),
          leverage,
          copiedAt:Number(now),
          entryPrice:Number(pos.markPx),
          lastPrice:Number(pos.markPx),
          lastMarkedAt:Number(now),
          sourceLeaderOpenAvgPx:finite(pos?.openAvgPx),
          sourceLeaderOpenTime:finite(pos?.openTime),
          sourceState:'OPEN_PUBLIC',
          status:'OPEN',
          execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false,
          epistemic:'COPY_FROM_PUBLIC_POSITION_AFTER_OBSERVATION_NOT_SAME_ENTRY_AS_LEADER'
        };
        const w3=state.wallets[WALLET_3_TRADER_COPY];
        if(w3.positions.length<maxOpenOperational){
          const margin=Math.max(1,Number(wallet3MarginQuote)||500);
          const position={...common,walletId:WALLET_3_TRADER_COPY,
            positionKey:traderPositionKey(WALLET_3_TRADER_COPY,trader,pos),
            marginQuote:margin,exposureQuote:margin*leverage
          };
          if(openPosition(w3,position))results.openedW3++;
        }
        if(isMemeInstrument(pos.instId,memeSet)){
          const w5=state.wallets[WALLET_5_MEME_COPY];
          if(w5.positions.length<maxOpenOperational){
            const margin=Math.max(1,Number(wallet5MarginQuote)||150);
            const position={...common,walletId:WALLET_5_MEME_COPY,
              positionKey:traderPositionKey(WALLET_5_MEME_COPY,trader,pos),
              marginQuote:margin,exposureQuote:margin*leverage,
              memeClassification:'KNOWN_CEX_MEME_SYMBOL'
            };
            if(openPosition(w5,position))results.openedW5++;
          }
        }
      }
    }
  }
  state.updatedAt=Number(now);
  return {state:freeze(state),results:freeze(results)};
}

function memePositionKey(row){return WALLET_4_MEME_SCOUT+':'+String(row?.chainId||'')+':'+String(row?.tokenAddress||'');}
function severeMemeRisk(flags=[]){
  const set=new Set(Array.isArray(flags)?flags:[]);
  return ['LIQUIDITY_UNKNOWN','LIQUIDITY_EXTREME_THIN','ONE_SIDED_NO_SELLS_OBSERVED'].some(x=>set.has(x));
}

export function applyMemecoinScoutSnapshot(input,snapshot,{
  now=Date.now(),
  marginQuote=100,
  feeBps=30,
  minScore=.58,
  minLiquidityUsd=10_000,
  maxOpenOperational=30,
  horizonMs=12*60*60_000,
  stopReturn=-.45,
  takeReturn=1.50
}={}){
  const state=mutableState(input);
  const wallet=state.wallets[WALLET_4_MEME_SCOUT];
  const rows=Array.isArray(snapshot?.rows)?snapshot.rows:[];
  const byKey=new Map(rows.map(x=>[String(x?.chainId||'')+':'+String(x?.tokenAddress||''),x]));
  const results={opened:0,closed:0,marked:0,eligible:0,sourceReady:snapshot?.sourceReady===true};

  for(let i=wallet.positions.length-1;i>=0;i--){
    const p=wallet.positions[i];
    const row=byKey.get(String(p.chainId||'')+':'+String(p.tokenAddress||''));
    if(row&&finite(row?.priceUsd)>0){
      const marked=markPosition(p,row.priceUsd,now,feeBps);
      wallet.positions[i]=marked;results.marked++;
      const ret=finite(marked.unrealizedReturnPct);
      const liq=finite(row?.liquidityUsd);
      let reason=null;
      if(ret!=null&&ret<=stopReturn)reason='MEME_STOP';
      else if(ret!=null&&ret>=takeReturn)reason='MEME_TAKE_PROFIT';
      else if(Number(now)-Number(p.openedAt||now)>=Math.max(60_000,Number(horizonMs)||12*60*60_000))reason='MEME_HORIZON';
      else if(liq!=null&&liq<3_000)reason='MEME_LIQUIDITY_COLLAPSE';
      if(reason){closePosition(wallet,i,{price:row.priceUsd,at:now,reason,feeBps});results.closed++;}
    }
  }

  for(const row of rows){
    const score=finite(row?.score?.researchPriorityScore,0);
    const stage=String(row?.score?.stage||'');
    const liq=finite(row?.liquidityUsd,0);
    const px=finite(row?.priceUsd);
    const flags=row?.score?.riskFlags||[];
    const eligible=['NEW_NOW','EARLY'].includes(stage)&&score>=minScore&&liq>=minLiquidityUsd&&px>0&&!severeMemeRisk(flags);
    if(!eligible)continue;
    results.eligible++;
    if(wallet.positions.length>=maxOpenOperational)break;
    const key=memePositionKey(row);
    if(wallet.positions.some(x=>x.positionKey===key)||wallet.closed.some(x=>x.positionKey===key))continue;
    const margin=Math.max(1,Number(marginQuote)||100);
    const position={
      walletId:WALLET_4_MEME_SCOUT,positionKey:key,
      chainId:String(row?.chainId||''),tokenAddress:String(row?.tokenAddress||''),
      symbol:text(row?.symbol||row?.name||'MEME',80),name:text(row?.name||'',120),
      side:'LONG',leverage:1,marginQuote:margin,exposureQuote:margin,
      entryPrice:px,lastPrice:px,openedAt:Number(now),lastMarkedAt:Number(now),
      sourcePairCreatedAt:finite(row?.pairCreatedAt),sourceFirstSeenAt:finite(row?.firstSeenAt),
      entryResearchPriorityScore:score,entryStage:stage,
      entryAttentionSignals:clone(row?.score?.attentionSignals||[]),
      entryRiskFlags:clone(flags),
      source:'BIGGJ_MEMECOIN_EARLY_RADAR',
      status:'OPEN',execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false,
      epistemic:'EARLY_RESEARCH_SCORE_NOT_PROFIT_PROBABILITY'
    };
    if(openPosition(wallet,position))results.opened++;
  }
  state.updatedAt=Number(now);
  return {state:freeze(state),results:freeze(results)};
}

function walletStats(wallet){
  const open=wallet.positions||[],closed=wallet.closed||[];
  const realized=closed.reduce((s,p)=>s+finite(p?.realizedNetPnlQuote,0),0);
  const unrealized=open.reduce((s,p)=>s+finite(p?.unrealizedNetPnlQuote,0),0);
  const wins=closed.filter(p=>finite(p?.realizedNetPnlQuote,0)>0);
  const losses=closed.filter(p=>finite(p?.realizedNetPnlQuote,0)<0);
  const gp=wins.reduce((s,p)=>s+finite(p?.realizedNetPnlQuote,0),0);
  const gl=Math.abs(losses.reduce((s,p)=>s+finite(p?.realizedNetPnlQuote,0),0));
  return freeze({
    walletId:wallet.walletId,label:wallet.label,capitalModel:wallet.capitalModel,capitalLimitQuote:null,
    openPositions:open.length,closedTrades:closed.length,wins:wins.length,losses:losses.length,
    winRate:closed.length?wins.length/closed.length:null,
    realizedPnlQuote:realized,unrealizedPnlQuote:unrealized,netPnlQuote:realized+unrealized,
    profitFactor:gl>EPS?gp/gl:null,
    cumulativeMarginUsedQuote:[...open,...closed].reduce((s,p)=>s+Math.max(0,finite(p?.marginQuote,0)),0),
    currentMarginAtRiskQuote:open.reduce((s,p)=>s+Math.max(0,finite(p?.marginQuote,0)),0),
    active:open.slice().sort((a,b)=>Number(b?.openedAt||0)-Number(a?.openedAt||0)).slice(0,20).map(x=>clone(x)),
    recentClosed:closed.slice(-20).reverse().map(x=>clone(x)),
    objective:wallet.objective,primaryPerformanceExcluded:true,
    execution:'SHADOW_ONLY',canExecuteLive:false
  });
}

export function specialistWalletSummary(state,{asOf=Date.now()}={}){
  const s=mutableState(state);
  const wallets={};
  for(const id of [WALLET_3_TRADER_COPY,WALLET_4_MEME_SCOUT,WALLET_5_MEME_COPY])wallets[id]=walletStats(s.wallets[id]);
  const core={version:SPECIALIST_SHADOW_WALLETS_VERSION,asOf:Number(asOf),wallets,
    execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false,automaticRealOrders:false};
  return freeze({...core,fingerprint:sha256(core)});
}

export async function loadSpecialistWalletState(filePath){
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(parsed?.version!==SPECIALIST_SHADOW_WALLETS_VERSION)throw new Error('SPECIALIST_WALLET_VERSION_MISMATCH');
    return {state:freeze(mutableState(parsed)),healthy:true,error:null};
  }catch(err){
    if(err?.code==='ENOENT')return {state:createSpecialistWalletState(),healthy:true,error:null};
    return {state:createSpecialistWalletState(),healthy:false,error:err instanceof Error?err.message:String(err)};
  }
}
export async function saveSpecialistWalletState(filePath,state){
  const next=mutableState(state);
  next.updatedAt=Date.now();
  const tmp=filePath+'.tmp';
  await writeFile(tmp,JSON.stringify(next),'utf8');
  await rename(tmp,filePath);
  return freeze(next);
}
