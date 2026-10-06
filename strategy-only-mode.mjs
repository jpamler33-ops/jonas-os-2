export const STRATEGY_ONLY_MODE_VERSION='BIGGJ_STRATEGY_ONLY_V1';

const truthy=new Set(['1','true','yes','on']);

export function strategyOnlyModeFromEnv(env=process.env){
  const raw=String(env.TCX_STRATEGY_ONLY_MODE??'true').trim().toLowerCase();
  const enabled=truthy.has(raw);
  return Object.freeze({
    version:STRATEGY_ONLY_MODE_VERSION,
    enabled,
    activeStrategy:enabled?'W6_USER_99K_60S':'FULL_RESEARCH_STACK',
    disabledWhenEnabled:Object.freeze([
      'AUTONOMOUS_SHADOW_TRADER',
      'COVERAGE_CURRICULUM',
      'MANDATORY_DISCOVERY',
      'LEARNED_CHALLENGERS',
      'STRATEGY_LEAGUE',
      'PARALLEL_STRATEGY_WORLDS',
      'FORECAST_SHADOW_COMPETITION',
      'FEATURE_RESEARCH',
      'INDICATOR_EVOLUTION',
      'MODEL_PROMOTION_REVIEW',
      'BIGGJ_LIVING_RESEARCH',
      'WORLD_MODEL_RESEARCH'
    ]),
    preserve:Object.freeze([
      'W6_USER_99K_60S',
      'W6_DISCOVERY_FEEDS',
      'W6_EXECUTABLE_PNL_RESEARCH',
      'SHADOW_PERSISTENCE',
      'OBSERVABILITY',
      'HEALTH_ENDPOINTS'
    ]),
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false,
    automaticProductionPromotion:false
  });
}

export const STRATEGY_ONLY_MODE=strategyOnlyModeFromEnv();

export function allowStrategyOnlySubsystem(name,policy=STRATEGY_ONLY_MODE){
  if(!policy?.enabled)return true;
  return !policy.disabledWhenEnabled.includes(String(name||''));
}

export function strategyOnlySafetyInvariant(policy=STRATEGY_ONLY_MODE){
  return policy?.execution==='SHADOW_ONLY'&&policy?.canExecute===false&&policy?.canExecuteLive===false&&policy?.automaticProductionPromotion===false;
}
