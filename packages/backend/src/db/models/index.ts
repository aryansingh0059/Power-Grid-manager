export { SubstationModel } from './Substation';
export { FeederModel } from './Feeder';
export { DTModel } from './DistributionTransformer';
export { PoleModel } from './Pole';
export { DeviceModel } from './Device';
export { TelemetryEventModel } from './TelemetryEvent';
export { ScheduledOutageModel } from './ScheduledOutage';
export { IncidentModel } from './Incident';

// Re-export document interfaces for service-layer use
export type { ISubstation } from './Substation';
export type { IFeeder } from './Feeder';
export type { IDistributionTransformer } from './DistributionTransformer';
export type { IPole } from './Pole';
export type { IDevice } from './Device';
export type { ITelemetryEvent } from './TelemetryEvent';
export type { IScheduledOutage } from './ScheduledOutage';
export type { IIncident } from './Incident';
