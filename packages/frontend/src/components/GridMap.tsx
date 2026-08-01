import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { PoleRecord, Incident } from '@pgm/shared';

interface GridMapProps {
  poles: PoleRecord[];
  incidents: Incident[];
  selectedIncident: Incident | null;
  onSelectIncident: (inc: Incident) => void;
}

export const GridMap: React.FC<GridMapProps> = ({
  poles,
  incidents,
  selectedIncident,
  onSelectIncident,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize map instance once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Center on Bengaluru (default synthetic city center)
    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.5946],
      zoom: 15,
      preferCanvas: true,
      zoomControl: true,
    });

    // Dark styled OpenStreetMap tiles
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      className: 'map-tiles-dark',
    });

    tileLayer.addTo(map);
    mapRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map markers and overlays on poles/incidents change
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // Map of pole locations for fast lookup
    const polePosMap = new Map<string, [number, number]>();
    for (const p of poles) {
      polePosMap.set(p.poleId, [p.lat, p.lon]);
    }

    // Set of all dark pole IDs from active incidents
    const darkPoleIds = new Set<string>();
    const activeIncidents = incidents.filter((i) => i.status !== 'closed');

    for (const inc of activeIncidents) {
      for (const pId of inc.affectedPoleIds || []) {
        darkPoleIds.add(pId);
      }
    }

    // Render Canvas Circle Markers for Poles
    poles.forEach((p) => {
      const isDark = darkPoleIds.has(p.poleId);
      const isUpstream = selectedIncident?.boundary.upstreamPoleId === p.poleId;
      const isDownstream = selectedIncident?.boundary.downstreamPoleId === p.poleId;

      let radius = 3;
      let color = '#0284c7'; // Healthy cyan blue
      let fillColor = '#38bdf8';
      let fillOpacity = 0.35;

      if (isDark) {
        radius = 5;
        color = '#dc2626';
        fillColor = '#ef4444'; // Dark pole red
        fillOpacity = 0.85;
      }

      if (isUpstream) {
        radius = 8;
        color = '#16a34a';
        fillColor = '#22c55e'; // Upstream boundary pole green
        fillOpacity = 1;
      }

      if (isDownstream) {
        radius = 9;
        color = '#b91c1c';
        fillColor = '#f87171'; // Downstream boundary pole red
        fillOpacity = 1;
      }

      const marker = L.circleMarker([p.lat, p.lon], {
        radius,
        color,
        fillColor,
        fillOpacity,
        weight: isUpstream || isDownstream ? 3 : 1,
      });

      marker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; color: #1e293b;">
          <strong>Pole ID: ${p.poleId}</strong><br/>
          DT: ${p.dtId}<br/>
          Feeder: ${p.feederId}<br/>
          Status: <strong>${p.energized ? 'ENERGIZED' : 'DARK / DE-ENERGIZED'}</strong><br/>
          Topology: ${p.topologySource}
        </div>
      `);

      layerGroup.addLayer(marker);
    });

    // Render Fault Boundaries for Active Incidents
    activeIncidents.forEach((inc) => {
      const isSelected = selectedIncident?.incidentId === inc.incidentId;
      const upPos = inc.boundary.upstreamPoleId ? polePosMap.get(inc.boundary.upstreamPoleId) : null;
      const downPos = inc.boundary.downstreamPoleId ? polePosMap.get(inc.boundary.downstreamPoleId) : null;

      if (upPos && downPos) {
        // Line between upstream & downstream boundary poles
        const precision = inc.boundary.precision ?? 'ESTIMATED_SPAN';
        const isExact = precision === 'EXACT_SPAN';

        const polyline = L.polyline([upPos, downPos], {
          color: isExact ? '#ef4444' : '#f59e0b',
          weight: isSelected ? 6 : 4,
          dashArray: isExact ? undefined : '8, 8',
          opacity: isSelected ? 1 : 0.75,
        });

        polyline.bindTooltip(
          `Fault Boundary: ${inc.boundary.description} (${precision})`,
          { sticky: true }
        );

        polyline.on('click', () => onSelectIncident(inc));
        layerGroup.addLayer(polyline);
      }

      // Render DT Outage halo ring if DT level outage
      if (inc.faultType === 'dt_fault' || !upPos) {
        const ring = L.circle([inc.lat, inc.lon], {
          radius: 120,
          color: '#a855f7',
          fillColor: '#c084fc',
          fillOpacity: 0.2,
          weight: 2,
          dashArray: '4, 4',
        });
        ring.bindTooltip(`DT Outage Zone: ${inc.dtId}`, { sticky: true });
        ring.on('click', () => onSelectIncident(inc));
        layerGroup.addLayer(ring);
      }
    });
  }, [poles, incidents, selectedIncident, onSelectIncident]);

  // Pan to selected incident coordinates on selection change
  useEffect(() => {
    if (!selectedIncident || !mapRef.current) return;
    mapRef.current.flyTo([selectedIncident.lat, selectedIncident.lon], 16, {
      duration: 1.2,
    });
  }, [selectedIncident]);

  return (
    <div className="relative w-full h-full min-h-[450px] rounded-2xl overflow-hidden border border-gray-800 shadow-2xl bg-gray-950">
      {/* Container element for Leaflet */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Map Legend Overlay */}
      <div className="absolute bottom-4 right-4 z-[400] bg-gray-900/90 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-gray-800 text-xs shadow-xl flex flex-col gap-1.5 font-mono">
        <div className="text-gray-400 font-sans font-semibold mb-0.5 text-[11px]">GRID MAP LEGEND</div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          <span className="text-gray-300">Upstream Boundary Pole (Live)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          <span className="text-gray-300">Downstream Boundary Pole (Dark)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-0.5 bg-red-500 inline-block" />
          <span className="text-gray-300">Exact Span Fault</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-0.5 border-b border-dashed border-amber-500 inline-block" />
          <span className="text-gray-300">Estimated Span Fault</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400 opacity-60 inline-block" />
          <span className="text-gray-400">Healthy Pole</span>
        </div>
      </div>
    </div>
  );
};
