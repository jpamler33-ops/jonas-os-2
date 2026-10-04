import { BIGGJ_SAFETY_INVARIANTS, BIGGJ_SYSTEM_DEFAULTS, BIGGJ_SYSTEMS, assertBiggjSafetyInvariants } from './biggj-system-contract.mjs';

const now = () => Date.now();

export function createBiggjSystemSupervisor({ config = BIGGJ_SYSTEM_DEFAULTS, staleAfterMs = 90_000 } = {}) {
  assertBiggjSafetyInvariants(BIGGJ_SAFETY_INVARIANTS);
  const state = new Map();

  for (const [system, policy] of Object.entries(config)) {
    state.set(system, {
      system,
      policy: { ...policy },
      status: 'BOOTING',
      lastHeartbeatAt: 0,
      memoryMb: 0,
      queueDepth: 0,
      evidenceDelta: 0,
      informationGain: 0,
      blockedReason: null,
    });
  }

  function heartbeat(system, patch = {}) {
    const current = state.get(system);
    if (!current) throw new Error(`UNKNOWN_BIGGJ_SYSTEM:${system}`);
    const memoryMb = Number(patch.memoryMb ?? current.memoryMb ?? 0);
    const overBudget = memoryMb > Number(current.policy.memoryBudgetMb || Infinity);
    const next = {
      ...current,
      ...patch,
      memoryMb,
      lastHeartbeatAt: now(),
      status: overBudget ? 'DEGRADED' : (patch.status || 'HEALTHY'),
      blockedReason: overBudget ? 'MEMORY_BUDGET_EXCEEDED' : (patch.blockedReason ?? null),
    };
    state.set(system, next);
    return snapshot(system);
  }

  function snapshot(system) {
    const current = state.get(system);
    if (!current) return null;
    const stale = current.lastHeartbeatAt > 0 && now() - current.lastHeartbeatAt > staleAfterMs;
    return { ...current, stale, status: stale ? 'STALE' : current.status };
  }

  function health() {
    assertBiggjSafetyInvariants(BIGGJ_SAFETY_INVARIANTS);
    const systems = [...state.keys()].map(snapshot);
    const criticalBad = systems.some((item) => item.policy.critical && !['HEALTHY', 'BOOTING'].includes(item.status));
    const degraded = systems.some((item) => !['HEALTHY', 'BOOTING'].includes(item.status));
    return {
      schema: 'biggj.system-health.v1',
      status: criticalBad ? 'BLOCKED' : degraded ? 'DEGRADED' : 'HEALTHY',
      safety: BIGGJ_SAFETY_INVARIANTS,
      systems,
    };
  }

  function canSchedule(system, { estimatedMemoryMb = 0, expectedInformationGain = 0 } = {}) {
    const current = snapshot(system);
    if (!current) return { allowed: false, reason: 'UNKNOWN_SYSTEM' };
    if (current.status === 'STALE') return { allowed: false, reason: 'STALE_SYSTEM' };
    if (current.blockedReason) return { allowed: false, reason: current.blockedReason };
    if (Number(current.memoryMb) + Number(estimatedMemoryMb) > Number(current.policy.memoryBudgetMb)) {
      return { allowed: false, reason: 'MEMORY_BUDGET' };
    }
    if (!current.policy.critical && Number(expectedInformationGain) <= 0) {
      return { allowed: false, reason: 'NO_EXPECTED_INFORMATION_GAIN' };
    }
    return { allowed: true, reason: 'OK' };
  }

  return { heartbeat, snapshot, health, canSchedule };
}

export function recommendedIsolationOrder() {
  return [
    BIGGJ_SYSTEMS.RESEARCH,
    BIGGJ_SYSTEMS.WORLD,
    BIGGJ_SYSTEMS.EXPERIENCE,
    BIGGJ_SYSTEMS.WALLET,
    BIGGJ_SYSTEMS.DATA,
    BIGGJ_SYSTEMS.LIVE_BRAIN,
  ];
}
