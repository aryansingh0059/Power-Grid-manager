import { io, Socket } from 'socket.io-client';
import type { Incident } from '@pgm/shared';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const socketUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
    socket = io(socketUrl, {
      autoConnect: true,
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function subscribeToRealtimeEvents(handlers: {
  onIncidentCreated?: (incident: Incident) => void;
  onIncidentUpdated?: (incident: Incident) => void;
  onIncidentVerified?: (incident: Incident) => void;
  onNetworkStateChanged?: (payload: { action: string; affectedPoleCount: number }) => void;
}) {
  const s = getSocket();

  if (handlers.onIncidentCreated) s.on('incident:created', handlers.onIncidentCreated);
  if (handlers.onIncidentUpdated) s.on('incident:updated', handlers.onIncidentUpdated);
  if (handlers.onIncidentVerified) s.on('incident:verified', handlers.onIncidentVerified);
  if (handlers.onNetworkStateChanged) s.on('network:state_changed', handlers.onNetworkStateChanged);

  return () => {
    if (handlers.onIncidentCreated) s.off('incident:created', handlers.onIncidentCreated);
    if (handlers.onIncidentUpdated) s.off('incident:updated', handlers.onIncidentUpdated);
    if (handlers.onIncidentVerified) s.off('incident:verified', handlers.onIncidentVerified);
    if (handlers.onNetworkStateChanged) s.off('network:state_changed', handlers.onNetworkStateChanged);
  };
}
