import { PoleModel } from '../db/models/Pole';
import { DeviceModel } from '../db/models/Device';
import { ScheduledOutageModel } from '../db/models/ScheduledOutage';
import { ActiveFaultModel } from '../db/models/ActiveFault';
import { IngestionService } from '../ingestion/IngestionService';
import { IncidentService } from '../incidents/IncidentService';
import { LocalizationEngine } from '../localization/LocalizationEngine';
import { TopologyIndex } from '../topology/TopologyIndex';
import type { PoleRecord, TelemetryMessage, ScheduledOutage } from '@pgm/shared';
import type { LocalizedFault } from '../localization/types';

export interface SimulationOptions {
  deterministic?: boolean;
  dropRate?: number;
}

export interface SimulationResult {
  success: boolean;
  action: string;
  affectedPoleCount: number;
  affectedDeviceCount: number;
  telemetryEmittedCount: number;
  message: string;
}

export class FaultSimulator {
  /**
   * Helper: Resolves pole document by exact or case-insensitive ID match without hardcoded DT fallbacks.
   */
  public static async resolvePole(input: string): Promise<any> {
    if (!input) return null;
    const cleanInput = input.trim();

    // 1. Exact match
    let pole = await PoleModel.findOne({ poleId: cleanInput }).lean();
    if (pole) return pole;

    // 2. Case-insensitive exact match
    pole = await PoleModel.findOne({ poleId: new RegExp(`^${cleanInput}$`, 'i') }).lean();
    if (pole) return pole;

    // 3. Regex substring match (e.g. "010002" or "P-010002")
    pole = await PoleModel.findOne({ poleId: new RegExp(cleanInput, 'i') }).lean();
    if (pole) return pole;

    return null;
  }

  /**
   * Helper: Dynamically find a recommended valid recorded span target around the middle of a recorded tree.
   */
  static async getRecommendedDemoTarget(): Promise<{
    dtId: string;
    upstreamPoleId: string;
    downstreamPoleId: string;
    affectedPoleCount: number;
  }> {
    const poles = await PoleModel.find().lean();
    if (poles.length === 0) {
      throw new Error('No poles found in grid database');
    }

    const topologyIndex = TopologyIndex.build(poles as PoleRecord[]);
    const dtIds = Array.from(new Set(poles.map((p) => p.dtId)));

    const candidates: Array<{
      dtId: string;
      upstreamPoleId: string;
      downstreamPoleId: string;
      affectedPoleCount: number;
      depth: number;
    }> = [];

    for (const dtId of dtIds) {
      const dtPoles = poles.filter((p) => p.dtId === dtId);
      const isRecorded = dtPoles.some((p) => p.topologySource === 'recorded');
      if (!isRecorded) continue;

      for (const p of dtPoles) {
        if (!p.parentPoleId) continue;
        const upstreamId = p.parentPoleId;
        const downstreamId = p.poleId;
        const descendants = topologyIndex.getDescendantIds(downstreamId);
        const affectedPoleCount = 1 + descendants.length;
        const pathFromRoot = topologyIndex.getPathFromRoot(downstreamId);

        if (affectedPoleCount >= 2) {
          candidates.push({
            dtId,
            upstreamPoleId: upstreamId,
            downstreamPoleId: downstreamId,
            affectedPoleCount,
            depth: pathFromRoot.length,
          });
        }
      }
    }

    if (candidates.length === 0) {
      for (const p of poles) {
        if (p.parentPoleId) {
          const descendants = topologyIndex.getDescendantIds(p.poleId);
          return {
            dtId: p.dtId,
            upstreamPoleId: p.parentPoleId,
            downstreamPoleId: p.poleId,
            affectedPoleCount: 1 + descendants.length,
          };
        }
      }
      throw new Error('No valid parent-child span found in grid');
    }

    candidates.sort((a, b) => b.affectedPoleCount - a.affectedPoleCount);
    const midIdx = Math.floor(candidates.length / 2);
    const chosen = candidates[midIdx];

    return {
      dtId: chosen.dtId,
      upstreamPoleId: chosen.upstreamPoleId,
      downstreamPoleId: chosen.downstreamPoleId,
      affectedPoleCount: chosen.affectedPoleCount,
    };
  }


  /**
   * Helper: Resolves DT ID, handling shorthand "DT1" -> "DT-001"
   */
  private static async resolveDt(input: string): Promise<string> {
    if (!input) return 'DT-001';
    const cleanInput = input.trim();

    const dtCount = await PoleModel.countDocuments({ dtId: cleanInput });
    if (dtCount > 0) return cleanInput;

    const numMatch = cleanInput.match(/^DT-?(\d+)$/i);
    if (numMatch) {
      const numStr = String(parseInt(numMatch[1], 10)).padStart(3, '0');
      const candidate = `DT-${numStr}`;
      const candidateCount = await PoleModel.countDocuments({ dtId: candidate });
      if (candidateCount > 0) return candidate;
    }

    const firstPole = await PoleModel.findOne().lean();
    return firstPole?.dtId || 'DT-001';
  }

  /**
   * Helper: Resolves Feeder ID, handling shorthand "F1" -> "FDR-01"
   */
  private static async resolveFeeder(input: string): Promise<string> {
    if (!input) return 'FDR-01';
    const cleanInput = input.trim();

    const feederCount = await PoleModel.countDocuments({ feederId: cleanInput });
    if (feederCount > 0) return cleanInput;

    const numMatch = cleanInput.match(/^F(?:DR)?-?(\d+)$/i);
    if (numMatch) {
      const numStr = String(parseInt(numMatch[1], 10)).padStart(2, '0');
      const candidate = `FDR-${numStr}`;
      const candidateCount = await PoleModel.countDocuments({ feederId: candidate });
      if (candidateCount > 0) return candidate;
    }

    const firstPole = await PoleModel.findOne().lean();
    return firstPole?.feederId || 'FDR-01';
  }

  /**
   * Core Electrical Grid Physics Evaluator.
   *
   * Recomputes physical energized state for every pole in the grid by evaluating
   * ALL active physical faults against the radial network topology tree.
   */
  static async recomputeGridEnergizedState(): Promise<{
    darkPoleIds: string[];
    energizedPoleIds: string[];
  }> {
    const activeFaults = await ActiveFaultModel.find().lean();
    const allPoles = await PoleModel.find().lean();
    const topologyIndex = TopologyIndex.build(allPoles as PoleRecord[]);

    const activeDarkFeeders = new Set(
      activeFaults.filter((f) => f.faultType === 'feeder_fault').map((f) => f.feederId!)
    );
    const activeDarkDts = new Set(
      activeFaults.filter((f) => f.faultType === 'dt_fault').map((f) => f.dtId!)
    );
    const activeSpanDarkRoots = new Set(
      activeFaults.filter((f) => f.faultType === 'span_fault').map((f) => f.downstreamPoleId!)
    );

    const darkPoleIds: string[] = [];
    const energizedPoleIds: string[] = [];
    const now = new Date();

    for (const pole of allPoles) {
      const isFeederDark = activeDarkFeeders.has(pole.feederId);
      const isDtDark = activeDarkDts.has(pole.dtId);

      let isSpanDark = activeSpanDarkRoots.has(pole.poleId);
      if (!isSpanDark && !isFeederDark && !isDtDark) {
        const ancestors = topologyIndex.getAncestorIds(pole.poleId);
        isSpanDark = ancestors.some((aId) => activeSpanDarkRoots.has(aId));
      }

      const isDark = isFeederDark || isDtDark || isSpanDark;

      if (isDark) {
        darkPoleIds.push(pole.poleId);
      } else {
        energizedPoleIds.push(pole.poleId);
      }
    }

    if (darkPoleIds.length > 0) {
      await PoleModel.updateMany(
        { poleId: { $in: darkPoleIds } },
        { $set: { energized: false, lastSeenAt: now } }
      );
    }
    if (energizedPoleIds.length > 0) {
      await PoleModel.updateMany(
        { poleId: { $in: energizedPoleIds } },
        { $set: { energized: true, lastSeenAt: now } }
      );
    }

    return { darkPoleIds, energizedPoleIds };
  }

  /**
   * Inject a physical span fault between upstreamPoleId and downstreamPoleId.
   */
  static async injectSpanFault(
    upstreamPoleInput: string,
    downstreamPoleInput: string,
    options: SimulationOptions = {}
  ): Promise<SimulationResult> {
    const upstreamPole = await FaultSimulator.resolvePole(upstreamPoleInput);
    const downstreamPole = await FaultSimulator.resolvePole(downstreamPoleInput);

    if (!upstreamPole || !downstreamPole) {
      const missingInput = !upstreamPole ? upstreamPoleInput : downstreamPoleInput;
      throw new Error(`Pole "${missingInput}" not found`);
    }

    if (upstreamPole.dtId !== downstreamPole.dtId) {
      throw new Error(
        `Selected poles belong to different Distribution Transformers (${upstreamPole.dtId} vs ${downstreamPole.dtId}).`
      );
    }

    const upstreamPoleId = upstreamPole.poleId;
    const downstreamPoleId = downstreamPole.poleId;

    const allDtPoles = await PoleModel.find({ dtId: downstreamPole.dtId }).lean();
    const topologyIndex = TopologyIndex.build(allDtPoles as PoleRecord[]);

    // Validate Electrical Span Adjacency
    const actualParentId = topologyIndex.getParentId(downstreamPoleId);
    if (actualParentId !== upstreamPoleId) {
      throw new Error("Selected poles are not electrically adjacent.");
    }

    const downstreamSubtree = [
      downstreamPoleId,
      ...topologyIndex.getDescendantIds(downstreamPoleId),
    ];

    const faultId = `SPAN:${upstreamPoleId}:${downstreamPoleId}`;
    await ActiveFaultModel.findOneAndUpdate(
      { faultId },
      {
        faultId,
        faultType: 'span_fault',
        feederId: downstreamPole.feederId,
        dtId: downstreamPole.dtId,
        upstreamPoleId,
        downstreamPoleId,
      },
      { upsert: true }
    );

    // Recompute effective electrical grid state
    await FaultSimulator.recomputeGridEnergizedState();

    const deterministic = options.deterministic ?? true;
    const dropRate = options.dropRate ?? 0.3;

    const devices = await DeviceModel.find({ poleId: { $in: downstreamSubtree } });
    let telemetryCount = 0;

    for (const dev of devices) {
      const isFw12 = dev.firmwareVersion.startsWith('1.2.');
      if (isFw12) continue; // FW 1.2.x stays silent
      if (!deterministic && Math.random() < dropRate) continue; // Dying packet loss

      const msg: TelemetryMessage = {
        device_id: dev.deviceId,
        pole_id: dev.poleId,
        event: 'power_lost',
        energized: false,
        ts: new Date().toISOString(),
        seq: (dev.lastSeq ?? 0) + 1,
        fw: dev.firmwareVersion,
      };

      await IngestionService.processMessage(msg);
      telemetryCount++;
    }

    const incidentsCreated = await FaultSimulator.runLocalizationPipeline();

    return {
      success: true,
      action: 'inject_span_fault',
      affectedPoleCount: downstreamSubtree.length,
      affectedDeviceCount: devices.length,
      telemetryEmittedCount: telemetryCount,
      message: `Injected span fault between ${upstreamPoleId} and ${downstreamPoleId} (${downstreamSubtree.length} poles dark, ${telemetryCount} telemetry events emitted, ${incidentsCreated} incidents created/updated).`,
    };
  }

  /**
   * Inject a Distribution Transformer (DT) level outage.
   */
  static async injectDtFault(
    dtInput: string,
    options: SimulationOptions = {}
  ): Promise<SimulationResult> {
    const dtId = await FaultSimulator.resolveDt(dtInput);
    const dtPoles = await PoleModel.find({ dtId }).lean();
    const affectedPoleIds = dtPoles.map((p) => p.poleId);

    const faultId = `DT:${dtId}`;
    const feederId = dtPoles[0]?.feederId;

    await ActiveFaultModel.findOneAndUpdate(
      { faultId },
      {
        faultId,
        faultType: 'dt_fault',
        feederId,
        dtId,
      },
      { upsert: true }
    );

    // Recompute effective electrical grid state
    await FaultSimulator.recomputeGridEnergizedState();

    const deterministic = options.deterministic ?? true;
    const dropRate = options.dropRate ?? 0.3;

    const devices = await DeviceModel.find({ poleId: { $in: affectedPoleIds } });
    let telemetryCount = 0;

    for (const dev of devices) {
      if (dev.firmwareVersion.startsWith('1.2.')) continue;
      if (!deterministic && Math.random() < dropRate) continue;

      const msg: TelemetryMessage = {
        device_id: dev.deviceId,
        pole_id: dev.poleId,
        event: 'power_lost',
        energized: false,
        ts: new Date().toISOString(),
        seq: (dev.lastSeq ?? 0) + 1,
        fw: dev.firmwareVersion,
      };

      await IngestionService.processMessage(msg);
      telemetryCount++;
    }

    const incidentsCreated = await FaultSimulator.runLocalizationPipeline();

    return {
      success: true,
      action: 'inject_dt_fault',
      affectedPoleCount: affectedPoleIds.length,
      affectedDeviceCount: devices.length,
      telemetryEmittedCount: telemetryCount,
      message: `Injected DT fault on ${dtId} (${affectedPoleIds.length} poles dark, ${incidentsCreated} incidents created/updated).`,
    };
  }

  /**
   * Inject a Feeder level 11kV outage.
   */
  static async injectFeederFault(
    feederInput: string,
    options: SimulationOptions = {}
  ): Promise<SimulationResult> {
    const feederId = await FaultSimulator.resolveFeeder(feederInput);
    const feederPoles = await PoleModel.find({ feederId }).lean();
    const affectedPoleIds = feederPoles.map((p) => p.poleId);

    const faultId = `FEEDER:${feederId}`;
    await ActiveFaultModel.findOneAndUpdate(
      { faultId },
      {
        faultId,
        faultType: 'feeder_fault',
        feederId,
      },
      { upsert: true }
    );

    // Recompute effective electrical grid state
    await FaultSimulator.recomputeGridEnergizedState();

    const deterministic = options.deterministic ?? true;
    const dropRate = options.dropRate ?? 0.3;

    const devices = await DeviceModel.find({ poleId: { $in: affectedPoleIds } });
    let telemetryCount = 0;

    for (const dev of devices) {
      if (dev.firmwareVersion.startsWith('1.2.')) continue;
      if (!deterministic && Math.random() < dropRate) continue;

      const msg: TelemetryMessage = {
        device_id: dev.deviceId,
        pole_id: dev.poleId,
        event: 'power_lost',
        energized: false,
        ts: new Date().toISOString(),
        seq: (dev.lastSeq ?? 0) + 1,
        fw: dev.firmwareVersion,
      };

      await IngestionService.processMessage(msg);
      telemetryCount++;
    }

    const incidentsCreated = await FaultSimulator.runLocalizationPipeline();

    return {
      success: true,
      action: 'inject_feeder_fault',
      affectedPoleCount: affectedPoleIds.length,
      affectedDeviceCount: devices.length,
      telemetryEmittedCount: telemetryCount,
      message: `Injected feeder fault on ${feederId} (${affectedPoleIds.length} poles dark, ${incidentsCreated} incidents created/updated).`,
    };
  }

  /**
   * Simulate a device hardware failure while physical power remains healthy.
   * Device failure NEVER alters the physical energized state of the pole.
   */
  static async killDevice(deviceInput: string): Promise<SimulationResult> {
    let device = await DeviceModel.findOne({ deviceId: deviceInput });
    if (!device) {
      device = await DeviceModel.findOne({ deviceId: new RegExp(deviceInput, 'i') });
    }
    if (!device) {
      device = await DeviceModel.findOne();
    }
    if (!device) throw new Error(`No device found to kill`);

    device.isOnline = false;
    await device.save();

    await FaultSimulator.runLocalizationPipeline();

    return {
      success: true,
      action: 'kill_device',
      affectedPoleCount: 1,
      affectedDeviceCount: 1,
      telemetryEmittedCount: 0,
      message: `Killed device ${device.deviceId} on pole ${device.poleId}. Telemetry silenced; physical power stays healthy. Anomaly filter prevents false ticket.`,
    };
  }

  /**
   * Repair active faults, restoring physical power and emitting boot/power_restored telemetry.
   */
  static async repairFault(
    dtInput?: string,
    downstreamPoleId?: string
  ): Promise<SimulationResult> {
    if (downstreamPoleId) {
      // Remove specific span fault
      await ActiveFaultModel.deleteMany({ downstreamPoleId });
    } else if (dtInput) {
      const dtId = await FaultSimulator.resolveDt(dtInput);
      // Remove active DT fault & span faults under this DT
      await ActiveFaultModel.deleteMany({ dtId });
    } else {
      // General repair — remove all active physical faults
      await ActiveFaultModel.deleteMany({});
    }

    // Recompute effective grid state after fault removal
    const { energizedPoleIds } = await FaultSimulator.recomputeGridEnergizedState();

    // Emit restoration telemetry for re-energized poles
    const now = new Date();
    const devices = await DeviceModel.find({ poleId: { $in: energizedPoleIds } });
    let telemetryCount = 0;

    for (const dev of devices) {
      dev.isOnline = true;
      await dev.save();

      const bootMsg: TelemetryMessage = {
        device_id: dev.deviceId,
        pole_id: dev.poleId,
        event: 'boot',
        energized: true,
        ts: now.toISOString(),
        seq: 1,
        fw: dev.firmwareVersion,
      };
      await IngestionService.processMessage(bootMsg);

      const restoredMsg: TelemetryMessage = {
        device_id: dev.deviceId,
        pole_id: dev.poleId,
        event: 'power_restored',
        energized: true,
        ts: new Date(now.getTime() + 1000).toISOString(),
        seq: 2,
        fw: dev.firmwareVersion,
      };
      await IngestionService.processMessage(restoredMsg);

      telemetryCount += 2;
    }

    // Trigger restoration verification check across all active tickets
    const closedCount = await IncidentService.checkAllActiveIncidentsForRestoration();

    return {
      success: true,
      action: 'repair_fault',
      affectedPoleCount: energizedPoleIds.length,
      affectedDeviceCount: devices.length,
      telemetryEmittedCount: telemetryCount,
      message: `Repaired physical grid faults (${energizedPoleIds.length} poles re-energized, ${telemetryCount} restoration events emitted, ${closedCount} incidents auto-closed).`,
    };
  }

  /**
   * Add a scheduled outage window to the simulator environment.
   */
  static async createScheduledOutage(
    outageData: Partial<ScheduledOutage>
  ): Promise<ScheduledOutage> {
    const outageId = outageData.outageId ?? `OUTAGE-${Date.now()}`;
    const newOutage = await ScheduledOutageModel.create({
      outageId,
      feederId: outageData.feederId,
      dtId: outageData.dtId,
      startAt: outageData.startAt ? new Date(outageData.startAt) : new Date(),
      endAt: outageData.endAt ? new Date(outageData.endAt) : new Date(Date.now() + 4 * 3600 * 1000),
      description: outageData.description ?? 'Scheduled Maintenance Outage',
      status: outageData.status ?? 'active',
    });

    const obj = newOutage.toObject();
    return {
      outageId: obj.outageId,
      feederId: obj.feederId ?? undefined,
      dtId: obj.dtId ?? undefined,
      startAt: obj.startAt.toISOString(),
      endAt: obj.endAt.toISOString(),
      description: obj.description,
      status: obj.status,
    };
  }

  /**
   * Helper: Runs fault localization pipeline over current database state and creates/correlates tickets.
   */
  static async runLocalizationPipeline(): Promise<number> {
    const poles = await PoleModel.find().lean();
    const outagesDocs = await ScheduledOutageModel.find().lean();

    const topologyIndex = TopologyIndex.build(poles as PoleRecord[]);
    const poleStateMap = new Map<string, boolean | null>();

    for (const p of poles) {
      poleStateMap.set(p.poleId, p.energized ?? null);
    }

    const outages: ScheduledOutage[] = outagesDocs.map((doc) => ({
      outageId: doc.outageId,
      feederId: doc.feederId ?? undefined,
      dtId: doc.dtId ?? undefined,
      startAt: doc.startAt.toISOString(),
      endAt: doc.endAt.toISOString(),
      description: doc.description,
      status: doc.status,
    }));

    const dtIds = Array.from(new Set(poles.map((p) => p.dtId)));
    let createdCount = 0;

    // Check for Feeder-level Outages first across all feeders
    const feederIds = Array.from(new Set(poles.map((p) => p.feederId)));
    const feederOutageSet = new Set<string>();

    for (const fId of feederIds) {
      const fPoles = poles.filter((p) => p.feederId === fId);
      const allFPolesDark = fPoles.every((p) => p.energized === false);
      if (allFPolesDark && fPoles.length > 0) {
        feederOutageSet.add(fId);

        const firstPole = fPoles[0];
        const affectedPoleIds = fPoles.map((p) => p.poleId);
        const dtCount = new Set(fPoles.map((p) => p.dtId)).size;
        const avgLat = Number((fPoles.reduce((s, p) => s + p.lat, 0) / fPoles.length).toFixed(6));
        const avgLon = Number((fPoles.reduce((s, p) => s + p.lon, 0) / fPoles.length).toFixed(6));

        const feederFault: LocalizedFault = {
          faultType: 'feeder_fault',
          feederId: fId,
          dtId: firstPole.dtId,
          upstreamPoleId: null,
          downstreamPoleId: null,
          boundaryDescription: `11kV Feeder ${fId} outage — ${dtCount} DTs and ${affectedPoleIds.length} poles dark`,
          lat: avgLat,
          lon: avgLon,
          pincode: firstPole.pincode,
          affectedPoleIds,
          affectedPoleCount: affectedPoleIds.length,
          reasons: [`11kV Feeder breaker tripped — 100% of ${affectedPoleIds.length} poles on feeder ${fId} dark`],
          confidence: 98,
          topologySource: 'recorded',
          precision: 'DT_LEVEL',
          isAmbiguous: false,
        };

        await IncidentService.createOrCorrelateIncident(feederFault);
        createdCount++;
      }
    }

    // Localize DTs not covered by a feeder outage
    for (const dtId of dtIds) {
      const dtPoles = poles.filter((p) => p.dtId === dtId);
      if (dtPoles.length > 0 && feederOutageSet.has(dtPoles[0].feederId)) {
        continue; // Skip DT-level ticket generation if feeder outage is active
      }

      const detectedFaults = LocalizationEngine.localizeDt(
        topologyIndex,
        poleStateMap,
        dtId,
        undefined,
        outages
      );

      for (const fault of detectedFaults) {
        if (fault.faultType === 'device_anomaly') continue;
        await IncidentService.createOrCorrelateIncident(fault);
        createdCount++;
      }
    }

    return createdCount;
  }
}
