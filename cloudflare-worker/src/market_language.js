import { fnv1a64 } from "./version_manifest.js";

function n(x){const v=Number(x);return Number.isFinite(v)?v:null;}
function bucket(x,cuts,labels){
  const v=n(x);
  if(v===null)return"U";
  for(let i=0;i<cuts.length;i++) if(v<cuts[i]) return labels[i];
  return labels[labels.length-1];
}
function signBucket(x,small=0.0005,large=0.003){
  const v=n(x);
  if(v===null)return"U";
  if(v<=-large)return"DN2";
  if(v<=-small)return"DN1";
  if(v<small)return"FLAT";
  if(v<large)return"UP1";
  return"UP2";
}
function compact(label){return String(label||"U").replace(/[^A-Z0-9_+-]/gi,"").slice(0,20)||"U";}

export const MARKET_LANGUAGE_VERSION="1.0.0";

export function tokenizeMarket(genome={},extension={},macroRisk={}) {
  const direction=signBucket(genome.ret_15m,0.0008,0.004);
  const vol=bucket(genome.atr_pct,[0.0015,0.0035,0.007],["VLOW","VNORM","VHIGH","VEXT"]);
  const volume=bucket(genome.volume_ratio,[0.8,1.3,2.0],["VOLLO","VOLN","VOLHI","VOLX"]);
  const leverage=signBucket(genome.oi_change,0.0015,0.006);
  const flow=bucket(genome.flow_delta_ratio,[-0.2,0.2],["SELL","BAL","BUY"]);
  const liq=bucket(genome.liq_imbalance,[-0.25,0.25],["SELL_LIQ","BAL_LIQ","BUY_LIQ"]);
  const agreement=bucket(genome.agreement,[0.60,0.80],["CONFLICT","MIXED","ALIGNED"]);
  const novelty=bucket(genome.novelty,[0.35,0.70],["KNOWN","EDGE","NOVEL"]);
  const quality=bucket(genome.data_quality,[75,90],["QLOW","QOK","QHIGH"]);
  const premium=bucket(extension.coinbase_premium_bps,[-2,2],["CB_NEG","CB_FLAT","CB_POS"]);
  const basis=bucket(extension.perp_spot_basis_bps,[-3,3],["BAS_NEG","BAS_FLAT","BAS_POS"]);
  const depth=bucket(extension.depth_imbalance_01,[-0.15,0.15],["DEPTH_ASK","DEPTH_BAL","DEPTH_BID"]);
  const optionsSkew=bucket(extension.options_skew_30d,[-2,2],["CALL_SKEW","SKEW_FLAT","PUT_SKEW"]);
  const usd=bucket(extension.usd_change,[-0.002,0.002],["USD_DN","USD_FLAT","USD_UP"]);
  const macro=macroRisk?.active?"MACRO_LOCK":"MACRO_CLEAR";

  const components={
    direction,vol,volume,leverage,flow,liq,agreement,novelty,quality,
    premium,basis,depth,optionsSkew,usd,macro
  };
  const grammar=[
    direction,vol,leverage,flow,liq,agreement,premium,basis,depth,optionsSkew,macro
  ].map(compact).join("·");
  const tokenId="MT-"+fnv1a64(MARKET_LANGUAGE_VERSION+"|"+grammar).slice(0,12).toUpperCase();

  return {
    version:MARKET_LANGUAGE_VERSION,
    tokenId,
    grammar,
    components,
    compression:{
      rawDimensions:Object.values({...genome,...extension}).filter(v=>typeof v==="number"&&Number.isFinite(v)).length,
      tokenDimensions:Object.keys(components).length
    }
  };
}

export function sequenceKey(tokens,length=4){
  const xs=(tokens||[]).slice(-Math.max(2,Math.min(8,Number(length||4))));
  return xs.map(x=>x.token_id||x.tokenId).filter(Boolean).join(">");
}

export function transitionTension(tokens){
  const xs=(tokens||[]).slice(-12);
  if(xs.length<4)return{score:null,status:"LEARNING",switchRate:null,uniqueRatio:null};
  let switches=0;
  for(let i=1;i<xs.length;i++) if(xs[i].token_id!==xs[i-1].token_id)switches++;
  const switchRate=switches/(xs.length-1);
  const uniqueRatio=new Set(xs.map(x=>x.token_id)).size/xs.length;
  const score=Math.min(1,0.65*switchRate+0.35*uniqueRatio);
  return {
    score,
    switchRate,
    uniqueRatio,
    status:score>=0.78?"PHASE_TRANSITION":score>=0.55?"TENSION_BUILDING":"STABLE"
  };
}
