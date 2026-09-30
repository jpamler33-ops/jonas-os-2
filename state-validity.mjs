import { canonicalJson, sha256 } from "./institutional-kernel.mjs";

export const STATE_VALIDITY_VERSION="TCX_STATE_VALIDITY_V1";

export const DEFAULT_STATE_VALIDITY_CONFIG=Object.freeze({
  staleAfterMs:10*60*1000,
  expireAfterMs:30*60*1000,
  driftThreshold:0.28,
  strongWitnessContradictionAgreement:0.50,
  highEngineContradiction:0.50
});

function clamp(x,a=0,b=1){
  const n=Number(x);
  return Number.isFinite(n)?Math.max(a,Math.min(b,n)):a;
}

function finite(x){
  const n=Number(x);
  return Number.isFinite(n)?n:null;
}

function quantize(x,step){
  const n=finite(x);
  if(n==null) return null;
  return Math.round(n/step)*step;
}

function upper(x,fallback="UNKNOWN"){
  const s=String(x??"").trim().toUpperCase();
  return s||fallback;
}

function direction(x){
  const s=upper(x,"NEUTRAL");
  if(["BULLISH","UP","BID_PRESSURE"].includes(s)) return "BULLISH";
  if(["BEARISH","DOWN","ASK_PRESSURE"].includes(s)) return "BEARISH";
  return "NEUTRAL";
}

function isDirectionalFlip(a,b){
  const x=direction(a),y=direction(b);
  return (x==="BULLISH"&&y==="BEARISH")||(x==="BEARISH"&&y==="BULLISH");
}

function normalizedDelta(a,b,scale){
  const x=finite(a),y=finite(b);
  if(x==null||y==null) return 0;
  return clamp(Math.abs(y-x)/scale);
}

function priceMovePct(anchor,current){
  const a=finite(anchor),b=finite(current);
  if(a==null||b==null||a<=0||b<=0) return 0;
  return Math.abs(Math.log(b/a))*100;
}

function stateCore(symbol,ctx={}){
  return {
    schemaVersion:1,
    symbol:upper(symbol),
    state:{
      regime:upper(ctx.state?.regime),
      mtfBias:upper(ctx.state?.mtfBias),
      structure:upper(ctx.state?.structure),
      structureKey:String(ctx.state?.structureKey||"UNKNOWN"),
      liquidity:upper(ctx.state?.liquidity),
      flow:upper(ctx.state?.flow),
      pressureBucket:quantize(ctx.state?.pressure,5)
    },
    witness:{
      agreementBucket:quantize(clamp(ctx.witness?.agreement),0.05),
      contradiction:ctx.witness?.contradiction===true,
      satisfied:ctx.witness?.satisfied===true,
      externalCount:Math.max(0,Math.round(finite(ctx.witness?.externalCount)||0))
    },
    memory:{
      supportBucket:Math.max(0,Math.round((finite(ctx.memory?.support)||0)/2)*2),
      sufficient:ctx.memory?.sufficient===true,
      noveltyBucket:quantize(clamp(ctx.memory?.novelty),0.05)
    },
    engine:{
      evidenceBucket:quantize(clamp(ctx.engine?.evidenceStrength),0.05),
      contradictionBucket:quantize(clamp(ctx.engine?.contradiction),0.05),
      coherenceBucket:quantize(clamp(ctx.engine?.coherence),0.05),
      gate:upper(ctx.engine?.gate)
    },
    safety:{
      state:upper(ctx.safety?.state),
      canResearch:ctx.safety?.canResearch===true
    }
  };
}

export function createStateFingerprint(symbol,ctx={}){
  const core=stateCore(symbol,ctx);
  return {
    version:STATE_VALIDITY_VERSION,
    capturedAt:finite(ctx.capturedAt)||Date.now(),
    anchorPrice:finite(ctx.market?.price),
    core,
    hash:sha256(canonicalJson(core))
  };
}

export function validateStateFingerprint(fp){
  if(!fp||typeof fp!=="object") return false;
  if(fp.version!==STATE_VALIDITY_VERSION) return false;
  if(!fp.core||typeof fp.core!=="object") return false;
  if(!Number.isFinite(Number(fp.capturedAt))||Number(fp.capturedAt)<=0) return false;
  if(typeof fp.hash!=="string"||fp.hash.length!==64) return false;
  return fp.hash===sha256(canonicalJson(fp.core));
}

function reason(code,weight,detail){
  return {code,weight:Number(weight)||0,detail:String(detail||"")};
}

export function compareStateFingerprints(baseline,current,{
  config=DEFAULT_STATE_VALIDITY_CONFIG
}={}){
  if(!validateStateFingerprint(baseline)) throw new Error("invalid baseline fingerprint");
  if(!validateStateFingerprint(current)) throw new Error("invalid current fingerprint");
  if(baseline.core.symbol!==current.core.symbol) throw new Error("fingerprint symbol mismatch");

  const a=baseline.core,b=current.core;
  const reasons=[];
  const hardReasons=[];
  let drift=0;

  function categorical(code,x,y,weight){
    if(String(x)!==String(y)){
      drift+=weight;
      reasons.push(reason(code,weight,String(x)+" -> "+String(y)));
    }
  }

  categorical("REGIME_CHANGED",a.state.regime,b.state.regime,0.15);
  categorical("MTF_BIAS_CHANGED",a.state.mtfBias,b.state.mtfBias,0.12);
  categorical("STRUCTURE_CHANGED",a.state.structure,b.state.structure,0.12);
  categorical("STRUCTURE_KEY_CHANGED",a.state.structureKey,b.state.structureKey,0.08);
  categorical("LIQUIDITY_CHANGED",a.state.liquidity,b.state.liquidity,0.06);
  categorical("FLOW_CHANGED",a.state.flow,b.state.flow,0.08);
  categorical("WITNESS_SATISFACTION_CHANGED",a.witness.satisfied,b.witness.satisfied,0.05);
  categorical("ENGINE_GATE_CHANGED",a.engine.gate,b.engine.gate,0.06);
  categorical("SAFETY_STATE_CHANGED",a.safety.state,b.safety.state,0.08);

  const move=priceMovePct(baseline.anchorPrice,current.anchorPrice);
  const priceComponent=0.08*clamp(move/2);
  if(priceComponent>0){
    drift+=priceComponent;
    reasons.push(reason("PRICE_DRIFT",priceComponent,move.toFixed(3)+"%"));
  }

  const witnessDelta=normalizedDelta(
    a.witness.agreementBucket,b.witness.agreementBucket,0.25
  );
  if(witnessDelta>0){
    const w=0.05*witnessDelta;
    drift+=w;
    reasons.push(reason("WITNESS_AGREEMENT_DRIFT",w,witnessDelta.toFixed(3)));
  }

  const noveltyDelta=normalizedDelta(
    a.memory.noveltyBucket,b.memory.noveltyBucket,0.35
  );
  if(noveltyDelta>0){
    const w=0.04*noveltyDelta;
    drift+=w;
    reasons.push(reason("NOVELTY_DRIFT",w,noveltyDelta.toFixed(3)));
  }

  const contradictionDelta=normalizedDelta(
    a.engine.contradictionBucket,b.engine.contradictionBucket,0.25
  );
  if(contradictionDelta>0){
    const w=0.04*contradictionDelta;
    drift+=w;
    reasons.push(reason("CONTRADICTION_DRIFT",w,contradictionDelta.toFixed(3)));
  }

  const evidenceDelta=normalizedDelta(
    a.engine.evidenceBucket,b.engine.evidenceBucket,0.25
  );
  if(evidenceDelta>0){
    const w=0.04*evidenceDelta;
    drift+=w;
    reasons.push(reason("EVIDENCE_STRENGTH_DRIFT",w,evidenceDelta.toFixed(3)));
  }

  if(b.safety.state==="SAFE_STOP" || (a.safety.canResearch && !b.safety.canResearch)){
    hardReasons.push("RESEARCH_SAFETY_INVALIDATED");
  }
  if(isDirectionalFlip(a.state.structure,b.state.structure)){
    hardReasons.push("STRUCTURE_DIRECTION_FLIP");
  }
  if(isDirectionalFlip(a.state.mtfBias,b.state.mtfBias)){
    hardReasons.push("MTF_DIRECTION_FLIP");
  }
  if(a.state.regime!=="STRESS" && b.state.regime==="STRESS"){
    hardReasons.push("REGIME_ENTERED_STRESS");
  }
  if(
    !a.witness.contradiction &&
    b.witness.contradiction &&
    Number(b.witness.agreementBucket||0)<Number(config.strongWitnessContradictionAgreement)
  ){
    hardReasons.push("STRONG_WITNESS_CONTRADICTION");
  }
  if(
    Number(a.engine.contradictionBucket||0)<=0.25 &&
    Number(b.engine.contradictionBucket||0)>=Number(config.highEngineContradiction)
  ){
    hardReasons.push("ENGINE_CONTRADICTION_BREAK");
  }

  return {
    sameHash:baseline.hash===current.hash,
    driftScore:clamp(drift),
    changedDimensions:reasons.length,
    reasons:reasons.sort((x,y)=>y.weight-x.weight),
    hardReasons:[...new Set(hardReasons)],
    priceMovePct:move
  };
}

export function assessResearchValidity({
  baseline,
  current,
  currentContext=null,
  now=Date.now(),
  config=DEFAULT_STATE_VALIDITY_CONFIG
}={}){
  const base=baseline;
  const cur=current || createStateFingerprint(base?.core?.symbol,currentContext||{});
  if(!validateStateFingerprint(base)) throw new Error("invalid baseline fingerprint");
  if(!validateStateFingerprint(cur)) throw new Error("invalid current fingerprint");

  const ageMs=Math.max(0,Number(now)-Number(base.capturedAt));
  const cmp=compareStateFingerprints(base,cur,{config});

  let status="VALID";
  if(cmp.hardReasons.length) status="INVALIDATED";
  else if(ageMs>=Number(config.expireAfterMs)) status="EXPIRED";
  else if(cmp.driftScore>=Number(config.driftThreshold)) status="DRIFTED";
  else if(ageMs>=Number(config.staleAfterMs)) status="STALE";

  return {
    version:STATE_VALIDITY_VERSION,
    status,
    baselineHash:base.hash,
    currentHash:cur.hash,
    ageMs,
    staleAfterMs:Number(config.staleAfterMs),
    expireAfterMs:Number(config.expireAfterMs),
    driftThreshold:Number(config.driftThreshold),
    ...cmp,
    validForResearch:status==="VALID"||status==="STALE",
    reusableWithoutRefresh:status==="VALID",
    canExecute:false,
    execution:"SHADOW_ONLY"
  };
}

export function formatValidityReason(result,{limit=4}={}){
  if(!result||typeof result!=="object") return [];
  const hard=(result.hardReasons||[]).map(x=>"HARD "+x);
  const soft=(result.reasons||[])
    .slice(0,Math.max(0,limit-hard.length))
    .map(x=>x.code+" ("+Math.round(Number(x.weight||0)*100)+"%)");
  return [...hard,...soft].slice(0,limit);
}
