import type { TelemetryMessage } from '@pgm/shared';
import { DeviceModel } from '../db/models/Device';
import { PoleModel } from '../db/models/Pole';
import { TelemetryEventModel } from '../db/models/TelemetryEvent';
import { evaluateIngestionState, type DeviceStateSnapshot } from './state';

export interface IngestionResult {
  success: boolean;
  deviceId: string;
  poleId: string;
  seq: number;
  bootCount: number;
  isDuplicate: boolean;
  isStale: boolean;
  isNewerState: boolean;
}

export class IngestionService {
  /**
   * Process a single incoming telemetry message.
   *
   * Steps:
   *  1. Fetch current device state from DB (or fallback).
   *  2. Query existing events in DB to verify deduplication status.
   *  3. Evaluate ingestion decision (boot reset, sequence progression, duplicate, stale).
   *  4. Save raw telemetry event into TelemetryEventModel.
   *  5. If newer state, mutate PoleModel and DeviceModel.
   */
  static async processMessage(msg: TelemetryMessage): Promise<IngestionResult> {
    const receivedAt = new Date();
    const eventTs = new Date(msg.ts);

    // 1. Fetch current device state
    const deviceDoc = await DeviceModel.findOne({ deviceId: msg.device_id });
    const currentDeviceState: DeviceStateSnapshot | null = deviceDoc
      ? {
          deviceId: deviceDoc.deviceId,
          bootCount: deviceDoc.bootCount,
          lastSeq: deviceDoc.lastSeq ?? null,
          lastSeenAt: deviceDoc.lastHeartbeatAt,
          lastBootAt: deviceDoc.lastBootAt ?? null,
        }
      : null;

    // 2. Query known processed seqs in the device's current boot generation
    const currentBootCount = currentDeviceState?.bootCount ?? 1;
    const existingEvent = await TelemetryEventModel.findOne({
      deviceId: msg.device_id,
      bootCount: currentBootCount,
      seq: msg.seq,
    });

    const knownSeqs = new Set<number>();
    if (existingEvent) {
      knownSeqs.add(msg.seq);
    }

    // 3. Evaluate state decision
    const decision = evaluateIngestionState(msg, currentDeviceState, knownSeqs);

    // 4. Save raw telemetry event
    let isDuplicate = decision.isDuplicate;

    try {
      await TelemetryEventModel.create({
        deviceId: msg.device_id,
        poleId: msg.pole_id,
        event: msg.event,
        energized: msg.energized,
        ts: eventTs,
        seq: msg.seq,
        batteryMv: msg.battery_mv ?? null,
        rssi: msg.rssi ?? null,
        fw: msg.fw ?? null,
        receivedAt,
        isDuplicate,
        bootCount: decision.assignedBootCount,
      });
    } catch (err: unknown) {
      // MongoDB unique index duplicate key error (code 11000)
      const isMongoDup =
        err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000;
      if (isMongoDup) {
        isDuplicate = true;
      } else {
        throw err;
      }
    }

    // 5. If newer state, update PoleModel and DeviceModel
    if (decision.isNewerState && !isDuplicate) {
      await Promise.all([
        PoleModel.updateOne(
          { poleId: msg.pole_id },
          {
            $set: {
              energized: msg.energized,
              lastSeenAt: receivedAt,
            },
          }
        ),
        DeviceModel.updateOne(
          { deviceId: msg.device_id },
          {
            $set: {
              bootCount: decision.assignedBootCount,
              lastSeq: msg.seq,
              isOnline: true,
              ...(msg.event === 'boot' ? { lastBootAt: eventTs } : {}),
              ...(msg.event === 'heartbeat' ? { lastHeartbeatAt: receivedAt } : {}),
            },
          },
          { upsert: true }
        ),
      ]);
    }

    return {
      success: true,
      deviceId: msg.device_id,
      poleId: msg.pole_id,
      seq: msg.seq,
      bootCount: decision.assignedBootCount,
      isDuplicate,
      isStale: decision.isStale,
      isNewerState: decision.isNewerState && !isDuplicate,
    };
  }
}
