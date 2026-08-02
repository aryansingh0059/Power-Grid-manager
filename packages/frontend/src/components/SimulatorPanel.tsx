import React, { useState } from 'react';
import {
  Play,
  Zap,
  Wrench,
  AlertTriangle,
  ShieldOff,
  Sliders,
  X,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { ApiClient } from '../api/client';

interface SimulatorPanelProps {
  onRefresh: () => void;
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

  // Noise options
  const [dropPackets, setDropPackets] = useState(false);

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
    setFeedbackMessage('Recommended demo targets selected (DT-001, Feeder FDR-01, Span P1->P2)');
  };

  return (
    <>
      {/* Bottom Quick-Action Bar */}
      <div className="bg-gray-900/95 border-t border-gray-800 backdrop-blur-md px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 z-40 shrink-0">
        {/* Label & Modal Opener */}
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
            <Play className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-200 font-outfit uppercase tracking-wider">
                Reviewer Fault Simulator Studio
              </span>
              <button
                onClick={() => setIsDrawerOpen(true)}
                className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono hover:bg-amber-500/30 transition flex items-center gap-1"
              >
                <Sliders className="w-3 h-3" />
                Open Demo Studio
              </button>
            </div>
            <span className="text-[10px] text-gray-400">
              Inject physical outages to observe the real ingestion + localization engine create tickets over Socket.IO
            </span>
          </div>
        </div>

        {/* Quick Simulator Buttons */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => runSim('span', () => ApiClient.injectSpanFault('P1', 'P2'))}
            disabled={!!loadingAction}
            className="px-3 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 font-medium transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-red-400" />
            Span Fault (P1→P2)
          </button>

          <button
            onClick={() => runSim('dt', () => ApiClient.injectDtFault('DT-001'))}
            disabled={!!loadingAction}
            className="px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-800/60 font-medium transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-purple-400" />
            DT Outage (DT-001)
          </button>

          <button
            onClick={() => runSim('kill', () => ApiClient.killDevice('KSPDB-SD01-D001-1001'))}
            disabled={!!loadingAction}
            className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 font-medium transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <ShieldOff className="w-3.5 h-3.5 text-gray-400" />
            Kill Device
          </button>

          <button
            onClick={() => runSim('repair', () => ApiClient.repairFault('DT-001'))}
            disabled={!!loadingAction}
            className="px-3 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 font-bold transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Wrench className="w-3.5 h-3.5 text-emerald-400" />
            Repair & Restore (DT-001)
          </button>
        </div>

        {/* Feedback Message */}
        {feedbackMessage && (
          <div className="text-xs font-mono text-amber-300 bg-amber-950/40 border border-amber-800/40 px-3 py-1 rounded-lg">
            {feedbackMessage}
          </div>
        )}
      </div>

      {/* Expanded Reviewer Studio Drawer / Modal */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-950/80">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-gray-100 font-outfit uppercase tracking-wider">
                  Reviewer Interactive Demo Studio
                </h3>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* Target Picker Bar */}
              <div className="flex items-center justify-between bg-gray-950 p-3 rounded-xl border border-gray-800">
                <div className="text-gray-300 font-medium">Quick Demo Preset:</div>
                <button
                  onClick={handlePickRecommended}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold hover:bg-amber-500/30 transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                  Pick Recommended Demo Target
                </button>
              </div>

              {/* Scenario Tabs */}
              <div className="flex gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800 font-mono">
                <button
                  onClick={() => setActiveTab('span')}
                  className={`flex-1 py-1.5 rounded-lg text-center font-medium transition ${
                    activeTab === 'span'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Span Fault
                </button>
                <button
                  onClick={() => setActiveTab('dt')}
                  className={`flex-1 py-1.5 rounded-lg text-center font-medium transition ${
                    activeTab === 'dt'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  DT Fault
                </button>
                <button
                  onClick={() => setActiveTab('feeder')}
                  className={`flex-1 py-1.5 rounded-lg text-center font-medium transition ${
                    activeTab === 'feeder'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Feeder Outage
                </button>
                <button
                  onClick={() => setActiveTab('device')}
                  className={`flex-1 py-1.5 rounded-lg text-center font-medium transition ${
                    activeTab === 'device'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Device Fail
                </button>
                <button
                  onClick={() => setActiveTab('outage')}
                  className={`flex-1 py-1.5 rounded-lg text-center font-medium transition ${
                    activeTab === 'outage'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Schedule
                </button>
              </div>

              {/* Tab Content & Explanation Card */}
              {activeTab === 'span' && (
                <div className="space-y-3 bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <div className="flex items-start gap-2 text-amber-300 bg-amber-950/40 p-3 rounded-lg border border-amber-800/40">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold mb-0.5">Scenario 1: LT Line Span Failure</div>
                      <p className="text-[11px] text-amber-200/80 leading-relaxed font-sans">
                        Simulates a physical line break between an energized upstream pole and a dark downstream pole.
                        The engine isolates candidate boundary <code className="text-amber-300">P2 → P3</code> and groups downstream dark poles into a single incident.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-gray-400 font-mono">Upstream Pole ID</label>
                      <input
                        type="text"
                        value={upstreamPole}
                        onChange={(e) => setUpstreamPole(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-mono">Downstream Pole ID</label>
                      <input
                        type="text"
                        value={downstreamPole}
                        onChange={(e) => setDownstreamPole(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-white font-mono"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      runSim('span', () => ApiClient.injectSpanFault(upstreamPole, downstreamPole))
                    }
                    disabled={!!loadingAction}
                    className="w-full py-2 bg-red-600 hover:bg-red-500 font-bold text-white rounded-xl transition flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    Inject Span Break ({upstreamPole} → {downstreamPole})
                  </button>
                </div>
              )}
              {activeTab === 'dt' && (
                <div className="space-y-3 bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <div className="flex items-start gap-2 text-purple-300 bg-purple-950/40 p-3 rounded-lg border border-purple-800/40">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold mb-0.5">Scenario 2: Distribution Transformer Failure</div>
                      <p className="text-[11px] text-purple-200/80 leading-relaxed font-sans">
                        Trips a Distribution Transformer breaker. Tests DT-level outage detection when 100% of observable poles under the transformer report de-energized.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 font-mono">Transformer ID</label>
                    <input
                      type="text"
                      value={dtId}
                      onChange={(e) => setDtId(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>

                  <button
                    onClick={() => runSim('dt', () => ApiClient.injectDtFault(dtId))}
                    disabled={!!loadingAction}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 font-bold text-white rounded-xl transition flex items-center justify-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Inject Transformer Outage ({dtId})
                  </button>
                </div>
              )}

              {activeTab === 'feeder' && (
                <div className="space-y-3 bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <div className="flex items-start gap-2 text-amber-300 bg-amber-950/40 p-3 rounded-lg border border-amber-800/40">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold mb-0.5">Scenario 3: 11kV Feeder Outage</div>
                      <p className="text-[11px] text-amber-200/80 leading-relaxed font-sans">
                        Trips an entire 11kV feeder breaker at the substation. Tests multi-DT fault grouping across all transformers on feeder {feederId}.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 font-mono">Feeder ID</label>
                    <input
                      type="text"
                      value={feederId}
                      onChange={(e) => setFeederId(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>

                  <button
                    onClick={() => runSim('feeder', () => ApiClient.injectFeederFault(feederId))}
                    disabled={!!loadingAction}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-500 font-bold text-gray-950 rounded-xl transition flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    Inject Feeder Trip ({feederId})
                  </button>
                </div>
              )}

              {activeTab === 'device' && (
                <div className="space-y-3 bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <div className="flex items-start gap-2 text-blue-300 bg-blue-950/40 p-3 rounded-lg border border-blue-800/40">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold mb-0.5">Scenario 4: Device Failure (False-Positive Test)</div>
                      <p className="text-[11px] text-blue-200/80 leading-relaxed font-sans">
                        Silences telemetry on an IoT device while physical power stays healthy. Proves post-order sensor anomaly filter prevents false line-fault tickets.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 font-mono">Device ID</label>
                    <input
                      type="text"
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>

                  <button
                    onClick={() => runSim('kill', () => ApiClient.killDevice(deviceId))}
                    disabled={!!loadingAction}
                    className="w-full py-2 bg-gray-800 hover:bg-gray-700 font-bold text-gray-200 rounded-xl transition flex items-center justify-center gap-2"
                  >
                    <ShieldOff className="w-4 h-4" />
                    Silence Device Telemetry ({deviceId})
                  </button>
                </div>
              )}

              {/* Telemetry Noise Toggles */}
              <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 space-y-2">
                <div className="text-[10px] text-gray-400 uppercase font-mono font-semibold">
                  Optional Telemetry Noise Toggles
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-gray-300 font-mono">
                  <input
                    type="checkbox"
                    checked={dropPackets}
                    onChange={(e) => setDropPackets(e.target.checked)}
                    className="rounded bg-gray-900 border-gray-700"
                  />
                  <span>Simulate 30% dying packet loss (non-deterministic mode)</span>
                </label>
              </div>

              {/* Global Repair Controls */}
              <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
                <div className="text-gray-400 font-mono text-[11px]">
                  Active Faults: <span className="text-amber-400 font-bold">{activeFaults.length > 0 ? activeFaults.join(', ') : 'None'}</span>
                </div>

                <button
                  onClick={() => runSim('repair', () => ApiClient.repairFault(dtId))}
                  disabled={!!loadingAction}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 font-bold text-gray-950 rounded-xl transition flex items-center gap-2"
                >
                  <Wrench className="w-4 h-4" />
                  Repair & Restore Grid Power
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
