export const INTELLIGENCE_TERMINAL_VERSION='TCX_INTELLIGENCE_TERMINAL_V1';
const finite=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,finite(v,0)));
const pct=(v,d=0)=>finite(v)==null?'—':(Number(v)*100).toFixed(d)+'%';
const price=v=>finite(v)==null?'—':Number(v).toLocaleString('de-DE',{maximumFractionDigits:Math.abs(Number(v))<1?6:2});
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};

export function buildSuperRadar(rows=[]){
 const ranked=(rows||[]).map(x=>{
  const witness=clamp(x.witnessAgreement);
  const support=Math.max(0,finite(x.support,0));
  const pressure=Math.min(1,Math.abs(finite(x.pressureScore,0))/100);
  const eventBoost=x.eventCount?Math.min(1,x.eventCount/3):0;
  const freshness=finite(x.ageMs)==null?0:Math.max(0,1-finite(x.ageMs)/120000);
  const evidence=clamp(.40*witness+.20*Math.min(1,support/30)+.15*pressure+.15*eventBoost+.10*freshness);
  const restricted=['ABSTAIN','SAFE_STOP','DATA_STALE','OUT_OF_DISTRIBUTION','PROVIDER_CONFLICT'].includes(String(x.status||'').toUpperCase());
  return {...x,evidence,restricted};
 }).sort((a,b)=>b.evidence-a.evidence);
 return freeze({version:INTELLIGENCE_TERMINAL_VERSION,rows:ranked,execution:'SHADOW_ONLY',canExecuteLive:false});
}

export function renderSuperRadar(radar){
 const lines=['TCX // SUPER RADAR','━━━━━━━━━━━━━━━━━━━━','','Wo ist gerade die stärkste verwertbare Evidenz?',''];
 for(const [i,x] of (radar?.rows||[]).slice(0,12).entries()){
  const icon=x.restricted?'○':x.evidence>=.7?'●':x.evidence>=.5?'◐':'○';
  lines.push((i+1)+'. '+icon+' '+String(x.symbol||'').replace('USDT','/USDT')+' · '+Math.round(x.evidence*100)+'/100 · '+String(x.regime||'UNKNOWN').replaceAll('_',' '));
  lines.push('   Quellen '+pct(x.witnessAgreement)+' · Fälle '+(x.support||0)+(x.eventCount?' · Events '+x.eventCount:''));
 }
 lines.push('','Score = Evidenz-/Aufmerksamkeitspriorität, KEINE Renditeprognose.','○ eingeschränkt · ◐ beobachten · ● starke Datenlage','SHADOW_ONLY · REAL ORDERS BLOCKED');
 return lines.join('\n').slice(0,4096);
}

export function buildSuperSetup({symbol,state,forecast=null,events=null,confluence=null}={}){
 const bias=String(state?.dashboard?.bias||state?.analysis?.trend||'NEUTRAL').toUpperCase();
 const direction=bias.includes('BULL')||bias.includes('UP')?'UP':bias.includes('BEAR')||bias.includes('DOWN')?'DOWN':'NEUTRAL';
 const support=finite(state?.analysis?.support),resistance=finite(state?.analysis?.resistance);
 const witness=clamp(state?.dashboard?.witnessAgreement??state?.witnessAgreement);
 const eventRows=events?.events||[];
 const evidence=clamp(.50*witness+.20*Math.min(1,eventRows.length/3)+.30*Math.min(1,finite(confluence?.zones?.[0]?.score,0)/100));
 const restricted=evidence<.45||direction==='NEUTRAL';
 return freeze({version:INTELLIGENCE_TERMINAL_VERSION,symbol,direction,evidence,support,resistance,eventRows:eventRows.slice(0,4),forecastStatus:forecast?.status||null,status:restricted?'ABSTAIN':evidence>=.7?'READY':'WATCH',execution:'SHADOW_ONLY',canExecuteLive:false});
}
export function renderSuperSetup(x){
 return ['TCX // SUPER SETUP · '+String(x.symbol||'').replace('USDT','/USDT'),'━━━━━━━━━━━━━━━━━━━━','','STATE       '+x.status,'Direction   '+x.direction,'Evidence    '+Math.round(x.evidence*100)+'/100','Support     '+price(x.support),'Resistance  '+price(x.resistance),'Forecast    '+String(x.forecastStatus||'—'),'','EVENTS',...(x.eventRows.length?x.eventRows.map(e=>'• '+String(e.type||e.label||'EVENT').replaceAll('_',' ')):['• keine bestätigten Struktur-Events']),'','READY bedeutet ausreichende Analyse-Evidenz, nicht Trade-Freigabe.','Action bleibt ABSTAIN · SHADOW_ONLY'].join('\n').slice(0,4096);
}

export function buildSuperRisk({symbol,state,liquidation=null,accuracy=null,confluence=null}={}){
 const reasons=[];let risk=0;
 const spread=Math.max(0,finite(state?.market?.spreadBps,0)); if(spread>8){risk+=.2;reasons.push('breiter Spread');}
 const vol=Math.abs(finite(state?.dashboard?.volatility,0)); if(vol>.02){risk+=.15;reasons.push('hohe Volatilität');}
 const clusters=[...(liquidation?.clusters15m||liquidation?.clusters5m||[])]; if(clusters.length){risk+=.15;reasons.push('Liquidationscluster aktiv');}
 const acc=accuracy?.ready?accuracy?.evaluation?.overall:null;
 if(!acc){risk+=.2;reasons.push('Forecast-Accuracy noch nicht belastbar');}
 else if(finite(acc.expectedCalibrationError,0)>.12){risk+=.2;reasons.push('Kalibrierungsfehler erhöht');}
 const conf=finite(confluence?.zones?.[0]?.score,0); if(conf<45){risk+=.15;reasons.push('schwache Confluence');}
 risk=clamp(risk);
 return freeze({version:INTELLIGENCE_TERMINAL_VERSION,symbol,risk,status:risk>=.65?'HIGH':risk>=.35?'ELEVATED':'NORMAL',reasons,execution:'SHADOW_ONLY',canExecuteLive:false});
}
export function renderSuperRisk(x){
 return ['TCX // SUPER RISK · '+String(x.symbol||'').replace('USDT','/USDT'),'━━━━━━━━━━━━━━━━━━━━','','Risk state   '+x.status,'Risk index   '+Math.round(x.risk*100)+'/100','','RED TEAM',...(x.reasons.length?x.reasons.map(r=>'• '+r):['• keine zusätzliche Warnung aus den geprüften Modulen']),'','Risk Index ist ein Diagnosewert, keine Verlustwahrscheinlichkeit.','SHADOW_ONLY · REAL ORDERS BLOCKED'].join('\n').slice(0,4096);
}

export function buildSuperSignal({symbol,setup,risk,forecast=null}={}){
 const ready=setup?.status==='READY'&&risk?.status!=='HIGH';
 const status=ready?'WATCH':setup?.status==='WATCH'&&risk?.status==='NORMAL'?'WATCH':'ABSTAIN';
 return freeze({version:INTELLIGENCE_TERMINAL_VERSION,symbol,status,direction:setup?.direction||'NEUTRAL',evidence:setup?.evidence||0,risk:risk?.status||'UNKNOWN',forecastStatus:forecast?.status||null,execution:'SHADOW_ONLY',canExecuteLive:false});
}
export function renderSuperSignal(x){
 return ['TCX // SUPER SIGNAL · '+String(x.symbol||'').replace('USDT','/USDT'),'━━━━━━━━━━━━━━━━━━━━','','STATUS      '+x.status,'Direction   '+x.direction,'Evidence    '+Math.round(x.evidence*100)+'/100','Risk        '+x.risk,'Forecast    '+String(x.forecastStatus||'—'),'','Das ist die komprimierte Intelligence-Ausgabe.','WATCH = weiter beobachten, NICHT Order ausführen.','ABSTAIN = Evidenz/Risiko reicht nicht.','REAL ORDERS BLOCKED'].join('\n').slice(0,4096);
}
