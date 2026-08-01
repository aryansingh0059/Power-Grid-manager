import { SubstationModel } from './models/Substation';
import { FeederModel } from './models/Feeder';
import { DTModel } from './models/DistributionTransformer';
import { PoleModel } from './models/Pole';
import { DeviceModel } from './models/Device';
import { ScheduledOutageModel } from './models/ScheduledOutage';
import { generateSyntheticNetwork } from '../generator';

/**
 * Idempotently seeds the MongoDB database with synthetic network data if empty.
 * Returns true if seeding occurred, false if data already existed.
 */
export async function seedDatabaseIfNeeded(): Promise<boolean> {
  const existingCount = await PoleModel.countDocuments();
  if (existingCount > 0) {
    console.log(`[db:seed] Database already seeded (${existingCount} poles found). Skipping.`);
    return false;
  }

  console.log('[db:seed] Database is empty. Generating synthetic KSDB power network...');
  const dataset = generateSyntheticNetwork();

  await Promise.all([
    SubstationModel.insertMany(dataset.substations),
    FeederModel.insertMany(dataset.feeders),
    DTModel.insertMany(dataset.dts),
    PoleModel.insertMany(dataset.departmentPoles),
    DeviceModel.insertMany(dataset.devices),
    ScheduledOutageModel.insertMany(dataset.scheduledOutages),
  ]);

  console.log('[db:seed] Seeding complete! Stats:');
  console.log(`  Substations:                     ${dataset.stats.substationCount}`);
  console.log(`  Feeders:                         ${dataset.stats.feederCount}`);
  console.log(`  Distribution Transformers (DTs): ${dataset.stats.dtCount}`);
  console.log(`  Poles total:                     ${dataset.stats.poleCount}`);
  console.log(`  Devices total:                   ${dataset.stats.deviceCount}`);
  console.log(`  Poles without device (~9%):      ${dataset.stats.polesWithoutDeviceCount}`);
  console.log(`  DTs with recorded topology (~40%):${dataset.stats.dtsWithRecordedTopologyCount}`);
  console.log(`  DTs with missing topology (~60%): ${dataset.stats.dtsWithMissingTopologyCount}`);
  console.log(`  Devices on firmware 1.2 (~8%):   ${dataset.stats.firmware12DeviceCount}`);
  console.log(`  Poles missing pincode (~3%):     ${dataset.stats.missingPincodePoleCount}`);

  return true;
}
