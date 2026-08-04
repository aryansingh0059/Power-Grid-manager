import mongoose, { Schema, Document } from 'mongoose';

export interface IActiveFault {
  faultId: string;
  faultType: 'span_fault' | 'dt_fault' | 'feeder_fault' | 'scheduled_outage';
  feederId?: string;
  dtId?: string;
  upstreamPoleId?: string;
  downstreamPoleId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ActiveFaultSchema = new Schema<IActiveFault & Document>(
  {
    faultId: { type: String, required: true, unique: true, index: true },
    faultType: {
      type: String,
      enum: ['span_fault', 'dt_fault', 'feeder_fault', 'scheduled_outage'],
      required: true,
    },
    feederId: { type: String, default: null, index: true },
    dtId: { type: String, default: null, index: true },
    upstreamPoleId: { type: String, default: null, index: true },
    downstreamPoleId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

export const ActiveFaultModel = mongoose.model<IActiveFault & Document>(
  'ActiveFault',
  ActiveFaultSchema
);
