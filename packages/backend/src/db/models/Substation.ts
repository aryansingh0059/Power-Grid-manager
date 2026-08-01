import mongoose, { Schema, Document } from 'mongoose';
import type { Substation } from '@pgm/shared';

export interface ISubstation extends Substation {
  createdAt: Date;
  updatedAt: Date;
}

const SubstationSchema = new Schema<ISubstation & Document>(
  {
    substationId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
  },
  { timestamps: true }
);

export const SubstationModel = mongoose.model<ISubstation & Document>(
  'Substation',
  SubstationSchema
);
