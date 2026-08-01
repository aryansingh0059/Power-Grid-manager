import React, { useState } from 'react';
import { Play, Zap, Wrench, AlertTriangle, ShieldOff } from 'lucide-react';
import { ApiClient } from '../api/client';

interface SimulatorPanelProps {
  onRefresh: () => void;
}

export const SimulatorPanel: React.FC<SimulatorPanelProps> = ({ onRefresh }) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const runSim = async (name: string, fn: () => Promise<{ message?: string }>) => {
    setLoadingAction(name);
    setFeedbackMessage(null);
    try {
      const res = await fn();
      setFeedbackMessage(res.message || 'Simulation command executed');
      await ApiClient.runLocalization();
      onRefresh();
    } catch (err: unknown) {
      setFeedbackMessage(`Error: ${(err as Error).message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="bg-gray-900/95 border-t border-gray-800 backdrop-blur-md px-6 py-3 flex flex-wrap items-center justify-between gap-4 z-20">
      {/* Label */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
          <Play className="w-4 h-4" />
        </div>
        <div>
          <span className="text-xs font-bold text-gray-200 font-outfit uppercase tracking-wider block">
            Grid Simulator Bar
          </span>
          <span className="text-[10px] text-gray-400">
            Control room testing tool — inject physical breaks & verify telemetry
          </span>
        </div>
      </div>

      {/* Simulator Buttons */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => runSim('span', () => ApiClient.injectSpanFault('P2', 'P3'))}
          disabled={!!loadingAction}
          className="px-3 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 font-medium transition flex items-center gap-1.5 disabled:opacity-50"
        >
          <Zap className="w-3.5 h-3.5 text-red-400" />
          Span Fault (P2→P3)
        </button>

        <button
          onClick={() => runSim('dt', () => ApiClient.injectDtFault('DT1'))}
          disabled={!!loadingAction}
          className="px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-800/60 font-medium transition flex items-center gap-1.5 disabled:opacity-50"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-purple-400" />
          DT Outage (DT1)
        </button>

        <button
          onClick={() => runSim('feeder', () => ApiClient.injectFeederFault('F1'))}
          disabled={!!loadingAction}
          className="px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/60 font-medium transition flex items-center gap-1.5 disabled:opacity-50"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          Feeder Outage (F1)
        </button>

        <button
          onClick={() => runSim('kill', () => ApiClient.killDevice('DEV-005'))}
          disabled={!!loadingAction}
          className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 font-medium transition flex items-center gap-1.5 disabled:opacity-50"
        >
          <ShieldOff className="w-3.5 h-3.5 text-gray-400" />
          Kill Device (DEV-005)
        </button>

        <button
          onClick={() => runSim('repair', () => ApiClient.repairFault('DT1'))}
          disabled={!!loadingAction}
          className="px-3 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 font-bold transition flex items-center gap-1.5 disabled:opacity-50"
        >
          <Wrench className="w-3.5 h-3.5 text-emerald-400" />
          Repair & Restore (DT1)
        </button>
      </div>

      {/* Feedback Message */}
      {feedbackMessage && (
        <div className="text-xs font-mono text-amber-300 bg-amber-950/40 border border-amber-800/40 px-3 py-1 rounded-lg">
          {feedbackMessage}
        </div>
      )}
    </div>
  );
};
