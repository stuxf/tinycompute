/**
 * Upstash Redis Database Management API client
 * CRUD operations for Redis databases via api.upstash.com/v2.
 */

import { upstashRequest, UpstashApiError } from "./base";

export { UpstashApiError };

export interface UpstashDatabase {
  database_id: string;
  database_name: string;
  database_type: string;
  region: string;
  port: number;
  creation_time: number;
  state: string;
  password: string;
  user_email: string;
  endpoint: string;
  tls: boolean;
  rest_token: string;
  read_only_rest_token: string;
}

export interface CreateDatabaseRequest {
  name: string;
  region?: string;
  primary_region?: string;
  read_regions?: string[];
  tls?: boolean;
}

export class UpstashDatabasesClient {
  private email: string;
  private apiKey: string;

  constructor(opts: { email: string; apiKey: string }) {
    this.email = opts.email;
    this.apiKey = opts.apiKey;
  }

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return upstashRequest<T>(this.email, this.apiKey, method, path, body);
  }

  async create(request: CreateDatabaseRequest): Promise<UpstashDatabase> {
    return this.req<UpstashDatabase>("POST", "/redis/database", {
      name: request.name,
      region: request.region ?? "global",
      primary_region: request.primary_region ?? "us-east-1",
      read_regions: request.read_regions ?? ["us-west-1"],
      tls: request.tls ?? true,
    });
  }

  async list(): Promise<UpstashDatabase[]> {
    return this.req<UpstashDatabase[]>("GET", "/redis/databases");
  }

  async get(databaseId: string): Promise<UpstashDatabase> {
    return this.req<UpstashDatabase>("GET", `/redis/database/${databaseId}`);
  }

  async delete(databaseId: string): Promise<void> {
    await this.req<void>("DELETE", `/redis/database/${databaseId}`);
  }
}
