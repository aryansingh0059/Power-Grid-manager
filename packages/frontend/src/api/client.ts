import type {
  PoleRecord,
  DistributionTransformer,
  Feeder,
  Substation,
  Incident,
  ScheduledOutage,
  ApiResponse,
} from '@pgm/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const body: ApiResponse<T> = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error || `HTTP error ${res.status}`);
  }
  return body.data as T;
}

export const ApiClient = {
  // System Health
  getHealth: () => fetchJson<{ status: string; db: string; timestamp: string }>('/api/health'),

  // Network Assets
  getPoles: (params?: { dtId?: string; feederId?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<PoleRecord[]>(`/api/network/poles${q ? `?${q}` : ''}`);
  },
  getDts: (feederId?: string) =>
    fetchJson<DistributionTransformer[]>(`/api/network/dts${feederId ? `?feederId=${feederId}` : ''}`),
  getFeeders: () => fetchJson<Feeder[]>('/api/network/feeders'),
  getSubstations: () => fetchJson<Substation[]>('/api/network/substations'),

  // Incidents
  getIncidents: (params?: { status?: string; feederId?: string; dtId?: string; pincode?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<Incident[]>(`/api/incidents${q ? `?${q}` : ''}`);
  },
  getIncidentById: (id: string) => fetchJson<Incident>(`/api/incidents/${id}`),
  acknowledgeIncident: (id: string, note?: string) =>
    fetchJson<Incident>(`/api/incidents/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  assignCrew: (id: string, crewId: string, crewName: string) =>
    fetchJson<Incident>(`/api/incidents/${id}/assign-crew`, {
      method: 'POST',
      body: JSON.stringify({ crewId, crewName }),
    }),
  resolveIncident: (id: string, note?: string) =>
    fetchJson<Incident>(`/api/incidents/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  verifyRestoration: (id: string) =>
    fetchJson<{ verified: boolean; incident: Incident; darkPoleCount: number; message: string }>(
      `/api/incidents/${id}/verify`,
      { method: 'POST' }
    ),
  explainIncident: (id: string) =>
    fetchJson<{ summary: string; providerUsed: string; modelUsed?: string; estimatedCostUsd?: number }>(
      `/api/incidents/${id}/explain`,
      { method: 'POST' }
    ),

  // Outages & Telemetry
  getOutages: () => fetchJson<ScheduledOutage[]>('/api/outages'),
  getRecentTelemetry: (deviceId?: string) =>
    fetchJson<Record<string, unknown>[]>(`/api/telemetry/recent${deviceId ? `?deviceId=${deviceId}` : ''}`),

  // Simulator
  injectSpanFault: (upstreamPoleId: string, downstreamPoleId: string) =>
    fetchJson<{ message: string }>('/api/simulator/fault/span', {
      method: 'POST',
      body: JSON.stringify({ upstreamPoleId, downstreamPoleId, deterministic: true }),
    }),
  injectDtFault: (dtId: string) =>
    fetchJson<{ message: string }>('/api/simulator/fault/dt', {
      method: 'POST',
      body: JSON.stringify({ dtId, deterministic: true }),
    }),
  injectFeederFault: (feederId: string) =>
    fetchJson<{ message: string }>('/api/simulator/fault/feeder', {
      method: 'POST',
      body: JSON.stringify({ feederId, deterministic: true }),
    }),
  killDevice: (deviceId: string) =>
    fetchJson<{ message: string }>('/api/simulator/device/kill', {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    }),
  repairFault: (dtId: string, downstreamPoleId?: string) =>
    fetchJson<{ message: string }>('/api/simulator/repair', {
      method: 'POST',
      body: JSON.stringify({ dtId, downstreamPoleId }),
    }),
  runLocalization: () =>
    fetchJson<{ incidentsCreatedOrUpdated: number }>('/api/simulator/run-localization', {
      method: 'POST',
    }),
};
