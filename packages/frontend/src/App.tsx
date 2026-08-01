import { useState, useEffect } from 'react';

interface HealthData {
  status: string;
  db: 'connected' | 'disconnected';
  timestamp: string;
  version: string;
}

type BackendState = 'loading' | 'ok' | 'error';

function StatusIndicator({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'} ${
            ok ? '' : 'animate-pulse'
          }`}
        />
        <span className={`text-sm font-mono ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
          {ok ? 'online' : 'offline'}
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [state, setState] = useState<BackendState>('loading');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<HealthData>;
      })
      .then((data) => {
        setHealth(data);
        setState('ok');
      })
      .catch(() => setState('error'));
  }, []);

  const dbConnected = health?.db === 'connected';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header className="bg-gray-900/80 backdrop-blur border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-amber-400 font-bold text-base tracking-widest uppercase">
            KSDB
          </span>
          <span className="text-gray-700">|</span>
          <span className="text-gray-300 text-sm">Fault Management Console</span>
        </div>

        <div className="flex items-center gap-1 text-xs">
          {state === 'loading' && (
            <span className="text-gray-500 animate-pulse">Connecting…</span>
          )}
          {state === 'error' && (
            <span className="text-red-400">Backend unreachable</span>
          )}
          {state === 'ok' && health && (
            <span className="text-gray-500">
              v{health.version} &nbsp;·&nbsp; checked{' '}
              {new Date(health.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      {/* ── Centre card ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-amber-400 tracking-tight">
              Karnataka State Power Distribution Board
            </h1>
            <p className="text-gray-500 text-sm">
              Real-time LT network fault detection &amp; incident management
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl px-6 py-5 space-y-1">
            <p className="text-gray-600 text-xs uppercase tracking-widest mb-3 font-medium">
              System Status
            </p>

            <StatusIndicator ok={state !== 'error'} label="Backend API" />
            <StatusIndicator ok={state === 'ok' && dbConnected} label="Database" />
            <StatusIndicator ok={true} label="Console" />
          </div>

          <p className="text-center text-gray-700 text-xs">
            Operator console and map — available after Task 2
          </p>
        </div>
      </main>
    </div>
  );
}
