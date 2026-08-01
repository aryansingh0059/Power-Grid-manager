import mongoose, { Schema, Document } from 'mongoose';
import type {
  Incident,
  FaultType,
  TicketStatus,
  TopologySource,
  LocalizationPrecision,
  TimelineEntry,
} from '@pgm/shared';

// ── Sub-document: fault boundary ──────────────────────────────────────────────
const FaultBoundarySchema = new Schema(
  {
    upstreamPoleId: { type: String, default: null },
    downstreamPoleId: { type: String, default: null },
    description: { type: String, required: true },
    topologySource: {
      type: String,
      enum: ['recorded', 'inferred', 'unknown'] satisfies TopologySource[],
      required: true,
    },
    precision: {
      type: String,
      enum: ['EXACT_SPAN', 'ESTIMATED_SPAN', 'RANGE', 'DT_LEVEL'] satisfies LocalizationPrecision[],
      required: true,
      default: 'ESTIMATED_SPAN',
    },
    confidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

// ── Sub-document: timeline entry ──────────────────────────────────────────────
const TimelineEntrySchema = new Schema<TimelineEntry>(
  {
    at: { type: String, required: true }, // ISO-8601 stored as string
    status: {
      type: String,
      enum: [
        'detected',
        'acknowledged',
        'crew_assigned',
        'resolved',
        'verified',
        'closed',
      ] satisfies TicketStatus[],
      required: true,
    },
    note: { type: String, default: null },
    automated: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

// ── Main document ─────────────────────────────────────────────────────────────
export interface IIncident extends Omit<Incident, 'detectedAt' | 'acknowledgedAt' | 'crewAssignedAt' | 'resolvedAt' | 'verifiedAt' | 'closedAt'> {
  detectedAt: Date;
  acknowledgedAt?: Date | null;
  crewAssignedAt?: Date | null;
  resolvedAt?: Date | null;
  verifiedAt?: Date | null;
  closedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const IncidentSchema = new Schema<IIncident & Document>(
  {
    incidentId: { type: String, required: true, unique: true, index: true },
    faultType: {
      type: String,
      enum: [
        'span_fault',
        'dt_fault',
        'feeder_fault',
        'device_anomaly',
        'scheduled_outage',
      ] satisfies FaultType[],
      required: true,
    },
    status: {
      type: String,
      enum: [
        'detected',
        'acknowledged',
        'crew_assigned',
        'resolved',
        'verified',
        'closed',
      ] satisfies TicketStatus[],
      required: true,
      default: 'detected',
    },
    feederId: { type: String, required: true, index: true },
    dtId: { type: String, required: true, index: true },
    affectedPoleIds: [{ type: String }],
    affectedPoleCount: { type: Number, required: true, default: 0 },
    boundary: { type: FaultBoundarySchema, required: true },
    pincode: { type: String, required: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    detectedAt: { type: Date, required: true },
    acknowledgedAt: { type: Date, default: null },
    crewAssignedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    aiSummary: { type: String, default: null },
    timeline: [TimelineEntrySchema],
    scheduledOutageId: { type: String, default: null },
  },
  { timestamps: true }
);

// Active incident queries (primary operator view)
IncidentSchema.index({ status: 1, detectedAt: -1 });
IncidentSchema.index({ feederId: 1, status: 1 });
IncidentSchema.index({ dtId: 1, status: 1 });

export const IncidentModel = mongoose.model<IIncident & Document>('Incident', IncidentSchema);
