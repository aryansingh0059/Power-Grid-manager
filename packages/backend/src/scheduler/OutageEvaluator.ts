import type { ScheduledOutage } from '@pgm/shared';
import type { LocalizedFault } from '../localization/types';

export interface OutageEvaluationResult {
  isScheduledOutage: boolean;
  matchingOutage: ScheduledOutage | null;
  conflictDetected: boolean;
  explanation: string;
}

export class OutageEvaluator {
  /**
   * Evaluates whether a localized fault candidate overlaps with a scheduled outage window,
   * and whether physical telemetry conflicts with the scheduled outage.
   */
  static evaluateFault(
    fault: LocalizedFault,
    outages: ScheduledOutage[],
    detectedAt: Date = new Date()
  ): OutageEvaluationResult {
    const timeMs = detectedAt.getTime();

    // 1. Find overlapping outage records for this feeder or DT
    const matchingOutage = outages.find((outage) => {
      const matchFeeder = outage.feederId && outage.feederId === fault.feederId;
      const matchDt = outage.dtId && outage.dtId === fault.dtId;

      if (!matchFeeder && !matchDt) return false;

      const start = new Date(outage.startAt).getTime() - 15 * 60 * 1000; // 15 min early buffer
      const end = new Date(outage.endAt).getTime() + 30 * 60 * 1000; // 30 min overrun buffer

      return timeMs >= start && timeMs <= end;
    });

    if (!matchingOutage) {
      return {
        isScheduledOutage: false,
        matchingOutage: null,
        conflictDetected: false,
        explanation: 'No overlapping scheduled outage window found.',
      };
    }

    // 2. Evaluate Conflict between Scheduled Outage and Observed Telemetry
    // If the schedule claims a FEEDER-level shutdown, but the fault is an isolated localized span fault
    // (e.g. only 2 downstream poles dark out of a whole feeder), the feeder schedule did NOT turn off the feeder!
    // Therefore, the schedule evidence conflicts with reality — surface a legitimate span_fault ticket!
    const isFeederSchedule = Boolean(matchingOutage.feederId && !matchingOutage.dtId);
    const isLocalizedSpanFault = fault.faultType === 'span_fault' && fault.affectedPoleCount < 15;

    if (isFeederSchedule && isLocalizedSpanFault) {
      return {
        isScheduledOutage: false,
        matchingOutage,
        conflictDetected: true,
        explanation: `Schedule ${matchingOutage.outageId} specifies feeder shutdown, but observed fault is localized span failure (${fault.affectedPoleCount} poles dark). Schedule conflicts with physical reality.`,
      };
    }

    return {
      isScheduledOutage: true,
      matchingOutage,
      conflictDetected: false,
      explanation: `Fault aligns with scheduled outage ${matchingOutage.outageId}: ${matchingOutage.description}`,
    };
  }
}
