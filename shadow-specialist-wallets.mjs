import { readFile, writeFile, rename } from 'node:fs/promises';
import { sha256 } from './institutional-kernel.mjs';

export const SPECIALIST_SHADOW_WALLETS_VERSION='BIGGJ_SPECIALIST_SHADOW_WALLETS_V1';
export const WALLET_3_TRADER_COPY='W3_TRADER_COPY';
export const WALLET_4_MEME_SCOUT='W4_MEME_SCOUT';
export const WALLET_5_MEME_COPY='W5_MEME_COPY';
export const WALLET_6_USER_99K_60S='W6_USER_99K_60S';
export const USER_99K_60S_STRATEGY_VERSION='BIGGJ_USER_99K_60S_STRATEGY_V1';

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
      }),
      [WALLET_6_USER_99K_60S]:walletTemplate(WALLET_6_USER_99K_60S,{
        label:'99k in 60s — User Strategy V1',
        defaultMarginQuote:100,
        objective:'SHADOW_TEST_USER_DISCOVERED_99K_MARKET_CAP_WITHIN_60_SECONDS'
      })
    },
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false
  });
}

function mutableState(input){
  const base=input&&input.version===SPECIALIST_SHADOW_WALLETS_VERSION?clone(input):clone(createSpecialistWalletState());
  for(const id of [WALLET_3_TRADER_COPY,WALLET_4_MEME_SCOUT,WALLET_5_MEME_COPY,WALLET_6_USER_99K_60S]){
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
  const partialGross=finite(p?.partialRealizedGrossPnlQuote,0);
  const partialFees=finite(p?.partialRealizedFeesQuote,0);
  const partialNet=finite(p?.partialRealizedNetPnlQuote,0);
  const totalGross=partialGross+finite(calc.gross,0);
  const totalFees=partialFees+finite(calc.fees,0);
  const totalNet=partialNet+finite(calc.net,0);
  const initialExposure=Math.max(EPS,finite(p?.initialExposureQuote,p?.exposureQuote)||EPS);
  const closed={
    ...p,status:'CLOSED',closedAt:Number(at),closePrice:mark,closeReason:String(reason||'SOURCE_EXIT'),
    realizedGrossPnlQuote:totalGross,realizedFeesQuote:totalFees,realizedNetPnlQuote:totalNet,
    realizedReturnPct:totalGross/initialExposure,
    observedMfeReturnPct:finite(p?.peakUnrealizedReturnPct),
    observedMaeReturnPct:finite(p?.troughUnrealizedReturnPct),
    sourceClose:sourceClose?clone(sourceClose):null
  };
  wallet.positions.splice(index,1);
  wallet.closed.push(closed);
  if(wallet.closed.length>2000)wallet.closed=wallet.closed.slice(-2000);
  return closed;
}
function reducePosition(p,{price,at,fraction,reason,feeBps=10}={}){
  const mark=finite(price,p?.lastPrice);
  const exposure=Math.max(0,finite(p?.exposureQuote,0));
  const margin=Math.max(0,finite(p?.marginQuote,0));
  const f=Math.max(0,Math.min(.95,finite(fraction,0)));
  if(!(mark>0&&exposure>EPS&&f>0))return p;
  const closedExposure=exposure*f;
  const calc=netPnl({side:p.side,entryPrice:p.entryPrice,markPrice:mark,exposureQuote:closedExposure,feeBps});
  const event={
    at:Number(at),price:mark,fraction:f,reason:String(reason||'MEME_PARTIAL_REDUCE'),
    exposureQuote:closedExposure,grossPnlQuote:calc.gross,feesQuote:calc.fees,netPnlQuote:calc.net,
    returnPct:calc.returnPct
  };
  const base={
    ...p,
    initialExposureQuote:finite(p?.initialExposureQuote,exposure),
    initialMarginQuote:finite(p?.initialMarginQuote,margin),
    exposureQuote:Math.max(0,exposure-closedExposure),
    marginQuote:Math.max(0,margin*(1-f)),
    partialRealizedGrossPnlQuote:finite(p?.partialRealizedGrossPnlQuote,0)+finite(calc.gross,0),
    partialRealizedFeesQuote:finite(p?.partialRealizedFeesQuote,0)+finite(calc.fees,0),
    partialRealizedNetPnlQuote:finite(p?.partialRealizedNetPnlQuote,0)+finite(calc.net,0),
    partialExits:[...(Array.isArray(p?.partialExits)?p.partialExits:[]),event].slice(-20)
  };
  return markPosition(base,mark,at,feeBps);
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
  const results={openedW3:0,openedW5:0,closedW3:0,closedW5:0,learningBlockedW5:0,marked:0,sourceReady};
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
      const copyEligible=trader?.copyEligible!==false&&trader?.trackedLifecycleOnly!==true;
      for(const pos of Array.isArray(trader?.openPositions)?trader.openPositions:[]){
        if(!copyEligible)continue;
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
          if(String(pos?.memeLearning?.action||'NEUTRAL').toUpperCase()==='BLOCK'){
            results.learningBlockedW5++;
            continue;
          }
          if(w5.positions.length<maxOpenOperational){
            const margin=Math.max(1,Number(wallet5MarginQuote)||150);
            const position={...common,walletId:WALLET_5_MEME_COPY,
              positionKey:traderPositionKey(WALLET_5_MEME_COPY,trader,pos),
              marginQuote:margin,exposureQuote:margin*leverage,
              memeClassification:'KNOWN_CEX_MEME_SYMBOL',
              entryMemeLearning:clone(pos?.memeLearning||null)
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
  return [
    'LIQUIDITY_UNKNOWN','LIQUIDITY_EXTREME_THIN','ONE_SIDED_NO_SELLS_OBSERVED',
    'M5_CRASH_EXTREME','DATA_ANOMALY_MCAP_LIQUIDITY','DATA_ANOMALY_FDV_LIQUIDITY'
  ].some(x=>set.has(x));
}
function memeSecurityGate(row={}){
  return String(row?.security?.evidenceGate||'UNKNOWN').toUpperCase();
}
function memeSecurityCritical(row={}){
  return Array.isArray(row?.security?.criticalRiskFlags)&&row.security.criticalRiskFlags.length>0;
}
function memeEntryTailRisk(row={}){
  const flags=new Set(Array.isArray(row?.score?.riskFlags)?row.score.riskFlags:[]);
  const liq=finite(row?.liquidityUsd);
  const thin=flags.has('LIQUIDITY_THIN')||(liq!=null&&liq<25_000);
  const veryThin=flags.has('LIQUIDITY_VERY_THIN')||flags.has('LIQUIDITY_EXTREME_THIN')||(liq!=null&&liq<10_000);
  const secondaryFlags=[
    'M5_CHASE_RISK','EXTREME_TURNOVER','M5_DRAWDOWN_SEVERE',
    'M5_CRASH_EXTREME','ONE_SIDED_NO_SELLS_OBSERVED',
    'DATA_ANOMALY_MCAP_LIQUIDITY','DATA_ANOMALY_FDV_LIQUIDITY'
  ].filter(x=>flags.has(x));
  // Thin liquidity alone is not enough to kill the trade: the live sample
  // contains moonshot-positive thin cohorts. Block only when thin liquidity
  // is paired with an independent deterioration/chase/data-risk signal.
  const blocked=veryThin||(thin&&secondaryFlags.length>0);
  return Object.freeze({
    blocked,
    thin,
    veryThin,
    secondaryFlags:Object.freeze(secondaryFlags),
    liquidityUsd:liq,
    reason:veryThin?'VERY_THIN_LIQUIDITY':blocked?'THIN_PLUS_SECONDARY_RISK':null
  });
}
function memeTailRiskDiagnostics(position,row,marked,{armReturn=-.08}={}){
  const ret=finite(marked?.unrealizedReturnPct);
  const liq=finite(row?.liquidityUsd);
  const entryLiquidity=finite(position?.entryMarketFeatures?.liquidityUsd);
  const liquidityRatio=liq!=null&&entryLiquidity>0?liq/entryLiquidity:null;
  const p5=finite(row?.priceChangeM5);
  const buys=Math.max(0,finite(row?.buysM5,0));
  const sells=Math.max(0,finite(row?.sellsM5,0));
  const trades=buys+sells;
  const sellShare=trades>0?sells/trades:null;
  const flags=new Set(Array.isArray(row?.score?.riskFlags)?row.score.riskFlags:[]);
  const momentumWeak=p5!=null&&p5<=-25;
  const momentumCrash=p5!=null&&p5<=-50;
  const liquidityWeak=liquidityRatio!=null&&liquidityRatio<=.75;
  const liquidityDamage=liquidityRatio!=null&&liquidityRatio<=.55;
  const severeLiquidityDamage=liquidityRatio!=null&&liquidityRatio<=.30;
  const sellPressureWeak=trades>=8&&sellShare>=.62;
  const sellPressure=trades>=8&&sellShare>=.70;
  const severeMomentum=p5!=null&&p5<=-80;
  const riskOnly=String(row?.score?.stage||'').toUpperCase()==='RISK_ONLY';
  const severeFlag=flags.has('M5_CRASH_EXTREME')||flags.has('DATA_ANOMALY_MCAP_LIQUIDITY')||flags.has('DATA_ANOMALY_FDV_LIQUIDITY');
  const signalCount=[momentumCrash,liquidityDamage,sellPressure].filter(Boolean).length;
  const warningCount=[momentumWeak,liquidityWeak,sellPressureWeak].filter(Boolean).length;
  const armed=ret!=null&&ret<=Math.max(-.20,Math.min(-.03,finite(armReturn,-.08)));
  const exitArmed=ret!=null&&ret<=-.12;
  const derisk=armed&&(warningCount>=2||signalCount>=1||riskOnly||severeFlag);
  const trigger=
    (ret!=null&&ret<=-.03&&severeLiquidityDamage)||
    (ret!=null&&ret<=-.05&&severeMomentum)||
    (exitArmed&&(signalCount>=2||(riskOnly&&signalCount>=1)||(severeFlag&&signalCount>=1)));
  return Object.freeze({
    trigger,
    derisk,
    armed,
    exitArmed,
    returnPct:ret,
    entryLiquidityUsd:entryLiquidity,
    liquidityUsd:liq,
    liquidityRatio,
    priceChangeM5:p5,
    buysM5:buys,
    sellsM5:sells,
    sellShare,
    momentumWeak,
    momentumCrash,
    liquidityWeak,
    liquidityDamage,
    severeLiquidityDamage,
    sellPressureWeak,
    sellPressure,
    severeMomentum,
    riskOnly,
    severeFlag,
    signalCount,
    warningCount
  });
}
function memeRiskSizeMultiplier(row={}){
  const liq=Math.max(0,finite(row?.liquidityUsd,0));
  const score=Math.max(0,finite(row?.score?.researchPriorityScore,0));
  let m=liq<25_000?.35:liq<75_000?.60:liq<250_000?.80:1;
  if(memeEntryTailRisk(row).thin)m*=.75;
  if(score<.65)m*=.75;
  return Math.max(.20,Math.min(1,m));
}

export function applyMemecoinScoutSnapshot(input,snapshot,{
  now=Date.now(),
  marginQuote=100,
  feeBps=30,
  minScore=.58,
  minLiquidityUsd=10_000,
  requireBuySignal=false,
  maxOpenOperational=30,
  horizonMs=12*60*60_000,
  stopReturn=-.25,
  takeReturn=1.50,
  tailRiskArmReturn=-.08,
  riskReduceFraction=.50,
  riskSizingEnabled=false,
  runnerEnabled=false,
  runnerArmReturn=1.00,
  runnerTrailPct=.35,
  runnerProfitLockFraction=.25,
  blockThinLiquidityEntries=true,
  contrarianEnabled=false,
  contrarianProbeRate=.15,
  contrarianMarginMultiplier=.05,
  contrarianMinLiquidityUsd=5_000,
  contrarianMaxOpen=4,
  contrarianMaxSoftViolations=1
}={}){
  const state=mutableState(input);
  const wallet=state.wallets[WALLET_4_MEME_SCOUT];
  const rows=Array.isArray(snapshot?.rows)?snapshot.rows:[];
  const byKey=new Map(rows.map(x=>[String(x?.chainId||'')+':'+String(x?.tokenAddress||''),x]));
  const results={
    opened:0,closed:0,marked:0,eligible:0,
    learningBlocked:0,learningThrottled:0,learningBoosted:0,signalBlocked:0,
    tailRiskBlocked:0,tailRiskClosed:0,riskReduced:0,profitLocked:0,runnerTrailClosed:0,hardStopClosed:0,
    contrarianEligible:0,contrarianOpened:0,contrarianRejectedByHardGuard:0,
    sourceReady:snapshot?.sourceReady===true
  };

  for(let i=wallet.positions.length-1;i>=0;i--){
    const p=wallet.positions[i];
    const row=byKey.get(String(p.chainId||'')+':'+String(p.tokenAddress||''));
    if(row&&finite(row?.priceUsd)>0){
      const baseMarked=markPosition(p,row.priceUsd,now,feeBps);
      const ret=finite(baseMarked.unrealizedReturnPct);
      const liq=finite(row?.liquidityUsd);
      const peakReturn=Math.max(finite(p?.peakUnrealizedReturnPct,ret??-Infinity),ret??-Infinity);
      const troughReturn=Math.min(finite(p?.troughUnrealizedReturnPct,ret??Infinity),ret??Infinity);
      const risk=memeTailRiskDiagnostics(p,row,baseMarked,{armReturn:tailRiskArmReturn});
      let marked={
        ...baseMarked,
        peakUnrealizedReturnPct:Number.isFinite(peakReturn)?peakReturn:null,
        troughUnrealizedReturnPct:Number.isFinite(troughReturn)?troughReturn:null,
        lastMemeTailRisk:clone(risk)
      };
      wallet.positions[i]=marked;results.marked++;
      const hardStop=Math.max(-.95,Math.min(-.05,finite(stopReturn,-.25)));
      const staticTake=finite(takeReturn);
      const runnerArm=Math.max(.25,finite(runnerArmReturn,1));
      const runnerTrail=Math.max(.10,Math.min(.80,finite(runnerTrailPct,.35)));
      const runnerFloor=Number.isFinite(peakReturn)&&peakReturn>=runnerArm
        ?(1+peakReturn)*(1-runnerTrail)-1
        :null;
      let reason=null;
      if(memeSecurityGate(row)==='ABSTAIN'||memeSecurityCritical(row))reason='MEME_SECURITY_ABSTAIN';
      else if(liq!=null&&liq<3_000)reason='MEME_LIQUIDITY_COLLAPSE';
      else if(risk.severeLiquidityDamage&&ret!=null&&ret<=-.03)reason='MEME_LIQUIDITY_COLLAPSE';
      else if(risk.trigger)reason='MEME_TAIL_RISK_EXIT';
      else if(ret!=null&&ret<=hardStop)reason='MEME_STOP';
      else if(runnerEnabled===true&&runnerFloor!=null&&ret!=null&&ret<=runnerFloor)reason='MEME_RUNNER_TRAIL';
      else if(runnerEnabled!==true&&staticTake!=null&&ret!=null&&ret>=staticTake)reason='MEME_TAKE_PROFIT';
      else if(Number(now)-Number(p.openedAt||now)>=Math.max(60_000,Number(horizonMs)||12*60*60_000))reason='MEME_HORIZON';
      if(reason){
        const closed=closePosition(wallet,i,{price:row.priceUsd,at:now,reason,feeBps});
        if(closed){
          results.closed++;
          if(reason==='MEME_TAIL_RISK_EXIT')results.tailRiskClosed++;
          if(reason==='MEME_RUNNER_TRAIL')results.runnerTrailClosed++;
          if(reason==='MEME_STOP')results.hardStopClosed++;
        }
      }else{
        if(risk.derisk&&!marked.riskReductionApplied){
          const f=Math.max(.10,Math.min(.80,finite(riskReduceFraction,.50)));
          const reduced=reducePosition(marked,{price:row.priceUsd,at:now,fraction:f,reason:'MEME_RISK_REDUCE',feeBps});
          marked={...reduced,riskReductionApplied:true,riskReductionAt:Number(now),riskReductionFraction:f};
          wallet.positions[i]=marked;
          results.riskReduced++;
        }
        if(runnerEnabled===true&&ret!=null&&ret>=runnerArm&&!marked.profitLockApplied){
          const f=Math.max(.05,Math.min(.60,finite(runnerProfitLockFraction,.25)));
          const reduced=reducePosition(marked,{price:row.priceUsd,at:now,fraction:f,reason:'MEME_PROFIT_LOCK',feeBps});
          marked={...reduced,profitLockApplied:true,profitLockAt:Number(now),profitLockFraction:f};
          wallet.positions[i]=marked;
          results.profitLocked++;
        }
      }
    }
  }

  const openContrarian=()=>wallet.positions.filter(x=>x?.entryResearchLane==='CONTRARIAN_PROBE').length;
  const stableProbeScore=row=>{
    const hex=sha256({lane:'W4_CONTRARIAN_PROBE_V1',key:memePositionKey(row)}).slice(0,8);
    return parseInt(hex,16)/0xffffffff;
  };

  for(const row of rows){
    const score=finite(row?.score?.researchPriorityScore,0);
    const stage=String(row?.score?.stage||'');
    const liq=finite(row?.liquidityUsd,0);
    const px=finite(row?.priceUsd);
    const flags=row?.score?.riskFlags||[];
    const securityGate=memeSecurityGate(row);
    const learningAction=String(row?.memeLearning?.action||'NEUTRAL').toUpperCase();
    const entryTailRisk=memeEntryTailRisk(row);
    const entrySignalAction=String(row?.memeSignal?.action||'').toUpperCase();
    if(requireBuySignal===true&&entrySignalAction!=='BUY'){
      results.signalBlocked++;
      continue;
    }

    const hardSafe=
      px>0&&
      liq>=Math.max(3_000,Number(contrarianMinLiquidityUsd)||5_000)&&
      !severeMemeRisk(flags)&&
      securityGate==='PASS'&&
      !memeSecurityCritical(row);

    const stageOk=['NEW_NOW','EARLY'].includes(stage);
    const scoreOk=score>=minScore;
    const liquidityOk=liq>=minLiquidityUsd;
    const tailRiskOk=!(blockThinLiquidityEntries&&entryTailRisk.blocked);
    const learningOk=learningAction!=='BLOCK';
    const baseEligible=stageOk&&scoreOk&&liquidityOk&&px>0&&!severeMemeRisk(flags)&&securityGate==='PASS'&&!memeSecurityCritical(row);

    const softViolations=[];
    if(!stageOk)softViolations.push('STAGE_OUTSIDE_NORMAL_SCOUT');
    if(!scoreOk)softViolations.push('SCORE_BELOW_NORMAL_MIN');
    if(!liquidityOk)softViolations.push('LIQUIDITY_BELOW_NORMAL_MIN');
    if(!tailRiskOk)softViolations.push('TAIL_RISK_FILTER_WOULD_BLOCK');
    if(!learningOk)softViolations.push('LEARNED_BLOCK_WOULD_ABSTAIN');

    const contrarianEligible=
      contrarianEnabled===true&&
      hardSafe&&
      softViolations.length>0&&
      softViolations.length<=Math.max(1,Number(contrarianMaxSoftViolations)||1);
    if(contrarianEligible)results.contrarianEligible++;
    else if(softViolations.length>0&&!hardSafe)results.contrarianRejectedByHardGuard++;

    const probeScore=contrarianEligible?stableProbeScore(row):1;
    // Exploration must actually happen: when the lane is empty, bootstrap one
    // hard-safe single-rule probe instead of waiting indefinitely for the
    // probabilistic sampler. Further probes still respect the configured rate.
    const bootstrapContrarian=
      contrarianEligible&&
      openContrarian()===0&&
      results.contrarianOpened===0;
    const contrarianSelected=
      contrarianEligible&&
      (bootstrapContrarian||probeScore<Math.max(0,Math.min(1,Number(contrarianProbeRate)||0)))&&
      openContrarian()<Math.max(0,Number(contrarianMaxOpen)||0);

    if(!baseEligible&&!contrarianSelected)continue;
    if(baseEligible)results.eligible++;

    if(!tailRiskOk&&!contrarianSelected){
      results.tailRiskBlocked++;
      continue;
    }
    if(!learningOk&&!contrarianSelected){
      results.learningBlocked++;
      continue;
    }

    if(learningAction==='BOOST'&&!contrarianSelected)results.learningBoosted++;
    const normalLearningSizeMultiplier=learningAction==='THROTTLE'
      ?Math.max(.05,Math.min(.35,finite(row?.memeLearning?.sizeMultiplier,.15)))
      :1;
    if(learningAction==='THROTTLE'&&!contrarianSelected)results.learningThrottled++;

    if(wallet.positions.length>=maxOpenOperational)break;
    const key=memePositionKey(row);
    if(wallet.positions.some(x=>x.positionKey===key)||wallet.closed.some(x=>x.positionKey===key))continue;

    const riskSizeMultiplier=contrarianSelected?1:(riskSizingEnabled===true?memeRiskSizeMultiplier(row):1);
    const sizeMultiplier=contrarianSelected
      ?Math.max(.01,Math.min(.20,Number(contrarianMarginMultiplier)||.05))
      :Math.max(.05,Math.min(1,normalLearningSizeMultiplier*riskSizeMultiplier));
    const margin=Math.max(1,(Number(marginQuote)||100)*sizeMultiplier);
    const researchLane=contrarianSelected?'CONTRARIAN_PROBE':'STANDARD';
    const position={
      walletId:WALLET_4_MEME_SCOUT,positionKey:key,
      chainId:String(row?.chainId||''),tokenAddress:String(row?.tokenAddress||''),
      symbol:text(row?.symbol||row?.name||'MEME',80),name:text(row?.name||'',120),
      side:'LONG',leverage:1,marginQuote:margin,exposureQuote:margin,
      initialMarginQuote:margin,initialExposureQuote:margin,
      entryPrice:px,lastPrice:px,openedAt:Number(now),lastMarkedAt:Number(now),
      sourcePairCreatedAt:finite(row?.pairCreatedAt),sourceFirstSeenAt:finite(row?.firstSeenAt),
      entryResearchPriorityScore:score,entryStage:stage,
      entryAttentionSignals:clone(row?.score?.attentionSignals||[]),
      entryRiskFlags:clone(flags),
      entryTailRisk:clone(entryTailRisk),
      entryResearchLane:researchLane,
      entryContrarianViolations:contrarianSelected?clone(softViolations):[],
      entryContrarianProbeScore:contrarianSelected?probeScore:null,
      entryContrarianBootstrap:contrarianSelected&&bootstrapContrarian,
      peakUnrealizedReturnPct:0,
      troughUnrealizedReturnPct:0,
      entryMarketFeatures:{
        chainId:String(row?.chainId||''),stage,
        ageMinutes:finite(row?.score?.ageMinutes),
        researchPriorityScore:score,
        liquidityUsd:finite(row?.liquidityUsd),
        marketCap:finite(row?.marketCap),
        fdv:finite(row?.fdv),
        volumeM5:finite(row?.volumeM5),
        volumeH1:finite(row?.volumeH1),
        buysM5:finite(row?.buysM5),
        sellsM5:finite(row?.sellsM5),
        priceChangeM5:finite(row?.priceChangeM5),
        priceChangeH1:finite(row?.priceChangeH1),
        pairCreatedAt:finite(row?.pairCreatedAt),
        socialPosts:finite(row?.directSocialAttention?.posts),
        socialAuthors:finite(row?.directSocialAttention?.uniqueAuthors),
        socialEngagement:finite(row?.directSocialAttention?.engagement),
        socialAttentionBand:text(row?.directSocialAttention?.attentionBand||'',40),
        holderTop10Share:finite(row?.security?.holderState?.top10Share),
        largestHolderShare:finite(row?.security?.holderState?.largestHolderShare),
        holderFallbackUsed:row?.security?.coverage?.holderConcentrationIndependent===true||Boolean(row?.security?.independentHolderEvidence)
      },
      entryMemeLearning:clone(row?.memeLearning||null),
      entryMemeSignal:clone(row?.memeSignal||null),
      entrySignalAction:entrySignalAction||null,
      entryLearningSizeMultiplier:sizeMultiplier,
      entryRiskSizeMultiplier:riskSizeMultiplier,
      entrySizingPolicy:riskSizingEnabled===true?'LIQUIDITY_SCORE_RISK_SIZED':'LEGACY_FLAT_SHADOW_SIZE',
      entrySecurityGate:securityGate,
      entrySecuritySource:text(row?.security?.source||'',160),
      entryHolderFallbackUsed:row?.security?.coverage?.holderConcentrationIndependent===true||Boolean(row?.security?.independentHolderEvidence),
      entryHolderEvidenceSource:text(row?.security?.independentHolderEvidence?.source||row?.security?.holderState?.independentSource||'',160)||null,
      entrySecurityCriticalRiskFlags:clone(row?.security?.criticalRiskFlags||[]),
      entrySecurityWarningFlags:clone(row?.security?.warningFlags||[]),
      entrySecurityCoverage:clone(row?.security?.coverage||{}),
      source:'BIGGJ_MEMECOIN_EARLY_RADAR',
      status:'OPEN',execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false,
      epistemic:contrarianSelected
        ?'CONTRARIAN_SOFT_RULE_PROBE_NOT_PROFIT_CLAIM'
        :'EARLY_RESEARCH_SCORE_NOT_PROFIT_PROBABILITY'
    };
    if(openPosition(wallet,position)){
      results.opened++;
      if(contrarianSelected)results.contrarianOpened++;
    }
  }
  state.updatedAt=Number(now);
  return {state:freeze(state),results:freeze(results)};
}

function user99k60sPositionKey(row){
  return WALLET_6_USER_99K_60S+':'+String(row?.chainId||'')+':'+String(row?.tokenAddress||'');
}
function user99k60sAgeSeconds(row,now){
  const created=finite(row?.pairCreatedAt);
  if(created==null)return null;
  return Math.max(0,(Number(now)-created)/1000);
}

export function evaluateUser99k60sEntry(row,{
  now=Date.now(),
  maxAgeSeconds=60,
  minMarketCapUsd=99_000
}={}){
  const ageSeconds=user99k60sAgeSeconds(row,now);
  const marketCapUsd=finite(row?.marketCap);
  const priceUsd=finite(row?.priceUsd);
  const blockers=[];
  if(ageSeconds==null)blockers.push('PAIR_AGE_UNKNOWN');
  else if(ageSeconds>Math.max(1,Number(maxAgeSeconds)||60))blockers.push('OLDER_THAN_MAX_AGE');
  if(marketCapUsd==null)blockers.push('MARKET_CAP_UNKNOWN');
  else if(marketCapUsd<Math.max(1,Number(minMarketCapUsd)||99_000))blockers.push('MARKET_CAP_BELOW_THRESHOLD');
  if(!(priceUsd>0))blockers.push('PRICE_UNKNOWN');
  const match=blockers.length===0;
  return freeze({
    version:USER_99K_60S_STRATEGY_VERSION,
    match,
    action:match?'BUY_SHADOW':'IGNORE',
    rule:'AGE_LTE_60S_AND_MARKET_CAP_GTE_99K_THEN_IMMEDIATE_ENTRY',
    ageSeconds:ageSeconds==null?null:Number(ageSeconds.toFixed(3)),
    marketCapUsd,
    thresholdUsd:Math.max(1,Number(minMarketCapUsd)||99_000),
    maxAgeSeconds:Math.max(1,Number(maxAgeSeconds)||60),
    observedTimeTo99kSeconds:match&&ageSeconds!=null?Number(ageSeconds.toFixed(3)):null,
    blockers,
    epistemic:'OBSERVED_SNAPSHOT_THRESHOLD_TIME_NOT_EXACT_HISTORICAL_CROSSING_TIME',
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false
  });
}

function user99k60sSolScenarios(values=[5,10,20,40,80]){
  return [...new Set((Array.isArray(values)?values:[])
    .map(x=>finite(x))
    .filter(x=>x>0&&x<=10_000))]
    .sort((a,b)=>a-b);
}
function user99k60sTargetScenarios(targetPnlSol,values,feeBps){
  const target=Math.max(.0001,finite(targetPnlSol,10));
  const roundTripFeeRate=Math.max(0,finite(feeBps,30))/10000*2;
  return user99k60sSolScenarios(values).map(notionalSol=>({
    entryNotionalSol:notionalSol,
    targetPnlSol:target,
    targetNetReturn:target/notionalSol,
    targetPriceReturnApprox:target/notionalSol+roundTripFeeRate,
    targetHit:false,
    targetHitAt:null,
    targetHitObservedReturn:null,
    estimatedNetPnlSol:null,
    feeModel:'ROUND_TRIP_FEE_BPS_NO_SLIPPAGE'
  }));
}
function updateUser99k60sTargetScenarios(existing,returnPct,now,feeBps){
  const ret=finite(returnPct);
  const roundTripFeeRate=Math.max(0,finite(feeBps,30))/10000*2;
  return (Array.isArray(existing)?existing:[]).map(s=>{
    const notionalSol=Math.max(0,finite(s?.entryNotionalSol,0));
    const estimatedNetPnlSol=ret==null||!(notionalSol>0)?null:notionalSol*(ret-roundTripFeeRate);
    const hit=s?.targetHit===true||(estimatedNetPnlSol!=null&&estimatedNetPnlSol>=Math.max(.0001,finite(s?.targetPnlSol,10)));
    return {
      ...s,
      estimatedNetPnlSol,
      targetHit:hit,
      targetHitAt:s?.targetHitAt??(hit?Number(now):null),
      targetHitObservedReturn:s?.targetHitObservedReturn??(hit?ret:null)
    };
  });
}

function user99k60sHoldLabScenarios(values=[5,10,20,40,80]){
  const policies=[
    {id:'HOLD_5M',reviewAtSeconds:300,maxHoldSeconds:300},
    {id:'HOLD_10M',reviewAtSeconds:600,maxHoldSeconds:600},
    {id:'RUNNER',reviewAtSeconds:600,maxHoldSeconds:1800}
  ];
  const out=[];
  for(const notionalSol of user99k60sSolScenarios(values)){
    for(const policy of policies){
      out.push({
        id:policy.id+'_'+notionalSol+'SOL',
        policyId:policy.id,
        entryNotionalSol:notionalSol,
        reviewAtSeconds:policy.reviewAtSeconds,
        maxHoldSeconds:policy.maxHoldSeconds,
        status:'OPEN',
        closeAt:null,
        closeReturnPct:null,
        estimatedNetPnlSol:null,
        capitalEfficiency:null,
        goodRunnerAtLastReview:null,
        semantics:'PARALLEL_SHADOW_SCENARIO_NO_LIVE_EXECUTION'
      });
    }
  }
  return out;
}
function updateUser99k60sHoldLab(existing,{
  returnPct,
  holdSeconds,
  marketCapUsd,
  entryMarketCapUsd,
  peakMarketCapUsd,
  now,
  feeBps=30,
  minHoldSeconds=180
}={}){
  const ret=finite(returnPct);
  const cap=finite(marketCapUsd);
  const entryCap=finite(entryMarketCapUsd);
  const peakCap=finite(peakMarketCapUsd);
  const roundTripFeeRate=Math.max(0,finite(feeBps,30))/10000*2;
  const hold=Math.max(0,finite(holdSeconds,0));
  return (Array.isArray(existing)?existing:[]).map(s=>{
    if(s?.status==='CLOSED')return s;
    const notionalSol=Math.max(0,finite(s?.entryNotionalSol,0));
    const netRet=ret==null?null:ret-roundTripFeeRate;
    const estimatedNetPnlSol=netRet==null||!(notionalSol>0)?null:notionalSol*netRet;
    const capitalEfficiency=netRet;
    if(hold<Math.max(0,finite(minHoldSeconds,180))){
      return {...s,estimatedNetPnlSol,capitalEfficiency,protectedByMinHold:true};
    }

    const drawdownFromPeak=cap!=null&&peakCap>0?cap/peakCap-1:null;
    const aboveEntry=cap!=null&&entryCap>0?cap>=entryCap:false;
    const runnerGood=(ret!=null&&ret>0)||(aboveEntry&&drawdownFromPeak!=null&&drawdownFromPeak>-0.20);
    let shouldClose=false;
    if(s.policyId==='HOLD_5M')shouldClose=hold>=300;
    else if(s.policyId==='HOLD_10M')shouldClose=hold>=600;
    else if(s.policyId==='RUNNER'){
      if(hold>=1800)shouldClose=true;
      else if(hold>=600&&!runnerGood)shouldClose=true;
    }
    if(!shouldClose)return {...s,estimatedNetPnlSol,capitalEfficiency,protectedByMinHold:false,goodRunnerAtLastReview:s.policyId==='RUNNER'?runnerGood:s.goodRunnerAtLastReview};
    return {
      ...s,
      status:'CLOSED',
      closeAt:Number(now),
      closeHoldSeconds:hold,
      closeReturnPct:ret,
      estimatedNetPnlSol,
      capitalEfficiency,
      goodRunnerAtLastReview:s.policyId==='RUNNER'?runnerGood:s.goodRunnerAtLastReview,
      closeReason:s.policyId==='RUNNER'?(hold>=1800?'RUNNER_MAX_30M':'RUNNER_NO_LONGER_GOOD'):'TIME_WINDOW_REVIEW',
      protectedByMinHold:false
    };
  });
}
function user99k60sHoldLabSummary(scenarios=[]){
  const rows=Array.isArray(scenarios)?scenarios:[];
  const closed=rows.filter(x=>x?.status==='CLOSED');
  const best=closed.slice().sort((a,b)=>{
    const ae=finite(a?.capitalEfficiency,-Infinity),be=finite(b?.capitalEfficiency,-Infinity);
    if(be!==ae)return be-ae;
    return finite(a?.entryNotionalSol,Infinity)-finite(b?.entryNotionalSol,Infinity);
  })[0]||null;
  const eff=finite(best?.capitalEfficiency);
  return {
    scenarios:rows.length,
    open:rows.length-closed.length,
    closed:closed.length,
    best:best?{
      id:best.id,
      policyId:best.policyId,
      entryNotionalSol:best.entryNotionalSol,
      estimatedNetPnlSol:best.estimatedNetPnlSol,
      capitalEfficiency:best.capitalEfficiency,
      closeHoldSeconds:best.closeHoldSeconds,
      closeReason:best.closeReason,
      estimatedSolNeededFor10SolReference:eff>0?10/eff:null
    }:null,
    semantics:'BEST_PRICE_PERFORMANCE_IS_HIGHEST_FEE_ADJUSTED_RETURN_PER_SOL_THEN_LOWEST_CAPITAL'
  };
}

export function applyUser99k60sStrategySnapshot(input,snapshot,{
  now=Date.now(),
  marginQuote=100,
  feeBps=30,
  maxAgeSeconds=60,
  minMarketCapUsd=99_000,
  minExitMarketCapUsd=null,
  targetPnlSol=10,
  entryNotionalSol=null,
  notionalScenariosSol=[5,10,20,40,80],
  minHoldSeconds=180,
  maxOpenOperational=30
}={}){
  const state=mutableState(input);
  const wallet=state.wallets[WALLET_6_USER_99K_60S];
  const rows=Array.isArray(snapshot?.rows)?snapshot.rows:[];
  const byKey=new Map(rows.map(x=>[String(x?.chainId||'')+':'+String(x?.tokenAddress||''),x]));
  const results={
    matched:0,opened:0,closed:0,marked:0,
    marketCapExit:0,scenarioTargetHits:0,holdScenarioCloses:0,holdScenarioCloses:0,
    sourceReady:snapshot?.sourceReady===true,
    strategyVersion:USER_99K_60S_STRATEGY_VERSION
  };

  for(let i=wallet.positions.length-1;i>=0;i--){
    const p=wallet.positions[i];
    const row=byKey.get(String(p.chainId||'')+':'+String(p.tokenAddress||''));
    if(!row||!(finite(row?.priceUsd)>0))continue;
    const baseMarked=markPosition(p,row.priceUsd,now,feeBps);
    const marketCapUsd=finite(row?.marketCap);
    const peakMarketCapUsd=Math.max(
      finite(p?.peakMarketCapUsd,marketCapUsd??-Infinity),
      marketCapUsd??-Infinity
    );
    const troughMarketCapUsd=Math.min(
      finite(p?.troughMarketCapUsd,marketCapUsd??Infinity),
      marketCapUsd??Infinity
    );
    const configuredNotionalSol=finite(p?.entryNotionalSol,finite(entryNotionalSol));
    const ret=finite(baseMarked?.unrealizedReturnPct);
    const roundTripFeeRate=Math.max(0,finite(feeBps,30))/10000*2;
    const pnlSolEstimate=configuredNotionalSol>0&&ret!=null
      ?configuredNotionalSol*(ret-roundTripFeeRate)
      :null;
    const beforeHits=(p?.profitTargetScenarios||[]).filter(x=>x?.targetHit===true).length;
    const profitTargetScenarios=updateUser99k60sTargetScenarios(
      p?.profitTargetScenarios||user99k60sTargetScenarios(targetPnlSol,notionalScenariosSol,feeBps),
      ret,now,feeBps
    );
    const afterHits=profitTargetScenarios.filter(x=>x?.targetHit===true).length;
    results.scenarioTargetHits+=Math.max(0,afterHits-beforeHits);
    const holdSeconds=Math.max(0,(Number(now)-Number(p?.openedAt||now))/1000);
    const priorHoldLab=p?.holdLab||user99k60sHoldLabScenarios(notionalScenariosSol);
    const priorHoldClosed=priorHoldLab.filter(x=>x?.status==='CLOSED').length;
    const beforeHoldClosed=(p?.holdLab||[]).filter(x=>x?.status==='CLOSED').length;
    const holdLab=updateUser99k60sHoldLab(
      priorHoldLab,
      {
        returnPct:ret,
        holdSeconds,
        marketCapUsd,
        entryMarketCapUsd:p?.entryMarketCapUsd,
        peakMarketCapUsd:Number.isFinite(peakMarketCapUsd)?peakMarketCapUsd:null,
        now,
        feeBps,
        minHoldSeconds
      }
    );
    results.holdScenarioCloses+=Math.max(0,holdLab.filter(x=>x?.status==='CLOSED').length-priorHoldClosed);
    const afterHoldClosed=holdLab.filter(x=>x?.status==='CLOSED').length;
    results.holdScenarioCloses+=Math.max(0,afterHoldClosed-beforeHoldClosed);
    const marked={
      ...baseMarked,
      lastMarketCapUsd:marketCapUsd,
      peakMarketCapUsd:Number.isFinite(peakMarketCapUsd)?peakMarketCapUsd:null,
      troughMarketCapUsd:Number.isFinite(troughMarketCapUsd)?troughMarketCapUsd:null,
      estimatedNetPnlSolBeforeSlippage:pnlSolEstimate,
      profitTargetScenarios,
      holdSeconds,
      minHoldSeconds:Math.max(0,finite(minHoldSeconds,180)),
      lossExitProtectedUntil:Number(p?.openedAt||now)+Math.max(0,finite(minHoldSeconds,180))*1000,
      holdLab,
      holdLabSummary:user99k60sHoldLabSummary(holdLab)
    };
    wallet.positions[i]=marked;
    results.marked++;

    let reason=null;
    const marketCapFloor=finite(p?.minExitMarketCapUsd,finite(minExitMarketCapUsd));
    const protectedHold=holdSeconds<Math.max(0,finite(p?.minHoldSeconds,finite(minHoldSeconds,180)));
    if(!protectedHold&&marketCapFloor>0&&marketCapUsd!=null&&marketCapUsd<marketCapFloor){
      reason='USER_99K_60S_MCAP_TOO_SMALL';
    }
    if(reason){
      const closed=closePosition(wallet,i,{price:row.priceUsd,at:now,reason,feeBps});
      if(closed){
        results.closed++;
        if(reason==='USER_99K_60S_MCAP_TOO_SMALL')results.marketCapExit++;
      }
    }
  }

  if(snapshot?.sourceReady===true){
    for(const row of rows){
      if(wallet.positions.length>=Math.max(1,Number(maxOpenOperational)||30))break;
      const signal=evaluateUser99k60sEntry(row,{now,maxAgeSeconds,minMarketCapUsd});
      if(!signal.match)continue;
      results.matched++;
      const key=user99k60sPositionKey(row);
      if(wallet.positions.some(x=>x.positionKey===key)||wallet.closed.some(x=>x.positionKey===key))continue;
      const px=finite(row?.priceUsd);
      if(!(px>0))continue;
      const marketCapUsd=finite(row?.marketCap);
      const margin=Math.max(1,Number(marginQuote)||100);
      const rowNotionalSol=finite(row?.userStrategy?.entryNotionalSol);
      const configuredNotionalSol=rowNotionalSol>0?rowNotionalSol:finite(entryNotionalSol);
      const position={
        walletId:WALLET_6_USER_99K_60S,
        positionKey:key,
        chainId:String(row?.chainId||''),
        tokenAddress:String(row?.tokenAddress||''),
        symbol:text(row?.symbol||row?.name||'MEME',80),
        name:text(row?.name||'',120),
        side:'LONG',leverage:1,
        marginQuote:margin,exposureQuote:margin,
        initialMarginQuote:margin,initialExposureQuote:margin,
        entryPrice:px,lastPrice:px,
        openedAt:Number(now),lastMarkedAt:Number(now),
        sourcePairCreatedAt:finite(row?.pairCreatedAt),
        sourceFirstSeenAt:finite(row?.firstSeenAt),
        entryAgeSeconds:signal.ageSeconds,
        observedTimeTo99kSeconds:signal.observedTimeTo99kSeconds,
        entryMarketCapUsd:marketCapUsd,
        lastMarketCapUsd:marketCapUsd,
        peakMarketCapUsd:marketCapUsd,
        troughMarketCapUsd:marketCapUsd,
        entryNotionalSol:configuredNotionalSol>0?configuredNotionalSol:null,
        targetPnlSol:finite(targetPnlSol)>0?finite(targetPnlSol):10,
        profitTargetScenarios:user99k60sTargetScenarios(targetPnlSol,notionalScenariosSol,feeBps),
        holdLab:user99k60sHoldLabScenarios(notionalScenariosSol),
        holdLabSummary:user99k60sHoldLabSummary(user99k60sHoldLabScenarios(notionalScenariosSol)),
        minHoldSeconds:Math.max(0,finite(minHoldSeconds,180)),
        lossExitProtectedUntil:Number(now)+Math.max(0,finite(minHoldSeconds,180))*1000,
        minExitMarketCapUsd:finite(minExitMarketCapUsd)>0?finite(minExitMarketCapUsd):null,
        marketCapExitTracking:finite(minExitMarketCapUsd)>0?'ACTIVE_EXACT_FLOOR':'WAITING_FOR_OBSERVED_USER_EXIT_RULE',
        entryStrategySignal:clone(signal),
        strategyVersion:USER_99K_60S_STRATEGY_VERSION,
        entryRule:'AGE_LTE_60S_AND_MARKET_CAP_GTE_99K_IMMEDIATE',
        exitRule:'DISCRETIONARY_PROFIT_TAKE_OR_OBSERVED_USER_MARKET_CAP_EXIT_RULE_WITH_3M_LOSS_PROTECTION',
        targetTracking:'OBSERVATIONAL_ONLY_NO_AUTO_PROFIT_EXIT',
        source:'BIGGJ_MEMECOIN_EARLY_RADAR',
        status:'OPEN',
        execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false,
        epistemic:'USER_DISCOVERED_ENTRY_RULE_FROZEN_V1_EXIT_DISCRETIONARY_NO_AUTO_PROFIT_TARGET'
      };
      if(openPosition(wallet,position))results.opened++;
    }
  }

  state.updatedAt=Number(now);
  return {state:freeze(state),results:freeze(results)};
}


function medianFinite(values=[]){
  const xs=(Array.isArray(values)?values:[]).map(x=>finite(x)).filter(x=>x!=null).sort((a,b)=>a-b);
  if(!xs.length)return null;
  const m=Math.floor(xs.length/2);
  return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;
}
export function recordUser99k60sExitObservation(input,{
  positionKey,
  reason,
  now=Date.now(),
  priceUsd=null,
  marketCapUsd=null,
  feeBps=30
}={}){
  const state=mutableState(input);
  const wallet=state.wallets[WALLET_6_USER_99K_60S];
  const allowed=new Set(['USER_PROFIT_ENOUGH','USER_MCAP_TOO_SMALL']);
  const why=String(reason||'').toUpperCase();
  if(!allowed.has(why))return {state:freeze(state),recorded:false,error:'INVALID_EXIT_REASON',closed:null};
  const idx=wallet.positions.findIndex(x=>String(x?.positionKey||'')===String(positionKey||''));
  if(idx<0)return {state:freeze(state),recorded:false,error:'POSITION_NOT_FOUND',closed:null};
  const p=wallet.positions[idx];
  const mark=finite(priceUsd,finite(p?.lastPrice));
  if(!(mark>0))return {state:freeze(state),recorded:false,error:'PRICE_UNAVAILABLE',closed:null};
  const cap=finite(marketCapUsd,finite(p?.lastMarketCapUsd));
  const marked=markPosition(p,mark,now,feeBps);
  const peakMarketCapUsd=Math.max(finite(p?.peakMarketCapUsd,cap??-Infinity),cap??-Infinity);
  const troughMarketCapUsd=Math.min(finite(p?.troughMarketCapUsd,cap??Infinity),cap??Infinity);
  const holdSeconds=Math.max(0,(Number(now)-Number(p?.openedAt||now))/1000);
  const marketCapDrawdownFromPeakPct=cap!=null&&peakMarketCapUsd>0?cap/peakMarketCapUsd-1:null;
  const ret=finite(marked?.unrealizedReturnPct);
  const notionalSol=finite(p?.entryNotionalSol);
  const roundTripFeeRate=Math.max(0,finite(feeBps,30))/10000*2;
  const estimatedNetPnlSolBeforeSlippage=notionalSol>0&&ret!=null?notionalSol*(ret-roundTripFeeRate):null;
  wallet.positions[idx]={
    ...marked,
    lastMarketCapUsd:cap,
    peakMarketCapUsd:Number.isFinite(peakMarketCapUsd)?peakMarketCapUsd:null,
    troughMarketCapUsd:Number.isFinite(troughMarketCapUsd)?troughMarketCapUsd:null,
    userExitObservation:{
      version:'BIGGJ_USER_99K_60S_EXIT_OBSERVATION_V1',
      reason:why,
      at:Number(now),
      priceUsd:mark,
      marketCapUsd:cap,
      holdSeconds,
      returnPct:ret,
      entryNotionalSol:notionalSol>0?notionalSol:null,
      estimatedNetPnlSolBeforeSlippage,
      peakMarketCapUsd:Number.isFinite(peakMarketCapUsd)?peakMarketCapUsd:null,
      marketCapDrawdownFromPeakPct,
      semantics:'USER_MARKED_DISCRETIONARY_EXIT_OBSERVATION_NOT_AUTOMATIC_POLICY'
    }
  };
  const closeReason=why==='USER_PROFIT_ENOUGH'?'USER_99K_60S_PROFIT_ENOUGH':'USER_99K_60S_MCAP_TOO_SMALL';
  const closed=closePosition(wallet,idx,{price:mark,at:now,reason:closeReason,feeBps});
  state.updatedAt=Number(now);
  return {state:freeze(state),recorded:Boolean(closed),error:closed?null:'CLOSE_FAILED',closed:closed?freeze(clone(closed)):null};
}

export function user99k60sExitLearningSummary(input,{asOf=Date.now()}={}){
  const state=mutableState(input);
  const wallet=state.wallets[WALLET_6_USER_99K_60S];
  const rows=(wallet.closed||[]).filter(x=>x?.userExitObservation?.version==='BIGGJ_USER_99K_60S_EXIT_OBSERVATION_V1');
  const summarize=(reason)=>{
    const xs=rows.filter(x=>x?.userExitObservation?.reason===reason);
    return {
      samples:xs.length,
      medianHoldSeconds:medianFinite(xs.map(x=>x?.userExitObservation?.holdSeconds)),
      medianReturnPct:medianFinite(xs.map(x=>x?.userExitObservation?.returnPct)),
      medianEstimatedNetPnlSol:medianFinite(xs.map(x=>x?.userExitObservation?.estimatedNetPnlSolBeforeSlippage)),
      medianExitMarketCapUsd:medianFinite(xs.map(x=>x?.userExitObservation?.marketCapUsd)),
      medianMarketCapDrawdownFromPeakPct:medianFinite(xs.map(x=>x?.userExitObservation?.marketCapDrawdownFromPeakPct))
    };
  };
  return freeze({
    version:'BIGGJ_USER_99K_60S_EXIT_LEARNER_V1',
    asOf:Number(asOf),
    samples:rows.length,
    profitEnough:summarize('USER_PROFIT_ENOUGH'),
    marketCapTooSmall:summarize('USER_MCAP_TOO_SMALL'),
    minimumSamplesBeforeRuleProposal:20,
    ruleProposalReady:rows.length>=20,
    automaticPolicyMutation:false,
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false,
    semantics:'DESCRIBE_USER_EXIT_BEHAVIOR_ONLY_DO_NOT_OPTIMIZE_OR_AUTOMATE_YET'
  });
}

function walletStats(wallet){
  const open=wallet.positions||[],closed=wallet.closed||[];
  const closedRealized=closed.reduce((s,p)=>s+finite(p?.realizedNetPnlQuote,0),0);
  const openPartialRealized=open.reduce((s,p)=>s+finite(p?.partialRealizedNetPnlQuote,0),0);
  const realized=closedRealized+openPartialRealized;
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
    cumulativeMarginUsedQuote:[...open,...closed].reduce((s,p)=>s+Math.max(0,finite(p?.initialMarginQuote,p?.marginQuote)||0),0),
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
  for(const id of [WALLET_3_TRADER_COPY,WALLET_4_MEME_SCOUT,WALLET_5_MEME_COPY,WALLET_6_USER_99K_60S])wallets[id]=walletStats(s.wallets[id]);
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
