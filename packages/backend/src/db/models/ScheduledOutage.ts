import mongoose, { Schema, Document } from 'mongoose';
import type { ScheduledOutage, OutageStatus } from '@pgm/shared';

export interface IScheduledOutage extends Omit<ScheduledOutage, 'startAt' | 'endAt'> {
  startAt: Date;
  endAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledOutageSchema = new Schema<IScheduledOutage & Document>(
  {
    outageId: { type: String, required: true, unique: true, index: true },
    feederId: { type: String, default: null, index: true },
    dtId: { type: String, default: null, index: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'completed', 'cancelled'] satisfies OutageStatus[],
      required: true,
      default: 'scheduled',
    },
  },
  { timestamps: true }
);

// Find outages that overlap with a time window (used in fault classification)
ScheduledOutageSchema.index({ startAt: 1, endAt: 1 });
ScheduledOutageSchema.index({ feederId: 1, startAt: 1, endAt: 1 });
ScheduledOutageSchema.index({ dtId: 1, startAt: 1, endAt: 1 });

export const ScheduledOutageModel = mongoose.model<IScheduledOutage & Document>(
  'ScheduledOutage',
  ScheduledOutageSchema
);
