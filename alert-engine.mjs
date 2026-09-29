export const ALERT_ENGINE_VERSION="TCX_ALERTS_V2";

export const ALERT_TYPES=Object.freeze([
  "PRICE",
  "REGIME_CHANGE",
  "STRUCTURE_CHANGE",
  "WITNESS_AGREEMENT",
  "WITNESS_CONTRADICTION",
  "MEMORY_SUPPORT",
  "SAFETY_STATE_CHANGE",
  "COMPOSITE"
]);

const SYMBOL_RE=/^[A-Z0-9]{2,18}USDT$/;
const VALID_OPS=new Set(["GTE","LTE","EQ","NEQ","CHANGED","TRUTHY"]);

function finite(v){
  if(v===null || v===undefined || v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function stable(value){
  if(value==null) return "null";
  if(Array.isArray(value)) return "["+value.map(stable).join(",")+"]";
  if(typeof value==="object"){
    return "{"+Object.keys(value).sort().map(function(k){return JSON.stringify(k)+":"+stable(value[k]);}).join(",")+"}";
  }
  return JSON.stringify(value);
}

function hashText(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return (h>>>0).toString(16).padStart(8,"0");
}

function getPath(obj,path){
  const parts=String(path||"").split(".").filter(Boolean);
  let cur=obj;
  for(const p of parts){
    if(cur==null || typeof cur!=="object" || !(p in cur)) return undefined;
    cur=cur[p];
  }
  return cur;
}

function conditionLabel(c){
  const lhs=String(c.path||"unknown");
  const op=String(c.op||"");
  if(op==="CHANGED") return lhs+" changed";
  if(op==="TRUTHY") return lhs+" true";
  return lhs+" "+op+" "+String(c.value);
}

export function sanitizeCondition(raw){
  if(!raw||typeof raw!=="object") return null;
  const path=String(raw.path||"").trim();
  const op=String(raw.op||"").toUpperCase();
  if(!path || !VALID_OPS.has(op)) return null;
  const out={path,op};
  if(!["CHANGED","TRUTHY"].includes(op)) out.value=raw.value;
  return out;
}

export function createAlert({
  id=null,
  symbol,
  type,
  conditions=[],
  mode="ALL",
  createdAt=Date.now(),
  expiresAt=null,
  cooldownMs=15*60*1000,
  enabled=true,
  once=false,
  label=""
}={}){
  const s=String(symbol||"").toUpperCase();
  const t=String(type||"").toUpperCase();
  if(!SYMBOL_RE.test(s)) throw new Error("invalid alert symbol");
  if(!ALERT_TYPES.includes(t)) throw new Error("invalid alert type");
  const clean=conditions.map(sanitizeCondition).filter(Boolean);
  if(!clean.length) throw new Error("alert conditions required");
  const m=String(mode||"ALL").toUpperCase()==="ANY"?"ANY":"ALL";
  const created=finite(createdAt);
  if(created==null||created<=0) throw new Error("invalid createdAt");
  const expiry=expiresAt==null?null:finite(expiresAt);
  const cooldown=Math.max(0,finite(cooldownMs)??0);
  const alertId=String(id||("a_"+created+"_"+hashText(s+t+stable(clean)).slice(0,6)));
  return {
    schemaVersion:2,
    id:alertId,
    symbol:s,
    type:t,
    label:String(label||"").slice(0,120),
    conditions:clean,
    mode:m,
    createdAt:created,
    expiresAt:expiry,
    cooldownMs:cooldown,
    enabled:Boolean(enabled),
    once:Boolean(once),
    lastFiredAt:null,
    lastFingerprint:null,
    previous:{}
  };
}

export function legacyPriceAlertToV2(raw){
  const symbol=String(raw?.symbol||"").toUpperCase();
  const target=finite(raw?.target);
  const direction=String(raw?.direction||"").toUpperCase();
  const createdAt=finite(raw?.createdAt);
  if(!SYMBOL_RE.test(symbol)||target==null||target<=0||!["ABOVE","BELOW"].includes(direction)||createdAt==null||createdAt<=0) return null;
  return createAlert({
    symbol,
    type:"PRICE",
    conditions:[{path:"market.price",op:direction==="ABOVE"?"GTE":"LTE",value:target}],
    createdAt,
    once:true,
    cooldownMs:0,
    label:"Price "+(direction==="ABOVE"?"≥":"≤")+" "+target
  });
}

export function sanitizeAlert(raw){
  if(!raw||typeof raw!=="object") return null;
  if(!raw.schemaVersion && Object.prototype.hasOwnProperty.call(raw,"target")) return legacyPriceAlertToV2(raw);
  if(Number(raw.schemaVersion)!==2) return null;
  try{
    const base=createAlert({
      id:raw.id,
      symbol:raw.symbol,
      type:raw.type,
      conditions:Array.isArray(raw.conditions)?raw.conditions:[],
      mode:raw.mode,
      createdAt:raw.createdAt,
      expiresAt:raw.expiresAt,
      cooldownMs:raw.cooldownMs,
      enabled:raw.enabled!==false,
      once:raw.once===true,
      label:raw.label
    });
    base.lastFiredAt=finite(raw.lastFiredAt);
    base.lastFingerprint=raw.lastFingerprint==null?null:String(raw.lastFingerprint);
    base.previous=(raw.previous&&typeof raw.previous==="object"&&!Array.isArray(raw.previous))?{...raw.previous}:{};
    return base;
  }catch{
    return null;
  }
}

function compareCondition(c,ctx,previous){
  const current=getPath(ctx,c.path);
  switch(c.op){
    case "GTE":{
      const a=finite(current),b=finite(c.value);
      return {match:a!=null&&b!=null&&a>=b,current};
    }
    case "LTE":{
      const a=finite(current),b=finite(c.value);
      return {match:a!=null&&b!=null&&a<=b,current};
    }
    case "EQ":
      return {match:String(current)===String(c.value),current};
    case "NEQ":
      return {match:current!==undefined&&String(current)!==String(c.value),current};
    case "TRUTHY":
      return {match:Boolean(current),current};
    case "CHANGED":{
      const had=Object.prototype.hasOwnProperty.call(previous,c.path);
      const before=previous[c.path];
      return {match:had&&stable(before)!==stable(current),current,before};
    }
    default:
      return {match:false,current};
  }
}

export function evaluateAlert(alert,context,{now=Date.now()}={}){
  const a=sanitizeAlert(alert);
  if(!a) return {triggered:false,reason:"INVALID_ALERT",alert:null};
  const t=finite(now)??Date.now();
  if(!a.enabled) return {triggered:false,reason:"DISABLED",alert:a};
  if(a.expiresAt!=null&&t>=a.expiresAt) return {triggered:false,reason:"EXPIRED",alert:{...a,enabled:false}};

  const checks=a.conditions.map(function(c){return {condition:c,...compareCondition(c,context,a.previous||{})};});
  const matched=a.mode==="ANY"?checks.some(function(x){return x.match;}):checks.every(function(x){return x.match;});
  const nextPrevious={...(a.previous||{})};
  for(const x of checks) nextPrevious[x.condition.path]=x.current;

  const fingerprint=hashText(stable({
    symbol:a.symbol,
    type:a.type,
    values:checks.map(function(x){
      const op=x.condition.op;
      return {
        path:x.condition.path,
        op,
        match:x.match,
        current:["CHANGED","EQ","NEQ"].includes(op)?x.current:undefined
      };
    })
  }));

  if(!matched){
    return {
      triggered:false,
      reason:"NO_MATCH",
      fingerprint,
      checks,
      alert:{...a,previous:nextPrevious,lastFingerprint:null}
    };
  }

  if(a.lastFiredAt!=null && t-a.lastFiredAt<a.cooldownMs){
    return {
      triggered:false,
      reason:"COOLDOWN",
      fingerprint,
      checks,
      alert:{...a,previous:nextPrevious}
    };
  }

  if(a.lastFingerprint===fingerprint && !a.once){
    return {
      triggered:false,
      reason:"DEDUPED",
      fingerprint,
      checks,
      alert:{...a,previous:nextPrevious}
    };
  }

  return {
    triggered:true,
    reason:"MATCH",
    fingerprint,
    checks,
    message:checks.filter(function(x){return x.match;}).map(function(x){return conditionLabel(x.condition);}).join(" AND "),
    alert:{
      ...a,
      previous:nextPrevious,
      lastFiredAt:t,
      lastFingerprint:fingerprint,
      enabled:a.once?false:a.enabled
    }
  };
}

export function formatAlert(alert){
  const a=sanitizeAlert(alert);
  if(!a) return "Invalid alert";
  const cond=a.conditions.map(conditionLabel).join(a.mode==="ANY"?" OR ":" AND ");
  return a.type+" · "+a.symbol.replace("USDT","/USDT")+" · "+cond+(a.enabled?"":" · disabled");
}

export function requiredContext(alert){
  const a=sanitizeAlert(alert);
  if(!a) return new Set();
  const out=new Set(["market"]);
  for(const c of a.conditions){
    const root=String(c.path).split(".")[0];
    if(root) out.add(root);
  }
  return out;
}


export const SETUP_PHASES=Object.freeze(["WATCHING","APPROACHING","BREAK_PENDING","CONFIRMED","RETEST","ENTRY_READY","INVALIDATED"]);
const SETUP_PHASE_RANK=Object.freeze(Object.fromEntries(SETUP_PHASES.map((p,i)=>[p,i])));

export function createSetupTransitionState({setupId,phase="WATCHING",now=Date.now(),expiresAt=null}={}){
  const id=String(setupId||"").trim(),p=String(phase||"WATCHING").toUpperCase();
  if(!id) throw new Error("setupId required");
  if(!(p in SETUP_PHASE_RANK)) throw new Error("invalid setup phase");
  return {setupId:id,phase:p,lastNotifiedPhase:null,updatedAt:Number(now),expiresAt:expiresAt==null?null:Number(expiresAt)};
}

export function advanceSetupTransition(state,nextPhase,{now=Date.now()}={}){
  const s=state&&typeof state==="object"?{...state}:null;
  if(!s?.setupId) throw new Error("setup transition state required");
  const next=String(nextPhase||"").toUpperCase(),t=Number(now);
  if(!(next in SETUP_PHASE_RANK)) throw new Error("invalid setup phase");
  if(s.expiresAt!=null&&Number.isFinite(Number(s.expiresAt))&&t>=Number(s.expiresAt)){
    const changed=s.phase!=="INVALIDATED";
    return {changed,notify:changed&&s.lastNotifiedPhase!=="INVALIDATED",reason:"EXPIRED",state:{...s,phase:"INVALIDATED",lastNotifiedPhase:changed?"INVALIDATED":s.lastNotifiedPhase,updatedAt:t}};
  }
  if(next!=="INVALIDATED"&&SETUP_PHASE_RANK[next]<SETUP_PHASE_RANK[s.phase]) return {changed:false,notify:false,reason:"REGRESSION_SUPPRESSED",state:{...s,updatedAt:t}};
  if(next===s.phase) return {changed:false,notify:false,reason:"DUPLICATE_PHASE",state:{...s,updatedAt:t}};
  const notify=!["WATCHING","BREAK_PENDING"].includes(next)&&s.lastNotifiedPhase!==next;
  return {changed:true,notify,reason:"PHASE_ADVANCED",state:{...s,phase:next,lastNotifiedPhase:notify?next:s.lastNotifiedPhase,updatedAt:t}};
}

export function formatSetupTransitionAlert({symbol,direction,phase,price,level,confidence=null,reasons=[],invalidation=null}={}){
  const sym=String(symbol||"").replace(/USDT$/,""),dir=String(direction||"").toUpperCase(),p=String(phase||"").toUpperCase();
  const title=p==="ENTRY_READY"?"SETUP BEREIT":p==="CONFIRMED"?"BREAK BESTÄTIGT":p==="RETEST"?"RETEST BESTÄTIGT":p==="INVALIDATED"?"SETUP INVALIDIERT":"SETUP UPDATE";
  const lines=["📍 "+sym+" · "+dir+" · "+title];
  if(Number.isFinite(Number(price))) lines.push("Preis: "+Number(price));
  if(Number.isFinite(Number(level))) lines.push("Level: "+Number(level));
  if(Number.isFinite(Number(confidence))) lines.push("Confidence: "+Math.round(Number(confidence)*100)+"%");
  const clean=(Array.isArray(reasons)?reasons:[]).map(x=>String(x).trim()).filter(Boolean).slice(0,4);
  if(clean.length) lines.push("Bestätigung: "+clean.join(" · "));
  if(Number.isFinite(Number(invalidation))) lines.push("Invalidation: "+Number(invalidation));
  return lines.join("\n");
}
