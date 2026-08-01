import type { TelemetryMessage, TelemetryEventType } from '@pgm/shared';

export interface ValidationResult {
  valid: boolean;
  message?: TelemetryMessage;
  error?: string;
}

const VALID_EVENTS: Set<TelemetryEventType> = new Set([
  'heartbeat',
  'power_lost',
  'power_restored',
  'boot',
]);

/**
 * Validates raw request body against the IoT telemetry wire spec.
 */
export function validateTelemetryPayload(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const record = body as Record<string, unknown>;

  if (typeof record.device_id !== 'string' || !record.device_id.trim()) {
    return { valid: false, error: 'Field "device_id" must be a non-empty string' };
  }

  if (typeof record.pole_id !== 'string' || !record.pole_id.trim()) {
    return { valid: false, error: 'Field "pole_id" must be a non-empty string' };
  }

  if (
    typeof record.event !== 'string' ||
    !VALID_EVENTS.has(record.event as TelemetryEventType)
  ) {
    return {
      valid: false,
      error: `Field "event" must be one of: ${Array.from(VALID_EVENTS).join(', ')}`,
    };
  }

  if (typeof record.energized !== 'boolean') {
    return { valid: false, error: 'Field "energized" must be a boolean' };
  }

  if (typeof record.ts !== 'string' || isNaN(Date.parse(record.ts))) {
    return { valid: false, error: 'Field "ts" must be a valid ISO-8601 timestamp string' };
  }

  if (typeof record.seq !== 'number' || !Number.isInteger(record.seq) || record.seq < 0) {
    return { valid: false, error: 'Field "seq" must be a non-negative integer' };
  }

  const message: TelemetryMessage = {
    device_id: record.device_id.trim(),
    pole_id: record.pole_id.trim(),
    event: record.event as TelemetryEventType,
    energized: record.energized,
    ts: record.ts,
    seq: record.seq,
    battery_mv: typeof record.battery_mv === 'number' ? record.battery_mv : undefined,
    rssi: typeof record.rssi === 'number' ? record.rssi : undefined,
    fw: typeof record.fw === 'string' ? record.fw : undefined,
  };

  return { valid: true, message };
}
