import mongoose, { Schema, Document } from 'mongoose';
import type { DistributionTransformer } from '@pgm/shared';

export interface IDistributionTransformer extends DistributionTransformer {
  createdAt: Date;
  updatedAt: Date;
}

const DTSchema = new Schema<IDistributionTransformer & Document>(
  {
    dtId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    feederId: { type: String, required: true, index: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    /**
     * True only when ALL poles under this DT have parentPoleId recorded.
     * False for ~60% of DTs — drives topology confidence level.
     */
    hasRecordedTopology: { type: Boolean, required: true, default: false },
  },
  { timestamps: true }
);

export const DTModel = mongoose.model<IDistributionTransformer & Document>(
  'DistributionTransformer',
  DTSchema
);
