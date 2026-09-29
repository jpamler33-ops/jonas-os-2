export const STRUCTURE_EVENT_RADAR_VERSION='TCX_STRUCTURE_EVENT_RADAR_V1';

function finite(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function price(v){
  const n=finite(v);
  if(n==null)return '—';
  const a=Math.abs(n);
  return n.toFixed(a<1?6:a<100?3:2);
}
function tfRank(tf){
  return ({'4h':5,'1h':4,'15m':3,'5m':2,'1m':1})[String(tf)]||0;
}
function severity(type){
  if(/BROKEN|BOS/.test(type)) return 3;
  if(/RETEST/.test(type)) return 2;
  return 1;
}
function icon(type){
  if(type==='NEW_HH'||type==='NEW_HL'||type==='BOS_UP'||type==='LH_BROKEN'||type==='RETEST_UP') return '↗';
  if(type==='NEW_LH'||type==='NEW_LL'||type==='BOS_DOWN'||type==='HL_BROKEN'||type==='RETEST_DOWN') return '↘';
  return '•';
}
function label(type){
  const map={
    NEW_HH:'NEW HH',NEW_HL:'NEW HL',NEW_LH:'NEW LH',NEW_LL:'NEW LL',
    BOS_UP:'BOS UP',BOS_DOWN:'BOS DOWN',
    RETEST_UP:'RETEST UP',RETEST_DOWN:'RETEST DOWN',
    HL_BROKEN:'HL BROKEN',LH_BROKEN:'LH BROKEN'
  };
  return map[type]||String(type||'EVENT');
}
function latestPivotByLabel(xs,labelName){
  for(let i=xs.length-1;i>=0;i--) if(xs[i]?.label===labelName) return xs[i];
  return null;
}
function event(tf,type,at,level,detail,ageBars=0){
  return Object.freeze({
    id:[tf,type,Number(at)||0,Number(level)||0].join(':'),
    timeframe:String(tf),
    type:String(type),
    label:label(type),
    icon:icon(type),
    severity:severity(type),
    at:Number(at)||0,
    level:finite(level),
    detail:String(detail||''),
    ageBars:Math.max(0,Number(ageBars)||0)
  });
}

export function deriveStructureEvents({timeframe,analysis,candles=[],maxPivotAgeBars=8}={}){
  const tf=String(timeframe||'5m');
  const closed=(Array.isArray(candles)?candles:[]).filter(x=>x?.closed===true);
  const closedCount=closed.length;
  const pivots=Array.isArray(analysis?.classifiedPivots)?analysis.classifiedPivots:[];
  const out=[];
  const latest=pivots.at(-1);
  if(latest&&['HH','HL','LH','LL'].includes(String(latest.label))){
    const ageBars=Math.max(0,closedCount-1-Number(latest.i||0));
    if(ageBars<=maxPivotAgeBars){
      out.push(event(tf,'NEW_'+latest.label,latest.openTime,latest.price,'bestätigter Swing',ageBars));
    }
  }

  const pattern=analysis?.pattern;
  if(pattern?.stage==='BREAK_CLOSE'){
    out.push(event(
      tf,
      String(pattern.side).toUpperCase()==='LONG'?'BOS_UP':'BOS_DOWN',
      closed[Number(pattern.breakIndex)]?.openTime??0,
      pattern.level,
      'Break per Schlusskurs bestätigt',
      Math.max(0,closedCount-1-Number(pattern.breakIndex||0))
    ));
  }else if(pattern?.stage==='BREAK_RETEST_CONFIRMED'){
    out.push(event(
      tf,
      String(pattern.side).toUpperCase()==='LONG'?'RETEST_UP':'RETEST_DOWN',
      closed[Number(pattern.retestIndex)]?.openTime??0,
      pattern.level,
      'Break + Retest bestätigt',
      Math.max(0,closedCount-1-Number(pattern.retestIndex||0))
    ));
  }

  const lastClose=finite(analysis?.lastClose);
  const hl=latestPivotByLabel(pivots,'HL');
  const lh=latestPivotByLabel(pivots,'LH');
  if(lastClose!=null&&hl&&lastClose<Number(hl.price)){
    out.push(event(tf,'HL_BROKEN',closed.at(-1)?.openTime??0,hl.price,'Schlusskurs unter letztem HL',0));
  }
  if(lastClose!=null&&lh&&lastClose>Number(lh.price)){
    out.push(event(tf,'LH_BROKEN',closed.at(-1)?.openTime??0,lh.price,'Schlusskurs über letztem LH',0));
  }

  const dedupe=new Map();
  for(const e of out){
    const key=e.timeframe+'|'+e.type+'|'+String(e.level);
    const prior=dedupe.get(key);
    if(!prior||e.ageBars<prior.ageBars) dedupe.set(key,e);
  }
  return Object.freeze([...dedupe.values()].sort((a,b)=>b.severity-a.severity||a.ageBars-b.ageBars));
}

export function buildStructureEventRadar({
  symbol,
  analyses={},
  candlesByTf={},
  now=Date.now()
}={}){
  const frames=['4h','1h','15m','5m','1m'];
  const events=[];
  for(const tf of frames){
    const rows=deriveStructureEvents({
      timeframe:tf,
      analysis:analyses?.[tf],
      candles:candlesByTf?.[tf]||[]
    });
    events.push(...rows);
  }
  events.sort((a,b)=>b.severity-a.severity||tfRank(b.timeframe)-tfRank(a.timeframe)||a.ageBars-b.ageBars);

  const key=events.slice(0,12).map(e=>[e.timeframe,e.type,e.level??'NA'].join(':')).join('|')||'NONE';
  const lines=[
    'TCX // STRUCTURE EVENT RADAR · '+String(symbol||'').replace('USDT','/USDT'),
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    'CONFIRMED EVENTS'
  ];
  if(events.length){
    for(const e of events.slice(0,14)){
      lines.push(
        e.icon+' '+e.timeframe.toUpperCase()+' · '+e.label+' · '+price(e.level)+' · '+e.ageBars+' bars alt',
        '  '+e.detail
      );
    }
  }else{
    lines.push('Keine frischen bestätigten Struktur-Events.');
  }
  lines.push(
    '',
    'BOS = Break of Structure',
    'HH/HL/LH/LL werden nur aus abgeschlossenen Kerzen bestätigt.',
    'Laufende Kerzen erzeugen keine bestätigten Events.',
    '',
    'STRUCTURE OBSERVATION · SHADOW_ONLY'
  );
  return Object.freeze({
    version:STRUCTURE_EVENT_RADAR_VERSION,
    text:lines.join('\n').slice(0,4096),
    events:Object.freeze(events),
    structureEventKey:key,
    generatedAt:Number(now),
    researchOnly:true
  });
}
