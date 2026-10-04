export const BIGGJ_SAFETY_INVARIANTS = Object.freeze({
  mode: 'SHADOW_ONLY',
  abstainEnabled: true,
  canExecute: false,
  canExecuteLive: false,
  automaticProductionPromotion: false,
});

export const BIGGJ_SYSTEMS = Object.freeze({
  CONTROL: 'control',
  DATA: 'data',
  LIVE_BRAIN: 'live-brain',
  RESEARCH: 'research',
  WORLD: 'world',
  WALLET: 'wallet',
  EXPERIENCE: 'experience',
});

export const BIGGJ_SYSTEM_DEFAULTS = Object.freeze({
  [BIGGJ_SYSTEMS.CONTROL]: { critical: true, memoryBudgetMb: 96, concurrency: 1 },
  [BIGGJ_SYSTEMS.DATA]: { critical: true, memoryBudgetMb: 160, concurrency: 2 },
  [BIGGJ_SYSTEMS.LIVE_BRAIN]: { critical: true, memoryBudgetMb: 160, concurrency: 1 },
  [BIGGJ_SYSTEMS.RESEARCH]: { critical: false, memoryBudgetMb: 320, concurrency: 1 },
  [BIGGJ_SYSTEMS.WORLD]: { critical: false, memoryBudgetMb: 256, concurrency: 1 },
  [BIGGJ_SYSTEMS.WALLET]: { critical: false, memoryBudgetMb: 192, concurrency: 1 },
  [BIGGJ_SYSTEMS.EXPERIENCE]: { critical: false, memoryBudgetMb: 128, concurrency: 1 },
});

export function assertBiggjSafetyInvariants(candidate = BIGGJ_SAFETY_INVARIANTS) {
  if (candidate?.mode !== 'SHADOW_ONLY') throw new Error('BIGGJ_SAFETY_MODE_VIOLATION');
  if (candidate?.abstainEnabled !== true) throw new Error('BIGGJ_ABSTAIN_MUST_REMAIN_ENABLED');
  if (candidate?.canExecute !== false) throw new Error('BIGGJ_EXECUTION_MUST_REMAIN_DISABLED');
  if (candidate?.canExecuteLive !== false) throw new Error('BIGGJ_LIVE_EXECUTION_MUST_REMAIN_DISABLED');
  if (candidate?.automaticProductionPromotion !== false) throw new Error('BIGGJ_AUTO_PROMOTION_MUST_REMAIN_DISABLED');
  return true;
}

export function createSystemEnvelope({ system, type, payload = null, correlationId = null, evidenceId = null, ts = Date.now() }) {
  if (!Object.values(BIGGJ_SYSTEMS).includes(system)) throw new Error(`UNKNOWN_BIGGJ_SYSTEM:${system}`);
  if (!type) throw new Error('BIGGJ_EVENT_TYPE_REQUIRED');
  return Object.freeze({
    schema: 'biggj.system-envelope.v1',
    system,
    type,
    ts,
    correlationId,
    evidenceId,
    payload,
    safety: BIGGJ_SAFETY_INVARIANTS,
  });
}
