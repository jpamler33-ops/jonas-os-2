import { sha256 } from './institutional-kernel.mjs';
import { shadowPortfolioSummary, shadowPortfolioPeriodStats } from './shadow-portfolio-ledger.mjs';

export const SHADOW_CAPITAL_ACADEMY_VERSION='TCX_SHADOW_CAPITAL_ACADEMY_V1';

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function freeze(v){
  if(v&&typeof v==='object'&&!Object.isFrozen(v)){
    Object.freeze(v);
    for(const x of Object.values(v)) freeze(x);
  }
  return v;
}

function localDayKey(epoch,timeZone){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date(epoch));
  const get=t=>parts.find(x=>x.type===t)?.value||'00';
  return get('year')+'-'+get('month')+'-'+get('day');
}
function localWeekKey(epoch,timeZone){
  const d=new Date(epoch);
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'
  }).formatToParts(d);
  const get=t=>parts.find(x=>x.type===t)?.value||'';
  const weekday={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[get('weekday')]??0;
  const y=Number(get('year')),m=Number(get('month')),day=Number(get('day'));
  const utc=new Date(Date.UTC(y,m-1,day-((weekday+6)%7)));
  return utc.getUTCFullYear()+'-W'+String(utc.getUTCMonth()+1).padStart(2,'0')+'-'+String(utc.getUTCDate()).padStart(2,'0');
}
function groupPnl(rows,keyFn){
  const map=new Map();
  for(const p of rows){
    const k=keyFn(Number(p.closedAt));
    map.set(k,(map.get(k)||0)+Number(p.realizedNetPnlQuote||0));
  }
  return [...map.entries()].map(([key,pnl])=>({key,pnl}));
}
function consecutiveLosses(closed){
  let n=0;
  for(let i=closed.length-1;i>=0;i--){
    const pnl=Number(closed[i].realizedNetPnlQuote||0);
    if(pnl<0) n++;
    else break;
  }
  return n;
}
function criterion(id,label,value,target,mode='GTE'){
  const n=finite(value,0),t=finite(target,0);
  const pass=mode==='LTE'?n<=t:n>=t;
  const progress=mode==='LTE'
    ? (n<=t?1:clamp(t/Math.max(n,1e-12),0,1))
    : (t<=0?1:clamp(n/t,0,1));
  return freeze({id,label,value:n,target:t,mode,pass,progress});
}
function allPass(criteria){ return criteria.every(x=>x.pass); }

const STAGES=Object.freeze([
  Object.freeze({
    id:'BOOTCAMP',label:'Bootcamp',level:0,
    risk:{notionalMultiplier:.50,memeMultiplier:.40,maxOpenTotal:4,maxOpenPerSymbol:1,maxOpenMemecoin:1,maxSinglePositionPct:.005,maxExposurePct:.03,dailyLossLimitPct:.010,lossStreakPause:4}
  }),
  Object.freeze({
    id:'DISCIPLINE',label:'Disziplin',level:1,
    risk:{notionalMultiplier:.75,memeMultiplier:.45,maxOpenTotal:6,maxOpenPerSymbol:1,maxOpenMemecoin:1,maxSinglePositionPct:.0075,maxExposurePct:.05,dailyLossLimitPct:.0125,lossStreakPause:4}
  }),
  Object.freeze({
    id:'CONSISTENCY',label:'Konsistenz',level:2,
    risk:{notionalMultiplier:1.00,memeMultiplier:.50,maxOpenTotal:8,maxOpenPerSymbol:2,maxOpenMemecoin:2,maxSinglePositionPct:.010,maxExposurePct:.07,dailyLossLimitPct:.015,lossStreakPause:5}
  }),
  Object.freeze({
    id:'MULTI_MARKET',label:'Multi-Market',level:3,
    risk:{notionalMultiplier:1.10,memeMultiplier:.55,maxOpenTotal:12,maxOpenPerSymbol:2,maxOpenMemecoin:3,maxSinglePositionPct:.0125,maxExposurePct:.09,dailyLossLimitPct:.0175,lossStreakPause:5}
  }),
  Object.freeze({
    id:'STRESS_TEST',label:'Stress-Test',level:4,
    risk:{notionalMultiplier:1.25,memeMultiplier:.60,maxOpenTotal:16,maxOpenPerSymbol:3,maxOpenMemecoin:4,maxSinglePositionPct:.015,maxExposurePct:.12,dailyLossLimitPct:.020,lossStreakPause:6}
  }),
  Object.freeze({
    id:'CAPITAL_READY_SIM',label:'Capital-Ready Simulation',level:5,
    risk:{notionalMultiplier:1.50,memeMultiplier:.65,maxOpenTotal:20,maxOpenPerSymbol:3,maxOpenMemecoin:5,maxSinglePositionPct:.020,maxExposurePct:.15,dailyLossLimitPct:.0225,lossStreakPause:6}
  })
]);

function buildStageCriteria(stageId,m){
  const s=m.summary;
  const meme=m.asset.MEME||{};
  const largestWinShare=m.largestWinShare;
  if(stageId==='BOOTCAMP') return [
    criterion('trades','20 abgeschlossene Trades',s.closedTrades,20),
    criterion('drawdown','Max. Drawdown ≤ 4%',s.maxDrawdownPct,.04,'LTE'),
    criterion('profit_factor','Profit Factor ≥ 0,90',finite(s.profitFactor,0),.90)
  ];
  if(stageId==='DISCIPLINE') return [
    criterion('trades','50 abgeschlossene Trades',s.closedTrades,50),
    criterion('profit_factor','Profit Factor ≥ 1,05',finite(s.profitFactor,0),1.05),
    criterion('expectancy','Expectancy ≥ 0',finite(s.expectancyQuote,-1),0),
    criterion('drawdown','Max. Drawdown ≤ 6%',s.maxDrawdownPct,.06,'LTE'),
    criterion('days','Mindestens 5 Handelstage',m.tradingDays,5)
  ];
  if(stageId==='CONSISTENCY') return [
    criterion('trades','100 abgeschlossene Trades',s.closedTrades,100),
    criterion('profit_factor','Profit Factor ≥ 1,10',finite(s.profitFactor,0),1.10),
    criterion('positive_days','Positive Tage ≥ 50%',m.positiveDayRate,.50),
    criterion('days','Mindestens 10 Handelstage',m.tradingDays,10),
    criterion('drawdown','Max. Drawdown ≤ 7%',s.maxDrawdownPct,.07,'LTE'),
    criterion('single_trade_dependence','Größter Gewinn ≤ 45% Gesamtgewinn',largestWinShare,.45,'LTE')
  ];
  if(stageId==='MULTI_MARKET') return [
    criterion('trades','160 abgeschlossene Trades',s.closedTrades,160),
    criterion('symbols','Mindestens 4 Coins',m.distinctSymbols,4),
    criterion('longs','Mindestens 20 Long-Trades',m.longTrades,20),
    criterion('shorts','Mindestens 20 Short-Trades',m.shortTrades,20),
    criterion('profit_factor','Profit Factor ≥ 1,12',finite(s.profitFactor,0),1.12),
    criterion('positive_weeks','Positive Wochen ≥ 50%',m.positiveWeekRate,.50)
  ];
  if(stageId==='STRESS_TEST') return [
    criterion('trades','250 abgeschlossene Trades',s.closedTrades,250),
    criterion('days','Mindestens 20 Handelstage',m.tradingDays,20),
    criterion('profit_factor','Profit Factor ≥ 1,15',finite(s.profitFactor,0),1.15),
    criterion('drawdown','Max. Drawdown ≤ 8%',s.maxDrawdownPct,.08,'LTE'),
    criterion('meme_trades','Mindestens 20 Memecoin-Trades',finite(meme.trades,0),20),
    criterion('meme_pf','Memecoin Profit Factor ≥ 1,00',finite(meme.profitFactor,0),1.00)
  ];
  return [
    criterion('trades','400 abgeschlossene Trades',s.closedTrades,400),
    criterion('days','Mindestens 28 Handelstage',m.tradingDays,28),
    criterion('symbols','Mindestens 6 Coins',m.distinctSymbols,6),
    criterion('profit_factor','Profit Factor ≥ 1,20',finite(s.profitFactor,0),1.20),
    criterion('expectancy','Expectancy > 0',finite(s.expectancyQuote,-1),.000001),
    criterion('net_pnl','Gesamt-PnL > 0',finite(s.netPnlQuote,-1),.000001),
    criterion('drawdown','Max. Drawdown ≤ 8%',s.maxDrawdownPct,.08,'LTE'),
    criterion('positive_weeks','Positive Wochen ≥ 60%',m.positiveWeekRate,.60),
    criterion('single_trade_dependence','Größter Gewinn ≤ 30% Gesamtgewinn',largestWinShare,.30,'LTE')
  ];
}

export function evaluateShadowCapitalAcademy(ledger,{asOf=Date.now(),timeZone='Europe/Berlin'}={}){
  const summary=shadowPortfolioSummary(ledger,{asOf});
  const positions=(ledger?.positions||[]).filter(p=>p&&p.execution==='SHADOW_ONLY'&&p.canExecuteLive===false);
  const closed=positions.filter(p=>p.status==='CLOSED').sort((a,b)=>Number(a.closedAt)-Number(b.closedAt));
  const open=positions.filter(p=>p.status==='OPEN');
  const daily=shadowPortfolioPeriodStats(ledger,{period:'DAY',asOf,timeZone});

  const days=groupPnl(closed,t=>localDayKey(t,timeZone));
  const weeks=groupPnl(closed,t=>localWeekKey(t,timeZone));
  const positiveDays=days.filter(x=>x.pnl>0).length;
  const positiveWeeks=weeks.filter(x=>x.pnl>0).length;
  const distinctSymbols=new Set(closed.map(p=>p.symbol)).size;
  const longTrades=closed.filter(p=>p.side==='LONG').length;
  const shortTrades=closed.filter(p=>p.side==='SHORT').length;
  const asset={};
  for(const cls of ['CORE','MEME']){
    const xs=closed.filter(p=>String(p.assetClass||'CORE').toUpperCase()===cls);
    const wins=xs.filter(p=>Number(p.realizedNetPnlQuote)>0);
    const losses=xs.filter(p=>Number(p.realizedNetPnlQuote)<0);
    const gp=wins.reduce((s,p)=>s+Number(p.realizedNetPnlQuote||0),0);
    const gl=Math.abs(losses.reduce((s,p)=>s+Number(p.realizedNetPnlQuote||0),0));
    asset[cls]={
      trades:xs.length,
      pnl:xs.reduce((s,p)=>s+Number(p.realizedNetPnlQuote||0),0),
      profitFactor:gl>1e-12?gp/gl:null
    };
  }
  const grossProfit=closed.filter(p=>Number(p.realizedNetPnlQuote)>0).reduce((s,p)=>s+Number(p.realizedNetPnlQuote||0),0);
  const largestWin=closed.reduce((m,p)=>Math.max(m,Number(p.realizedNetPnlQuote||0)),0);
  const largestWinShare=grossProfit>0?largestWin/grossProfit:1;
  const metrics={
    summary,
    tradingDays:days.length,
    tradingWeeks:weeks.length,
    positiveDayRate:days.length?positiveDays/days.length:0,
    positiveWeekRate:weeks.length?positiveWeeks/weeks.length:0,
    distinctSymbols,longTrades,shortTrades,largestWinShare,asset
  };

  const stages=STAGES.map(stage=>{
    const criteria=buildStageCriteria(stage.id,metrics);
    return freeze({
      ...stage,
      passed:allPass(criteria),
      progress:criteria.length?criteria.reduce((s,x)=>s+x.progress,0)/criteria.length:1,
      criteria
    });
  });

  let achievedLevel=-1;
  for(let i=0;i<stages.length;i++){
    if(stages[i].passed&&i===achievedLevel+1) achievedLevel=i;
    else break;
  }
  const activeIndex=Math.min(achievedLevel+1,stages.length-1);
  const activeStage=stages[activeIndex];
  const effectiveStage=STAGES[Math.max(0,achievedLevel)];
  const currentPolicy=effectiveStage.risk;

  const initial=Math.max(1,Number(ledger?.initialEquityQuote)||10_000);
  const equity=Math.max(1,Number(summary.equityQuote)||initial);
  const openExposure=open.reduce((s,p)=>s+Number(p.entryQuote||0),0);
  const openMeme=open.filter(p=>String(p.assetClass||'CORE').toUpperCase()==='MEME').length;
  const lossStreak=consecutiveLosses(closed);
  const lastClosedAt=closed.at(-1)?.closedAt??null;
  const dailyLossLimitQuote=initial*currentPolicy.dailyLossLimitPct;
  const dailyLossHit=Number(daily.realizedPnlQuote)<=-dailyLossLimitQuote;
  const lossPauseMs=60*60_000;
  const lossStreakPause=
    lossStreak>=currentPolicy.lossStreakPause&&
    Number.isFinite(Number(lastClosedAt))&&
    Number(asOf)-Number(lastClosedAt)<lossPauseMs;
  const severeDrawdown=Number(summary.maxDrawdownPct)>.10;
  const exposureHit=openExposure/equity>=currentPolicy.maxExposurePct;

  const blockers=[];
  if(dailyLossHit) blockers.push('DAILY_LOSS_LIMIT');
  if(lossStreakPause) blockers.push('LOSS_STREAK_COOLDOWN');
  if(exposureHit) blockers.push('EXPOSURE_CAP');
  const coreAllowed=blockers.length===0;
  const memeBlockers=[...blockers];
  if(severeDrawdown) memeBlockers.push('DRAWDOWN_MEME_HOLD');
  if(openMeme>=currentPolicy.maxOpenMemecoin) memeBlockers.push('MEME_OPEN_CAP');

  const core={
    version:SHADOW_CAPITAL_ACADEMY_VERSION,
    asOf:Number(asOf),
    timeZone,
    achievedLevel,
    achievedStage:achievedLevel>=0?stages[achievedLevel].id:'UNRANKED',
    activeStage:activeStage.id,
    activeStageLabel:activeStage.label,
    stageProgress:activeStage.progress,
    stages:stages.map(s=>({id:s.id,label:s.label,level:s.level,passed:s.passed,progress:s.progress,criteria:s.criteria})),
    metrics:{
      closedTrades:summary.closedTrades,
      netPnlQuote:summary.netPnlQuote,
      profitFactor:summary.profitFactor,
      expectancyQuote:summary.expectancyQuote,
      maxDrawdownPct:summary.maxDrawdownPct,
      tradingDays:metrics.tradingDays,
      tradingWeeks:metrics.tradingWeeks,
      positiveDayRate:metrics.positiveDayRate,
      positiveWeekRate:metrics.positiveWeekRate,
      distinctSymbols,
      longTrades,shortTrades,
      largestWinShare,
      asset
    },
    riskPolicy:{...currentPolicy},
    guard:{
      coreAllowed,
      memeAllowed:memeBlockers.length===0,
      blockers,
      memeBlockers,
      dailyRealizedPnlQuote:Number(daily.realizedPnlQuote||0),
      dailyLossLimitQuote,
      lossStreak,
      lossPauseUntil:lossStreakPause?Number(lastClosedAt)+lossPauseMs:null,
      openExposureQuote:openExposure,
      openExposurePct:openExposure/equity,
      openTotal:open.length,
      openMeme,
      severeDrawdown
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'TRAINING_AND_RISK_READINESS_DIAGNOSTIC_NOT_REAL_MONEY_APPROVAL'
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function academyTradeBudget(academy,{assetClass='CORE',baseNotionalQuote=100,equityQuote=null}={}){
  const policy=academy?.riskPolicy||STAGES[0].risk;
  const equity=Math.max(1,finite(equityQuote,10000));
  const base=Math.max(1,finite(baseNotionalQuote,100));
  const cls=String(assetClass||'CORE').toUpperCase();
  const classMult=cls==='MEME'?Number(policy.memeMultiplier||.4):1;
  const stageSized=base*Number(policy.notionalMultiplier||.5)*classMult;
  const maxSingle=equity*Number(policy.maxSinglePositionPct||.005);
  const notionalQuote=Math.max(1,Math.min(stageSized,maxSingle));
  const core={
    version:SHADOW_CAPITAL_ACADEMY_VERSION,
    assetClass:cls,
    baseNotionalQuote:base,
    equityQuote:equity,
    stageMultiplier:Number(policy.notionalMultiplier||.5),
    classMultiplier:classMult,
    maxSinglePositionPct:Number(policy.maxSinglePositionPct||.005),
    notionalQuote,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function verifyShadowCapitalAcademy(value){
  try{
    const reasons=[];
    if(value?.version!==SHADOW_CAPITAL_ACADEMY_VERSION) reasons.push('VERSION_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecuteLive!==false) reasons.push('EXECUTION_INVARIANT_INVALID');
    const {fingerprint,...core}=value||{};
    const expected=sha256(core);
    if(fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['ACADEMY_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
