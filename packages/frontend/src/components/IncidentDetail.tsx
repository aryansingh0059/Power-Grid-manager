import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  MapPin,
  CheckCircle,
  Clock,
  UserCheck,
  Zap,
  Info,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import type { Incident, TimelineEntry } from '@pgm/shared';
import { ApiClient } from '../api/client';

interface IncidentDetailProps {
  incident: Incident | null;
  onAcknowledge: (id: string, note?: string) => Promise<void>;
  onAssignCrew: (id: string, crewId: string, crewName: string) => Promise<void>;
  onResolve: (id: string, note?: string) => Promise<void>;
  onVerify: (id: string) => Promise<void>;
}

function getConfidenceCategory(score: number): { label: string; color: string } {
  if (score >= 85) return { label: 'HIGH CONFIDENCE', color: 'text-health-green' };
  if (score >= 60) return { label: 'MEDIUM CONFIDENCE', color: 'text-amber-400' };
  return { label: 'LOW CONFIDENCE', color: 'text-fault-red' };
}

function formatStatus(status: string): string {
  switch (status) {
    case 'detected':
      return 'Unacknowledged';
    case 'acknowledged':
      return 'Acknowledged';
    case 'crew_assigned':
      return 'Crew Assigned';
    case 'resolved':
      return 'Resolved';
    case 'verified':
      return 'Verified';
    case 'closed':
      return 'Closed';
    default:
      return status;
  }
}

export const IncidentDetail: React.FC<IncidentDetailProps> = ({
  incident,
  onAcknowledge,
  onAssignCrew,
  onResolve,
  onVerify,
}) => {
  const [crewId, setCrewId] = useState('CREW-07');
  const [crewName, setCrewName] = useState('KPTCL Line Crew Alpha');
  const [showCrewForm, setShowCrewForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  if (!incident) {
    return (
      <div className="h-full bg-surface-1 border border-border rounded-lg flex flex-col items-center justify-center p-6 text-center text-content-tertiary select-none">
        <Info className="w-8 h-8 text-content-tertiary mb-2 opacity-50" />
        <h3 className="text-xs font-semibold text-content-secondary">No Incident Selected</h3>
        <p className="text-[11px] text-content-tertiary max-w-xs mt-1">
          Select an incident ticket from the queue or click a fault marker on the map.
        </p>
      </div>
    );
  }

  const confScore = Math.round(
    incident.boundary.confidence <= 1
      ? incident.boundary.confidence * 100
      : incident.boundary.confidence
  );

  const confCategory = getConfidenceCategory(confScore);
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${incident.lat},${incident.lon}`;
  const darkPoles = incident.affectedPoleIds?.length || incident.affectedPoleCount;
  const isClosed = incident.status === 'closed';
  const isUnacked = incident.status === 'detected';

  const handleAck = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await onAcknowledge(incident.incidentId, 'Control room operator acknowledged ticket');
    } catch (e: unknown) {
      setActionError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);
    try {
      await onAssignCrew(incident.incidentId, crewId, crewName);
      setShowCrewForm(false);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await onResolve(incident.incidentId, 'Field crew reported physical repairs completed');
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerify = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await ApiClient.verifyRestoration(incident.incidentId);
      if (!res.verified) {
        setActionError(`Restoration verification pending: ${res.darkPoleCount} of ${darkPoles} affected poles remain de-energized.`);
      } else {
        await onVerify(incident.incidentId);
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateAiSummary = async () => {
    setIsAiLoading(true);
    try {
      const res = await ApiClient.explainIncident(incident.incidentId);
      setAiSummary(res.summary);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-1 border border-border rounded-lg overflow-hidden select-none">
      {/* Header Bar */}
      <div className="p-3 border-b border-border bg-surface-2/40 flex items-start justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-content-primary">
              {incident.incidentId}
            </span>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.2 rounded ${
                isUnacked
                  ? 'bg-fault-red/15 text-fault-red'
                  : isClosed
                  ? 'bg-health-green/15 text-health-green'
                  : 'bg-amber-400/15 text-amber-400'
              }`}
            >
              {formatStatus(incident.status)}
            </span>
          </div>
          <p className="text-xs text-content-primary font-medium mt-1">
            {incident.boundary.description}
          </p>
        </div>

        {/* Confidence Score Pill */}
        <div className="text-right shrink-0">
          <div className={`text-xs font-mono font-semibold ${confCategory.color}`}>
            {confScore}%
          </div>
          <div className="text-[9px] text-content-tertiary font-sans">
            {confCategory.label.split(' ')[0]}
          </div>
        </div>
      </div>

      {/* Main Detail Inspector Body (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {/* Error Alert Banner */}
        {actionError && (
          <div className="p-2.5 bg-surface-2 border border-fault-red rounded text-fault-red flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px]">{actionError}</span>
          </div>
        )}

        {/* Unverified Restoration Warning */}
        {incident.status === 'resolved' && (
          <div className="p-2.5 bg-surface-2 border border-amber-400/60 rounded text-amber-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-[11px]">
              <div className="font-semibold text-content-primary">
                Restoration Verification Pending
              </div>
              <p className="text-content-secondary leading-normal">
                Repair reported by crew, but physical telemetry confirmation is pending.
              </p>
            </div>
          </div>
        )}

        {/* Scheduled Outage Overlay */}
        {(incident.scheduledOutageId || incident.faultType === 'scheduled_outage') && (
          <div className="p-2 bg-surface-2 border border-info-blue/50 rounded text-info-blue flex items-center gap-2 text-[11px]">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Scheduled maintenance window overlap ({incident.scheduledOutageId ?? 'OUTAGE-FEED'}).</span>
          </div>
        )}

        {/* Location & Impact */}
        <div className="bg-surface-2 p-2.5 rounded border border-border space-y-2">
          <div className="text-[10px] text-content-tertiary uppercase font-semibold">
            Location & Impact
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-content-tertiary">DT Asset: </span>
              <span className="font-mono text-content-primary font-medium">{incident.dtId}</span>
            </div>
            <div>
              <span className="text-content-tertiary">Feeder: </span>
              <span className="font-mono text-content-primary font-medium">{incident.feederId}</span>
            </div>
            <div>
              <span className="text-content-tertiary">Pincode: </span>
              <span className="font-mono text-content-primary font-medium">{incident.pincode ?? '560001'}</span>
            </div>
            <div>
              <span className="text-content-tertiary">Impact: </span>
              <span className="font-semibold text-content-primary">{darkPoles} poles</span>
            </div>
          </div>

          <div className="pt-2 border-t border-border flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1 text-content-secondary font-mono">
              <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
              <span>
                {incident.lat.toFixed(5)}, {incident.lon.toFixed(5)}
              </span>
            </div>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-amber-400 hover:underline flex items-center gap-1 font-medium"
            >
              Open in Maps <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Localization & Evidence */}
        <div className="bg-surface-2 p-2.5 rounded border border-border space-y-2">
          <div className="flex items-center justify-between text-[10px] text-content-tertiary font-semibold uppercase">
            <span>Localization Evidence</span>
            <span className={confCategory.color}>{confCategory.label}</span>
          </div>

          <div className="text-xs text-content-secondary space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-content-tertiary">Precision:</span>
              <span className="font-mono text-content-primary">{incident.boundary.precision ?? 'ESTIMATED_SPAN'}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-content-tertiary">Topology Source:</span>
              <span className="font-mono text-content-primary">{incident.boundary.topologySource}</span>
            </div>
          </div>

          <div className="space-y-1 pt-1.5 border-t border-border text-[11px] text-content-secondary">
            <div className="flex items-center gap-1.5">
              <span className="text-health-green">✓</span>
              <span>
                {incident.boundary.topologySource === 'recorded'
                  ? 'Recorded parent-child grid topology confirmed'
                  : 'Geographically inferred grid topology via MST'}
              </span>
            </div>
            {incident.boundary.upstreamPoleId && (
              <div className="flex items-center gap-1.5">
                <span className="text-health-green">✓</span>
                <span>Upstream pole {incident.boundary.upstreamPoleId} confirmed energized</span>
              </div>
            )}
            {incident.boundary.downstreamPoleId && (
              <div className="flex items-center gap-1.5">
                <span className="text-health-green">✓</span>
                <span>Downstream pole {incident.boundary.downstreamPoleId} confirmed dark</span>
              </div>
            )}
          </div>
        </div>

        {/* Operator Summary (AI Section) */}
        <div className="bg-surface-2 p-2.5 rounded border border-border space-y-1.5">
          <div className="text-[10px] text-content-tertiary uppercase font-semibold">
            Operator Summary
          </div>

          {aiSummary || incident.aiSummary ? (
            <div className="space-y-1.5">
              <p className="text-xs text-content-primary leading-relaxed bg-surface-1 p-2 rounded border border-border font-sans">
                {aiSummary || incident.aiSummary}
              </p>
              <div className="text-[10px] text-content-tertiary">
                AI-assisted · generated from deterministic incident data
              </div>
            </div>
          ) : (
            <button
              onClick={handleGenerateAiSummary}
              disabled={isAiLoading}
              className="w-full py-1.5 bg-surface-1 hover:bg-surface-3 border border-border text-content-secondary hover:text-content-primary rounded transition font-medium text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-400 ${isAiLoading ? 'animate-spin' : ''}`} />
              {isAiLoading ? 'Generating Summary...' : 'Generate Operator Summary'}
            </button>
          )}
        </div>

        {/* Affected Poles */}
        <div className="bg-surface-2 p-2.5 rounded border border-border space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-content-tertiary font-semibold uppercase">
            <span>Affected Poles ({darkPoles})</span>
            {isClosed ? (
              <CheckCircle className="w-3.5 h-3.5 text-health-green" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-fault-red" />
            )}
          </div>

          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {incident.affectedPoleIds?.map((pId: string) => (
              <span
                key={pId}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                  isClosed
                    ? 'bg-surface-1 border-health-green/40 text-health-green'
                    : 'bg-surface-1 border-border text-content-secondary'
                }`}
              >
                {pId}
              </span>
            ))}
          </div>
        </div>

        {/* Operator Workflow Actions */}
        <div className="bg-surface-2 p-2.5 rounded border border-border space-y-2">
          <div className="text-[10px] text-content-tertiary uppercase font-semibold">
            Operator Actions
          </div>

          {incident.status === 'detected' && (
            <button
              onClick={handleAck}
              disabled={actionLoading}
              className="w-full py-1.5 bg-amber-400 hover:bg-amber-500 text-surface-0 font-semibold rounded transition flex items-center justify-center gap-1.5 disabled:opacity-50 text-xs"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Acknowledge Incident
            </button>
          )}

          {['detected', 'acknowledged'].includes(incident.status) && (
            <div>
              {!showCrewForm ? (
                <button
                  onClick={() => setShowCrewForm(true)}
                  className="w-full py-1.5 bg-surface-1 hover:bg-surface-3 border border-border text-content-primary font-medium rounded transition flex items-center justify-center gap-1.5 text-xs"
                >
                  <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                  Assign Repair Crew
                </button>
              ) : (
                <form onSubmit={handleAssign} className="space-y-2 bg-surface-1 p-2 rounded border border-border">
                  <div>
                    <label className="text-[10px] text-content-tertiary">Crew Name</label>
                    <input
                      type="text"
                      value={crewName}
                      onChange={(e) => setCrewName(e.target.value)}
                      className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-content-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-content-tertiary">Crew ID</label>
                    <input
                      type="text"
                      value={crewId}
                      onChange={(e) => setCrewId(e.target.value)}
                      className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-content-primary"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="flex-1 py-1 bg-amber-400 text-surface-0 font-semibold rounded text-xs"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCrewForm(false)}
                      className="px-2 py-1 bg-surface-2 text-content-tertiary rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {['crew_assigned', 'acknowledged'].includes(incident.status) && (
            <button
              onClick={handleResolve}
              disabled={actionLoading}
              className="w-full py-1.5 bg-surface-1 hover:bg-surface-3 border border-border text-content-primary font-medium rounded transition flex items-center justify-center gap-1.5 text-xs disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5 text-health-green" />
              Mark Work Resolved
            </button>
          )}

          {incident.status === 'resolved' && (
            <button
              onClick={handleVerify}
              disabled={actionLoading}
              className="w-full py-1.5 bg-health-green hover:bg-emerald-600 text-surface-0 font-semibold rounded transition flex items-center justify-center gap-1.5 disabled:opacity-50 text-xs"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Verify Restoration
            </button>
          )}
        </div>

        {/* Audit Timeline */}
        <div className="bg-surface-2 p-2.5 rounded border border-border space-y-2">
          <div className="text-[10px] text-content-tertiary uppercase font-semibold flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Timeline Log
          </div>

          <div className="space-y-2 relative border-l border-border ml-2 pl-3 text-xs">
            {incident.timeline?.map((entry: TimelineEntry, idx: number) => (
              <div key={idx} className="relative">
                <span className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-surface-3 border border-border" />
                <div className="text-[10px] text-content-tertiary font-mono">
                  {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="text-xs text-content-secondary">{entry.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

