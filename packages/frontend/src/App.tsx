import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { PoleRecord, Incident } from '@pgm/shared';
import { ApiClient } from './api/client';
import { subscribeToRealtimeEvents } from './api/socket';
import { Header } from './components/Header';
import { IncidentList } from './components/IncidentList';
import { GridMap } from './components/GridMap';
import { IncidentDetail } from './components/IncidentDetail';
import { SimulatorPanel } from './components/SimulatorPanel';
import { AlertCircle } from 'lucide-react';

export function App() {
  const [poles, setPoles] = useState<PoleRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Keep a ref to selectedIncident so refreshData doesn't need it as a dep
  const selectedIncidentRef = useRef<Incident | null>(null);
  selectedIncidentRef.current = selectedIncident;

  // Fetch complete grid state from backend
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedPoles, fetchedIncidents] = await Promise.all([
        ApiClient.getPoles(),
        ApiClient.getIncidents(),
      ]);

      setPoles(fetchedPoles);
      setIncidents(fetchedIncidents);

      // Keep current selected incident updated if present (use ref to avoid dep cycle)
      const current = selectedIncidentRef.current;
      if (current) {
        const updated = fetchedIncidents.find((i) => i.incidentId === current.incidentId);
        if (updated) setSelectedIncident(updated);
      } else if (fetchedIncidents.length > 0) {
        // Select first active incident by default
        const active = fetchedIncidents.find((i) => i.status !== 'closed') || fetchedIncidents[0];
        setSelectedIncident(active);
      }
    } catch (err: unknown) {
      console.error('[App] Failed to load grid data:', err);
      setError((err as Error).message || 'Failed to connect to backend server');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshData();
  }, []);

  // Real-time Socket.IO subscriptions
  useEffect(() => {
    const unsubscribe = subscribeToRealtimeEvents({
      onIncidentCreated: (newIncident) => {
        setIncidents((prev) => [newIncident, ...prev.filter((i) => i.incidentId !== newIncident.incidentId)]);
        setSelectedIncident(newIncident);
      },
      onIncidentUpdated: (updatedIncident) => {
        setIncidents((prev) =>
          prev.map((i) => (i.incidentId === updatedIncident.incidentId ? updatedIncident : i))
        );
        setSelectedIncident((curr: Incident | null) =>
          curr?.incidentId === updatedIncident.incidentId ? updatedIncident : curr
        );
        ApiClient.getPoles().then(setPoles).catch(console.error);
      },
      onIncidentVerified: (verifiedIncident) => {
        setIncidents((prev) =>
          prev.map((i) => (i.incidentId === verifiedIncident.incidentId ? verifiedIncident : i))
        );
        setSelectedIncident((curr: Incident | null) =>
          curr?.incidentId === verifiedIncident.incidentId ? verifiedIncident : curr
        );
        ApiClient.getPoles().then(setPoles).catch(console.error);
      },
      onNetworkStateChanged: () => {
        ApiClient.getPoles().then(setPoles).catch(console.error);
        ApiClient.getIncidents().then(setIncidents).catch(console.error);
      },
    });

    return () => unsubscribe();
  }, []);

  // Incident Actions Handlers
  const handleAcknowledge = async (id: string, note?: string) => {
    await ApiClient.acknowledgeIncident(id, note);
    await refreshData();
  };

  const handleAssignCrew = async (id: string, crewId: string, crewName: string) => {
    await ApiClient.assignCrew(id, crewId, crewName);
    await refreshData();
  };

  const handleResolve = async (id: string, note?: string) => {
    await ApiClient.resolveIncident(id, note);
    await refreshData();
  };

  const handleVerify = async (id: string) => {
    await ApiClient.verifyRestoration(id);
    await refreshData();
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-950 text-gray-100 overflow-hidden font-sans select-none">
      {/* Header Bar */}
      <Header
        incidents={incidents}
        isLive={true}
        onRefresh={refreshData}
        isLoading={isLoading}
      />

      {/* Main Grid Content Area */}
      <main className="flex-1 flex gap-4 p-4 min-h-0 overflow-hidden">
        {/* Error Banner */}
        {error && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-950 border border-red-700 text-red-200 px-4 py-2 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{error}</span>
            <button
              onClick={refreshData}
              className="ml-2 underline text-red-300 hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Column 1: Incident Feed (Left ~340px) */}
        <section className="w-80 lg:w-96 shrink-0 h-full">
          <IncidentList
            incidents={incidents}
            selectedIncident={selectedIncident}
            onSelectIncident={setSelectedIncident}
          />
        </section>

        {/* Column 2: GIS Grid Map (Center Flex-1) */}
        <section className="flex-1 h-full min-w-[400px]">
          <GridMap
            poles={poles}
            incidents={incidents}
            selectedIncident={selectedIncident}
            onSelectIncident={setSelectedIncident}
          />
        </section>

        {/* Column 3: Incident Details & Action Panel (Right ~380px) */}
        <section className="w-80 lg:w-96 shrink-0 h-full">
          <IncidentDetail
            incident={selectedIncident}
            onAcknowledge={handleAcknowledge}
            onAssignCrew={handleAssignCrew}
            onResolve={handleResolve}
            onVerify={handleVerify}
          />
        </section>
      </main>

      {/* Bottom Simulation Bar */}
      <SimulatorPanel onRefresh={refreshData} />
    </div>
  );
}
export default App;
