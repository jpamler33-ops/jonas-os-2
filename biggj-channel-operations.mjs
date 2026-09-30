export const BIGGJ_CHANNEL_OPERATIONS_VERSION='BIGGJ_CHANNEL_OPERATIONS_V2';

const finite=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const arr=v=>Array.isArray(v)?v:[];
const errText=err=>err instanceof Error?err.message:String(err??'UNKNOWN');

function normalizeProfile(profile={}){
  return Object.freeze({
    mode:String(profile?.mode||'UNKNOWN'),
    cadence:String(profile?.cadence||'on demand'),
    cadenceMs:finite(profile?.cadenceMs,null),
    requiresContent:profile?.requiresContent!==false,
    eventDriven:profile?.eventDriven===true
  });
}

function statusFor(row,now){
  if(row.exists!==true)return {status:'BROKEN',decision:'REPAIR_LAYOUT',priority:1,reason:'Channel fehlt.'};
  if(row.parentMatches===false||row.topicMatches===false)return {status:'DEGRADED',decision:'REPAIR_LAYOUT',priority:1,reason:'Kategorie oder Topic weicht vom Sollzustand ab.'};
  if(row.lastFailureAt&&(!row.lastSuccessAt||row.lastFailureAt>row.lastSuccessAt)){
    return {status:'DEGRADED',decision:'RECOVER',priority:1,reason:'Letzter Manager-Lauf ist fehlgeschlagen: '+String(row.lastError||'UNKNOWN')};
  }
  if(row.profile.eventDriven){
    return {status:'IDLE_OK',decision:'WATCH',priority:3,reason:'Event-getriebener Channel; keine künstliche Aktivität nötig.'};
  }
  if(row.profile.requiresContent&&row.botMessageCount===0&&row.lastSuccessAt==null){
    return {status:'EMPTY',decision:'REFRESH',priority:1,reason:'Noch kein verwalteter Bot-Inhalt erkannt.'};
  }
  const cadenceMs=finite(row.profile.cadenceMs,null);
  const activity=Math.max(finite(row.lastSuccessAt,0),finite(row.lastMessageAt,0));
  if(cadenceMs&&activity>0&&now-activity>cadenceMs*2.5){
    return {status:'STALE',decision:'REFRESH',priority:2,reason:'Inhalt ist älter als die erwartete Aktualisierungsfrequenz.'};
  }
  if(cadenceMs&&activity===0){
    return {status:'STALE',decision:'REFRESH',priority:2,reason:'Für einen Live-Channel fehlt ein erfolgreicher Refresh-Zeitpunkt.'};
  }
  return {status:'HEALTHY',decision:'KEEP',priority:3,reason:'Channel erfüllt aktuell seinen erwarteten Betriebsmodus.'};
}

function suggestionFor(name,evaluation){
  if(evaluation.decision==='REPAIR_LAYOUT')return '#'+name+': Layout/Topic automatisch auf Sollzustand zurückführen und danach Funktionscheck ausführen.';
  if(evaluation.decision==='RECOVER')return '#'+name+': fehlgeschlagenen Manager-Lauf erneut ausführen; bei Wiederholung Quelle/Callback/Permission isolieren.';
  if(evaluation.decision==='REFRESH')return '#'+name+': Live-Inhalt neu erzeugen und Freshness danach erneut prüfen.';
  if(evaluation.status==='HEALTHY')return '#'+name+': keine Änderung nötig; nur weiter überwachen.';
  return '#'+name+': Zustand beobachten.';
}

export function createBiggjChannelManagerRuntime({sections=[],profileFor=()=>null,now=()=>Date.now()}={}){
  const managers=new Map();
  for(const section of arr(sections)){
    for(const spec of arr(section?.channels)){
      const name=String(spec?.name||'').trim();
      if(!name||managers.has(name))continue;
      managers.set(name,{
        name,
        category:String(section?.category||'UNKNOWN'),
        topic:String(spec?.topic||''),
        profile:normalizeProfile(profileFor(name)||{}),
        exists:false,
        parentMatches:null,
        topicMatches:null,
        botMessageCount:0,
        lastMessageAt:null,
        lastAttemptAt:null,
        lastSuccessAt:null,
        lastFailureAt:null,
        lastError:null,
        lastDetail:null,
        successes:0,
        failures:0
      });
    }
  }

  function row(name){
    return managers.get(String(name||''))||null;
  }

  function observe(name,patch={}){
    const x=row(name); if(!x)return false;
    if('exists'in patch)x.exists=patch.exists===true;
    if('parentMatches'in patch)x.parentMatches=patch.parentMatches==null?null:patch.parentMatches===true;
    if('topicMatches'in patch)x.topicMatches=patch.topicMatches==null?null:patch.topicMatches===true;
    if('botMessageCount'in patch)x.botMessageCount=Math.max(0,finite(patch.botMessageCount,0));
    if('lastMessageAt'in patch)x.lastMessageAt=finite(patch.lastMessageAt,null);
    if('lastDetail'in patch)x.lastDetail=patch.lastDetail==null?x.lastDetail:String(patch.lastDetail);
    return true;
  }

  function success(name,detail=null){
    const x=row(name); if(!x)return false;
    const t=Number(now());
    x.lastAttemptAt=t;x.lastSuccessAt=t;x.lastError=null;x.lastDetail=detail==null?x.lastDetail:String(detail);
    x.successes++;
    return true;
  }

  function failure(name,error,detail=null){
    const x=row(name); if(!x)return false;
    const t=Number(now());
    x.lastAttemptAt=t;x.lastFailureAt=t;x.lastError=errText(error);x.lastDetail=detail==null?x.lastDetail:String(detail);
    x.failures++;
    return true;
  }

  function snapshot(){
    const t=Number(now());
    const rows=[...managers.values()].map(x=>{
      const evaluation=statusFor(x,t);
      return Object.freeze({
        ...x,
        ...evaluation,
        suggestion:suggestionFor(x.name,evaluation)
      });
    });
    const counts={HEALTHY:0,IDLE_OK:0,STALE:0,EMPTY:0,DEGRADED:0,BROKEN:0};
    for(const x of rows)counts[x.status]=(counts[x.status]||0)+1;
    const problems=rows
      .filter(x=>!['HEALTHY','IDLE_OK'].includes(x.status))
      .sort((a,b)=>a.priority-b.priority||String(a.name).localeCompare(String(b.name)));
    const supervisorStatus=problems.some(x=>x.priority===1)?'ACTION_REQUIRED':problems.length?'DEGRADED':'HEALTHY';
    const profiled=rows.filter(x=>x.profile?.mode&&x.profile.mode!=='UNKNOWN').length;
    const managerCoverage=rows.length?profiled/rows.length:0;
    const supervisor=Object.freeze({
      status:supervisorStatus,
      managed:rows.length,
      coverage:managerCoverage,
      nextActions:Object.freeze(problems.slice(0,8).map(x=>Object.freeze({
        channel:x.name,
        decision:x.decision,
        priority:x.priority,
        reason:x.reason,
        suggestion:x.suggestion
      })))
    });
    const domainMap=new Map();
    for(const row of rows){
      const key=String(row.category||'UNKNOWN');
      const bucket=domainMap.get(key)||[];
      bucket.push(row);
      domainMap.set(key,bucket);
    }
    const domainSupervisors=[...domainMap.entries()].map(([category,domainRows])=>{
      const domainProblems=domainRows.filter(x=>!['HEALTHY','IDLE_OK'].includes(x.status));
      const status=domainProblems.some(x=>x.priority===1)
        ?'ACTION_REQUIRED'
        :domainProblems.length?'DEGRADED':'HEALTHY';
      const covered=domainRows.filter(x=>x.profile?.mode&&x.profile.mode!=='UNKNOWN').length;
      return Object.freeze({
        category,
        status,
        managers:domainRows.length,
        healthy:domainRows.length-domainProblems.length,
        problems:domainProblems.length,
        coverage:domainRows.length?covered/domainRows.length:0,
        nextActions:Object.freeze(domainProblems.slice(0,4).map(x=>Object.freeze({
          channel:x.name,
          decision:x.decision,
          priority:x.priority,
          reason:x.reason,
          suggestion:x.suggestion
        })))
      });
    }).sort((a,b)=>
      ({ACTION_REQUIRED:0,DEGRADED:1,HEALTHY:2}[a.status]??3)-({ACTION_REQUIRED:0,DEGRADED:1,HEALTHY:2}[b.status]??3)||
      a.category.localeCompare(b.category)
    );
    const domainProblems=domainSupervisors.filter(x=>x.status!=='HEALTHY');
    const operationsDirector=Object.freeze({
      status:domainProblems.some(x=>x.status==='ACTION_REQUIRED')
        ?'ACTION_REQUIRED'
        :domainProblems.length?'DEGRADED':'HEALTHY',
      domains:domainSupervisors.length,
      healthyDomains:domainSupervisors.length-domainProblems.length,
      problemDomains:domainProblems.length,
      supervisorStatus,
      nextDomains:Object.freeze(domainProblems.slice(0,6).map(x=>Object.freeze({
        category:x.category,
        status:x.status,
        problems:x.problems,
        nextActions:x.nextActions
      })))
    });
    const metaSupervisor=Object.freeze({
      status:managerCoverage<1
        ?'BLIND_SPOT'
        :operationsDirector.status==='ACTION_REQUIRED'
          ?'DIRECTOR_ESCALATION'
          :operationsDirector.status==='DEGRADED'
            ?'WATCH_DIRECTOR'
            :'HEALTHY',
      supervisorObserved:true,
      directorObserved:true,
      domainSupervisorsObserved:domainSupervisors.length,
      managerCoverage,
      unprofiledManagers:rows.length-profiled,
      problemRate:rows.length?problems.length/rows.length:0,
      domainProblemRate:domainSupervisors.length?domainProblems.length/domainSupervisors.length:0,
      rule:'Manager → Domain-Supervisor → Operations-Director → Meta-Supervisor. Auto-Reparatur bleibt auf UI/Refresh/Layout begrenzt; keine Trading-Policy oder Live-Execution.'
    });
    return Object.freeze({
      version:BIGGJ_CHANNEL_OPERATIONS_VERSION,
      generatedAt:t,
      managers:rows.length,
      healthy:(counts.HEALTHY||0)+(counts.IDLE_OK||0),
      problems:problems.length,
      counts:Object.freeze(counts),
      rows:Object.freeze(rows),
      topProblems:Object.freeze(problems.slice(0,12)),
      supervisor,
      domainSupervisors:Object.freeze(domainSupervisors),
      operationsDirector,
      metaSupervisor
    });
  }

  return Object.freeze({
    version:BIGGJ_CHANNEL_OPERATIONS_VERSION,
    names:Object.freeze([...managers.keys()]),
    observe,
    success,
    failure,
    snapshot
  });
}
