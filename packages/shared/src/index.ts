/**
 * Core domain types shared between backend and frontend.
 *
 * Rules:
 * - No runtime code here — types and enums only.
 * - No external dependencies.
 * - Evolves alongside the domain model; keep in sync with Mongoose schemas.
 */

// ─── Telemetry ───────────────────────────────────────────────────────────────

export type TelemetryEvent = 'heartbeat' | 'power_lost' | 'power_restored' | 'boot';

export interface TelemetryMessage {
  device_id: string;
  pole_id: string;
  event: TelemetryEvent;
  energized: boolean;
  ts: string; // ISO-8601
  seq: number; // monotonic per device; primary ordering signal
  battery_mv?: number;
  rssi?: number;
  fw?: string; // firmware version, e.g. "1.4.2"
}

// ─── Topology ────────────────────────────────────────────────────────────────

export type TopologySource = 'recorded' | 'inferred' | 'unknown';

export interface PoleRecord {
  pole_id: string;
  lat: number;
  lon: number;
  feeder_id: string;
  dt_id: string;
  seq_on_line?: number; // missing for ~60% of DTs
  parent_pole_id?: string; // missing for ~60% of DTs
  pole_type: 'distribution' | 'service' | 'corner' | 'terminal';
  ward: string;
  pincode: string;
  device_id?: string; // ~9% of poles have no device
}

// ─── Fault localization ───────────────────────────────────────────────────────

export type FaultType =
  | 'span_fault'
  | 'dt_fault'
  | 'feeder_fault'
  | 'device_anomaly'
  | 'scheduled_outage';

export interface FaultBoundary {
  /** Upstream pole that is energized (null if DT-level or feeder) */
  upstream_pole_id: string | null;
  /** First downstream dark pole */
  downstream_pole_id: string | null;
  /** Human description of the failed span or asset */
  description: string;
  topology_source: TopologySource;
  /** 0–1 confidence in the localization */
  confidence: number;
}

// ─── Incidents / Tickets ──────────────────────────────────────────────────────

export type TicketStatus =
  | 'detected'
  | 'acknowledged'
  | 'crew_assigned'
  | 'resolved'
  | 'verified'
  | 'closed';

export interface IncidentSummary {
  incident_id: string;
  fault_type: FaultType;
  status: TicketStatus;
  feeder_id: string;
  dt_id: string;
  affected_pole_count: number;
  boundary: FaultBoundary;
  pincode: string;
  lat: number;
  lon: number;
  detected_at: string; // ISO-8601
  resolved_at?: string;
  verified_at?: string;
}

// ─── API wrappers ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  version: string;
  db: 'connected' | 'disconnected';
}
