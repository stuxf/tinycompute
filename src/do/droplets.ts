/**
 * DigitalOcean Droplets API client
 * CRUD operations and power actions for Droplets.
 */

import { doRequest, assertDOId, DOApiError } from "./base.js";

export { DOApiError };

export interface DropletSize {
  slug: string;
  memory: number;
  vcpus: number;
  disk: number;
  transfer: number;
  price_monthly: number;
  price_hourly: number;
  regions: string[];
  available: boolean;
  description: string;
}

export interface DropletImage {
  id: number;
  name: string;
  distribution: string;
  slug: string | null;
  public: boolean;
  regions: string[];
  min_disk_size: number;
  type: string;
  size_gigabytes: number;
  description: string;
  status: string;
  created_at: string;
}

export interface DropletRegion {
  slug: string;
  name: string;
  sizes: string[];
  available: boolean;
  features: string[];
}

export interface DropletNetworkV4 {
  ip_address: string;
  netmask: string;
  gateway: string;
  type: "public" | "private";
}

export interface DropletNetworkV6 {
  ip_address: string;
  netmask: number;
  gateway: string;
  type: "public" | "private";
}

export interface DropletNetworks {
  v4: DropletNetworkV4[];
  v6: DropletNetworkV6[];
}

export interface Droplet {
  id: number;
  name: string;
  memory: number;
  vcpus: number;
  disk: number;
  locked: boolean;
  status: "new" | "active" | "off" | "archive";
  created_at: string;
  features: string[];
  region: DropletRegion;
  image: DropletImage;
  size: DropletSize;
  size_slug: string;
  networks: DropletNetworks;
  tags: string[];
  volume_ids: string[];
  vpc_uuid: string;
}

export interface CreateDropletRequest {
  name: string;
  region: string;
  size: string;
  image: string | number;
  ssh_keys?: (number | string)[];
  backups?: boolean;
  ipv6?: boolean;
  monitoring?: boolean;
  tags?: string[];
  user_data?: string;
  vpc_uuid?: string;
  volumes?: string[];
  with_droplet_agent?: boolean;
}

export type DropletAction = "power_on" | "power_off" | "reboot" | "shutdown";

export interface Action {
  id: number;
  status: "in-progress" | "completed" | "errored";
  type: string;
  started_at: string;
  completed_at: string | null;
  resource_id: number;
  resource_type: string;
  region: DropletRegion;
}

export class DODropletsClient {
  private token: string;
  private projectId: string | undefined;

  constructor(opts: { token: string; projectId?: string }) {
    this.token = opts.token;
    this.projectId = opts.projectId;
  }

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return doRequest<T>(this.token, method, path, body);
  }

  /**
   * Create a droplet and optionally assign it to the configured project.
   * Pass `projectId` to override, or `null` to skip project assignment.
   */
  async create(
    req: CreateDropletRequest,
    projectId?: string | null,
  ): Promise<Droplet> {
    const res = await this.req<{ droplet: Droplet }>("POST", "/droplets", req);
    const droplet = res.droplet;

    const targetProject = projectId === null
      ? undefined
      : projectId ?? this.projectId;

    if (targetProject) {
      await this.req<unknown>(
        "POST",
        `/projects/${targetProject}/resources`,
        { resources: [`do:droplet:${droplet.id}`] },
      );
      console.log(
        `[do] Assigned droplet ${droplet.id} to project ${targetProject}`,
      );
    }

    return droplet;
  }

  async get(dropletId: number): Promise<Droplet> {
    assertDOId(dropletId, "droplet");
    const res = await this.req<{ droplet: Droplet }>("GET", `/droplets/${dropletId}`);
    return res.droplet;
  }

  async list(
    tag?: string,
    page = 1,
    perPage = 20,
  ): Promise<{ droplets: Droplet[]; total: number }> {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (tag) params.set("tag_name", tag);
    const res = await this.req<{
      droplets: Droplet[];
      meta: { total: number };
    }>("GET", `/droplets?${params}`);
    return { droplets: res.droplets, total: res.meta.total };
  }

  async delete(dropletId: number): Promise<void> {
    assertDOId(dropletId, "droplet");
    await this.req<void>("DELETE", `/droplets/${dropletId}`);
  }

  async performAction(
    dropletId: number,
    action: DropletAction,
  ): Promise<Action> {
    assertDOId(dropletId, "droplet");
    const res = await this.req<{ action: Action }>(
      "POST",
      `/droplets/${dropletId}/actions`,
      { type: action },
    );
    return res.action;
  }

  async powerOn(dropletId: number): Promise<Action> {
    return this.performAction(dropletId, "power_on");
  }

  async powerOff(dropletId: number): Promise<Action> {
    return this.performAction(dropletId, "power_off");
  }

  async reboot(dropletId: number): Promise<Action> {
    return this.performAction(dropletId, "reboot");
  }

  async shutdown(dropletId: number): Promise<Action> {
    return this.performAction(dropletId, "shutdown");
  }

  async getAction(dropletId: number, actionId: number): Promise<Action> {
    assertDOId(dropletId, "droplet");
    assertDOId(actionId, "action");
    const res = await this.req<{ action: Action }>(
      "GET",
      `/droplets/${dropletId}/actions/${actionId}`,
    );
    return res.action;
  }

  /** List available regions */
  async listRegions(): Promise<DropletRegion[]> {
    const res = await this.req<{ regions: DropletRegion[] }>("GET", "/regions");
    return res.regions;
  }

  /** List available sizes */
  async listSizes(): Promise<DropletSize[]> {
    const res = await this.req<{ sizes: DropletSize[] }>("GET", "/sizes");
    return res.sizes;
  }
}
