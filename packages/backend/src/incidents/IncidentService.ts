import { IncidentModel, type IIncident } from '../db/models/Incident';
import { PoleModel } from '../db/models/Pole';
import type { LocalizedFault } from '../localization/types';

export interface VerificationResult {
  verified: boolean;
  incident: IIncident;
  darkPoleCount: number;
  message: string;
}

export class IncidentService {
  /**
   * Correlates a localized fault with existing active tickets or creates a new incident.
   */
  static async createOrCorrelateIncident(fault: LocalizedFault): Promise<IIncident> {
    // Search for existing active incident under same DT with matching downstream pole or overlapping affected poles
    const activeIncidents = await IncidentModel.find({
      dtId: fault.dtId,
      status: { $in: ['detected', 'acknowledged', 'crew_assigned'] },
    });

    const matchingIncident = activeIncidents.find((inc) => {
      // Direct boundary match
      if (
        inc.boundary.downstreamPoleId === fault.downstreamPoleId &&
        inc.boundary.upstreamPoleId === fault.upstreamPoleId
      ) {
        return true;
      }
      // Overlapping dark poles
      const existingPoles = new Set(inc.affectedPoleIds);
      const isOverlapping = fault.affectedPoleIds.some((pId) => existingPoles.has(pId));
      return isOverlapping;
    });

    const nowIso = new Date().toISOString();

    if (matchingIncident) {
      // Correlate into existing ticket
      const combinedPoles = Array.from(
        new Set([...matchingIncident.affectedPoleIds, ...fault.affectedPoleIds])
      );

      matchingIncident.affectedPoleIds = combinedPoles;
      matchingIncident.affectedPoleCount = combinedPoles.length;
      matchingIncident.boundary = {
        upstreamPoleId: fault.upstreamPoleId,
        downstreamPoleId: fault.downstreamPoleId,
        description: fault.boundaryDescription,
        topologySource: fault.topologySource,
        precision: fault.precision,
        confidence: fault.confidence / 100, // 0..1 scale for DB subdoc
      };

      matchingIncident.timeline.push({
        at: nowIso,
        status: matchingIncident.status,
        note: `Telemetry signal correlated — updated boundary to ${fault.boundaryDescription} (${combinedPoles.length} poles affected)`,
        automated: true,
      });

      await matchingIncident.save();
      return matchingIncident;
    }

    // Create new incident ticket
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = Math.floor(Math.random() * 65536)
      .toString(16)
      .toUpperCase()
      .padStart(4, '0');
    const incidentId = `INC-${dateStr}-${randomHex}`;

    const newIncident = await IncidentModel.create({
      incidentId,
      faultType: fault.faultType,
      status: 'detected',
      feederId: fault.feederId,
      dtId: fault.dtId,
      affectedPoleIds: fault.affectedPoleIds,
      affectedPoleCount: fault.affectedPoleIds.length,
      boundary: {
        upstreamPoleId: fault.upstreamPoleId,
        downstreamPoleId: fault.downstreamPoleId,
        description: fault.boundaryDescription,
        topologySource: fault.topologySource,
        precision: fault.precision,
        confidence: fault.confidence / 100,
      },
      pincode: fault.pincode,
      lat: fault.lat,
      lon: fault.lon,
      detectedAt: new Date(),
      timeline: [
        {
          at: nowIso,
          status: 'detected',
          note: `Fault detected automatically by localization engine (${fault.precision}, ${fault.confidence}% confidence)`,
          automated: true,
        },
      ],
    });

    return newIncident;
  }

  /**
   * Operator acknowledges an active incident ticket.
   */
  static async acknowledgeIncident(
    incidentId: string,
    operatorNote?: string
  ): Promise<IIncident> {
    const incident = await IncidentModel.findOne({ incidentId });
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    if (incident.status === 'closed') {
      throw new Error(`Cannot acknowledge closed incident ${incidentId}`);
    }

    const now = new Date();
    incident.status = 'acknowledged';
    incident.acknowledgedAt = now;
    incident.timeline.push({
      at: now.toISOString(),
      status: 'acknowledged',
      note: operatorNote ? `Acknowledged by operator: ${operatorNote}` : 'Acknowledged by operator',
      automated: false,
    });

    await incident.save();
    return incident;
  }

  /**
   * Assigns a field repair crew to an active incident.
   */
  static async assignCrew(
    incidentId: string,
    crewId: string,
    crewName: string
  ): Promise<IIncident> {
    const incident = await IncidentModel.findOne({ incidentId });
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    if (incident.status === 'closed') {
      throw new Error(`Cannot assign crew to closed incident ${incidentId}`);
    }

    const now = new Date();
    incident.status = 'crew_assigned';
    incident.crewAssignedAt = now;
    incident.timeline.push({
      at: now.toISOString(),
      status: 'crew_assigned',
      note: `Assigned repair crew: ${crewName} (ID: ${crewId})`,
      automated: false,
    });

    await incident.save();
    return incident;
  }

  /**
   * Marks repair work resolved.
   * RESOLVED does NOT imply VERIFIED. Triggers verification check immediately.
   */
  static async resolveIncident(incidentId: string, note?: string): Promise<IIncident> {
    const incident = await IncidentModel.findOne({ incidentId });
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    const now = new Date();
    incident.status = 'resolved';
    incident.resolvedAt = now;
    incident.timeline.push({
      at: now.toISOString(),
      status: 'resolved',
      note: note ? `Marked resolved: ${note}` : 'Marked resolved by operator/crew (verification pending)',
      automated: false,
    });

    await incident.save();

    // Trigger restoration verification immediately
    await IncidentService.verifyRestoration(incidentId);
    return (await IncidentModel.findOne({ incidentId }))!;
  }

  /**
   * Verifies restoration status via live pole telemetry.
   * If all affected poles are energized, transitions to VERIFIED -> CLOSED.
   */
  static async verifyRestoration(incidentId: string): Promise<VerificationResult> {
    const incident = await IncidentModel.findOne({ incidentId });
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    // Fetch current energization state of all affected poles
    const poles = await PoleModel.find({ poleId: { $in: incident.affectedPoleIds } });

    // Dark poles are those with a device that explicitly report energized === false
    const darkPoles = poles.filter((p) => p.deviceId && p.energized === false);
    const darkCount = darkPoles.length;
    const now = new Date();

    if (darkCount === 0) {
      // Telemetry verification SUCCEEDED!
      incident.status = 'closed';
      incident.verifiedAt = now;
      incident.closedAt = now;
      incident.timeline.push({
        at: now.toISOString(),
        status: 'verified',
        note: `Restoration telemetry verified: All ${incident.affectedPoleIds.length} affected poles confirmed energized. Ticket closed automatically.`,
        automated: true,
      });

      await incident.save();

      return {
        verified: true,
        incident,
        darkPoleCount: 0,
        message: 'All affected poles confirmed energized. Incident verified and closed.',
      };
    } else {
      // Verification FAILED — poles remain dark!
      incident.timeline.push({
        at: now.toISOString(),
        status: incident.status,
        note: `Restoration verification pending: ${darkCount} of ${incident.affectedPoleIds.length} affected poles remain de-energized.`,
        automated: true,
      });

      await incident.save();

      return {
        verified: false,
        incident,
        darkPoleCount: darkCount,
        message: `${darkCount} affected poles remain de-energized. Incident remains in ${incident.status} state.`,
      };
    }
  }

  /**
   * Periodically scans all active/resolved incidents and verifies restoration against telemetry.
   */
  static async checkAllActiveIncidentsForRestoration(): Promise<number> {
    const pendingIncidents = await IncidentModel.find({
      status: { $in: ['resolved', 'crew_assigned', 'acknowledged', 'detected'] },
    });

    let closedCount = 0;
    for (const inc of pendingIncidents) {
      const res = await IncidentService.verifyRestoration(inc.incidentId);
      if (res.verified) {
        closedCount++;
      }
    }

    return closedCount;
  }
}
