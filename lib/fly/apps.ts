/**
 * Fly Apps API client
 * App lifecycle and IP management.
 * Uses shared flyRequestRaw for retries, timeouts, and rate limit handling.
 */

import { flyRequestRaw, FlyApiError } from "./base";

export { FlyApiError };

export interface App {
  id: string;
  name: string;
  status: string;
  organization: { id: string; slug: string };
}

export interface CreateAppRequest {
  app_name: string;
  org_slug: string;
  network?: string;
}

export interface IpAssignment {
  id: string;
  address: string;
  type: "v4" | "v6" | "shared_v4" | "private_v6";
  region: string;
  created_at: string;
}

export class FlyAppsClient {
  private token: string;

  constructor(opts: { token: string }) {
    this.token = opts.token;
  }

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return flyRequestRaw<T>(this.token, method, path, body);
  }

  async create(req: CreateAppRequest): Promise<App> {
    return this.req<App>("POST", "/apps", req);
  }

  async get(appName: string): Promise<App> {
    return this.req<App>("GET", `/apps/${appName}`);
  }

  async list(orgSlug?: string): Promise<App[]> {
    const query = orgSlug ? `?org_slug=${orgSlug}` : "";
    return this.req<App[]>("GET", `/apps${query}`);
  }

  async delete(appName: string, force?: boolean): Promise<void> {
    const query = force ? "?force=true" : "";
    await this.req<void>("DELETE", `/apps/${appName}${query}`);
  }

  // --- IP Assignments ---

  async listIps(appName: string): Promise<IpAssignment[]> {
    return this.req<IpAssignment[]>(
      "GET",
      `/apps/${appName}/ip_assignments`,
    );
  }

  async allocateIp(
    appName: string,
    type: "v4" | "v6" | "shared_v4" = "shared_v4",
    region?: string,
  ): Promise<IpAssignment> {
    return this.req<IpAssignment>("POST", `/apps/${appName}/ip_assignments`, {
      type,
      region,
    });
  }

  async releaseIp(appName: string, ip: string): Promise<void> {
    await this.req<void>(
      "DELETE",
      `/apps/${appName}/ip_assignments/${ip}`,
    );
  }
}
