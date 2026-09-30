import { sha256 } from './institutional-kernel.mjs';

export const SHADOW_TRAINING_SUPERVISOR_VERSION='TCX_SHADOW_TRAINING_SUPERVISOR_V1';

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
function pf(rows){
  let gp=0,gl=0;
  for(const p of rows){
    const x=Number(p.realizedNetPnlQuote||0);
    if(x>0) gp+=x;
    else if(x<0) gl+=Math.abs(x);
  }
  return gl>1e-12?gp/gl:null;
}
function expectancy(rows){
  if(!rows.length) return null;
  return rows.reduce((s,p)=>s+Number(p.realizedNetPnlQuote||0),0)/rows.length;
}
function maxDrawdown(rows,initialEquity=10_000){
  let equity=Math.max(1,Number(initialEquity)||10_000),peak=equity,maxQuote=0,maxPct=0;
  for(const p of rows){
    equity+=Number(p.realizedNetPnlQuote||0);
    peak=Math.max(peak,equity);
    const dd=Math.max(0,peak-equity);
    maxQuote=Math.max(maxQuote,dd);
    maxPct=Math.max(maxPct,peak>0?dd/peak:0);
  }
  return {quote:maxQuote,pct:maxPct};
}
function lossStreak(rows){
  let n=0;
  for(let i=rows.length-1;i>=0;i--){
    if(Number(rows[i].realizedNetPnlQuote||0)<0) n++;
    else break;
  }
  return n;
}
function group(rows,keyFn){
  const m=new Map();
  for(const p of rows){
    const key=String(keyFn(p)||'UNKNOWN');
    const a=m.get(key)||[];
    a.push(p);m.set(key,a);
  }
  return [...m.entries()].map(([key,x])=>({
    key,
    trades:x.length,
    pnl:x.reduce((s,p)=>s+Number(p.realizedNetPnlQuote||0),0),
    profitFactor:pf(x),
    expectancyQuote:expectancy(x),
    winRate:x.length?x.filter(p=>Number(p.realizedNetPnlQuote||0)>0).length/x.length:null
  })).sort((a,b)=>b.trades-a.trades);
}
function concentration(groups,total){
  return total>0&&groups.length?groups[0].trades/total:0;
}
function pct(n){ return Math.round(Number(n||0)*1000)/10; }

function chooseMission({recent,all,academy,bySide,bySymbol,byHorizon,byAsset,rollingPf,rollingExpectancy,rollingDd,streak}){
  const stage=String(academy?.activeStage||'BOOTCAMP');
  if(all.length<20){
    return {
      type:'SAMPLE_BUILDING',
      title:'Saubere Stichprobe aufbauen',
      objective:'Mindestens 20 vollständig abgeschlossene Shadow-Trades sammeln, ohne Entry-Gates zu lockern.',
      target:20,
      current:all.length,
      progress:clamp(all.length/20,0,1),
      priority:100
    };
  }
  if(recent.length>=20&&rollingPf!=null&&Number.isFinite(rollingPf)&&rollingPf<0.90){
    return {
      type:'EDGE_RECOVERY',
      title:'Edge-Recovery',
      objective:'Rolling Profit Factor wieder auf mindestens 0,90 bringen. Nur bereits zulässige Setups handeln; keine Qualitäts-Gates senken.',
      target:.90,
      current:rollingPf,
      progress:clamp(rollingPf/.90,0,1),
      priority:95
    };
  }
  if(rollingDd.pct>.06){
    return {
      type:'DRAWDOWN_RECOVERY',
      title:'Drawdown kontrollieren',
      objective:'Rolling Drawdown unter 6% stabilisieren. Supervisor reduziert dafür automatisch das simulierte Risiko.',
      target:.06,
      current:rollingDd.pct,
      progress:clamp(.06/Math.max(rollingDd.pct,1e-9),0,1),
      priority:90
    };
  }
  const sideConc=concentration(bySide,recent.length);
  if(recent.length>=30&&sideConc>.80){
    const weak=bySide.at(-1)?.key||'OPPOSITE_SIDE';
    return {
      type:'SIDE_BALANCE',
      title:'Long/Short-Robustheit',
      objective:'Mehr unabhängige '+weak+'-Beispiele sammeln, aber ausschließlich wenn die normalen Forecast-Gates erfüllt sind.',
      target:.80,
      current:sideConc,
      progress:clamp(.80/sideConc,0,1),
      priority:70
    };
  }
  const symbolConc=concentration(bySymbol,recent.length);
  if(recent.length>=30&&symbolConc>.60){
    return {
      type:'SYMBOL_DIVERSITY',
      title:'Coin-Abhängigkeit reduzieren',
      objective:'Kein einzelner Coin soll mehr als 60% der Rolling-Stichprobe dominieren. Keine Trades nur für Diversifikation erzwingen.',
      target:.60,
      current:symbolConc,
      progress:clamp(.60/symbolConc,0,1),
      priority:65
    };
  }
  const horizonConc=concentration(byHorizon,recent.length);
  if(recent.length>=30&&horizonConc>.70){
    return {
      type:'HORIZON_DIVERSITY',
      title:'Horizont-Robustheit',
      objective:'Mehr valide Beispiele außerhalb des dominanten Prognosehorizonts sammeln, ohne Entry-Gates zu lockern.',
      target:.70,
      current:horizonConc,
      progress:clamp(.70/horizonConc,0,1),
      priority:60
    };
  }
  const meme=byAsset.find(x=>x.key==='MEME');
  if(['STRESS_TEST','CAPITAL_READY_SIM'].includes(stage)&&(meme?.trades||0)<20){
    return {
      type:'MEME_DISCIPLINE',
      title:'Memecoin-Disziplin',
      objective:'20 abgeschlossene Memecoin-Shadow-Trades unter den strengeren Meme-Gates sammeln.',
      target:20,
      current:meme?.trades||0,
      progress:clamp((meme?.trades||0)/20,0,1),
      priority:55
    };
  }
  if(streak>=3){
    return {
      type:'LOSS_STREAK_CONTROL',
      title:'Verlustserien kontrollieren',
      objective:'Nach Verlustserien Risiko klein halten und nur neue Setups mit unveränderten Qualitäts-Gates zulassen.',
      target:2,
      current:streak,
      progress:clamp(2/Math.max(streak,1),0,1),
      priority:50
    };
  }
  return {
    type:'CONSISTENCY',
    title:'Konsistenz ausbauen',
    objective:'Rolling Stichprobe vergrößern und Profit Factor/Expectancy über mehrere Coins und Marktphasen stabil halten.',
    target:Math.max(100,all.length+20),
    current:all.length,
    progress:clamp(all.length/Math.max(100,all.length+20),0,1),
    priority:20
  };
}

export function evaluateShadowTrainingSupervisor(ledger,academy,{
  asOf=Date.now(),
  rollingTrades=100
}={}){
  const positions=(ledger?.positions||[])
    .filter(p=>
      p&&p.execution==='SHADOW_ONLY'&&p.canExecuteLive===false&&p.status==='CLOSED'&&
      !['CHALLENGER','ABSTAIN_PROBE','COVERAGE_PROBE','EXPLORATION'].includes(String(p.entryMode||'STANDARD').toUpperCase())
    )
    .sort((a,b)=>Number(a.closedAt||0)-Number(b.closedAt||0));
  const n=Math.max(20,Math.floor(Number(rollingTrades)||100));
  const recent=positions.slice(-n);
  const initial=Math.max(1,Number(ledger?.initialEquityQuote)||10_000);
  const rollingPf=pf(recent);
  const rollingExpectancy=expectancy(recent);
  const rollingDd=maxDrawdown(recent,initial);
  const streak=lossStreak(positions);
  const bySide=group(recent,p=>p.side);
  const bySymbol=group(recent,p=>p.symbol);
  const byHorizon=group(recent,p=>p.horizonId||'UNKNOWN');
  const byAsset=group(recent,p=>p.assetClass||'CORE');

  let sampleFactor=positions.length<20?.50:positions.length<50?.65:positions.length<100?.80:1;
  let pfFactor=rollingPf==null?.60:!Number.isFinite(rollingPf)?1:rollingPf<.75?.35:rollingPf<1?.55:rollingPf<1.1?.80:1;
  let ddFactor=rollingDd.pct>.10?.30:rollingDd.pct>.07?.45:rollingDd.pct>.05?.65:rollingDd.pct>.03?.82:1;
  let streakFactor=streak>=6?.35:streak>=4?.55:streak>=3?.75:1;
  const riskMultiplier=clamp(Math.min(sampleFactor,pfFactor,ddFactor,streakFactor),.25,1);

  const lastClosedAt=positions.at(-1)?.closedAt??null;
  const catastrophic=
    recent.length>=30&&
    ((Number.isFinite(rollingPf)&&rollingPf<.55)||rollingDd.pct>.12);
  const holdMs=2*60*60_000;
  const holdUntil=catastrophic&&Number.isFinite(Number(lastClosedAt))
    ?Number(lastClosedAt)+holdMs
    :null;
  const riskHold=catastrophic&&holdUntil!=null&&Number(asOf)<holdUntil;

  const mission=chooseMission({
    recent,all:positions,academy,bySide,bySymbol,byHorizon,byAsset,
    rollingPf,rollingExpectancy,rollingDd,streak
  });
  const missionId='tm_'+sha256({
    version:SHADOW_TRAINING_SUPERVISOR_VERSION,
    stage:String(academy?.activeStage||'BOOTCAMP'),
    type:mission.type
  }).slice(0,18);

  const core={
    version:SHADOW_TRAINING_SUPERVISOR_VERSION,
    asOf:Number(asOf),
    rollingTrades:n,
    samples:{all:positions.length,recent:recent.length},
    rolling:{
      pnlQuote:recent.reduce((s,p)=>s+Number(p.realizedNetPnlQuote||0),0),
      profitFactor:rollingPf,
      expectancyQuote:rollingExpectancy,
      winRate:recent.length?recent.filter(p=>Number(p.realizedNetPnlQuote||0)>0).length/recent.length:null,
      maxDrawdownQuote:rollingDd.quote,
      maxDrawdownPct:rollingDd.pct,
      lossStreak:streak
    },
    diversity:{
      sides:bySide,
      symbols:bySymbol.slice(0,12),
      horizons:byHorizon,
      assets:byAsset,
      sideConcentration:concentration(bySide,recent.length),
      symbolConcentration:concentration(bySymbol,recent.length),
      horizonConcentration:concentration(byHorizon,recent.length)
    },
    risk:{
      multiplier:riskMultiplier,
      sampleFactor,pfFactor,ddFactor,streakFactor,
      hold:riskHold,
      holdUntil,
      reason:riskHold?'TRAINING_COOLDOWN_AFTER_SEVERE_ROLLING_FAILURE':null
    },
    mission:{...mission,missionId},
    academyStage:String(academy?.activeStage||'BOOTCAMP'),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    meaning:'ADAPTIVE_TRAINING_DIAGNOSTIC_NOT_PROFIT_GUARANTEE_OR_REAL_MONEY_APPROVAL'
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function supervisedShadowBudget(supervisor,{academyNotionalQuote=200}={}){
  const base=Math.max(1,finite(academyNotionalQuote,200));
  const mult=clamp(finite(supervisor?.risk?.multiplier,.25),.25,1);
  const notionalQuote=Math.max(1,base*mult);
  const core={
    version:SHADOW_TRAINING_SUPERVISOR_VERSION,
    academyNotionalQuote:base,
    trainingRiskMultiplier:mult,
    notionalQuote,
    missionId:String(supervisor?.mission?.missionId||''),
    missionType:String(supervisor?.mission?.type||'UNKNOWN'),
    riskHold:supervisor?.risk?.hold===true,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
  return freeze({...core,fingerprint:sha256(core)});
}

export function renderSupervisorCompact(supervisor){
  const x=supervisor||{};
  const pfv=x.rolling?.profitFactor;
  return {
    mission:String(x.mission?.title||'Training'),
    progressPct:pct(x.mission?.progress),
    riskMultiplier:Number(x.risk?.multiplier||0),
    profitFactor:pfv==null?null:Number(pfv),
    expectancyQuote:finite(x.rolling?.expectancyQuote),
    drawdownPct:finite(x.rolling?.maxDrawdownPct,0),
    recentTrades:Number(x.samples?.recent||0),
    hold:x.risk?.hold===true,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  };
}

export function verifyShadowTrainingSupervisor(value){
  try{
    const reasons=[];
    if(value?.version!==SHADOW_TRAINING_SUPERVISOR_VERSION) reasons.push('VERSION_INVALID');
    if(value?.execution!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecuteLive!==false) reasons.push('EXECUTION_INVARIANT_INVALID');
    const {fingerprint,...core}=value||{};
    const expected=sha256(core);
    if(fingerprint!==expected) reasons.push('FINGERPRINT_MISMATCH');
    return {ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['SUPERVISOR_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
