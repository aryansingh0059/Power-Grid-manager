import React, { useState } from 'react';
import { Search, AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import type { Incident } from '@pgm/shared';

interface IncidentListProps {
  incidents: Incident[];
  selectedIncident: Incident | null;
  onSelectIncident: (inc: Incident) => void;
}

// Helper to compute relative time from ISO string or Date
function formatRelativeTime(dateStr?: string | Date): string {
  if (!dateStr) return '';
  const now = new Date().getTime();
  const date = new Date(dateStr).getTime();
  const diffMinutes = Math.floor((now - date) / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function getFaultTypeLabel(type: string): string {
  switch (type) {
    case 'span_fault':
      return 'SPAN FAULT';
    case 'dt_fault':
      return 'TRANSFORMER FAULT';
    case 'feeder_fault':
      return 'FEEDER OUTAGE';
    case 'device_anomaly':
      return 'DEVICE ANOMALY';
    case 'scheduled_outage':
      return 'SCHEDULED OUTAGE';
    default:
      return type.replace('_', ' ').toUpperCase();
  }
}

function getStatusLabel(status: string): string {
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

export const IncidentList: React.FC<IncidentListProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'detected' | 'in_repair' | 'closed'>('active');

  // Filtering
  const filtered = incidents.filter((inc) => {
    // Status tab filter
    if (statusFilter === 'active' && inc.status === 'closed') return false;
    if (statusFilter === 'detected' && inc.status !== 'detected') return false;
    if (statusFilter === 'in_repair' && !['acknowledged', 'crew_assigned', 'resolved'].includes(inc.status)) return false;
    if (statusFilter === 'closed' && inc.status !== 'closed') return false;

    // Search query filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchId = inc.incidentId.toLowerCase().includes(q);
      const matchDt = inc.dtId.toLowerCase().includes(q);
      const matchFeeder = inc.feederId.toLowerCase().includes(q);
      const matchPincode = inc.pincode?.toLowerCase().includes(q);
      const matchBoundary = inc.boundary.description.toLowerCase().includes(q);
      return matchId || matchDt || matchFeeder || matchPincode || matchBoundary;
    }

    return true;
  });

  const activeCount = incidents.filter((i) => i.status !== 'closed').length;
  const unacknowledgedCount = incidents.filter((i) => i.status === 'detected').length;
  const inRepairCount = incidents.filter((i) => ['acknowledged', 'crew_assigned', 'resolved'].includes(i.status)).length;
  const closedCount = incidents.filter((i) => i.status === 'closed').length;

  return (
    <div className="flex flex-col h-full bg-surface-1 border border-border rounded-lg overflow-hidden select-none">
      {/* Header Area */}
      <div className="p-3 border-b border-border space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-content-primary">
              Incidents
            </h2>
            <span className="text-xs text-content-tertiary">
              ({filtered.length})
            </span>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-content-tertiary absolute left-2.5 top-2" />
          <input
            type="text"
            placeholder="Search pole, DT, feeder, PIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded pl-8 pr-2.5 py-1 text-xs text-content-primary placeholder-content-tertiary focus:outline-none focus:border-amber-400/60 transition"
          />
        </div>

        {/* Status Filter Segmented Controls */}
        <div className="flex border-b border-border text-xs pt-1">
          <button
            onClick={() => setStatusFilter('active')}
            className={`pb-1.5 px-2 font-medium transition border-b-2 text-center flex-1 ${
              statusFilter === 'active'
                ? 'border-amber-400 text-content-primary'
                : 'border-transparent text-content-tertiary hover:text-content-secondary'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter('detected')}
            className={`pb-1.5 px-2 font-medium transition border-b-2 text-center flex-1 ${
              statusFilter === 'detected'
                ? 'border-fault-red text-fault-red'
                : 'border-transparent text-content-tertiary hover:text-content-secondary'
            }`}
          >
            Unack ({unacknowledgedCount})
          </button>
          <button
            onClick={() => setStatusFilter('in_repair')}
            className={`pb-1.5 px-2 font-medium transition border-b-2 text-center flex-1 ${
              statusFilter === 'in_repair'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-content-tertiary hover:text-content-secondary'
            }`}
          >
            Repair ({inRepairCount})
          </button>
          <button
            onClick={() => setStatusFilter('closed')}
            className={`pb-1.5 px-2 font-medium transition border-b-2 text-center flex-1 ${
              statusFilter === 'closed'
                ? 'border-health-green text-health-green'
                : 'border-transparent text-content-tertiary hover:text-content-secondary'
            }`}
          >
            Closed ({closedCount})
          </button>
        </div>
      </div>

      {/* Incident List Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-content-tertiary space-y-1">
            <p className="text-xs font-medium text-content-secondary">No active incidents</p>
            <p className="text-[11px]">The network is currently operating normally.</p>
          </div>
        ) : (
          filtered.map((inc) => {
            const isSelected = selectedIncident?.incidentId === inc.incidentId;
            const isUnacked = inc.status === 'detected';
            const isClosed = inc.status === 'closed';

            const confScore = Math.round(
              inc.boundary.confidence <= 1 ? inc.boundary.confidence * 100 : inc.boundary.confidence
            );
            const darkPoles = inc.affectedPoleIds?.length || inc.affectedPoleCount;
            const timeAgo = formatRelativeTime(inc.detectedAt);

            // Left indicator color
            const borderIndicatorColor = isSelected
              ? 'bg-amber-400'
              : isUnacked
              ? 'bg-fault-red'
              : isClosed
              ? 'bg-health-green'
              : 'bg-amber-400';

            return (
              <div
                key={inc.incidentId}
                onClick={() => onSelectIncident(inc)}
                className={`p-3 transition cursor-pointer relative flex gap-2.5 ${
                  isSelected
                    ? 'bg-surface-2'
                    : 'hover:bg-surface-2/60 bg-surface-1'
                }`}
              >
                {/* 3px Left Severity Bar Indicator */}
                <div className={`w-0.5 shrink-0 rounded-full my-0.5 ${borderIndicatorColor}`} />

                <div className="flex-1 min-w-0 space-y-1">
                  {/* Top Line: Fault Type & Status Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold tracking-wide text-content-primary">
                      {getFaultTypeLabel(inc.faultType)}
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
                      {getStatusLabel(inc.status)}
                    </span>
                  </div>

                  {/* ID & DT Asset info */}
                  <div className="text-[11px] font-mono text-content-tertiary flex items-center gap-1.5">
                    <span className="text-content-secondary">{inc.incidentId}</span>
                    <span>·</span>
                    <span>{inc.dtId}</span>
                  </div>

                  {/* Boundary Description */}
                  <p className="text-xs text-content-primary truncate">
                    {inc.boundary.description}
                  </p>

                  {/* Bottom Line: Poles + Confidence + Relative Age */}
                  <div className="flex items-center justify-between text-[11px] text-content-tertiary pt-0.5">
                    <span>
                      {darkPoles} poles affected · {confScore}% confidence
                    </span>
                    <span>{timeAgo}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

