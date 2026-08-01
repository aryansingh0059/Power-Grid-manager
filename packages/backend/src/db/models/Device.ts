import mongoose, { Schema, Document } from 'mongoose';
import type { Device } from '@pgm/shared';

export interface IDevice extends Omit<Device, 'lastHeartbeatAt'> {
  lastHeartbeatAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice & Document>(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    poleId: { type: String, required: true, unique: true, index: true },
    firmwareVersion: { type: String, required: true },
    lastHeartbeatAt: { type: Date, default: null },
    lastSeq: { type: Number, default: null },
    /**
     * Incremented each time a 'boot' event is received.
     * Used to segment seq ranges — after a boot, seq resets so we track
     * (deviceId, bootCount, seq) as the deduplication key.
     */
    bootCount: { type: Number, required: true, default: 0 },
    isOnline: { type: Boolean, required: true, default: false },
  },
  { timestamps: true }
);

export const DeviceModel = mongoose.model<IDevice & Document>('Device', DeviceSchema);
