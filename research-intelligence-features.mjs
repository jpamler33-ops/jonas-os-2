export const RESEARCH_INTELLIGENCE_FEATURES_VERSION='TCX_RESEARCH_INTELLIGENCE_FEATURES_V1';

function finite(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function clamp(v,min=-1,max=1){
  return Math.max(min,Math.min(max,Number(v)));
}
function tanh(v){
  const n=finite(v);
  return n==null?null:Math.tanh(n);
}
function centeredRatio(v,scale=1){
  const n=finite(v);
  if(n==null||n<=0) return null;
  return Math.tanh(Math.log(n)*scale);
}
function mean(values,{minCount=1}={}){
  const xs=(values||[]).map(finite).filter(x=>x!=null);
  if(xs.length<minCount) return null;
  return xs.reduce((a,b)=>a+b,0)/xs.length;
}
function featureMap(rows){
  const out=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    const id=String(row?.id||'');
    const value=finite(row?.value);
    const availableAt=finite(row?.availableAt);
    if(!id||value==null||availableAt==null) continue;
    const prior=out.get(id);
    if(!prior||availableAt>=prior.availableAt){
      out.set(id,{id,value,availableAt,source:String(row?.source||'UNKNOWN')});
    }
  }
  return out;
}
function derive(out,map,id,value,inputIds){
  const n=finite(value);
  if(n==null) return;
  const inputs=(inputIds||[]).map(x=>map.get(x)).filter(Boolean);
  if(!inputs.length) return;
  out.push(Object.freeze({
    id,
    value:n,
    availableAt:Math.max(...inputs.map(x=>x.availableAt)),
    source:RESEARCH_INTELLIGENCE_FEATURES_VERSION
  }));
}

export const EXTERNAL_RESEARCH_FEATURE_EXPERIMENTS=Object.freeze([
  Object.freeze({
    id:'COINMETRICS_ACTIVITY',
    label:'Coin Metrics Network Activity',
    featureIds:Object.freeze([
      'research.coinmetrics.activeAddressesChange1d',
      'research.coinmetrics.newAddressesLog',
      'research.coinmetrics.txCountLog'
    ])
  }),
  Object.freeze({
    id:'COINMETRICS_MVRV',
    label:'Coin Metrics MVRV State',
    featureIds:Object.freeze([
      'research.coinmetrics.mvrv',
      'research.coinmetrics.mvrvChange1d'
    ])
  }),
  Object.freeze({
    id:'DERIBIT_OPTIONS_POSITIONING',
    label:'Deribit Options Positioning',
    featureIds:Object.freeze([
      'research.options.putCallOiRatio',
      'research.options.putCallIvSkewPct'
    ])
  }),
  Object.freeze({
    id:'DERIBIT_OPTIONS_VOLATILITY',
    label:'Deribit Options Volatility',
    featureIds:Object.freeze(['research.options.weightedIvPct'])
  }),
  Object.freeze({
    id:'DERIBIT_OPTIONS_ACTIVITY',
    label:'Deribit Options Activity',
    featureIds:Object.freeze([
      'research.options.openInterestLog',
      'research.options.volumeUsdLog'
    ])
  }),
  Object.freeze({
    id:'MACRO_RATES',
    label:'Macro Rates State',
    featureIds:Object.freeze([
      'research.macro.fedFundsPct',
      'research.macro.us10yPct',
      'research.macro.us10yMinusFedFundsPct'
    ])
  }),
  Object.freeze({
    id:'MACRO_DOLLAR',
    label:'Broad Dollar Index',
    featureIds:Object.freeze(['research.macro.broadDollarIndex'])
  }),
  Object.freeze({
    id:'MACRO_FED_BALANCE_SHEET',
    label:'Federal Reserve Balance Sheet',
    featureIds:Object.freeze(['research.macro.fedAssetsLog'])
  })
]);

export const PREDICTION_MARKET_RESEARCH_EXPERIMENTS=Object.freeze([
  Object.freeze({
    id:'PREDICTION_MARKET_PROBABILITY',
    label:'Configured Prediction Market Probability',
    featureIds:Object.freeze([
      'research.prediction.yesProbability',
      'research.prediction.confidenceFromHalf'
    ])
  })
]);

export const DERIVED_INTELLIGENCE_RESEARCH_EXPERIMENTS=Object.freeze([
  Object.freeze({
    id:'INTEL_LEVERAGE_CROWDING',
    label:'Derived Leverage Crowding',
    featureIds:Object.freeze(['research.intelligence.leverageCrowding'])
  }),
  Object.freeze({
    id:'INTEL_OPEN_INTEREST_EXPANSION',
    label:'Derived Open Interest Expansion',
    featureIds:Object.freeze(['research.intelligence.openInterestExpansion'])
  }),
  Object.freeze({
    id:'INTEL_SQUEEZE_STATE',
    label:'Derived Squeeze State',
    featureIds:Object.freeze([
      'research.intelligence.squeezeRisk',
      'research.intelligence.squeezeDirection'
    ])
  }),
  Object.freeze({
    id:'INTEL_NETWORK_ACTIVITY',
    label:'Derived Network Activity Impulse',
    featureIds:Object.freeze(['research.intelligence.networkActivityImpulse'])
  }),
  Object.freeze({
    id:'INTEL_VALUATION_STRETCH',
    label:'Derived MVRV Valuation Stretch',
    featureIds:Object.freeze(['research.intelligence.valuationStretch'])
  }),
  Object.freeze({
    id:'INTEL_OPTIONS_DOWNSIDE',
    label:'Derived Options Downside Pressure',
    featureIds:Object.freeze(['research.intelligence.optionsDownsidePressure'])
  }),
  Object.freeze({
    id:'INTEL_OPTIONS_VOLATILITY',
    label:'Derived Options Volatility State',
    featureIds:Object.freeze(['research.intelligence.optionsVolatilityState'])
  }),
  Object.freeze({
    id:'INTEL_MACRO_CURVE_STRESS',
    label:'Derived Macro Curve Stress',
    featureIds:Object.freeze(['research.intelligence.macroCurveStress'])
  }),
  Object.freeze({
    id:'INTEL_CROSS_DOMAIN_STRESS',
    label:'Derived Cross-Domain Stress',
    featureIds:Object.freeze(['research.intelligence.crossDomainStress'])
  })
]);

export function buildDerivedResearchIntelligenceFeatures(rows){
  const map=featureMap(rows);
  const out=[];

  const funding=map.get('research.derivatives.fundingRate')?.value;
  const longShort=map.get('research.derivatives.globalLongShortRatio')?.value;
  const taker=map.get('research.derivatives.takerBuySellRatio')?.value;
  const oiDelta=map.get('research.derivatives.openInterestDelta5m')?.value;
  const liqImbalance=map.get('research.liquidation.imbalance5m')?.value;

  const fundingCrowding=finite(funding)==null?null:tanh(Number(funding)*5000);
  const longShortCrowding=centeredRatio(longShort,1);
  const takerCrowding=centeredRatio(taker,1);
  const leverageCrowding=mean([fundingCrowding,longShortCrowding,takerCrowding],{minCount:2});
  derive(out,map,'research.intelligence.leverageCrowding',leverageCrowding,[
    'research.derivatives.fundingRate',
    'research.derivatives.globalLongShortRatio',
    'research.derivatives.takerBuySellRatio'
  ]);

  const openInterestExpansion=finite(oiDelta)==null?null:tanh(Number(oiDelta)*20);
  derive(out,map,'research.intelligence.openInterestExpansion',openInterestExpansion,[
    'research.derivatives.openInterestDelta5m'
  ]);

  const squeezeComponents=[
    leverageCrowding==null?null:Math.abs(leverageCrowding),
    openInterestExpansion==null?null:Math.max(0,openInterestExpansion),
    finite(liqImbalance)==null?null:Math.abs(Number(liqImbalance))
  ];
  const squeezeRisk=mean(squeezeComponents,{minCount:2});
  derive(out,map,'research.intelligence.squeezeRisk',squeezeRisk==null?null:clamp(squeezeRisk,0,1),[
    'research.derivatives.fundingRate',
    'research.derivatives.globalLongShortRatio',
    'research.derivatives.takerBuySellRatio',
    'research.derivatives.openInterestDelta5m',
    'research.liquidation.imbalance5m'
  ]);
  const squeezeDirection=squeezeRisk==null||leverageCrowding==null
    ?null
    :-Math.sign(leverageCrowding)*squeezeRisk;
  derive(out,map,'research.intelligence.squeezeDirection',squeezeDirection,[
    'research.derivatives.fundingRate',
    'research.derivatives.globalLongShortRatio',
    'research.derivatives.takerBuySellRatio',
    'research.derivatives.openInterestDelta5m',
    'research.liquidation.imbalance5m'
  ]);

  const activeChange=map.get('research.coinmetrics.activeAddressesChange1d')?.value;
  const networkActivityImpulse=finite(activeChange)==null?null:tanh(Number(activeChange)*5);
  derive(out,map,'research.intelligence.networkActivityImpulse',networkActivityImpulse,[
    'research.coinmetrics.activeAddressesChange1d'
  ]);

  const mvrv=map.get('research.coinmetrics.mvrv')?.value;
  const valuationStretch=finite(mvrv)!=null&&Number(mvrv)>0?tanh(Math.log(Number(mvrv))):null;
  derive(out,map,'research.intelligence.valuationStretch',valuationStretch,[
    'research.coinmetrics.mvrv'
  ]);

  const putCall=map.get('research.options.putCallOiRatio')?.value;
  const skew=map.get('research.options.putCallIvSkewPct')?.value;
  const optionsDownsidePressure=mean([
    centeredRatio(putCall,1),
    finite(skew)==null?null:tanh(Number(skew)/25)
  ],{minCount:1});
  derive(out,map,'research.intelligence.optionsDownsidePressure',optionsDownsidePressure,[
    'research.options.putCallOiRatio',
    'research.options.putCallIvSkewPct'
  ]);

  const iv=map.get('research.options.weightedIvPct')?.value;
  const optionsVolatilityState=finite(iv)!=null&&Number(iv)>0?tanh(Math.log(Number(iv)/50)):null;
  derive(out,map,'research.intelligence.optionsVolatilityState',optionsVolatilityState,[
    'research.options.weightedIvPct'
  ]);

  const curve=map.get('research.macro.us10yMinusFedFundsPct')?.value;
  const macroCurveStress=finite(curve)==null?null:tanh(-Number(curve)/2);
  derive(out,map,'research.intelligence.macroCurveStress',macroCurveStress,[
    'research.macro.us10yMinusFedFundsPct'
  ]);

  const crossDomainStress=mean([
    squeezeRisk,
    optionsDownsidePressure==null?null:Math.abs(optionsDownsidePressure),
    macroCurveStress==null?null:Math.abs(macroCurveStress)
  ],{minCount:2});
  derive(out,map,'research.intelligence.crossDomainStress',crossDomainStress==null?null:clamp(crossDomainStress,0,1),[
    'research.derivatives.fundingRate',
    'research.derivatives.globalLongShortRatio',
    'research.derivatives.takerBuySellRatio',
    'research.derivatives.openInterestDelta5m',
    'research.liquidation.imbalance5m',
    'research.options.putCallOiRatio',
    'research.options.putCallIvSkewPct',
    'research.macro.us10yMinusFedFundsPct'
  ]);

  return Object.freeze(out.sort((a,b)=>a.id.localeCompare(b.id)));
}

export function researchIntelligenceSnapshot(rows){
  const features=buildDerivedResearchIntelligenceFeatures(rows);
  return Object.freeze({
    version:RESEARCH_INTELLIGENCE_FEATURES_VERSION,
    featureCount:features.length,
    features,
    researchOnly:true,
    mayExecute:false,
    productionMutationAllowed:false
  });
}
