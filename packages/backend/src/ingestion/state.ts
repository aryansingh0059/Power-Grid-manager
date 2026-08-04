import type { TelemetryMessage } from '@pgm/shared';

export interface DeviceStateSnapshot {
  deviceId: string;
  bootCount: number;
  lastSeq: number | null;
  lastSeenAt: Date | null;
  lastBootAt?: Date | null;
}

export interface IngestionDecision {
  /** The assigned boot generation count for this message. */
  assignedBootCount: number;
  /** True if this message is a duplicate of a previously ingested sequence in this boot generation. */
  isDuplicate: boolean;
  /** True if this message is older than current state and should NOT mutate pole/device state. */
  isStale: boolean;
  /** True if this message is strictly newer than current state and SHOULD mutate pole/device state. */
  isNewerState: boolean;
  /** True if a boot sequence reset was explicitly or implicitly detected. */
  isBootReset: boolean;
}

/**
 * Pure evaluation function for telemetry sequence ordering, boot resets, and staleness.
 * Independent of MongoDB or Express.
 */
export function evaluateIngestionState(
  msg: TelemetryMessage,
  currentDeviceState: DeviceStateSnapshot | null,
  knownProcessedSeqsInBoot: Set<number> = new Set()
): IngestionDecision {
  const currentBootCount = currentDeviceState?.bootCount ?? 1;
  const lastSeq = currentDeviceState?.lastSeq ?? null;

  // 1. Check explicit or implicit boot reset
  const isExplicitBoot = msg.event === 'boot';
  const isImplicitBootReset =
    !isExplicitBoot &&
    lastSeq !== null &&
    msg.seq < lastSeq &&
    msg.seq <= 5 &&
    lastSeq >= 10;

  const isBootReset = isExplicitBoot || isImplicitBootReset;

  // Check if message is timestamped before last known boot (stale retry from previous boot cycle)
  const msgTsTime = new Date(msg.ts).getTime();
  const lastBootTime = currentDeviceState?.lastBootAt ? currentDeviceState.lastBootAt.getTime() : 0;
  const isPreBootStale = !isExplicitBoot && lastBootTime > 0 && msgTsTime < lastBootTime;

  let assignedBootCount = isBootReset ? currentBootCount + 1 : currentBootCount;
  if (isPreBootStale) {
    assignedBootCount = Math.max(0, currentBootCount - 1);
  }


  // 2. Check duplicate within the assigned boot generation
  const isDuplicate = knownProcessedSeqsInBoot.has(msg.seq);

  // 3. Evaluate state progression relative to current state
  if (currentDeviceState === null || lastSeq === null) {
    // First message ever for this device
    return {
      assignedBootCount,
      isDuplicate,
      isStale: false,
      isNewerState: !isDuplicate,
      isBootReset,
    };
  }

  let isNewerState = false;
  let isStale = false;

  if (assignedBootCount > currentBootCount) {
    // Advanced boot generation -> definitely newer
    isNewerState = true;
    isStale = false;
  } else if (assignedBootCount < currentBootCount) {
    // Belongs to an older boot generation -> stale
    isNewerState = false;
    isStale = true;
  } else {
    // Same boot generation
    if (msg.seq > lastSeq) {
      isNewerState = true;
      isStale = false;
    } else {
      // msg.seq <= lastSeq
      isNewerState = false;
      isStale = true;
    }
  }

  if (isDuplicate) {
    isNewerState = false;
    isStale = true;
  }

  return {
    assignedBootCount,
    isDuplicate,
    isStale,
    isNewerState,
    isBootReset,
  };
}
