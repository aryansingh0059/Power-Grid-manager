import mongoose, { Schema, Document } from 'mongoose';
import type { TelemetryEvent, TelemetryEventType } from '@pgm/shared';

/**
 * Stored telemetry record.
 * Ingested messages are normalised from the snake_case wire format and written here.
 * Duplicates are flagged but retained for auditability.
 */
export interface ITelemetryEvent extends Omit<TelemetryEvent, 'ts' | 'receivedAt'> {
  ts: Date; // original device timestamp (may be skewed by ±90 s)
  receivedAt: Date; // server ingestion time; use for ordering, not ts
  /**
   * bootCount at ingestion time. Combined with (deviceId, seq) this forms
   * the deduplication key that survives seq resets on device reboot.
   */
  bootCount: number;
}

const TelemetryEventSchema = new Schema<ITelemetryEvent & Document>(
  {
    deviceId: { type: String, required: true, index: true },
    poleId: { type: String, required: true, index: true },
    event: {
      type: String,
      enum: ['heartbeat', 'power_lost', 'power_restored', 'boot'] satisfies TelemetryEventType[],
      required: true,
    },
    energized: { type: Boolean, required: true },
    ts: { type: Date, required: true },
    seq: { type: Number, required: true },
    batteryMv: { type: Number, default: null },
    rssi: { type: Number, default: null },
    fw: { type: String, default: null },
    receivedAt: { type: Date, required: true },
    isDuplicate: { type: Boolean, required: true, default: false },
    bootCount: { type: Number, required: true, default: 0 },
  },
  {
    // No timestamps: true — we manage ts/receivedAt manually for precision
    // TTL: retain events for 7 days (adjust as needed)
    expireAfterSeconds: 0, // set via the index below
  }
);

// Deduplication index: (deviceId, bootCount, seq) must be unique
TelemetryEventSchema.index({ deviceId: 1, bootCount: 1, seq: 1 }, { unique: true });

// Efficient pole-level event history (most recent first)
TelemetryEventSchema.index({ poleId: 1, receivedAt: -1 });

// TTL index: auto-delete documents 7 days after ingestion
TelemetryEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export const TelemetryEventModel = mongoose.model<ITelemetryEvent & Document>(
  'TelemetryEvent',
  TelemetryEventSchema
);
