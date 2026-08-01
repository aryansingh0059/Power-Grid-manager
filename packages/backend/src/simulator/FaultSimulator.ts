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
   * Inject a physical span fault between upstreamPoleId and downstreamPoleId.
   */
  static async injectSpanFault(
    upstreamPoleId: string,
    downstreamPoleId: string,
    options: SimulationOptions = {}
  ): Promise<SimulationResult> {
    const allPoles = await PoleModel.find().lean();
    const topologyIndex = TopologyIndex.build(allPoles as PoleRecord[]);

    const downstreamSubtree = [
      downstreamPoleId,
      ...topologyIndex.getDescendantIds(downstreamPoleId),
    ];

    const deterministic = options.deterministic ?? false;
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
      if (isFw12) {
        // Firmware 1.2.x devices go SILENT on power loss (no dying message)
        continue;
      }

      // Simulate 30% dying message loss unless in deterministic mode
      if (!deterministic && Math.random() < dropRate) {
        continue;
      }

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

    return {
      success: true,
      action: 'inject_span_fault',
      affectedPoleCount: downstreamSubtree.length,
      affectedDeviceCount: devices.length,
      telemetryEmittedCount: telemetryCount,
      message: `Injected span fault between ${upstreamPoleId} and ${downstreamPoleId} (${downstreamSubtree.length} poles dark, ${telemetryCount} dying telemetry events emitted).`,
    };
  }

  /**
   * Inject a Distribution Transformer (DT) level outage.
   */
  static async injectDtFault(
    dtId: string,
    options: SimulationOptions = {}
  ): Promise<SimulationResult> {
    const dtPoles = await PoleModel.find({ dtId }).lean();
    const affectedPoleIds = dtPoles.map((p) => p.poleId);

    const deterministic = options.deterministic ?? false;
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

    return {
      success: true,
      action: 'inject_dt_fault',
      affectedPoleCount: affectedPoleIds.length,
      affectedDeviceCount: devices.length,
      telemetryEmittedCount: telemetryCount,
      message: `Injected DT fault on ${dtId} (${affectedPoleIds.length} poles dark, ${telemetryCount} dying events emitted).`,
    };
  }

  /**
   * Inject a Feeder level 11kV outage.
   */
  static async injectFeederFault(
    feederId: string,
    options: SimulationOptions = {}
  ): Promise<SimulationResult> {
    const feederPoles = await PoleModel.find({ feederId }).lean();
    const affectedPoleIds = feederPoles.map((p) => p.poleId);

    const deterministic = options.deterministic ?? false;
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

    return {
      success: true,
      action: 'inject_feeder_fault',
      affectedPoleCount: affectedPoleIds.length,
      affectedDeviceCount: devices.length,
      telemetryEmittedCount: telemetryCount,
      message: `Injected feeder fault on ${feederId} (${affectedPoleIds.length} poles dark).`,
    };
  }

  /**
   * Simulate a device hardware failure while physical power remains healthy.
   */
  static async killDevice(deviceId: string): Promise<SimulationResult> {
    const device = await DeviceModel.findOne({ deviceId });
    if (!device) throw new Error(`Device ${deviceId} not found`);

    device.isOnline = false;
    await device.save();

    return {
      success: true,
      action: 'kill_device',
      affectedPoleCount: 1,
      affectedDeviceCount: 1,
      telemetryEmittedCount: 0,
      message: `Killed device ${deviceId} on pole ${device.poleId}. Telemetry silenced; physical power stays healthy.`,
    };
  }

  /**
   * Repair an active fault, restoring physical power and emitting boot/power_restored telemetry.
   */
  static async repairFault(
    dtId: string,
    downstreamPoleId?: string
  ): Promise<SimulationResult> {
    const allPoles = await PoleModel.find({ dtId }).lean();
    const topologyIndex = TopologyIndex.build(allPoles as PoleRecord[]);

    let targetPoleIds: string[] = [];

    if (downstreamPoleId) {
      targetPoleIds = [
        downstreamPoleId,
        ...topologyIndex.getDescendantIds(downstreamPoleId),
      ];
    } else {
      targetPoleIds = allPoles.map((p) => p.poleId);
    }

    const now = new Date();
    await PoleModel.updateMany(
      { poleId: { $in: targetPoleIds } },
      { $set: { energized: true, lastSeenAt: now } }
    );

    const devices = await DeviceModel.find({ poleId: { $in: targetPoleIds } });
    let telemetryCount = 0;

    for (const dev of devices) {
      // 1. Emit boot event (resets sequence count)
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

      // 2. Emit power_restored event
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
      message: `Repaired fault on DT ${dtId} (${targetPoleIds.length} poles re-energized, ${telemetryCount} restoration events emitted, ${closedCount} incidents auto-closed).`,
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
        if (fault.faultType === 'device_anomaly') continue; // Do not ticket sensor anomalies
        await IncidentService.createOrCorrelateIncident(fault);
        createdCount++;
      }
    }

    return createdCount;
  }
}
