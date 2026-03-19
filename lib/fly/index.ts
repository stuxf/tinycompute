/**
 * Unified Fly.io client
 */

export { FlyApiError, assertFlyId, flyRequestRaw } from "./base";
export { FlyMachinesClient } from "./machines";
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
} from "./machines";

export { FlyVolumesClient } from "./volumes";
export type { Volume, CreateVolumeRequest } from "./volumes";

export { FlyAppsClient } from "./apps";
export type { App, CreateAppRequest, IpAssignment } from "./apps";

import { FlyMachinesClient } from "./machines";
import { FlyVolumesClient } from "./volumes";
import { FlyAppsClient } from "./apps";

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
