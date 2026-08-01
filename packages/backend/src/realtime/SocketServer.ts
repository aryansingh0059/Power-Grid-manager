import { Server as HTTPServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import type { IIncident } from '../db/models/Incident';

export class SocketServer {
  private static io: IOServer | null = null;

  /**
   * Initializes Socket.IO attached to the HTTP server.
   */
  static init(server: HTTPServer): IOServer {
    if (SocketServer.io) return SocketServer.io;

    SocketServer.io = new IOServer(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    SocketServer.io.on('connection', (socket: Socket) => {
      console.log(`[realtime] Client connected: ${socket.id}`);
      socket.on('disconnect', () => {
        console.log(`[realtime] Client disconnected: ${socket.id}`);
      });
    });

    console.log('[realtime] Socket.IO server initialized.');
    return SocketServer.io;
  }

  /**
   * Get current Socket.IO instance (or null if not initialized).
   */
  static getInstance(): IOServer | null {
    return SocketServer.io;
  }

  /** Broadcast incident created event */
  static emitIncidentCreated(incident: IIncident): void {
    SocketServer.io?.emit('incident:created', incident);
  }

  /** Broadcast incident updated event */
  static emitIncidentUpdated(incident: IIncident): void {
    SocketServer.io?.emit('incident:updated', incident);
  }

  /** Broadcast incident verified event */
  static emitIncidentVerified(incident: IIncident): void {
    SocketServer.io?.emit('incident:verified', incident);
  }

  /** Broadcast network state change event (fault / repair / simulation) */
  static emitNetworkStateChanged(payload: { action: string; affectedPoleCount: number }): void {
    SocketServer.io?.emit('network:state_changed', payload);
  }
}
