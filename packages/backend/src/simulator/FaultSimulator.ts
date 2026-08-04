import { PoleModel } from '../db/models/Pole';
import { DeviceModel } from '../db/models/Device';
import { ScheduledOutageModel } from '../db/models/ScheduledOutage';
import { IngestionService } from '../ingestion/IngestionService';
import { IncidentService } from '../incidents/IncidentService';
import { LocalizationEngine } from '../localization/LocalizationEngine';
import { TopologyIndex } from '../topology/TopologyIndex';
import type { PoleRecord, TelemetryMessage, ScheduledOutage } from '@pgm/shared';

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
   * Helper: Resolves pole document handling shorthand inputs like "P1", "P2", "P-010002", etc.
   */
  private static async resolvePole(input: string, fallbackIdx = 0): Promise<any> {
    if (!input) {
      const dtPoles = await PoleModel.find({ dtId: 'DT-001' }).sort({ seqOnLine: 1, poleId: 1 }).lean();
      return dtPoles[fallbackIdx] || dtPoles[0] || null;
    }

    const cleanInput = input.trim();

    // 1. Exact match
    let pole = await PoleModel.findOne({ poleId: cleanInput }).lean();
    if (pole) return pole;

    // 2. Regex match (e.g. "010002" or "P-010002")
    pole = await PoleModel.findOne({ poleId: new RegExp(cleanInput, 'i') }).lean();
    if (pole) return pole;

    // 3. Shorthand "P1", "P2", "P3", etc.
    const numMatch = cleanInput.match(/^P-?(\d+)$/i);
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1;
      const dtPoles = await PoleModel.find({ dtId: 'DT-001' }).sort({ seqOnLine: 1, poleId: 1 }).lean();
      if (dtPoles.length > idx && idx >= 0) {
        return dtPoles[idx];
      }
    }

    // 4. Fallback: get pole by fallback index in DT-001
    const dtPoles = await PoleModel.find({ dtId: 'DT-001' }).sort({ seqOnLine: 1, poleId: 1 }).lean();
    return dtPoles[fallbackIdx] || dtPoles[0] || null;
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
   * Inject a physical span fault between upstreamPoleId and downstreamPoleId.
   */
  static async injectSpanFault(
    upstreamPoleInput: string,
    downstreamPoleInput: string,
    options: SimulationOptions = {}
  ): Promise<SimulationResult> {
    const upstreamPole = await FaultSimulator.resolvePole(upstreamPoleInput, 0);
    const downstreamPole = await FaultSimulator.resolvePole(downstreamPoleInput, 1);

    if (!upstreamPole || !downstreamPole) {
      throw new Error(`Could not resolve poles for input ${upstreamPoleInput} / ${downstreamPoleInput}`);
    }

    const upstreamPoleId = upstreamPole.poleId;
    const downstreamPoleId = downstreamPole.poleId;

    const allPoles = await PoleModel.find({ dtId: downstreamPole.dtId }).lean();
    const topologyIndex = TopologyIndex.build(allPoles as PoleRecord[]);

    const downstreamSubtree = [
      downstreamPoleId,
      ...topologyIndex.getDescendantIds(downstreamPoleId),
    ];

    const deterministic = options.deterministic ?? true;
    const dropRate = options.dropRate ?? 0.3;

    // Update physical state of affected poles in DB
    await PoleModel.updateMany(
      { poleId: { $in: downstreamSubtree } },
      { $set: { energized: false, lastSeenAt: new Date() } }
    );

    const devices = await DeviceModel.find({ poleId: { $in: downstreamSubtree } });
    let telemetryCount = 0;

    for (const dev of devices) {
      const isFw12 = dev.firmwareVersion.startsWith('1.2.');
      if (isFw12) continue;
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

    const deterministic = options.deterministic ?? true;
    const dropRate = options.dropRate ?? 0.3;

    await PoleModel.updateMany(
      { dtId },
      { $set: { energized: false, lastSeenAt: new Date() } }
    );

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

    const deterministic = options.deterministic ?? true;
    const dropRate = options.dropRate ?? 0.3;

    await PoleModel.updateMany(
      { feederId },
      { $set: { energized: false, lastSeenAt: new Date() } }
    );

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
   * Smartly restores ALL dark poles across the network if no specific target is provided.
   */
  static async repairFault(
    dtInput?: string,
    downstreamPoleId?: string
  ): Promise<SimulationResult> {
    let targetPoleIds: string[] = [];

    if (downstreamPoleId) {
      const dtId = await FaultSimulator.resolveDt(dtInput || 'DT-001');
      const allPoles = await PoleModel.find({ dtId }).lean();
      const topologyIndex = TopologyIndex.build(allPoles as PoleRecord[]);
      targetPoleIds = [
        downstreamPoleId,
        ...topologyIndex.getDescendantIds(downstreamPoleId),
      ];
    } else {
      // Find all dark poles currently in the database
      const darkPoles = await PoleModel.find({ energized: false }).lean();
      targetPoleIds = darkPoles.map((p) => p.poleId);

      // Fallback: if no dark poles found, target DT-001 poles
      if (targetPoleIds.length === 0) {
        const dtId = await FaultSimulator.resolveDt(dtInput || 'DT-001');
        const dtPoles = await PoleModel.find({ dtId }).lean();
        targetPoleIds = dtPoles.map((p) => p.poleId);
      }
    }

    const now = new Date();
    await PoleModel.updateMany(
      { poleId: { $in: targetPoleIds } },
      { $set: { energized: true, lastSeenAt: now } }
    );

    const devices = await DeviceModel.find({ poleId: { $in: targetPoleIds } });
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
      affectedPoleCount: targetPoleIds.length,
      affectedDeviceCount: devices.length,
      telemetryEmittedCount: telemetryCount,
      message: `Repaired physical grid faults (${targetPoleIds.length} poles re-energized, ${telemetryCount} restoration events emitted, ${closedCount} incidents auto-closed).`,
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

    for (const dtId of dtIds) {
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
