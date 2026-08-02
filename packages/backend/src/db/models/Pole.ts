import mongoose, { Schema, Document } from 'mongoose';
import type { PoleRecord, TopologySource, PoleType } from '@pgm/shared';

/**
 * Stored pole document.
 * Combines the static registry fields (from seed/import) with the mutable
 * runtime state fields (energized, lastSeenAt) that are updated by ingestion.
 */
export interface IPole extends Omit<PoleRecord, 'energized' | 'lastSeenAt'> {
  energized: boolean | null; // null = no telemetry ever received
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PoleSchema = new Schema<IPole & Document>(
  {
    // ── Registry fields (static) ───────────────────────────────────────────
    poleId: { type: String, required: true, unique: true, index: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    feederId: { type: String, required: true, index: true },
    dtId: { type: String, required: true, index: true },
    seqOnLine: { type: Number, default: null },
    parentPoleId: { type: String, default: null, index: true },
    poleType: {
      type: String,
      enum: ['distribution', 'service', 'corner', 'terminal'] satisfies PoleType[],
      required: true,
    },
    ward: { type: String, required: true },
    pincode: { type: String, default: '' },
    deviceId: { type: String, default: null, index: true },
    topologySource: {
      type: String,
      enum: ['recorded', 'inferred', 'unknown'] satisfies TopologySource[],
      required: true,
      default: 'unknown',
    },

    // ── Runtime state (updated by ingestion) ──────────────────────────────
    energized: { type: Boolean, default: null },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound index for geo-proximity queries (used in topology inference)
PoleSchema.index({ dtId: 1, lat: 1, lon: 1 });
// Index for finding children of a pole in the topology tree
PoleSchema.index({ dtId: 1, parentPoleId: 1 });

export const PoleModel = mongoose.model<IPole & Document>('Pole', PoleSchema);
