/**
 * Core domain types shared between backend and frontend.
 *
 * Conventions:
 * - TelemetryMessage uses snake_case to match the IoT device wire format exactly.
 * - All internal domain types use camelCase (TypeScript convention).
 * - No runtime code — types and enums only.
 * - No external dependencies.
 */

// ─── Telemetry (wire format — matches IoT device spec) ───────────────────────

/** The four event types a device can emit. */
export type TelemetryEventType = 'heartbeat' | 'power_lost' | 'power_restored' | 'boot';

/** Raw message as received from a device, in the exact wire format. */
export interface TelemetryMessage {
  device_id: string;
  pole_id: string;
  event: TelemetryEventType;
  energized: boolean;
  ts: string; // ISO-8601 — may differ by ±90 s from server time
  seq: number; // monotonic per device per boot; primary ordering signal
  battery_mv?: number;
  rssi?: number;
  fw?: string; // firmware version, e.g. "1.4.2"
}

/** Stored/deduplicated telemetry record (internal domain, camelCase). */
export interface TelemetryEvent {
  deviceId: string;
  poleId: string;
  event: TelemetryEventType;
  energized: boolean;
  ts: string; // original device timestamp ISO-8601
  seq: number;
  batteryMv?: number;
  rssi?: number;
  fw?: string;
  receivedAt: string; // ISO-8601 timestamp when our server ingested it
  isDuplicate: boolean;
}

// ─── Network topology ─────────────────────────────────────────────────────────

export type TopologySource =
  | 'recorded' // parent_pole_id present in registry (reliable)
  | 'inferred' // derived from geo-proximity; clearly marked
  | 'unknown'; // no topology available; DT-level localisation used

export type PoleType = 'distribution' | 'service' | 'corner' | 'terminal';

/** Static pole registry record. */
export interface PoleRecord {
  poleId: string;
  lat: number;
  lon: number;
  feederId: string;
  dtId: string;
  seqOnLine?: number; // missing for ~60% of DTs
  parentPoleId?: string; // missing for ~60% of DTs; null = root of DT tree
  poleType: PoleType;
  ward: string;
  pincode: string;
  deviceId?: string; // ~9% of poles have no device
  topologySource: TopologySource;
  /** True if parent pole relationship was inferred with geometric ambiguity. */
  isAmbiguous?: boolean;
  /** Current energisation state; undefined = never received telemetry. */
  energized?: boolean | null;
  /** ISO-8601 of last telemetry event received for this pole. */
  lastSeenAt?: string | null;
}

/** 11 kV substation feeding one or more feeders. */
export interface Substation {
  substationId: string;
  name: string;
  lat: number;
  lon: number;
}

/** 11 kV feeder originating from a substation. */
export interface Feeder {
  feederId: string;
  name: string;
  substationId: string;
}

/**
 * Distribution Transformer stepping 11 kV → 415 V.
 * Each DT is the root of one LT pole tree.
 */
export interface DistributionTransformer {
  dtId: string;
  name: string;
  feederId: string;
  lat: number;
  lon: number;
  /** False for ~60% of DTs — critical for localization confidence. */
  hasRecordedTopology: boolean;
}

/** IoT device mounted on a pole. */
export interface Device {
  deviceId: string;
  poleId: string;
  firmwareVersion: string; // e.g. "1.4.2"; 1.2.x does not send power_lost
  lastHeartbeatAt?: string | null; // ISO-8601
  lastSeq?: number | null;
  bootCount: number; // incremented on each 'boot' event; seq resets with it
  isOnline: boolean;
}

// ─── Scheduled outages ────────────────────────────────────────────────────────

export type OutageStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

/**
 * A planned outage window on a feeder or DT.
 * Used as evidence in fault classification — not treated as absolute truth
 * (schedules can start late, overrun, or be cancelled without feed updates).
 */
export interface ScheduledOutage {
  outageId: string;
  feederId?: string; // set if a feeder-level outage
  dtId?: string; // set if a DT-level outage
  startAt: string; // ISO-8601
  endAt: string; // ISO-8601
  description: string;
  status: OutageStatus;
}

// ─── Fault localization ───────────────────────────────────────────────────────

export type FaultType =
  | 'span_fault' // broken conductor between two poles
  | 'dt_fault' // distribution transformer failure
  | 'feeder_fault' // 11 kV feeder fault upstream
  | 'device_anomaly' // sensor/device failure; power likely healthy
  | 'scheduled_outage'; // planned outage window

export type LocalizationPrecision =
  | 'EXACT_SPAN'
  | 'ESTIMATED_SPAN'
  | 'RANGE'
  | 'DT_LEVEL';

/**
 * The localised fault boundary.
 * For a span fault: the edge P_upstream → P_downstream is broken.
 * For DT/feeder faults: upstreamPoleId is null.
 */
export interface FaultBoundary {
  /** Last energised pole upstream of the fault (null for DT/feeder faults). */
  upstreamPoleId: string | null;
  /** First dark pole downstream of the fault. */
  downstreamPoleId: string | null;
  /** Human-readable description e.g. "Span between P-024430 and P-024431". */
  description: string;
  topologySource: TopologySource;
  precision: LocalizationPrecision;
  /** 0–1 confidence in this boundary. Drives UI colour coding. */
  confidence: number;
}

// ─── Incidents / Tickets ──────────────────────────────────────────────────────

export type TicketStatus =
  | 'detected'
  | 'acknowledged'
  | 'crew_assigned'
  | 'resolved' // operator marks done; NOT yet verified by telemetry
  | 'verified' // telemetry confirms all affected poles are energised
  | 'closed';

/** One entry in the incident timeline. */
export interface TimelineEntry {
  at: string; // ISO-8601
  status: TicketStatus;
  note?: string;
  /** true = system-generated transition; false = operator action. */
  automated: boolean;
}

/** Full incident document (used for detail view and persistence). */
export interface Incident {
  incidentId: string;
  faultType: FaultType;
  status: TicketStatus;
  feederId: string;
  dtId: string;
  /** All pole IDs that went dark due to this fault. */
  affectedPoleIds: string[];
  boundary: FaultBoundary;
  pincode: string;
  lat: number; // approx. centre of affected area
  lon: number;
  detectedAt: string; // ISO-8601
  acknowledgedAt?: string;
  crewAssignedAt?: string;
  resolvedAt?: string;
  verifiedAt?: string;
  closedAt?: string;
  /** Generated by AI or deterministic fallback template. */
  aiSummary?: string;
  timeline: TimelineEntry[];
  /** Set if a scheduled outage explains or partially explains this incident. */
  scheduledOutageId?: string;
}

/** Lightweight incident record for list views. */
export interface IncidentSummary {
  incidentId: string;
  faultType: FaultType;
  status: TicketStatus;
  feederId: string;
  dtId: string;
  affectedPoleCount: number;
  boundary: FaultBoundary;
  pincode: string;
  lat: number;
  lon: number;
  detectedAt: string;
  resolvedAt?: string;
  verifiedAt?: string;
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
