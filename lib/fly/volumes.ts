/**
 * Fly Volumes API client
 * Persistent storage — create, list, delete volumes.
 */

import { flyRequest, assertFlyId } from "./base";

export interface Volume {
  id: string;
  name: string;
  state: string;
  size_gb: number;
  region: string;
  zone: string;
  encrypted: boolean;
  attached_machine_id: string | null;
  created_at: string;
}

export interface CreateVolumeRequest {
  name: string;
  region: string;
  size_gb: number;
  encrypted?: boolean;
  snapshot_id?: string;
}

export class FlyVolumesClient {
  private token: string;
  private appName: string;

  constructor(opts: { token: string; appName: string }) {
    this.token = opts.token;
    this.appName = opts.appName;
  }

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return flyRequest<T>(this.token, this.appName, method, path, body);
  }

  async create(req: CreateVolumeRequest): Promise<Volume> {
    return this.req<Volume>("POST", "/volumes", req);
  }

  async list(): Promise<Volume[]> {
    return this.req<Volume[]>("GET", "/volumes");
  }

  async get(volumeId: string): Promise<Volume> {
    assertFlyId(volumeId, "volume");
    return this.req<Volume>("GET", `/volumes/${volumeId}`);
  }

  async delete(volumeId: string): Promise<void> {
    assertFlyId(volumeId, "volume");
    await this.req<void>("DELETE", `/volumes/${volumeId}`);
  }

  async extend(volumeId: string, sizeGb: number): Promise<Volume> {
    assertFlyId(volumeId, "volume");
    return this.req<Volume>("PUT", `/volumes/${volumeId}/extend`, {
      size_gb: sizeGb,
    });
  }

  async snapshots(volumeId: string): Promise<unknown[]> {
    assertFlyId(volumeId, "volume");
    return this.req<unknown[]>("GET", `/volumes/${volumeId}/snapshots`);
  }

  async createSnapshot(volumeId: string): Promise<unknown> {
    assertFlyId(volumeId, "volume");
    return this.req<unknown>("POST", `/volumes/${volumeId}/snapshots`);
  }
}
