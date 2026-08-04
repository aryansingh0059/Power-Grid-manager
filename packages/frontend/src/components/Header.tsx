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
  const unacknowledgedCount = activeIncidents.filter((i) => i.status === 'detected').length;
  const inRepairCount = activeIncidents.filter((i) =>
    ['acknowledged', 'crew_assigned', 'resolved'].includes(i.status)
  ).length;

  const totalDarkPoles = activeIncidents.reduce(
    (sum, inc) => sum + (inc.affectedPoleIds?.length || 0),
    0
  );

  return (
    <header className="bg-surface-1 border-b border-border px-4 py-2 flex items-center justify-between gap-4 sticky top-0 z-30 shrink-0 select-none">
      {/* Brand & Subdivision Identity */}
      <div className="flex items-center gap-2.5">
        <Zap className="w-4 h-4 text-amber-400 shrink-0" />
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold text-content-primary tracking-tight">
            KSPTCL Grid Operations
          </h1>
          <span className="text-xs text-content-tertiary font-normal">
            Subdivision 04 · LT Network
          </span>
        </div>
      </div>

      {/* Operational Counters (Status Bar Style) */}
      <div className="flex items-center gap-4 text-xs">
        {/* Unacknowledged */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-tertiary">Unacknowledged</span>
          <span
            className={`font-mono font-semibold ${
              unacknowledgedCount > 0 ? 'text-fault-red' : 'text-content-secondary'
            }`}
          >
            {unacknowledgedCount}
          </span>
        </div>

        <span className="text-border-subtle font-light">|</span>

        {/* In Repair */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-tertiary">In Repair</span>
          <span
            className={`font-mono font-semibold ${
              inRepairCount > 0 ? 'text-amber-400' : 'text-content-secondary'
            }`}
          >
            {inRepairCount}
          </span>
        </div>

        <span className="text-border-subtle font-light">|</span>

        {/* Dark Poles */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-tertiary">Dark Poles</span>
          <span
            className={`font-mono font-semibold ${
              totalDarkPoles > 0 ? 'text-fault-red' : 'text-content-secondary'
            }`}
          >
            {totalDarkPoles}
          </span>
        </div>
      </div>

      {/* Realtime Live & Refresh Controls */}
      <div className="flex items-center gap-3">
        {/* Live Indicator */}
        <div className="flex items-center gap-1.5 text-xs text-content-secondary">
          <span
            className={`w-2 h-2 rounded-full ${
              isLive ? 'bg-health-green animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="font-medium text-[11px]">{isLive ? 'Live' : 'Polling'}</span>
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1.5 rounded hover:bg-surface-3 text-content-secondary hover:text-content-primary transition disabled:opacity-40"
          title="Refresh Grid State"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
};

