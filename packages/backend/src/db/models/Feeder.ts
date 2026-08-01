import mongoose, { Schema, Document } from 'mongoose';
import type { Feeder } from '@pgm/shared';

export interface IFeeder extends Feeder {
  createdAt: Date;
  updatedAt: Date;
}

const FeederSchema = new Schema<IFeeder & Document>(
  {
    feederId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    substationId: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

export const FeederModel = mongoose.model<IFeeder & Document>('Feeder', FeederSchema);
