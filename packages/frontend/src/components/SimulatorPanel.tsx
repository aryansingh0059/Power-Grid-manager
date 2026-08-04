import React, { useState } from 'react';
import {
  Play,
  Zap,
  Wrench,
  AlertTriangle,
  ShieldOff,
  X,
  Info,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { ApiClient } from '../api/client';

interface SimulatorPanelProps {
  onRefresh: () => void;
}

function getActiveSimulationText(activeFaults: string[]): string {
  if (activeFaults.length === 0) return 'None';
  return activeFaults.map((f) => {
    switch (f) {
      case 'span':
        return 'Span fault';
      case 'dt':
        return 'Transformer fault';
      case 'feeder':
        return 'Feeder outage';
      case 'kill':
        return 'Device failure';
      case 'outage':
        return 'Scheduled outage';
      default:
        return f;
    }
  }).join(', ');
}

export const SimulatorPanel: React.FC<SimulatorPanelProps> = ({ onRefresh }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'span' | 'dt' | 'feeder' | 'device' | 'outage'>('span');

  // Input states
  const [upstreamPole, setUpstreamPole] = useState('P1');
  const [downstreamPole, setDownstreamPole] = useState('P2');
  const [dtId, setDtId] = useState('DT-001');
  const [feederId, setFeederId] = useState('FDR-01');
  const [deviceId, setDeviceId] = useState('KSPDB-SD01-D001-1001');

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [activeFaults, setActiveFaults] = useState<string[]>([]);

  const runSim = async (name: string, fn: () => Promise<{ message?: string }>) => {
    setLoadingAction(name);
    setFeedbackMessage(null);
    try {
      const res = await fn();
      setFeedbackMessage(res.message || 'Simulation command executed');
      if (name !== 'repair') {
        setActiveFaults((prev) => Array.from(new Set([...prev, name])));
      } else {
        setActiveFaults([]);
      }
      await ApiClient.runLocalization();
      onRefresh();
    } catch (err: unknown) {
      setFeedbackMessage(`Error: ${(err as Error).message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePickRecommended = () => {
    setUpstreamPole('P1');
    setDownstreamPole('P2');
    setDtId('DT-001');
    setFeederId('FDR-01');
    setDeviceId('KSPDB-SD01-D001-1001');
    setFeedbackMessage('Demo target set to DT-001 (P1 → P2)');
  };

  const activeSimText = getActiveSimulationText(activeFaults);
  const hasActiveFault = activeFaults.length > 0;

  return (
    <>
      {/* Permanent Bottom Launcher Bar (Quiet & Unobtrusive) */}
      <div className="bg-surface-1 border-t border-border px-4 py-1.5 flex items-center justify-between gap-4 z-40 shrink-0 text-xs select-none">
        {/* Left: Launcher Button & Identity */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="px-2.5 py-1 rounded bg-surface-2 hover:bg-surface-3 border border-border text-content-primary font-medium transition flex items-center gap-1.5 text-xs"
          >
            <Play className="w-3 h-3 text-amber-400 fill-amber-400" />
            Open Simulator
          </button>
          <span className="text-content-tertiary text-[11px] hidden sm:inline">
            Demo Simulator
          </span>
        </div>

        {/* Center: Active Simulation Status */}
        <div className="flex items-center gap-2 text-[11px] text-content-tertiary">
          <span>Active simulation:</span>
          <span className={`font-medium ${hasActiveFault ? 'text-amber-400 font-mono' : 'text-content-secondary'}`}>
            {activeSimText}
          </span>
        </div>

        {/* Right: Contextual Quick Repair Action */}
        <div className="flex items-center gap-2">
          {hasActiveFault && (
            <button
              onClick={() => runSim('repair', () => ApiClient.repairFault(dtId))}
              disabled={!!loadingAction}
              className="px-2.5 py-1 rounded bg-health-green hover:bg-emerald-600 text-surface-0 font-semibold text-xs transition flex items-center gap-1 disabled:opacity-50"
            >
              <Wrench className="w-3 h-3" />
              Repair Fault
            </button>
          )}

          {feedbackMessage && (
            <span className="text-[11px] text-content-tertiary font-mono truncate max-w-xs">
              {feedbackMessage}
            </span>
          )}
        </div>
      </div>

      {/* Demo Simulator Modal */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[9999] bg-surface-0/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className="bg-surface-1 border border-border w-full max-w-xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-surface-2/40">
              <div>
                <h3 className="text-sm font-semibold text-content-primary">
                  Demo Simulator
                </h3>
                <p className="text-[11px] text-content-tertiary">
                  Inject controlled network conditions to verify detection and restoration behavior.
                </p>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded text-content-tertiary hover:text-content-primary hover:bg-surface-3 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Recommended Target Selector */}
              <div className="flex items-center justify-between bg-surface-2 p-2.5 rounded border border-border">
                <span className="text-content-secondary">Target selection preset:</span>
                <button
                  onClick={handlePickRecommended}
                  className="px-2.5 py-1 rounded bg-surface-1 hover:bg-surface-3 text-amber-400 border border-border font-medium transition flex items-center gap-1 text-[11px]"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Use demo target
                </button>
              </div>

              {/* Scenario Tabs */}
              <div className="flex border-b border-border text-xs">
                <button
                  onClick={() => setActiveTab('span')}
                  className={`pb-2 px-3 font-medium transition border-b-2 ${
                    activeTab === 'span'
                      ? 'border-fault-red text-fault-red'
                      : 'border-transparent text-content-tertiary hover:text-content-secondary'
                  }`}
                >
                  Span Fault
                </button>
                <button
                  onClick={() => setActiveTab('dt')}
                  className={`pb-2 px-3 font-medium transition border-b-2 ${
                    activeTab === 'dt'
                      ? 'border-amber-400 text-amber-400'
                      : 'border-transparent text-content-tertiary hover:text-content-secondary'
                  }`}
                >
                  DT Fault
                </button>
                <button
                  onClick={() => setActiveTab('feeder')}
                  className={`pb-2 px-3 font-medium transition border-b-2 ${
                    activeTab === 'feeder'
                      ? 'border-amber-400 text-amber-400'
                      : 'border-transparent text-content-tertiary hover:text-content-secondary'
                  }`}
                >
                  Feeder Outage
                </button>
                <button
                  onClick={() => setActiveTab('device')}
                  className={`pb-2 px-3 font-medium transition border-b-2 ${
                    activeTab === 'device'
                      ? 'border-info-blue text-info-blue'
                      : 'border-transparent text-content-tertiary hover:text-content-secondary'
                  }`}
                >
                  Device Failure
                </button>
                <button
                  onClick={() => setActiveTab('outage')}
                  className={`pb-2 px-3 font-medium transition border-b-2 ${
                    activeTab === 'outage'
                      ? 'border-health-green text-health-green'
                      : 'border-transparent text-content-tertiary hover:text-content-secondary'
                  }`}
                >
                  Scheduled Outage
                </button>
              </div>

              {/* Tab Scenario Details */}
              {activeTab === 'span' && (
                <div className="space-y-3 bg-surface-2 p-3 rounded border border-border">
                  <p className="text-content-secondary leading-relaxed text-[11px]">
                    Simulates a physical line break between two adjacent LT poles. Downstream poles lose power and the localization engine isolates candidate boundary span.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-content-tertiary">Upstream Pole</label>
                      <input
                        type="text"
                        value={upstreamPole}
                        onChange={(e) => setUpstreamPole(e.target.value)}
                        className="w-full bg-surface-1 border border-border rounded px-2 py-1 text-content-primary font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-content-tertiary">Downstream Pole</label>
                      <input
                        type="text"
                        value={downstreamPole}
                        onChange={(e) => setDownstreamPole(e.target.value)}
                        className="w-full bg-surface-1 border border-border rounded px-2 py-1 text-content-primary font-mono text-xs"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      runSim('span', () => ApiClient.injectSpanFault(upstreamPole, downstreamPole))
                    }
                    disabled={!!loadingAction}
                    className="w-full py-1.5 bg-fault-red hover:bg-red-600 font-semibold text-surface-0 rounded transition flex items-center justify-center gap-1.5 text-xs disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Inject Span Fault ({upstreamPole} → {downstreamPole})
                  </button>
                </div>
              )}

              {activeTab === 'dt' && (
                <div className="space-y-3 bg-surface-2 p-3 rounded border border-border">
                  <p className="text-content-secondary leading-relaxed text-[11px]">
                    Trips a Distribution Transformer breaker. Tests DT-level outage localization when 100% of poles under the transformer report de-energized.
                  </p>

                  <div>
                    <label className="text-[10px] text-content-tertiary">Distribution Transformer ID</label>
                    <input
                      type="text"
                      value={dtId}
                      onChange={(e) => setDtId(e.target.value)}
                      className="w-full bg-surface-1 border border-border rounded px-2 py-1 text-content-primary font-mono text-xs"
                    />
                  </div>

                  <button
                    onClick={() => runSim('dt', () => ApiClient.injectDtFault(dtId))}
                    disabled={!!loadingAction}
                    className="w-full py-1.5 bg-amber-400 hover:bg-amber-500 font-semibold text-surface-0 rounded transition flex items-center justify-center gap-1.5 text-xs disabled:opacity-50"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Inject Transformer Outage ({dtId})
                  </button>
                </div>
              )}

              {activeTab === 'feeder' && (
                <div className="space-y-3 bg-surface-2 p-3 rounded border border-border">
                  <p className="text-content-secondary leading-relaxed text-[11px]">
                    Trips an entire 11kV feeder breaker at the substation. Tests multi-DT fault grouping across all transformers on feeder {feederId}.
                  </p>

                  <div>
                    <label className="text-[10px] text-content-tertiary">Feeder ID</label>
                    <input
                      type="text"
                      value={feederId}
                      onChange={(e) => setFeederId(e.target.value)}
                      className="w-full bg-surface-1 border border-border rounded px-2 py-1 text-content-primary font-mono text-xs"
                    />
                  </div>

                  <button
                    onClick={() => runSim('feeder', () => ApiClient.injectFeederFault(feederId))}
                    disabled={!!loadingAction}
                    className="w-full py-1.5 bg-amber-400 hover:bg-amber-500 font-semibold text-surface-0 rounded transition flex items-center justify-center gap-1.5 text-xs disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Inject Feeder Outage ({feederId})
                  </button>
                </div>
              )}

              {activeTab === 'device' && (
                <div className="space-y-3 bg-surface-2 p-3 rounded border border-border">
                  <p className="text-content-secondary leading-relaxed text-[11px]">
                    Silences telemetry on an IoT device while physical power stays healthy. Verifies post-order sensor anomaly filter prevents false line-fault tickets.
                  </p>

                  <div>
                    <label className="text-[10px] text-content-tertiary">Device ID</label>
                    <input
                      type="text"
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value)}
                      className="w-full bg-surface-1 border border-border rounded px-2 py-1 text-content-primary font-mono text-xs"
                    />
                  </div>

                  <button
                    onClick={() => runSim('kill', () => ApiClient.killDevice(deviceId))}
                    disabled={!!loadingAction}
                    className="w-full py-1.5 bg-surface-1 hover:bg-surface-3 border border-border text-content-primary font-medium rounded transition flex items-center justify-center gap-1.5 text-xs disabled:opacity-50"
                  >
                    <ShieldOff className="w-3.5 h-3.5 text-content-tertiary" />
                    Simulate Hardware Failure ({deviceId})
                  </button>
                </div>
              )}

              {activeTab === 'outage' && (
                <div className="space-y-3 bg-surface-2 p-3 rounded border border-border">
                  <p className="text-content-secondary leading-relaxed text-[11px]">
                    Simulates a scheduled maintenance outage window. Cross-references detected fault boundaries against planned maintenance schedules.
                  </p>

                  <div className="flex items-center gap-2 text-content-secondary text-[11px]">
                    <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Feeder maintenance window active for FDR-01</span>
                  </div>
                </div>
              )}

              {/* Active Simulation Status & Repair Action */}
              <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
                <div>
                  <span className="text-content-tertiary">Active simulation: </span>
                  <span className={`font-medium ${hasActiveFault ? 'text-amber-400 font-mono' : 'text-content-secondary'}`}>
                    {activeSimText}
                  </span>
                </div>

                <button
                  onClick={() => runSim('repair', () => ApiClient.repairFault(dtId))}
                  disabled={!!loadingAction}
                  className="px-3 py-1.5 bg-health-green hover:bg-emerald-600 font-semibold text-surface-0 rounded transition flex items-center gap-1 text-xs disabled:opacity-50"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  {hasActiveFault ? 'Repair Fault' : 'Restore Grid State'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

