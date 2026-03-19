/**
 * Unified Fly.io client
 */

export { FlyApiError, assertFlyId, flyRequestRaw } from "./base.js";
export { FlyMachinesClient } from "./machines.js";
export type {
  Machine,
  MachineConfig,
  MachineGuest,
  MachineService,
  MachineMount,
  MachineCheck,
  MachineInit,
  MachineFile,
  MachineMetrics,
  MachineProcess,
  CreateMachineRequest,
} from "./machines.js";

export { FlyVolumesClient } from "./volumes.js";
export type { Volume, CreateVolumeRequest } from "./volumes.js";

export { FlyAppsClient } from "./apps.js";
export type { App, CreateAppRequest, IpAssignment } from "./apps.js";

import { FlyMachinesClient } from "./machines.js";
import { FlyVolumesClient } from "./volumes.js";
import { FlyAppsClient } from "./apps.js";

export class FlyClient {
  public machines: FlyMachinesClient;
  public volumes: FlyVolumesClient;
  public apps: FlyAppsClient;

  constructor(opts: { token: string; appName: string }) {
    this.machines = new FlyMachinesClient(opts);
    this.volumes = new FlyVolumesClient(opts);
    this.apps = new FlyAppsClient({ token: opts.token });
  }
}
