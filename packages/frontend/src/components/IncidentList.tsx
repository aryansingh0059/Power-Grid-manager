import React, { useState } from 'react';
import { Search, AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import type { Incident } from '@pgm/shared';

interface IncidentListProps {
  incidents: Incident[];
  selectedIncident: Incident | null;
  onSelectIncident: (inc: Incident) => void;
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

  return (
    <div className="flex flex-col h-full bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Header & Tabs */}
      <div className="p-4 border-b border-gray-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-bold text-gray-100 font-outfit uppercase tracking-wider">
              Incident Console
            </h2>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 font-mono">
            {filtered.length} tickets
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by DT, pole, feeder, pincode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/50 transition font-sans"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800/60 text-xs">
          <button
            onClick={() => setStatusFilter('active')}
            className={`flex-1 py-1 rounded-lg text-center font-medium transition ${
              statusFilter === 'active'
                ? 'bg-gray-800 text-gray-100 shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Active ({incidents.filter((i) => i.status !== 'closed').length})
          </button>
          <button
            onClick={() => setStatusFilter('detected')}
            className={`flex-1 py-1 rounded-lg text-center font-medium transition ${
              statusFilter === 'detected'
                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Unacked
          </button>
          <button
            onClick={() => setStatusFilter('in_repair')}
            className={`flex-1 py-1 rounded-lg text-center font-medium transition ${
              statusFilter === 'in_repair'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            In Repair
          </button>
          <button
            onClick={() => setStatusFilter('closed')}
            className={`flex-1 py-1 rounded-lg text-center font-medium transition ${
              statusFilter === 'closed'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Closed
          </button>
        </div>
      </div>

      {/* Incident Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500 space-y-2">
            <CheckCircle className="w-8 h-8 text-emerald-500/40" />
            <p className="text-xs font-medium">No incident tickets match your filters.</p>
          </div>
        ) : (
          filtered.map((inc) => {
            const isSelected = selectedIncident?.incidentId === inc.incidentId;
            const isUnacked = inc.status === 'detected';
            const isClosed = inc.status === 'closed';

            const confScore = Math.round(
              inc.boundary.confidence <= 1 ? inc.boundary.confidence * 100 : inc.boundary.confidence
            );
            const precision = inc.boundary.precision ?? 'ESTIMATED_SPAN';

            return (
              <div
                key={inc.incidentId}
                onClick={() => onSelectIncident(inc)}
                className={`p-3.5 rounded-xl border transition cursor-pointer relative ${
                  isSelected
                    ? 'bg-gray-800/90 border-amber-500/80 shadow-lg shadow-amber-500/10'
                    : isUnacked
                    ? 'bg-red-950/20 border-red-800/40 hover:border-red-600/60'
                    : isClosed
                    ? 'bg-gray-950/40 border-gray-800/40 opacity-75 hover:opacity-100'
                    : 'bg-gray-950/80 border-gray-800/80 hover:border-gray-700'
                }`}
              >
                {/* Top Row: Ticket ID & Status Badge */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-gray-200">
                    <span className="text-amber-400">{inc.incidentId}</span>
                    <span className="text-gray-500">•</span>
                    <span className="text-gray-400">{inc.dtId}</span>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md font-mono ${
                      inc.status === 'detected'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                        : inc.status === 'acknowledged'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : inc.status === 'crew_assigned'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : inc.status === 'resolved'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {inc.status}
                  </span>
                </div>

                {/* Boundary Description */}
                <p className="text-xs text-gray-300 font-medium line-clamp-1 mb-2">
                  {inc.boundary.description}
                </p>

                {/* Metadata Row: Precision, Confidence, Dark Poles */}
                <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-800/50">
                  <div className="flex items-center gap-2 font-mono">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        precision === 'EXACT_SPAN'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {precision}
                    </span>

                    <span className="flex items-center gap-1 text-purple-300">
                      <Zap className="w-3 h-3 text-purple-400" />
                      {inc.affectedPoleIds?.length || inc.affectedPoleCount} dark
                    </span>
                  </div>

                  {/* Confidence Pill */}
                  <div className="flex items-center gap-1 font-mono text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{confScore}% Conf</span>
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
