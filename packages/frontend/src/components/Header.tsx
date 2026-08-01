import React from 'react';
import { Activity, ShieldAlert, Zap, RefreshCw } from 'lucide-react';
import type { Incident } from '@pgm/shared';

interface HeaderProps {
  incidents: Incident[];
  isLive: boolean;
  onRefresh: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  incidents,
  isLive,
  onRefresh,
  isLoading,
}) => {
  const activeIncidents = incidents.filter((i) => i.status !== 'closed');
  const criticalCount = activeIncidents.filter((i) => i.status === 'detected').length;
  const inProgressCount = activeIncidents.filter((i) =>
    ['acknowledged', 'crew_assigned', 'resolved'].includes(i.status)
  ).length;

  const totalDarkPoles = activeIncidents.reduce(
    (sum, inc) => sum + (inc.affectedPoleIds?.length || 0),
    0
  );

  return (
    <header className="bg-gray-900/90 border-b border-gray-800 backdrop-blur-md px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-2xl">
      {/* Brand & Sub-division Info */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
          <Zap className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-100 font-outfit tracking-wide">
              KSPTCL — LT Grid Control Room
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
              SUBDIVISION-04
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Real-Time Low Tension Fault Detection & Automated Restoration Console
          </p>
        </div>
      </div>

      {/* Primary Grid Operational Metrics */}
      <div className="flex items-center gap-6 bg-gray-950/60 px-4 py-2 rounded-xl border border-gray-800/80">
        {/* Critical Unacknowledged */}
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-red-500/10 text-red-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-gray-400 font-medium">Unacknowledged</div>
            <div className="text-sm font-bold text-red-400 font-mono">{criticalCount}</div>
          </div>
        </div>

        <div className="h-6 w-px bg-gray-800" />

        {/* In Repair */}
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-gray-400 font-medium">In Repair</div>
            <div className="text-sm font-bold text-amber-400 font-mono">{inProgressCount}</div>
          </div>
        </div>

        <div className="h-6 w-px bg-gray-800" />

        {/* Affected Poles */}
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-gray-400 font-medium">Dark Poles</div>
            <div className="text-sm font-bold text-purple-300 font-mono">{totalDarkPoles}</div>
          </div>
        </div>
      </div>

      {/* Actions & Socket Live Badge */}
      <div className="flex items-center gap-3">
        {/* Socket.IO Live Indicator */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium font-mono ${
            isLive
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isLive ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
            }`}
          />
          {isLive ? 'LIVE FEED' : 'POLLING'}
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition flex items-center justify-center disabled:opacity-50"
          title="Refresh Grid State"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
};
