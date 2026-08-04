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

      let radius = 2.5;
      let color = '#4A7B8C'; // Subtle teal/neutral healthy pole
      let fillColor = '#4A7B8C';
      let fillOpacity = 0.4;

      if (isDark) {
        radius = 5;
        color = '#D84A4A';
        fillColor = '#D84A4A';
        fillOpacity = 0.9;
      }

      if (isUpstream) {
        radius = 6;
        color = '#36A875';
        fillColor = '#36A875';
        fillOpacity = 1;
      }

      if (isDownstream) {
        radius = 7;
        color = '#D84A4A';
        fillColor = '#D84A4A';
        fillOpacity = 1;
      }

      const marker = L.circleMarker([p.lat, p.lon], {
        radius,
        color,
        fillColor,
        fillOpacity,
        weight: isUpstream || isDownstream ? 2 : 1,
      });

      marker.bindPopup(`
        <div style="font-family: Inter, system-ui, sans-serif; padding: 2px;">
          <div style="font-family: JetBrains Mono, monospace; font-size: 13px; font-weight: 600; color: #F2F1ED; margin-bottom: 2px;">
            ${p.poleId}
          </div>
          <div style="font-size: 11px; font-weight: 600; color: ${p.energized ? '#36A875' : '#D84A4A'}; margin-bottom: 6px;">
            ${p.energized ? 'ENERGIZED' : 'DARK / DE-ENERGIZED'}
          </div>
          <div style="font-size: 11px; color: #A6ABB0; border-top: 1px solid #2C3137; padding-top: 4px;">
            DT: ${p.dtId} · FDR: ${p.feederId}<br/>
            Topology: ${p.topologySource}
          </div>
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
          color: isExact ? '#D84A4A' : '#E5A823',
          weight: isSelected ? 4 : 3,
          dashArray: isExact ? undefined : '8, 6',
          opacity: isSelected ? 1 : 0.8,
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
          color: '#E5A823',
          fillColor: '#E5A823',
          fillOpacity: 0.08,
          weight: 1.5,
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
    <div className="relative w-full h-full min-h-[400px] rounded-lg overflow-hidden border border-border bg-surface-0">
      {/* Container element for Leaflet */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 right-3 z-[400] bg-surface-1/90 backdrop-blur-sm px-3 py-2 rounded border border-border text-[11px] shadow-lg flex flex-col gap-1.5 select-none">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-health-green inline-block shrink-0" />
          <span className="text-content-secondary">Upstream boundary (Live)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-fault-red inline-block shrink-0" />
          <span className="text-content-secondary">Downstream boundary (Dark)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-0.5 bg-fault-red inline-block shrink-0" />
          <span className="text-content-secondary">Confirmed fault span</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-0.5 border-b border-dashed border-amber-400 inline-block shrink-0" />
          <span className="text-content-secondary">Estimated fault span</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#4A7B8C]/60 inline-block shrink-0" />
          <span className="text-content-tertiary">Healthy pole</span>
        </div>
      </div>
    </div>
  );
};

